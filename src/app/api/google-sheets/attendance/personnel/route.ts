import { google } from "googleapis";
import { NextResponse } from "next/server";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function normalize(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Read DANH_MUC for personnel list
    const dmRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DANH_MUC!A1:F500",
    });
    const dmRows = dmRes.data.values || [];
    const personnel: { tenVT: string; hoTen: string; boPhan: string }[] = [];
    for (let i = 1; i < dmRows.length; i++) {
      const row = dmRows[i];
      const hoTen = normalize(row[1]);
      const tenVT = normalize(row[2]);
      const boPhan = normalize(row[3]);
      if (tenVT && hoTen) {
        personnel.push({ tenVT, hoTen, boPhan });
      }
    }

    return NextResponse.json({ personnel });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Personnel list error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
