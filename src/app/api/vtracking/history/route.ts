import { NextRequest, NextResponse } from "next/server";
import { loginPresence, getCachedPresence, BASE_URL } from "@/lib/vtracking-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vehicleId, fromDate, toDate } = body;

  if (!vehicleId || !fromDate || !toDate) {
    return NextResponse.json(
      { error: "Thiếu vehicleId, fromDate hoặc toDate" },
      { status: 400 }
    );
  }

  let presence = getCachedPresence();
  if (!presence) {
    presence = await loginPresence();
    if (!presence) {
      presence = process.env.VTRACKING_PRESENCE || null;
    }
    if (!presence) {
      return NextResponse.json({ error: "Không thể đăng nhập Vtracking." }, { status: 401 });
    }
  }

  try {
    let res = await fetchHistory(presence, vehicleId, fromDate, toDate);
    let raw = res.ok ? await res.json() : null;

    const needsRelogin =
      !res.ok ||
      !raw?.content?.logs ||
      raw?.resultString?.includes("đăng nhập") ||
      raw?.resultString?.includes("hết") ||
      raw?.status === 401;

    if (needsRelogin) {
      const newPresence = await loginPresence();
      if (newPresence) {
        res = await fetchHistory(newPresence, vehicleId, fromDate, toDate);
        if (res.ok) {
          raw = await res.json();
        }
      }
    }

    return NextResponse.json({
      logs: raw?.content?.logs || [],
    });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối đến Vtracking" }, { status: 502 });
  }
}

async function fetchHistory(
  presence: string,
  vehicleId: string,
  fromDate: string,
  toDate: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(`${BASE_URL}/getHistoryTracking`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/historyMapV2`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Cookie: `PLAY_LANG=vi;presence=${presence}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      fromDate,
      toDate,
      id: vehicleId,
      after: "",
      before: "",
      limit: 5000,
    }),
  });

  clearTimeout(timeout);
  return res;
}
