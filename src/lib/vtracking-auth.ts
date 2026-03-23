const BASE_URL = "https://vtracking2.viettel.vn";
const WS_URL = "wss://api2.innoway.vn:8443/ws/attributes";

let cachedRawToken: string | null = null;
let cachedPresence: string | null = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 30 * 60 * 1000;

export async function loginRawToken(): Promise<string | null> {
  const username = process.env.VTRACKING_USERNAME;
  const password = process.env.VTRACKING_PASSWORD;
  if (!username || !password) return null;

  try {
    const res = await fetch(`${BASE_URL}/portDataWithParamNoToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        param: "/api/app/vtracking/login",
        body: { identifier: username, password: password },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success && data?.content?.token) {
      cachedRawToken = data.content.token;
      return cachedRawToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function loginPresence(): Promise<string | null> {
  const username = process.env.VTRACKING_USERNAME;
  const password = process.env.VTRACKING_PASSWORD;
  if (!username || !password) return null;

  try {
    const res = await fetch(`${BASE_URL}/login1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${BASE_URL}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ username, password }),
      redirect: "manual",
    });

    const cookies = res.headers.getSetCookie?.() || [];
    for (const cookie of cookies) {
      const match = cookie.match(/presence=([^;]+)/);
      if (match) {
        cachedPresence = match[1];
        cachedAt = Date.now();
        return cachedPresence;
      }
    }

    const setCookieHeader = res.headers.get("set-cookie") || "";
    const presenceMatch = setCookieHeader.match(/presence=([^;]+)/);
    if (presenceMatch) {
      cachedPresence = presenceMatch[1];
      cachedAt = Date.now();
      return cachedPresence;
    }

    return null;
  } catch {
    return null;
  }
}

export function getCachedPresence(): string | null {
  if (cachedPresence && Date.now() - cachedAt < TOKEN_TTL_MS) {
    return cachedPresence;
  }
  return null;
}

export function getCachedRawToken(): string | null {
  return cachedRawToken;
}

export { BASE_URL, WS_URL };
