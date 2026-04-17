import { google } from "googleapis";
import { NextResponse } from "next/server";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function normalizeMaX(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  // Strip leading zeros after X so "X02" == "X2", "X09" == "X9"
  const m = s.match(/^X0*(\d+)$/);
  return m ? `X${m[1]}` : s;
}

const MA_X_PATTERN = /^X\d+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { maToStt?: Record<string, number> };
    const maToStt = body.maToStt ?? {};

    // Normalize the input map once so lookups are O(1) against the same normalization
    const normalizedMap = new Map<string, number>();
    for (const [key, value] of Object.entries(maToStt)) {
      const normKey = normalizeMaX(key);
      if (normKey && MA_X_PATTERN.test(normKey)) {
        // First occurrence wins — caller should already dedupe, but be defensive
        if (!normalizedMap.has(normKey)) {
          normalizedMap.set(normKey, value);
        }
      }
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Read full BO_TRI_CV sheet — enough range to cover all 21 mã X rows
    const sheetName = "BO_TRI_CV";
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:P50`,
    });
    const rows = readRes.data.values || [];

    const updates: { range: string; values: (string | number)[][] }[] = [];
    let updated = 0;
    let cleared = 0;
    const matchedMaX: string[] = [];
    const sheetMaXSet = new Set<string>();

    // Scan every row; column H (index 7) = mã X
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const rawH = row[7];
      const maX = normalizeMaX(rawH);

      if (!maX || !MA_X_PATTERN.test(maX)) continue;

      sheetMaXSet.add(maX);
      const cellRow = i + 1; // 1-indexed for A1 notation
      const stt = normalizedMap.get(maX);

      if (stt !== undefined) {
        updates.push({
          range: `${sheetName}!K${cellRow}`,
          values: [[stt]],
        });
        matchedMaX.push(maX);
        updated++;
      } else {
        // Clear K for mã X without a matching pending lốt
        updates.push({
          range: `${sheetName}!K${cellRow}`,
          values: [[""]],
        });
        cleared++;
      }
    }

    // Diagnostic: mã X client gửi nhưng không có trong cột H của sheet
    const unmatchedMaX: string[] = [];
    for (const maX of normalizedMap.keys()) {
      if (!sheetMaXSet.has(maX)) unmatchedMaX.push(maX);
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updates,
        },
      });
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    return NextResponse.json({
      success: true,
      sheetUrl,
      sheetName,
      updated,
      cleared,
      receivedCount: normalizedMap.size,
      sheetMaXCount: sheetMaXSet.size,
      matchedMaX,
      unmatchedMaX,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("BO_TRI_CV sync-lot error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
