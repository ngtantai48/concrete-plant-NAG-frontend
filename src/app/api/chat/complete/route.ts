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

  const completionsUrl = apiUrl.replace(/\/stream\b/, "/completions");
  const body = await req.text();

  const upstream = await fetch(completionsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream error ${upstream.status}`, detail: text },
      { status: upstream.status || 502 }
    );
  }

  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
