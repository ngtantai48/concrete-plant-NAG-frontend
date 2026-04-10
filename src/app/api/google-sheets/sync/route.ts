import { google } from "googleapis";
import { NextResponse } from "next/server";

const SHEET_NAME = "CƠM CA";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function POST(request: Request) {
  try {
    const { rows, date } = (await request.json()) as {
      rows: string[][];
      date: string;
    };

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Check if sheet "CƠM CA" exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    let existing = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);

    if (!existing) {
      // Create the sheet with header + freeze top row
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
        },
      });
      const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

      // Add header row
      const header = ["Ngày", "Tên xe", "Biển số", "Tên tài xế", "Trạng thái", "Khoảng cách gần nhất"];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${SHEET_NAME}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      });

      // Freeze top row + bold header
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: "userEnteredFormat.textFormat.bold",
              },
            },
          ],
        },
      });
    }

    // Append data rows with date prefix
    const dataRows = rows.map((row) => [date, ...row]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: dataRows },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    return NextResponse.json({ success: true, sheetUrl, rowCount: dataRows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google Sheets sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);

    if (!existing) {
      return NextResponse.json({ message: "Sheet not found, nothing to clear" });
    }

    const sheetId = existing.properties?.sheetId ?? 0;

    // Clear all data (keep header row)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${SHEET_NAME}'!A2:Z`,
    });

    // Rewrite header + freeze + bold
    const header = ["Ngày", "Tên xe", "Biển số", "Tên tài xế", "Trạng thái", "Khoảng cách gần nhất"];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [header] },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
        ],
      },
    });

    return NextResponse.json({ success: true, message: "Sheet cleared, header preserved" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google Sheets clear error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
  }
  return NextResponse.json({
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  });
}
