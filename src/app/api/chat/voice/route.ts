export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_AGENT_VOICE_URL = "https://nag.svnagentic.site/v1/nag/voice/chat";
const USER_CONTEXT_HEADERS = [
  "x-nag-user-id",
  "x-nag-role",
  "x-nag-role-id",
  "x-nag-permissions",
  "x-nag-user-context",
  "x-chat-session-id",
] as const;

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function agentVoiceUrl() {
  return envValue("CHAT_AGENT_VOICE_URL") ?? DEFAULT_AGENT_VOICE_URL;
}

function nagConfigHeaders(): HeadersInit {
  const apiUrl = envValue("NAG_PROD_API_URL", "NEXT_PUBLIC_API_URL");
  return apiUrl ? { "X-NAG-Prod-API-URL": apiUrl } : {};
}

function agentHeaders(request: Request): HeadersInit {
  const token = envValue("CHAT_AGENT_API_TOKEN", "CHAT_API_TOKEN");
  const userAuthorization = request.headers.get("authorization");
  const requestId = crypto.randomUUID();
  const contextHeaders: Record<string, string> = {};

  USER_CONTEXT_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) contextHeaders[name] = value;
  });

  // CRITICAL: forward Content-Type (multipart/form-data; boundary=...) từ request
  // gốc — nếu không, upstream không parse được FormData → 422 "audio field missing"
  const incomingContentType = request.headers.get("content-type");
  const incomingContentLength = request.headers.get("content-length");

  return {
    ...(incomingContentType ? { "Content-Type": incomingContentType } : {}),
    ...(incomingContentLength ? { "Content-Length": incomingContentLength } : {}),
    "X-Request-Id": requestId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userAuthorization ? { "X-User-Authorization": userAuthorization } : {}),
    ...nagConfigHeaders(),
    ...contextHeaders,
  };
}

export async function POST(request: Request) {
  const upstream = await fetch(agentVoiceUrl(), {
    method: "POST",
    headers: agentHeaders(request),
    body: request.body,
    signal: request.signal,
    // @ts-expect-error — Node fetch requires duplex when streaming a body
    duplex: "half",
  });

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "audio/wav";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-cache, no-transform");
  const passThrough = ["content-length", "content-disposition", "x-transcribed-text"];
  for (const name of passThrough) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  });
}
