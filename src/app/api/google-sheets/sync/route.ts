import { google } from "googleapis";
import { NextResponse } from "next/server";

// Sheet name derived from dateRange: "CC-01/04-30/04"
function buildSheetName(dateRange: [string, string]): string {
  // dateRange = ["01/04/2026", "30/04/2026"] -> "CC-01/04-30/04"
  const from = dateRange[0].split("/").slice(0, 2).join("/"); // "01/04"
  const to = dateRange[1].split("/").slice(0, 2).join("/"); // "30/04"
  return `CC-${from}-${to}`;
}

interface FlatRow {
  stt: number | string;
  hoTen: string;
  licensePlate: string;
  meals: Record<string, { sang: boolean; trua: boolean; toi: boolean }>;
  total: number;
  isSection: boolean;
  sectionName?: string;
}

interface SyncPayload {
  flatRows: FlatRow[];
  days: string[]; // ["01", "02", ...]
  dateRange: [string, string]; // ["01/04/2026", "30/04/2026"]
  grandTotal: number;
  grandTotalText: string;
}

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
    const { flatRows, days, dateRange, grandTotal, grandTotalText } =
      (await request.json()) as SyncPayload;

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetName = buildSheetName(dateRange);

    // Check if sheet with this date range exists, delete if so, then create fresh
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets?.find((s) => s.properties?.title === sheetName);

    if (existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: existing.properties?.sheetId ?? 0 } }],
        },
      });
    }

    // Create new sheet
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

    const numDays = days.length;
    const dayStartCol = 3; // col C (1-indexed)
    const tongCol = dayStartCol + numDays * 3; // Tổng column
    const kyCol = tongCol + 1; // Ký nhận column
    const totalCols = kyCol;

    // Build all rows as 2D array
    const allRows: (string | number | null)[][] = [];

    // Row 1: Title
    const row1: (string | number | null)[] = new Array(totalCols).fill(null);
    row1[0] = "BẢNG CHẤM TIỀN ĂN QUA BỮA";
    allRows.push(row1);

    // Row 2: Date range
    const row2: (string | number | null)[] = new Array(totalCols).fill(null);
    row2[0] = `Từ ngày ${dateRange[0]} - ${dateRange[1]}`;
    allRows.push(row2);

    // Row 3: Header row 1 (STT, Họ và tên, Ngày trong tháng, Tổng, Ký nhận)
    const row3: (string | number | null)[] = new Array(totalCols).fill(null);
    row3[0] = "STT";
    row3[1] = "Họ và tên";
    row3[dayStartCol - 1] = "Ngày trong tháng";
    row3[tongCol - 1] = "Tổng";
    row3[kyCol - 1] = "Kí nhận";
    allRows.push(row3);

    // Row 4: Day numbers
    const row4: (string | number | null)[] = new Array(totalCols).fill(null);
    for (let i = 0; i < numDays; i++) {
      const col = dayStartCol - 1 + i * 3; // 0-indexed
      row4[col] = parseInt(days[i], 10);
    }
    allRows.push(row4);

    // Row 5: Trưa/Chiều/Tối sub-headers
    const row5: (string | number | null)[] = new Array(totalCols).fill(null);
    for (let i = 0; i < numDays; i++) {
      const col = dayStartCol - 1 + i * 3; // 0-indexed
      row5[col] = "Trưa";
      row5[col + 1] = "Chiều";
      row5[col + 2] = "Tối";
    }
    allRows.push(row5);

    // Data rows
    const colTotals: number[] = new Array(numDays * 3).fill(0);
    let dataRowCount = 0;

    for (const row of flatRows) {
      const dataRow: (string | number | null)[] = new Array(totalCols).fill(null);

      if (row.isSection) {
        dataRow[0] = row.stt as string;
        dataRow[1] = row.sectionName || row.hoTen;
        allRows.push(dataRow);
        continue;
      }

      dataRow[0] = row.stt as number;
      dataRow[1] = row.hoTen;

      let personTotal = 0;
      for (let i = 0; i < numDays; i++) {
        const dateStr = days[i];
        const dm = row.meals[dateStr] || { sang: false, trua: false, toi: false };
        const col = dayStartCol - 1 + i * 3; // 0-indexed

        if (dm.sang) {
          dataRow[col] = "/";
          personTotal++;
          colTotals[i * 3]++;
        }
        if (dm.trua) {
          dataRow[col + 1] = "/";
          personTotal++;
          colTotals[i * 3 + 1]++;
        }
        if (dm.toi) {
          dataRow[col + 2] = "/";
          personTotal++;
          colTotals[i * 3 + 2]++;
        }
      }

      dataRow[tongCol - 1] = personTotal;
      allRows.push(dataRow);
      dataRowCount++;
    }

    // Tổng cộng row
    const totalRow: (string | number | null)[] = new Array(totalCols).fill(null);
    totalRow[0] = "Tổng cộng";
    for (let i = 0; i < numDays * 3; i++) {
      totalRow[dayStartCol - 1 + i] = colTotals[i] || null;
    }
    totalRow[tongCol - 1] = grandTotal;
    allRows.push(totalRow);

    // Tổng text row
    const totalTextRow: (string | number | null)[] = new Array(totalCols).fill(null);
    totalTextRow[0] = "Tổng cộng";
    allRows.push(totalTextRow);

    // Tổng bữa text row
    const buaRow: (string | number | null)[] = new Array(totalCols).fill(null);
    buaRow[0] = `     Tổng:  ${String(grandTotal).padStart(2, "0")} bữa (${grandTotalText} bữa)`;
    allRows.push(buaRow);

    // Write all data at once
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: allRows },
    });

    // Build merge requests
    const mergeRequests: object[] = [];
    const lastDayCol0 = dayStartCol - 1 + numDays * 3 - 1; // 0-indexed last day column
    const frozenCols = 2; // must match frozenColumnCount below

    // Helper: push merge(s) that never cross the frozen-column boundary.
    // Google Sheets rejects any merge that spans both frozen and non-frozen columns.
    const pushMerge = (
      startRow: number,
      endRow: number,
      startCol: number,
      endCol: number,
    ) => {
      if (endCol - startCol < 2) return; // nothing to merge
      if (endCol <= frozenCols || startCol >= frozenCols) {
        // entirely within one zone
        mergeRequests.push({
          mergeCells: {
            range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
            mergeType: "MERGE_ALL",
          },
        });
      } else {
        // split at the frozen boundary
        if (frozenCols - startCol >= 2) {
          mergeRequests.push({
            mergeCells: {
              range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: frozenCols },
              mergeType: "MERGE_ALL",
            },
          });
        }
        if (endCol - frozenCols >= 2) {
          mergeRequests.push({
            mergeCells: {
              range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: frozenCols, endColumnIndex: endCol },
              mergeType: "MERGE_ALL",
            },
          });
        }
      }
    };

    // Row 1: merge title across all columns
    pushMerge(0, 1, 0, totalCols);

    // Row 2: merge date range
    pushMerge(1, 2, 0, totalCols);

    // Row 3: merge "Ngày trong tháng" across day columns (starts at col C = index 2, fully non-frozen)
    pushMerge(2, 3, dayStartCol - 1, lastDayCol0 + 1);

    // Merge STT (A3:A5) across 3 header rows — single column, no merge needed
    // Merge "Họ và tên" (B3:B5) across 3 header rows — single column, no merge needed

    // Merge STT (A3:A5) vertically
    mergeRequests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 },
        mergeType: "MERGE_ALL",
      },
    });

    // Merge "Họ và tên" (B3:B5) vertically
    mergeRequests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
        mergeType: "MERGE_ALL",
      },
    });

    // Merge Tổng across 3 header rows
    mergeRequests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: 5,
          startColumnIndex: tongCol - 1,
          endColumnIndex: tongCol,
        },
        mergeType: "MERGE_ALL",
      },
    });

    // Merge Ký nhận across 3 header rows
    mergeRequests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: 5,
          startColumnIndex: kyCol - 1,
          endColumnIndex: kyCol,
        },
        mergeType: "MERGE_ALL",
      },
    });

    // Row 4: merge each day number across 3 sub-columns (all in non-frozen zone)
    for (let i = 0; i < numDays; i++) {
      const startCol = dayStartCol - 1 + i * 3;
      mergeRequests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: startCol, endColumnIndex: startCol + 3 },
          mergeType: "MERGE_ALL",
        },
      });
    }

    // Merge section rows (section name across B to last day col)
    let currentRowIdx = 5; // data starts at row index 5 (row 6 in sheet)
    for (const row of flatRows) {
      if (row.isSection) {
        pushMerge(currentRowIdx, currentRowIdx + 1, 1, lastDayCol0 + 1);
      }
      currentRowIdx++;
    }

    // Merge "Tổng cộng" row (A:B) — entirely in frozen zone
    const tongCongRowIdx = currentRowIdx;
    mergeRequests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: tongCongRowIdx,
          endRowIndex: tongCongRowIdx + 1,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        mergeType: "MERGE_ALL",
      },
    });

    // Merge "Tổng cộng" text row
    const tongTextRowIdx = tongCongRowIdx + 1;
    pushMerge(tongTextRowIdx, tongTextRowIdx + 1, 0, tongCol);

    // Merge "Tổng bữa" text row
    const buaRowIdx = tongTextRowIdx + 1;
    pushMerge(buaRowIdx, buaRowIdx + 1, 0, kyCol);

    // Build formatting requests
    const formatRequests: object[] = [];

    // Title row: bold, size 14, centered
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 14 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    });

    // Date range row: italic, centered
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            textFormat: { italic: true, fontSize: 11 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    });

    // Header rows 3-5: bold, centered, bordered
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" },
            },
          },
        },
        fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)",
      },
    });

    // Data rows: bordered + centered for day/total columns
    const dataStartRow = 5;
    const dataEndRow = tongCongRowIdx + 1; // include tổng cộng row
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: dataStartRow, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" },
            },
          },
        },
        fields: "userEnteredFormat(borders)",
      },
    });

    // Center day columns + STT + Tổng in data rows
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: dataStartRow, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: { horizontalAlignment: "CENTER" },
        },
        fields: "userEnteredFormat(horizontalAlignment)",
      },
    });
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: dataStartRow,
          endRowIndex: dataEndRow,
          startColumnIndex: dayStartCol - 1,
          endColumnIndex: kyCol,
        },
        cell: {
          userEnteredFormat: { horizontalAlignment: "CENTER" },
        },
        fields: "userEnteredFormat(horizontalAlignment)",
      },
    });

    // Section rows: bold
    let secRowIdx = 5;
    for (const row of flatRows) {
      if (row.isSection) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: secRowIdx,
              endRowIndex: secRowIdx + 1,
              startColumnIndex: 0,
              endColumnIndex: totalCols,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                backgroundColor: { red: 1, green: 0.95, blue: 0.85, alpha: 1 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        });
      }
      secRowIdx++;
    }

    // Tổng cộng row: bold
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: tongCongRowIdx,
          endRowIndex: tongCongRowIdx + 1,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: "userEnteredFormat(textFormat)",
      },
    });

    // Column widths
    const colWidthRequests: object[] = [
      // STT: narrow
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 40 },
          fields: "pixelSize",
        },
      },
      // Họ và tên: wider
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 160 },
          fields: "pixelSize",
        },
      },
      // Day columns: narrow
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: dayStartCol - 1, endIndex: lastDayCol0 + 1 },
          properties: { pixelSize: 35 },
          fields: "pixelSize",
        },
      },
      // Tổng
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: tongCol - 1, endIndex: tongCol },
          properties: { pixelSize: 50 },
          fields: "pixelSize",
        },
      },
      // Ký nhận
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: kyCol - 1, endIndex: kyCol },
          properties: { pixelSize: 70 },
          fields: "pixelSize",
        },
      },
    ];

    // Freeze header rows + first 2 columns
    const freezeRequest = {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 5, frozenColumnCount: 2 },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    };

    // Execute all formatting in one batchUpdate
    // freezeRequest must come BEFORE mergeRequests — Google Sheets rejects
    // freezing columns that cut through an already-merged cell.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          freezeRequest,
          ...mergeRequests,
          ...formatRequests,
          ...colWidthRequests,
        ],
      },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

    return NextResponse.json({ success: true, sheetUrl, rowCount: dataRowCount });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Google Sheets sync error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const sheetName = searchParams.get("sheet");

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });

    // If specific sheet name provided, delete that one; otherwise delete all CC-* sheets
    const sheetsToDelete = meta.data.sheets?.filter((s) => {
      const title = s.properties?.title ?? "";
      return sheetName ? title === sheetName : title.startsWith("CC-");
    }) ?? [];

    if (sheetsToDelete.length === 0) {
      return NextResponse.json({ message: "No matching sheets found" });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: sheetsToDelete.map((s) => ({
          deleteSheet: { sheetId: s.properties?.sheetId ?? 0 },
        })),
      },
    });

    const deleted = sheetsToDelete.map((s) => s.properties?.title);
    return NextResponse.json({ success: true, message: "Sheets deleted", deleted });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Google Sheets clear error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
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
