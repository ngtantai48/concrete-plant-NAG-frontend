import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/* ── Shared style helpers ── */
const headerStyle = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin", color: { rgb: "CCCCCC" } }, bottom: { style: "thin", color: { rgb: "CCCCCC" } }, left: { style: "thin", color: { rgb: "CCCCCC" } }, right: { style: "thin", color: { rgb: "CCCCCC" } } } };
const cellStyle = { font: { sz: 12 }, alignment: { vertical: "center", wrapText: true }, border: { top: { style: "thin", color: { rgb: "E2E8F0" } }, bottom: { style: "thin", color: { rgb: "E2E8F0" } }, left: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } } } };
const numStyle = { ...cellStyle, alignment: { horizontal: "right", vertical: "center" }, numFmt: "#,##0" };
const pctStyle = { ...cellStyle, alignment: { horizontal: "center", vertical: "center" }, numFmt: "0%" };

/** Auto-fit column widths based on content */
function autoFitColumns(ws: XLSX.WorkSheet, data: Record<string, any>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const colWidths = keys.map((k) => {
    const headerLen = k.length;
    const maxDataLen = data.reduce((max, row) => {
      const val = row[k];
      const len = val !== undefined && val !== null ? String(val).length : 0;
      return Math.max(max, len);
    }, 0);
    return { wch: Math.min(Math.max(headerLen, maxDataLen) + 4, 45) };
  });
  ws["!cols"] = colWidths;
}

/** Apply header row styling (row 1) */
function styleSheet(ws: XLSX.WorkSheet, data: Record<string, any>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Header row height
  if (!ws["!rows"]) ws["!rows"] = [];
  ws["!rows"][0] = { hpt: 32 };

  // Style header cells
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  // Style data cells
  for (let r = 1; r <= range.e.r; r++) {
    if (!ws["!rows"][r]) ws["!rows"][r] = { hpt: 24 };
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      const val = ws[addr].v;
      const key = keys[c] || "";
      // Detect percentage columns
      if (key.includes("Tỷ lệ") || key.includes("%")) {
        ws[addr].s = pctStyle;
      } else if (typeof val === "number") {
        ws[addr].s = numStyle;
      } else {
        ws[addr].s = cellStyle;
      }
      // Alternate row background
      if (r % 2 === 0) {
        ws[addr].s = { ...ws[addr].s, fill: { fgColor: { rgb: "F8FAFC" } } };
      }
    }
  }

  autoFitColumns(ws, data);
}

export function exportToExcel(data: Record<string, any>[], fileName: string, sheetName = "Báo cáo") {
  const ws = XLSX.utils.json_to_sheet(data);
  styleSheet(ws, data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${fileName}.xlsx`);
}

export function exportMultiSheet(sheets: { name: string; data: Record<string, any>[] }[], fileName: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.data);
    styleSheet(ws, s.data);
    XLSX.utils.book_append_sheet(wb, ws, s.name.substring(0, 31));
  });
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${fileName}.xlsx`);
}
