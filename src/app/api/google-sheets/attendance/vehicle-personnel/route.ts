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

function extractPlate(raw: string): string {
  const idx = raw.indexOf("(");
  if (idx > 0) return raw.substring(0, idx).trim();
  return raw.trim();
}

function isValidPlate(plate: string): boolean {
  return /\d/.test(plate) && !/^(bi[eể]n|kh|xe)/i.test(plate);
}

interface VehiclePersonnel {
  licensePlate: string;
  type: "multi" | "single";
  personnel: { tenVT: string; hoTen: string; boPhan: string }[];
}

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // 1. Read DANH_MUC for tenVT -> hoTen mapping
    const dmRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DANH_MUC!A1:F500",
    });
    const dmRows = dmRes.data.values || [];
    const tenVTMap = new Map<string, { hoTen: string; boPhan: string }>();

    for (let i = 1; i < dmRows.length; i++) {
      const row = dmRows[i];
      const hoTen = normalize(row[1]);
      const tenVT = normalize(row[2]);
      const boPhan = normalize(row[3]);
      if (tenVT && hoTen) {
        tenVTMap.set(tenVT, { hoTen, boPhan });
      }
    }

    // 2. Read BO_TRI_CV for vehicle-personnel assignments
    const btcRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "BO_TRI_CV!A1:P50",
    });
    const btcRows = btcRes.data.values || [];

    const vehicles: VehiclePersonnel[] = [];

    // Scan rows 4-16 (0-indexed: 3-15)
    for (let i = 3; i <= Math.min(15, btcRows.length - 1); i++) {
      const row = btcRows[i] || [];

      // Multi-crew vehicles: C = plate (index 2), D/E/F = tenVT (index 3/4/5)
      const rawPlateMulti = normalize(row[2]);
      const plateMulti = extractPlate(rawPlateMulti);
      if (plateMulti && isValidPlate(plateMulti)) {
        const crew: { tenVT: string; hoTen: string; boPhan: string }[] = [];
        for (const colIdx of [3, 4, 5]) {
          const tenVT = normalize(row[colIdx]);
          if (tenVT) {
            const info = tenVTMap.get(tenVT);
            crew.push({
              tenVT,
              hoTen: info?.hoTen || tenVT,
              boPhan: info?.boPhan || "",
            });
          }
        }
        if (crew.length > 0) {
          vehicles.push({
            licensePlate: plateMulti,
            type: "multi",
            personnel: crew,
          });
        }
      }

      // Single vehicles: H = vehicle code (X1,X2..), I = plate+name "73D-00691 (Thiệp)", J = tenVT, K = STT (skip), L = tenVT secondary
      const rawSingleI = normalize(row[8]);
      const singlePlate = extractPlate(rawSingleI);
      if (singlePlate && isValidPlate(singlePlate)) {
        const crew: { tenVT: string; hoTen: string; boPhan: string }[] = [];
        for (const colIdx of [9, 11]) {
          const tenVT = normalize(row[colIdx]);
          if (tenVT && !/^\d+$/.test(tenVT)) {
            const info = tenVTMap.get(tenVT);
            crew.push({
              tenVT,
              hoTen: info?.hoTen || tenVT,
              boPhan: info?.boPhan || "",
            });
          }
        }
        if (crew.length > 0) {
          vehicles.push({
            licensePlate: singlePlate,
            type: "single",
            personnel: crew,
          });
        }
      }
    }

    // Build plate -> personnel names map for easy consumption
    const plateToNames: Record<string, string[]> = {};
    const nameToPlate: Record<string, string> = {};

    for (const v of vehicles) {
      if (!plateToNames[v.licensePlate]) {
        plateToNames[v.licensePlate] = [];
      }
      for (const p of v.personnel) {
        plateToNames[v.licensePlate].push(p.hoTen);
        nameToPlate[p.hoTen] = v.licensePlate;
      }
    }

    return NextResponse.json({
      vehicles,
      plateToNames,
      nameToPlate,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Vehicle-personnel read error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
