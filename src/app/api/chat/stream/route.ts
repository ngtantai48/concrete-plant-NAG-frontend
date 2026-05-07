import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const apiUrl = process.env.CHAT_API_URL;
  const apiToken = process.env.CHAT_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return NextResponse.json(
      { error: "CHAT_API_URL or CHAT_API_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      Accept: "text/event-stream",
    },
    body,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `Upstream error ${upstream.status}`, detail: errText },
      { status: upstream.status || 502 }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
