const DEFAULT_CONTENT_TYPE = "application/json";
const STREAM_MAX_TOKENS = 32_768;

export const runtime = "edge";
export const dynamic = "force-dynamic";

function upstreamUrl(): string {
  const url = process.env.CHAT_API_URL ?? process.env.NEXT_PUBLIC_CHAT_API_URL;
  if (!url) throw new Error("CHAT_API_URL/NEXT_PUBLIC_CHAT_API_URL is not configured");
  return url;
}

function upstreamHeaders(contentType: string): HeadersInit {
  const token = process.env.CHAT_API_TOKEN;
  return {
    "Content-Type": contentType,
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
          "X-API-Token": token,
        }
      : {}),
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
    headers: upstreamHeaders(contentType),
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
