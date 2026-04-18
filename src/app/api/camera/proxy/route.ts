import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');
  let port = searchParams.get('port');
  
  if (!ip) {
    return new NextResponse('Missing IP', { status: 400 });
  }

  // Remove hardcoded mapping. We will try HTTP first, then HTTPS.
  const protocol = port === '443' ? 'https' : 'http';
  let targetUrl = `${protocol}://${ip}:${port || 80}/ISAPI/Streaming/channels/102/picture`;
  const user = 'admin';
  const pass = '14526525aA@';

  try {
    // Helper function to fetch with axios to ignore self-signed certs
    const fetchWithAxios = async (url: string, headers: any = {}) => {
      try {
        const { default: axios } = await import('axios');
        const https = await import('https');
        const res = await axios.get(url, {
          headers,
          responseType: 'arraybuffer',
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 5000,
          validateStatus: () => true // Resolve all statuses
        });
        return res;
      } catch (err: any) {
        throw err;
      }
    };

    let initRes = await fetchWithAxios(targetUrl);
    
    // If HTTP connection reset or timeout, and port isn't 80, try HTTPS
    if (initRes.status === 0 || !initRes.status) {
       // axios throws on network error, so this might not be reached, but we catch it below.
    }

    if (initRes.status === 200) {
        return new NextResponse(initRes.data, {
            headers: {
              'Content-Type': initRes.headers['content-type'] || 'image/jpeg',
              'Cache-Control': 'no-store, max-age=0',
            }
        });
    }

    if (initRes.status === 401) {
      const wwwAuth = initRes.headers['www-authenticate'];
      if (wwwAuth && wwwAuth.includes('Digest')) {
        const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
        const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
        const qopMatch = wwwAuth.match(/qop="([^"]+)"/);
        
        if (realmMatch && nonceMatch) {
          const realm = realmMatch[1];
          const nonce = nonceMatch[1];
          const qop = qopMatch ? qopMatch[1] : '';
          
          const method = 'GET';
          const uri = '/ISAPI/Streaming/channels/102/picture'; // FIXED URI
          
          const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
          const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
          const nc = '00000001';
          const cnonce = crypto.randomBytes(4).toString('hex');
          const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
          
          const authHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
          
          // 2. Second request with Digest auth
          const authRes = await fetchWithAxios(targetUrl, { 'Authorization': authHeader });

          if (authRes.status === 200) {
            return new NextResponse(authRes.data, {
              headers: {
                'Content-Type': authRes.headers['content-type'] || 'image/jpeg',
                'Cache-Control': 'no-store, max-age=0',
              }
            });
          }
          return new NextResponse(`Camera returned ${authRes.status}`, { status: authRes.status });
        }
      }
      
      // Basic auth fallback
      const basicAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      const basicRes = await fetchWithAxios(targetUrl, { 'Authorization': basicAuth });
      
      if (basicRes.status === 200) {
        return new NextResponse(basicRes.data, {
          headers: {
            'Content-Type': basicRes.headers['content-type'] || 'image/jpeg',
            'Cache-Control': 'no-store, max-age=0',
          }
        });
      }
      return new NextResponse(`Basic auth failed: ${basicRes.status}`, { status: basicRes.status });
    }

    return new NextResponse(`Failed to fetch from camera: ${initRes.status}`, { status: initRes.status });
  } catch (err: any) {
    // If HTTP fails, try HTTPS fallback
    if (!targetUrl.startsWith('https')) {
      try {
        const httpsUrl = `https://${ip}:${port || 443}/ISAPI/Streaming/channels/102/picture`;
        const { default: axios } = await import('axios');
        const https = await import('https');
        
        // Try initial HTTPS request to get auth header
        const httpsInitRes = await axios.get(httpsUrl, {
           responseType: 'arraybuffer',
           httpsAgent: new https.Agent({ rejectUnauthorized: false }),
           timeout: 5000,
           validateStatus: () => true
        });

        if (httpsInitRes.status === 401) {
           const wwwAuth = httpsInitRes.headers['www-authenticate'];
           if (wwwAuth && wwwAuth.includes('Digest')) {
              const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
              const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
              
              if (realmMatch && nonceMatch) {
                const realm = realmMatch[1];
                const nonce = nonceMatch[1];
                const method = 'GET';
                const uri = '/ISAPI/Streaming/channels/102/picture';
                
                const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
                const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
                const nc = '00000001';
                const cnonce = crypto.randomBytes(4).toString('hex');
                const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
                
                const authHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
                
                const authRes = await axios.get(httpsUrl, {
                  headers: { 'Authorization': authHeader },
                  responseType: 'arraybuffer',
                  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                  timeout: 5000,
                  validateStatus: () => true
                });

                if (authRes.status === 200) {
                  return new NextResponse(authRes.data, {
                    headers: {
                      'Content-Type': authRes.headers['content-type'] || 'image/jpeg',
                      'Cache-Control': 'no-store, max-age=0',
                    }
                  });
                }
                return new NextResponse(`HTTPS Camera returned ${authRes.status}`, { status: authRes.status });
              }
           }
        }
        return new NextResponse(`Failed HTTPS proxy: ${httpsInitRes.status}`, { status: httpsInitRes.status });
      } catch (httpsErr: any) {
        return new NextResponse(`Proxy error (HTTP and HTTPS failed): ${httpsErr.message}`, { status: 500 });
      }
    }
    return new NextResponse(`Proxy error: ${err.message}`, { status: 500 });
  }
}
