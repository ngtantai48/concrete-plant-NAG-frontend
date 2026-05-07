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

function normalize(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

interface NhanSu {
  tenVT: string;
  hoTen: string;
  boPhan: string;
}

interface NhomNS {
  key: string;
  ten: string;
  boPhanMatch: string[];
  nhanSu: NhanSu[];
}

const NHOM_CONFIG: Omit<NhomNS, "nhanSu">[] = [
  { key: "A", ten: "Quản lý sản xuất", boPhanMatch: ["BLD", "QLSX"] },
  { key: "B", ten: "Vận hành trạm", boPhanMatch: ["VHT"] },
  { key: "C", ten: "Quản lý chất lượng (QA/QC)", boPhanMatch: ["QA/QC"] },
  { key: "D", ten: "Tổ xe bơm", boPhanMatch: ["Tổ bơm"] },
  { key: "E", ten: "Tổ bơm tĩnh", boPhanMatch: ["Bơm tĩnh"] },
  { key: "F", ten: "Tổ xe bồn", boPhanMatch: ["Xe bồn"] },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date"); // DD/MM/YYYY

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // 1. Read DANH_MUC for personnel list
    const dmRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DANH_MUC!A1:F500",
    });
    const dmRows = dmRes.data.values || [];
    const danhSachNS: NhanSu[] = [];
    const danhSachTenVT = new Set<string>();

    for (let i = 1; i < dmRows.length; i++) {
      const row = dmRows[i];
      const hoTen = normalize(row[1]);
      const tenVT = normalize(row[2]);
      const boPhan = normalize(row[3]);
      if (tenVT && hoTen) {
        danhSachTenVT.add(tenVT);
        danhSachNS.push({ tenVT, hoTen, boPhan });
      }
    }

    // 2. Read BO_TRI_CV for work assignments
    const btcRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "BO_TRI_CV!A1:P200",
    });
    const btcRows = btcRes.data.values || [];

    // Read date from E2
    const sheetDate = normalize(btcRows[1]?.[4]);

    // Who worked: scan all work columns
    const nguoiDiLam = new Set<string>();
    const nguoiNghi: Record<string, string> = {};
    const skipCols = new Set([6, 7, 8, 10, 12, 13, 14, 15]);

    // Find "NHÂN SỰ NGHỈ" section
    let foundNghiHeader = false;
    for (let i = 0; i < btcRows.length; i++) {
      if (!foundNghiHeader) {
        const cellI = normalize(btcRows[i]?.[8]);
        if (cellI.toUpperCase().includes("NHÂN SỰ NGHỈ".toUpperCase())) {
          foundNghiHeader = true;
        }
        continue;
      }
      const tenNghi = normalize(btcRows[i]?.[8]);
      if (tenNghi && danhSachTenVT.has(tenNghi)) {
        const ghiChu = normalize(btcRows[i]?.[9]);
        nguoiNghi[tenNghi] = ghiChu ? "1/2" : "N";
      }
    }

    // Scan work columns
    for (let i = 4; i < btcRows.length; i++) {
      const row = btcRows[i] || [];
      for (let j = 0; j < row.length; j++) {
        if (skipCols.has(j)) continue;
        const ten = normalize(row[j]);
        if (ten && danhSachTenVT.has(ten)) {
          nguoiDiLam.add(ten);
        }
      }
    }

    // 3. Group by department
    const nhomNS: NhomNS[] = NHOM_CONFIG.map((cfg) => ({ ...cfg, nhanSu: [] }));

    for (const ns of danhSachNS) {
      let placed = false;
      for (const nhom of nhomNS) {
        if (nhom.boPhanMatch.includes(ns.boPhan)) {
          nhom.nhanSu.push(ns);
          placed = true;
          break;
        }
      }
      if (!placed) {
        nhomNS[nhomNS.length - 1].nhanSu.push(ns);
      }
    }

    // 4. Build results
    const results = danhSachNS.map((ns) => {
      let status: string;
      if (ns.tenVT in nguoiNghi) {
        status = nguoiNghi[ns.tenVT] === "1/2" ? "0.5" : "0";
      } else if (nguoiDiLam.has(ns.tenVT)) {
        status = "1";
      } else {
        status = "0";
      }
      return {
        tenVT: ns.tenVT,
        hoTen: ns.hoTen,
        boPhan: ns.boPhan,
        status,
      };
    });

    return NextResponse.json({
      sheetDate: dateParam || sheetDate,
      results,
      nhomNS: nhomNS.map((n) => ({
        key: n.key,
        ten: n.ten,
        nhanSu: n.nhanSu.map((ns) => ns.hoTen),
      })),
      summary: {
        total: results.length,
        working: results.filter((r) => r.status === "1").length,
        off: results.filter((r) => r.status === "0").length,
        half: results.filter((r) => r.status === "0.5").length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Attendance read error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
