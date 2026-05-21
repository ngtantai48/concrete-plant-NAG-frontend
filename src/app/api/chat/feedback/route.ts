export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_AGENT_FEEDBACK_URL = "https://chat.svnagentic.site/api/chat/nag/feedback";
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

function agentFeedbackUrl() {
  return envValue("CHAT_AGENT_FEEDBACK_URL") ?? DEFAULT_AGENT_FEEDBACK_URL;
}

function nagConfigHeaders(): HeadersInit {
  const apiUrl = envValue("NAG_PROD_API_URL", "NEXT_PUBLIC_API_URL");
  return apiUrl ? { "X-NAG-Prod-API-URL": apiUrl } : {};
}

function agentHeaders(request: Request): HeadersInit {
  const token = envValue("CHAT_AGENT_API_TOKEN", "CHAT_API_TOKEN");
  const userAuthorization = request.headers.get("authorization");
  const contextHeaders: Record<string, string> = {};

  USER_CONTEXT_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) contextHeaders[name] = value;
  });

  return {
    "Content-Type": request.headers.get("content-type") ?? "application/json",
    "X-Request-Id": crypto.randomUUID(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userAuthorization ? { "X-User-Authorization": userAuthorization } : {}),
    ...nagConfigHeaders(),
    ...contextHeaders,
  };
}

export async function POST(request: Request) {
  const body = await request.text();

  const upstream = await fetch(agentFeedbackUrl(), {
    method: "POST",
    headers: agentHeaders(request),
    body,
    signal: request.signal,
  });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
    status: upstream.status,
    statusText: upstream.statusText,
  });
}
