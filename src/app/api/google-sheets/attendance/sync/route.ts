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

interface AttendanceRow {
  hoTen: string;
  boPhan: string;
  status: string; // "x" | "N" | "1/2"
}

interface NhomInfo {
  key: string;
  ten: string;
  nhanSu: string[]; // tenVT list
}

function parseDateStr(s: string): { ngay: number; thang: number; nam: number } | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const ngay = parseInt(parts[0], 10);
  const thang = parseInt(parts[1], 10);
  let nam = parseInt(parts[2], 10);
  if (nam < 100) nam += 2000;
  return { ngay, thang, nam };
}

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

const THU_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export async function POST(request: Request) {
  try {
    const { date, results, nhomNS } = (await request.json()) as {
      date: string; // DD/MM/YYYY
      results: AttendanceRow[];
      nhomNS: NhomInfo[];
    };

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const ngayInfo = parseDateStr(date);
    if (!ngayInfo) {
      return NextResponse.json({ error: "Invalid date: " + date }, { status: 400 });
    }

    const { ngay, thang, nam } = ngayInfo;
    const soNgay = getDaysInMonth(thang, nam);
    const sheetName = `CÔNG THÁNG ${thang}`;

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Check if sheet exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets?.find((s) => s.properties?.title === sheetName);

    if (!existing) {
      // Create sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetName, gridProperties: { columnCount: 36, rowCount: 200 } },
              },
            },
          ],
        },
      });

      // Build header rows
      const headerRows: string[][] = [];

      // Row 1: Title
      const row1 = new Array(36).fill("");
      row1[0] = `BẢNG CHẤM CÔNG THÁNG ${String(thang).padStart(2, "0")}/${nam}`;
      headerRows.push(row1);

      // Row 2: Dept
      const row2 = new Array(36).fill("");
      row2[0] = "Bộ phận sản xuất";
      headerRows.push(row2);

      // Row 3: Column headers
      const row3 = new Array(36).fill("");
      row3[0] = "STT";
      row3[1] = "Họ và tên";
      row3[2] = "Ngày trong tháng";
      row3[33] = "Công thường";
      row3[34] = "Công lễ";
      row3[35] = "Tổng cộng";
      headerRows.push(row3);

      // Row 4: Day of week
      const row4 = new Array(36).fill("");
      for (let d = 1; d <= soNgay; d++) {
        const dow = new Date(nam, thang - 1, d).getDay();
        row4[d + 1] = THU_NAMES[dow]; // col C = index 2 = day 1
      }
      headerRows.push(row4);

      // Row 5: Day numbers
      const row5 = new Array(36).fill("");
      for (let d = 1; d <= soNgay; d++) {
        row5[d + 1] = String(d);
      }
      headerRows.push(row5);

      // Data rows grouped by department
      let stt = 1;
      for (const nhom of nhomNS) {
        // Group header row
        const groupRow = new Array(36).fill("");
        groupRow[0] = nhom.key;
        groupRow[1] = nhom.ten;
        headerRows.push(groupRow);

        // Staff rows — nhanSu now contains hoTen values
        for (const hoTen of nhom.nhanSu) {
          const r = results.find((x) => x.hoTen === hoTen);
          const staffRow = new Array(36).fill("");
          staffRow[0] = String(stt);
          staffRow[1] = r ? r.hoTen : hoTen;
          headerRows.push(staffRow);
          stt++;
        }
      }

      // Total row
      const totalRow = new Array(36).fill("");
      totalRow[0] = "Tổng cộng";
      headerRows.push(totalRow);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: headerRows },
      });
    }

    // Read existing sheet to find staff rows
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:AJ200`,
    });
    const rows = sheetData.data.values || [];

    // Map hoTen → row index
    const hoTenToRow: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      const name = String(rows[i]?.[1] ?? "").trim();
      if (name) hoTenToRow[name] = i;
    }

    // --- Insert missing personnel into existing groups ---
    if (existing) {
      const sheetId = existing.properties?.sheetId ?? 0;

      // Find group header rows and "Tổng cộng" row
      const groupPositions: { key: string; headerIdx: number }[] = [];
      let totalRowIdx = -1;

      for (let i = 0; i < rows.length; i++) {
        const colA = String(rows[i]?.[0] ?? "").trim();
        for (const nhom of nhomNS) {
          if (colA === nhom.key) {
            groupPositions.push({ key: nhom.key, headerIdx: i });
            break;
          }
        }
        if (colA === "Tổng cộng") totalRowIdx = i;
      }

      groupPositions.sort((a, b) => a.headerIdx - b.headerIdx);

      // Process bottom-to-top so row inserts don't shift earlier groups
      let totalInserted = 0;

      for (let g = groupPositions.length - 1; g >= 0; g--) {
        const { key, headerIdx } = groupPositions[g];
        const nhom = nhomNS.find((n) => n.key === key);
        if (!nhom || nhom.nhanSu.length === 0) continue;

        // Section boundary: next group header / total row / end
        const sectionEnd =
          g + 1 < groupPositions.length
            ? groupPositions[g + 1].headerIdx
            : totalRowIdx >= 0
              ? totalRowIdx
              : rows.length;

        // Existing names in this section (both hoTen and tenVT)
        const existingNames = new Set<string>();
        for (let i = headerIdx + 1; i < sectionEnd; i++) {
          const name = String(rows[i]?.[1] ?? "").trim();
          if (name) existingNames.add(name);
        }

        // Find missing personnel — nhom.nhanSu now contains hoTen values
        const missing: string[] = [];
        for (const hoTen of nhom.nhanSu) {
          if (!existingNames.has(hoTen)) {
            missing.push(hoTen);
          }
        }

        if (missing.length === 0) continue;

        // Count existing staff rows in this section for STT numbering
        let sectionStt = 0;
        for (let i = headerIdx + 1; i < sectionEnd; i++) {
          const n = parseInt(String(rows[i]?.[0] ?? ""), 10);
          if (!isNaN(n)) sectionStt = Math.max(sectionStt, n);
        }
        // If section is empty, use total staff count before this group
        if (sectionStt === 0) {
          for (let gi = 0; gi < g; gi++) {
            const prevEnd =
              gi + 1 < groupPositions.length
                ? groupPositions[gi + 1].headerIdx
                : sectionEnd;
            for (let i = groupPositions[gi].headerIdx + 1; i < prevEnd; i++) {
              const n = parseInt(String(rows[i]?.[0] ?? ""), 10);
              if (!isNaN(n)) sectionStt = Math.max(sectionStt, n);
            }
          }
        }

        // Insert blank rows at the end of this group section
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId,
                    dimension: "ROWS",
                    startIndex: sectionEnd,
                    endIndex: sectionEnd + missing.length,
                  },
                  inheritFromBefore: true,
                },
              },
            ],
          },
        });

        // Write data to newly inserted rows
        const newRows = missing.map((hoTen, idx) => {
          const row = new Array(36).fill("");
          row[0] = String(sectionStt + idx + 1);
          row[1] = hoTen;
          return row;
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A${sectionEnd + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: newRows },
        });

        totalInserted += missing.length;
      }

      // Re-read sheet and rebuild mapping after inserts
      if (totalInserted > 0) {
        const reRead = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${sheetName}'!A1:AJ300`,
        });
        rows.length = 0;
        rows.push(...(reRead.data.values || []));

        Object.keys(hoTenToRow).forEach((k) => delete hoTenToRow[k]);
        for (let i = 0; i < rows.length; i++) {
          const name = String(rows[i]?.[1] ?? "").trim();
          if (name) hoTenToRow[name] = i;
        }
      }
    }

    // Write attendance for the day column
    const col = ngay + 1; // day 1 → col C (index 2)
    const updates: { range: string; values: string[][] }[] = [];
    let tongCong = 0;

    // Group totals tracking
    const groupTotals: Record<string, number> = {};
    for (const nhom of nhomNS) {
      groupTotals[nhom.key] = 0;
    }

    for (const r of results) {
      const rowIdx = hoTenToRow[r.hoTen];
      if (rowIdx === undefined) continue;

      const cellRow = rowIdx + 1; // 1-indexed
      const colLetter = colToLetter(col);

      updates.push({
        range: `'${sheetName}'!${colLetter}${cellRow}`,
        values: [[r.status]],
      });

      // Calculate work points
      const points = r.status === "1" ? 1 : r.status === "0.5" ? 0.5 : 0;
      tongCong += points;

      // Find which group this person belongs to
      for (const nhom of nhomNS) {
        if (nhom.nhanSu.includes(r.hoTen)) {
          groupTotals[nhom.key] = (groupTotals[nhom.key] || 0) + points;
          break;
        }
      }
    }

    // Recalculate totals: read all day columns for each person
    const totalUpdates: { range: string; values: (string | number)[][] }[] = [];

    for (const r of results) {
      const rowIdx = hoTenToRow[r.hoTen];
      if (rowIdx === undefined) continue;

      const cellRow = rowIdx + 1;
      const existingRow = rows[rowIdx] || [];

      // Count work from col C (2) to col AG (32)
      let cong = 0;
      for (let d = 2; d <= 2 + soNgay - 1; d++) {
        let val = String(existingRow[d] ?? "").trim().toLowerCase();
        // Override with current day's new value
        if (d === col) {
          val = r.status.toLowerCase();
        }
        if (val === "x" || val === "1") cong += 1;
        else if (val === "1/2" || val === "0.5") cong += 0.5;
      }

      // AH (col 34 = index 33), AJ (col 36 = index 35)
      totalUpdates.push({
        range: `'${sheetName}'!AH${cellRow}`,
        values: [[cong]],
      });
      totalUpdates.push({
        range: `'${sheetName}'!AJ${cellRow}`,
        values: [[cong]],
      });
    }

    // Batch update attendance + totals
    if (updates.length > 0 || totalUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [...updates, ...totalUpdates],
        },
      });
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    return NextResponse.json({
      success: true,
      sheetUrl,
      sheetName,
      updated: results.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Attendance sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function colToLetter(col: number): string {
  let result = "";
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}
