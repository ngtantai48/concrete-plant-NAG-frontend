const DEFAULT_CONTENT_TYPE = "application/json";
const STREAM_MAX_TOKENS = 32_768;
const USER_CONTEXT_HEADERS = [
  "x-nag-user-id",
  "x-nag-role",
  "x-nag-role-id",
  "x-nag-permissions",
  "x-nag-user-context",
  "x-chat-session-id",
] as const;

export const runtime = "edge";
export const dynamic = "force-dynamic";

function upstreamUrl(): string {
  const url = process.env.CHAT_API_URL;
  if (!url) throw new Error("CHAT_API_URL is not configured");
  return url;
}

function upstreamHeaders(contentType: string, request: Request): HeadersInit {
  const token = process.env.CHAT_API_TOKEN;
  const userAuthorization = request.headers.get("authorization");
  const contextHeaders: Record<string, string> = {};
  USER_CONTEXT_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) contextHeaders[name] = value;
  });
  return {
    "Content-Type": contentType,
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
          "X-API-Token": token,
        }
      : userAuthorization
        ? { Authorization: userAuthorization }
        : {}),
    ...(userAuthorization ? { "X-User-Authorization": userAuthorization } : {}),
    ...contextHeaders,
  };
}

export async function proxyChatRequest(request: Request, forceStream: boolean) {
  let body = await request.text();
  const contentType = request.headers.get("content-type") ?? DEFAULT_CONTENT_TYPE;

  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
    body = JSON.stringify({
      ...parsed,
      stream: forceStream ? true : parsed.stream === true ? false : parsed.stream,
      ...(forceStream ? { max_tokens: STREAM_MAX_TOKENS } : {}),
    });
  }

  const upstream = await fetch(upstreamUrl(), {
    method: "POST",
    headers: upstreamHeaders(contentType, request),
    body,
  });

  const headers = new Headers();
  headers.set(
    "Content-Type",
    forceStream
      ? "text/event-stream; charset=utf-8"
      : (upstream.headers.get("content-type") ?? DEFAULT_CONTENT_TYPE)
  );
  headers.set("Cache-Control", "no-cache, no-transform");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
