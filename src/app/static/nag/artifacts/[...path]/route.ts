export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_AGENT_ORIGIN = "https://chat.svnagentic.site";

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function upstreamOrigin(): string {
  const explicit = envValue(
    "CHAT_ARTIFACT_BASE_URL",
    "CHAT_STATIC_BASE_URL",
    "NEXT_PUBLIC_CHAT_ARTIFACT_BASE_URL",
    "NEXT_PUBLIC_CHAT_STATIC_BASE_URL"
  );
  if (explicit) return explicit.replace(/\/+$/, "");

  const streamUrl = envValue(
    "CHAT_AGENT_STREAM_URL",
    "NEXT_PUBLIC_CHAT_AGENT_STREAM_URL",
    "CHAT_API_URL",
    "NEXT_PUBLIC_CHAT_API_URL"
  );
  if (streamUrl) {
    try {
      return new URL(streamUrl).origin;
    } catch {
      return DEFAULT_AGENT_ORIGIN;
    }
  }

  return DEFAULT_AGENT_ORIGIN;
}

function passthroughHeaders(upstream: Response): Headers {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");
  const contentDisposition = upstream.headers.get("content-disposition");

  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  headers.set("Cache-Control", upstream.headers.get("cache-control") ?? "public, max-age=3600");
  return headers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  const params = await context.params;
  const artifactPath = params.path.map((segment) => encodeURIComponent(segment)).join("/");
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`/static/nag/artifacts/${artifactPath}`, upstreamOrigin());
  upstreamUrl.search = requestUrl.search;

  const upstream = await fetch(upstreamUrl, {
    headers: { Accept: request.headers.get("accept") ?? "*/*" },
    signal: request.signal,
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return new Response(body || `Artifact fetch failed (${upstream.status})`, {
      status: upstream.status,
      statusText: upstream.statusText,
    });
  }

  return new Response(upstream.body, {
    headers: passthroughHeaders(upstream),
    status: upstream.status,
    statusText: upstream.statusText,
  });
}
