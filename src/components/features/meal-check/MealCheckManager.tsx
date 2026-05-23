"use client";

import vtrackingApi from "@/services/vtracking.service";
import { Button, DatePicker, InputNumber, message, Progress, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import {
  CheckCircle, ChevronDown, ChevronUp, Download, ExternalLink,
  ImageDown, MapPin, RefreshCw, Search, UtensilsCrossed,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

const { RangePicker } = DatePicker;

// --- Types ---

interface Personnel {
  tenVT: string;
  hoTen: string;
  boPhan: string;
}

interface MealSlot {
  key: "sang" | "trua" | "toi";
  label: string;
  fromH: number;
  fromM: number;
  toH: number;
  toM: number;
}

const MEAL_SLOTS: MealSlot[] = [
  { key: "sang", label: "Trưa", fromH: 11, fromM: 30, toH: 13, toM: 0 },
  { key: "trua", label: "Chiều", fromH: 19, fromM: 0, toH: 22, toM: 0 },
  { key: "toi", label: "Tối", fromH: 22, fromM: 0, toH: 23, toM: 59 },
];

interface DayMeals {
  sang: boolean;
  trua: boolean;
  toi: boolean;
}

// personName -> { "01" -> { sang, trua, toi }, "02" -> ... }
type MealData = Record<string, Record<string, DayMeals>>;

interface NhomConfig {
  key: string;
  ten: string;
  boPhanMatch: string[];
}

const NHOM_CONFIG: NhomConfig[] = [
  { key: "A", ten: "Quản lý sản xuất", boPhanMatch: ["BLD", "QLSX"] },
  { key: "B", ten: "Văn phòng", boPhanMatch: ["VP", "Văn phòng"] },
  { key: "C", ten: "Vận hành trạm", boPhanMatch: ["VHT"] },
  { key: "D", ten: "Quản lý chất lượng (QA/QC)", boPhanMatch: ["QA/QC"] },
  { key: "E", ten: "Tổ xe bơm", boPhanMatch: ["Tổ bơm"] },
  { key: "F", ten: "Tổ bơm tĩnh", boPhanMatch: ["Bơm tĩnh"] },
  { key: "", ten: "Tổ xe bồn", boPhanMatch: ["Xe bồn"] },
];

interface FlatRow {
  stt: number | string;
  hoTen: string;
  licensePlate: string;
  meals: Record<string, DayMeals>;
  total: number;
  isSection: boolean;
  sectionName?: string;
}

// --- Helpers ---

function normalizePlate(plate: string): string {
  const digits = plate.replace(/\D/g, "");
  return digits.slice(-5);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDaysInRange(from: Dayjs, to: Dayjs): Dayjs[] {
  const days: Dayjs[] = [];
  let current = from.startOf("day");
  const end = to.startOf("day");
  while (current.isBefore(end) || current.isSame(end, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
}

// Vietnamese number to words (basic)
function numberToVietnamese(n: number): string {
  const ones = [
    "",
    "một",
    "hai",
    "ba",
    "bốn",
    "năm",
    "sáu",
    "bảy",
    "tám",
    "chín",
  ];
  const teens = [
    "mười",
    "mười một",
    "mười hai",
    "mười ba",
    "mười bốn",
    "mười lăm",
    "mười sáu",
    "mười bảy",
    "mười tám",
    "mười chín",
  ];

  if (n === 0) return "Không";
  if (n < 10) return ones[n].charAt(0).toUpperCase() + ones[n].slice(1);
  if (n < 20) return teens[n - 10].charAt(0).toUpperCase() + teens[n - 10].slice(1);
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    let s = ones[t] + " mươi";
    if (o === 1) s += " mốt";
    else if (o === 5) s += " lăm";
    else if (o > 0) s += " " + ones[o];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    let s = ones[h] + " trăm";
    if (remainder > 0 && remainder < 10) s += " lẻ " + ones[remainder];
    else if (remainder >= 10)
      s += " " + numberToVietnamese(remainder).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (n < 1000000) {
    const th = Math.floor(n / 1000);
    const remainder = n % 1000;
    let s = numberToVietnamese(th).toLowerCase() + " nghìn";
    if (remainder > 0 && remainder < 100) s += " không trăm " + numberToVietnamese(remainder).toLowerCase();
    else if (remainder >= 100)
      s += " " + numberToVietnamese(remainder).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return String(n);
}

export default function MealCheckManager() {
  const t = useTranslations("MealCheck");

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [latitude, setLatitude] = useState(17.490144886448913);
  const [longitude, setLongitude] = useState(106.55922219182935);
  const [radius, setRadius] = useState(150);
  const [loading, setLoading] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  // Data
  const [mealData, setMealData] = useState<MealData>({});
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [driverMap, setDriverMap] = useState<Record<string, string[]>>({}); // license_plate -> [hoTen]
  const [nameToPlateMap, setNameToPlateMap] = useState<Record<string, string>>({}); // hoTen -> license_plate
  const [checked, setChecked] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedSlots, setSelectedSlots] = useState<MealSlot["key"][]>(["sang", "trua", "toi"]);

  const activeSlots = useMemo(
    () => MEAL_SLOTS.filter((s) => selectedSlots.includes(s.key)),
    [selectedSlots]
  );

  const days = useMemo(
    () => getDaysInRange(dateRange[0], dateRange[1]),
    [dateRange]
  );

  const handleCheck = useCallback(async () => {
    setLoading(true);
    setMealData({});
    setChecked(false);
    setProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch vehicle-personnel mapping from BO_TRI_CV
      let drMap: Record<string, string[]> = {};
      let n2p: Record<string, string> = {};
      try {
        const vpRes = await fetch("/api/google-sheets/attendance/vehicle-personnel");
        if (!vpRes.ok) {
          const vpErr = await vpRes.json().catch(() => ({}));
          message.warning(`Lỗi tải bố trí xe: ${vpErr.error || vpRes.statusText}`);
        } else {
          const vpData = await vpRes.json();
          const rawPlateToNames: Record<string, string[]> = vpData.plateToNames || {};
          // Normalize plate keys for matching
          for (const [plate, names] of Object.entries(rawPlateToNames)) {
            drMap[normalizePlate(plate)] = names;
          }
          const rawNameToPlate: Record<string, string> = vpData.nameToPlate || {};
          for (const [name, plate] of Object.entries(rawNameToPlate)) {
            n2p[name] = plate;
          }
        }
      } catch {
        message.warning("Không kết nối được API bố trí xe");
      }
      setDriverMap(drMap);
      setNameToPlateMap(n2p);

      // 2. Fetch personnel
      let personnel: Personnel[] = [];
      try {
        const pRes = await fetch("/api/google-sheets/attendance/personnel");
        if (!pRes.ok) {
          const pErr = await pRes.json().catch(() => ({}));
          message.warning(`Lỗi tải danh sách nhân viên: ${pErr.error || pRes.statusText}`);
        } else {
          const pData = await pRes.json();
          personnel = pData.personnel || [];
        }
      } catch {
        message.warning("Không kết nối được API danh sách nhân viên");
      }
      setPersonnelList(personnel);

      // 3. Fetch vehicles
      const vehiclesRes = await vtrackingApi.fetchVehicles();
      const vehicles = vehiclesRes.data.vehicles || [];

      if (Object.keys(drMap).length === 0) {
        message.warning("Không có dữ liệu bố trí xe - nhân viên. Vui lòng kiểm tra Google Sheets.");
      }
      if (personnel.length === 0) {
        message.warning("Danh sách nhân viên trống. Vui lòng kiểm tra Google Sheets.");
      }
      if (vehicles.length === 0) {
        message.warning("Không lấy được danh sách xe từ VTracking.");
        setLoading(false);
        return;
      }

      // Count matched vehicles (those with driver names in the mapping)
      const matchedVehicles = vehicles.filter(
        (v) => {
          const nPlate = normalizePlate(v.license_plate);
          return drMap[nPlate] && drMap[nPlate].length > 0;
        }
      );
      if (matchedVehicles.length === 0 && Object.keys(drMap).length > 0) {
        message.warning(
          "Không khớp được biển số xe VTracking với bố trí CV. Kiểm tra biển số trong Google Sheets."
        );
      }

      const allDays = getDaysInRange(dateRange[0], dateRange[1]);
      const totalSteps = vehicles.length * allDays.length * activeSlots.length;
      setProgress({ current: 0, total: totalSteps });

      // 4. For each vehicle, each day, each meal slot
      const data: MealData = {};
      let step = 0;

      for (const vehicle of vehicles) {
        const driverNames = drMap[normalizePlate(vehicle.license_plate)];
        if (!driverNames || driverNames.length === 0) {
          step += allDays.length * activeSlots.length;
          setProgress({ current: step, total: totalSteps });
          continue;
        }

        for (const day of allDays) {
          const dateStr = day.format("DD");
          for (const name of driverNames) {
            if (!data[name]) data[name] = {};
            if (!data[name][dateStr])
              data[name][dateStr] = { sang: false, trua: false, toi: false };
          }

          for (const slot of activeSlots) {
            step++;
            setProgress({ current: step, total: totalSteps });

            // Skip if all people on this vehicle already have this slot
            const allHaveSlot = driverNames.every(
              (name) => data[name]?.[dateStr]?.[slot.key]
            );
            if (allHaveSlot) continue;

            try {
              const dayStr = day.format("DD-MM-YYYY");
              const fromDate = `${dayStr},${String(slot.fromH).padStart(2, "0")}:${String(slot.fromM).padStart(2, "0")}`;
              const toDate = `${dayStr},${String(slot.toH).padStart(2, "0")}:${String(slot.toM).padStart(2, "0")}`;

              const historyRes = await vtrackingApi.fetchHistory(
                vehicle.id,
                fromDate,
                toDate
              );
              const logs = historyRes.data.logs || [];

              for (const log of logs) {
                const val = (log.value as Record<string, unknown>) || {};
                const lat = Number(val.latitude);
                const lng = Number(val.longitude);
                if (!lat || !lng) continue;
                const dist = haversine(latitude, longitude, lat, lng);
                if (dist > radius) {
                  // Mark all people on this vehicle
                  for (const name of driverNames) {
                    data[name][dateStr][slot.key] = true;
                  }
                  break;
                }
              }
            } catch {
              // continue
            }
          }
        }
      }

      setMealData(data);
      setChecked(true);
    } catch {
      message.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [dateRange, latitude, longitude, radius, activeSlots, t]);

  // Build flat rows for table display
  const flatRows = useMemo(() => {
    if (!checked) return [];
    const rows: FlatRow[] = [];
    let stt = 1;

    // Group personnel by department
    const nhomGroups: { config: NhomConfig; members: Personnel[] }[] =
      NHOM_CONFIG.map((cfg) => ({ config: cfg, members: [] }));

    for (const p of personnelList) {
      let placed = false;
      for (const g of nhomGroups) {
        if (g.config.boPhanMatch.some((m) => p.boPhan.includes(m))) {
          g.members.push(p);
          placed = true;
          break;
        }
      }
      if (!placed) {
        nhomGroups[nhomGroups.length - 1].members.push(p);
      }
    }

    for (const g of nhomGroups) {
      if (g.members.length === 0) continue;
      rows.push({
        stt: g.config.key,
        hoTen: g.config.ten,
        licensePlate: "",
        meals: {},
        total: 0,
        isSection: true,
        sectionName: g.config.ten,
      });

      for (const member of g.members) {
        const personMeals = mealData[member.hoTen] || {};
        let total = 0;
        for (const dayMeals of Object.values(personMeals)) {
          for (const slot of activeSlots) {
            if (dayMeals[slot.key]) total++;
          }
        }
        rows.push({
          stt: stt++,
          hoTen: member.hoTen,
          licensePlate: nameToPlateMap[member.hoTen] || "",
          meals: personMeals,
          total,
          isSection: false,
        });
      }
    }

    return rows;
  }, [checked, personnelList, mealData, nameToPlateMap, activeSlots]);

  const grandTotal = useMemo(
    () => flatRows.reduce((sum, r) => sum + (r.isSection ? 0 : r.total), 0),
    [flatRows]
  );

  // --- Excel Export ---

  const handleExportExcel = useCallback(async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cơm ca");

    const allDays = getDaysInRange(dateRange[0], dateRange[1]);
    const numDays = allDays.length;
    const numSlots = activeSlots.length;
    const dayStartCol = 3; // col C (1-indexed)
    const lastDayCol = dayStartCol + numDays * numSlots - 1;
    const tongCol = lastDayCol + 1; // Tổng
    const kyCol = tongCol + 1; // Ký nhận
    const totalCols = kyCol;

    // Common styles from original template
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    const fontTNR = "Times New Roman";

    // Helper to get column letter
    const colLetter = (n: number) => {
      let s = "";
      let num = n;
      while (num > 0) {
        num--;
        s = String.fromCharCode(65 + (num % 26)) + s;
        num = Math.floor(num / 26);
      }
      return s;
    };

    // --- Row 1: Title --- (BOLD, sz=18, Times New Roman, center, height=28.5)
    const titleRow = ws.addRow([]);
    titleRow.getCell(1).value = "BẢNG CHẤM TIỀN ĂN QUA BỮA ";
    ws.mergeCells(`A1:${colLetter(totalCols)}1`);
    titleRow.getCell(1).font = { bold: true, size: 18, name: fontTNR };
    titleRow.getCell(1).alignment = { horizontal: "center" };
    titleRow.height = 50;

    // --- Row 2: Date range --- (BOLD, sz=16, center, v=middle, height=18)
    const dateRow = ws.addRow([]);
    dateRow.getCell(1).value = `Từ ngày ${dateRange[0].format("DD/MM/YYYY")} - ${dateRange[1].format("DD/MM/YYYY")}`;
    ws.mergeCells(`A2:${colLetter(totalCols)}2`);
    dateRow.getCell(1).font = { bold: true, size: 16, name: fontTNR };
    dateRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    dateRow.height = 44;

    // --- Row 3: Header row 1 --- (BOLD, sz=11, center, middle, wrap, thin border)
    const headerRow1 = ws.addRow([]);
    headerRow1.getCell(1).value = "STT";
    headerRow1.getCell(2).value = "Họ và tên";
    headerRow1.getCell(dayStartCol).value = "Ngày trong tháng";
    headerRow1.getCell(tongCol).value = "Tổng";
    headerRow1.getCell(kyCol).value = "Kí nhận";
    headerRow1.height = 40.75;

    // --- Row 4: Day numbers --- (BOLD, sz=10, height=30.75)
    const headerRow2 = ws.addRow([]);
    for (let i = 0; i < numDays; i++) {
      const col = dayStartCol + i * numSlots;
      headerRow2.getCell(col).value = allDays[i].date();
    }
    headerRow2.height = 40.75;

    // --- Row 5: Slot labels --- (sz=10, NOT bold, height=26.25)
    const headerRow3 = ws.addRow([]);
    for (let i = 0; i < numDays; i++) {
      const col = dayStartCol + i * numSlots;
      for (let s = 0; s < numSlots; s++) {
        headerRow3.getCell(col + s).value = activeSlots[s].label;
      }
    }
    headerRow3.height = 26.25;

    // Apply merges AFTER all header rows are created to avoid addRow offset issues
    ws.mergeCells(3, dayStartCol, 3, lastDayCol); // "Ngày trong tháng"
    ws.mergeCells("A3:A5"); // STT
    ws.mergeCells("B3:B5"); // Họ và tên
    ws.mergeCells(3, tongCol, 5, tongCol); // Tổng
    ws.mergeCells(3, kyCol, 5, kyCol); // Ký nhận
    for (let i = 0; i < numDays; i++) {
      const col = dayStartCol + i * numSlots;
      ws.mergeCells(4, col, 4, col + numSlots - 1); // Day number merge
    }

    // Style header rows 3-5
    for (let r = 3; r <= 5; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        if (r === 5 && c >= dayStartCol && c <= lastDayCol) {
          // Sub-headers: sz=10, NOT bold
          cell.font = { size: 10, name: fontTNR };
        } else if (r === 4 && c >= dayStartCol && c <= lastDayCol) {
          // Day numbers: sz=10, bold
          cell.font = { bold: true, size: 10, name: fontTNR };
        } else {
          // STT, Họ và tên, Ngày trong tháng, Tổng, Ký nhận: sz=11, bold
          cell.font = { bold: true, size: 11, name: fontTNR };
        }
      }
    }

    // --- Data rows ---
    const nhomGroups: { config: NhomConfig; members: Personnel[] }[] =
      NHOM_CONFIG.map((cfg) => ({ config: cfg, members: [] }));

    for (const p of personnelList) {
      let placed = false;
      for (const g of nhomGroups) {
        if (g.config.boPhanMatch.some((m) => p.boPhan.includes(m))) {
          g.members.push(p);
          placed = true;
          break;
        }
      }
      if (!placed) {
        nhomGroups[nhomGroups.length - 1].members.push(p);
      }
    }

    const colTotals: number[] = new Array(numDays * numSlots).fill(0);
    let globalStt = 1;

    for (const g of nhomGroups) {
      if (g.members.length === 0) continue;

      // Section header row (BOLD, sz=12, center/middle/wrap, merge B:lastDayCol, top+left+right border)
      const sectionRow = ws.addRow([]);
      sectionRow.height = 25;
      sectionRow.getCell(1).value = g.config.key;
      sectionRow.getCell(1).font = { bold: true, size: 12, name: fontTNR };
      sectionRow.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      sectionRow.getCell(1).border = { left: { style: "thin" }, right: { style: "thin" }, top: { style: "thin" } };

      sectionRow.getCell(2).value = g.config.ten;
      ws.mergeCells(sectionRow.number, 2, sectionRow.number, lastDayCol);
      // Style merged section cells
      for (let c = 2; c <= lastDayCol; c++) {
        sectionRow.getCell(c).font = { bold: true, size: 12, name: fontTNR };
        sectionRow.getCell(c).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        sectionRow.getCell(c).border = { left: { style: "thin" }, right: { style: "thin" }, top: { style: "thin" } };
      }

      // Data rows
      for (const member of g.members) {
        const personMeals = mealData[member.hoTen] || {};
        const dataRow = ws.addRow([]);
        dataRow.height = 25;

        // STT (sz=12, center, middle, wrap, thin border left+top+bottom)
        dataRow.getCell(1).value = globalStt++;
        dataRow.getCell(1).font = { size: 12, name: fontTNR };
        dataRow.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        dataRow.getCell(1).border = { left: { style: "thin" }, top: { style: "thin" }, bottom: { style: "thin" } };

        // Name (sz=12, left, wrap, thin border all)
        dataRow.getCell(2).value = member.hoTen;
        dataRow.getCell(2).font = { size: 12, name: fontTNR };
        dataRow.getCell(2).alignment = { horizontal: "left", wrapText: true };
        dataRow.getCell(2).border = thinBorder;

        let personTotal = 0;

        for (let i = 0; i < numDays; i++) {
          const day = allDays[i];
          const dateStr = day.format("DD");
          const dm = personMeals[dateStr] || { sang: false, trua: false, toi: false };
          const col = dayStartCol + i * numSlots;

          for (let s = 0; s < numSlots; s++) {
            if (dm[activeSlots[s].key]) {
              dataRow.getCell(col + s).value = "/";
              personTotal++;
              colTotals[i * numSlots + s]++;
            }
            dataRow.getCell(col + s).font = { size: 10, name: fontTNR };
            dataRow.getCell(col + s).alignment = { horizontal: "center" };
            dataRow.getCell(col + s).border = thinBorder;
          }
        }

        // Tổng column (sz=12, center, middle, thin border right+top+bottom)
        dataRow.getCell(tongCol).value = personTotal;
        dataRow.getCell(tongCol).font = { size: 12, name: fontTNR };
        dataRow.getCell(tongCol).alignment = { horizontal: "center", vertical: "middle" };
        dataRow.getCell(tongCol).border = { right: { style: "thin" }, top: { style: "thin" }, bottom: { style: "thin" } };

        // Ký nhận column (border)
        dataRow.getCell(kyCol).border = thinBorder;
      }
    }

    // --- Tổng cộng row --- (merge A:B, BOLD sz=11, all borders, white fill)
    const totalRow = ws.addRow([]);
    totalRow.height = 25;
    totalRow.getCell(1).value = "Tổng cộng";
    ws.mergeCells(totalRow.number, 1, totalRow.number, 2);
    totalRow.getCell(1).font = { bold: true, size: 11, name: fontTNR };
    totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    totalRow.getCell(1).border = thinBorder;
    totalRow.getCell(2).border = thinBorder;

    for (let i = 0; i < numDays * numSlots; i++) {
      const col = dayStartCol + i;
      totalRow.getCell(col).value = colTotals[i] || undefined;
      totalRow.getCell(col).font = { bold: true, size: 12, name: fontTNR };
      totalRow.getCell(col).alignment = { horizontal: "center", vertical: "middle" };
      totalRow.getCell(col).border = { left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    }
    totalRow.getCell(tongCol).value = grandTotal;
    totalRow.getCell(tongCol).font = { bold: true, size: 11, name: fontTNR };
    totalRow.getCell(tongCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    totalRow.getCell(tongCol).border = thinBorder;

    // --- Tổng cộng text row --- (merge A:AJ, BOLD sz=12, center, middle, thin border)
    const totalTextRow = ws.addRow([]);
    totalTextRow.height = 25;
    totalTextRow.getCell(1).value = "Tổng cộng";
    ws.mergeCells(totalTextRow.number, 1, totalTextRow.number, tongCol);
    totalTextRow.getCell(1).font = { bold: true, size: 12, name: fontTNR };
    totalTextRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    totalTextRow.getCell(1).border = thinBorder;

    // --- Tổng bữa text row --- (merge A:AK, BOLD sz=12, left, middle, top border)
    const totalBuaRow = ws.addRow([]);
    totalBuaRow.height = 21.75;
    const buaText = numberToVietnamese(grandTotal);
    totalBuaRow.getCell(1).value = `     Tổng:  ${String(grandTotal).padStart(2, "0")} bữa (${buaText} bữa)`;
    ws.mergeCells(totalBuaRow.number, 1, totalBuaRow.number, kyCol);
    totalBuaRow.getCell(1).font = { bold: true, size: 12, name: fontTNR };
    totalBuaRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    totalBuaRow.getCell(1).border = { top: { style: "thin" } };

    // --- Ghi chú row --- (A=" ", B="Ghi chú" BOLD sz=10, merge C:M)
    const noteRow = ws.addRow([]);
    noteRow.height = 21.75;
    noteRow.getCell(1).value = " ";
    noteRow.getCell(1).font = { size: 10, name: fontTNR };
    noteRow.getCell(2).value = "Ghi chú";
    noteRow.getCell(2).font = { bold: true, size: 10, name: fontTNR };
    noteRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    const ghiChuEndCol = Math.min(dayStartCol + 10, lastDayCol);
    ws.mergeCells(noteRow.number, dayStartCol, noteRow.number, ghiChuEndCol);

    // --- Date & signature row --- (merge T:AI, italic sz=12, center, middle)
    const signDateRow = ws.addRow([]);
    signDateRow.height = 14.25;
    const now = dateRange[1];
    // Start from ~col 20 (T) to lastDayCol (AI)
    const signStartCol = Math.max(20, dayStartCol);
    signDateRow.getCell(signStartCol).value = `          Quảng Trị, ngày ${now.format("DD")} Tháng ${now.format("MM")} năm ${now.format("YYYY")}         `;
    signDateRow.getCell(signStartCol).font = { italic: true, size: 12, name: fontTNR };
    signDateRow.getCell(signStartCol).alignment = { horizontal: "center", vertical: "middle" };
    if (lastDayCol > signStartCol) {
      ws.mergeCells(signDateRow.number, signStartCol, signDateRow.number, lastDayCol);
    }

    // --- "Người lập" row --- (merge B:E, G:R, U:AH, BOLD sz=12, center, middle)
    const signTitleRow = ws.addRow([]);
    signTitleRow.height = 15.4;
    ws.mergeCells(signTitleRow.number, 2, signTitleRow.number, 5);
    const nguoiLapEnd = Math.min(18, lastDayCol);
    if (nguoiLapEnd > 7) {
      ws.mergeCells(signTitleRow.number, 7, signTitleRow.number, nguoiLapEnd);
    }
    const nguoiLap2Start = Math.min(21, lastDayCol);
    const nguoiLap2End = Math.min(lastDayCol - 1, lastDayCol);
    if (nguoiLap2End > nguoiLap2Start) {
      signTitleRow.getCell(nguoiLap2Start).value = "Người lập";
      signTitleRow.getCell(nguoiLap2Start).font = { bold: true, size: 12, name: fontTNR };
      signTitleRow.getCell(nguoiLap2Start).alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(signTitleRow.number, nguoiLap2Start, signTitleRow.number, nguoiLap2End);
    }

    // --- "(Ký, họ tên)" row --- (merge B:E, G:R, V:AH, sz=12, center, middle)
    const signNameRow = ws.addRow([]);
    signNameRow.height = 15.4;
    ws.mergeCells(signNameRow.number, 2, signNameRow.number, 5);
    const kyGEnd = Math.min(18, lastDayCol);
    if (kyGEnd > 7) {
      ws.mergeCells(signNameRow.number, 7, signNameRow.number, kyGEnd);
    }
    const kyVStart = Math.min(22, lastDayCol);
    const kyVEnd = Math.min(lastDayCol - 1, lastDayCol);
    if (kyVEnd > kyVStart) {
      signNameRow.getCell(kyVStart).value = "(Ký, họ tên)       ";
      signNameRow.getCell(kyVStart).font = { size: 12, name: fontTNR };
      signNameRow.getCell(kyVStart).alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(signNameRow.number, kyVStart, signNameRow.number, kyVEnd);
    }

    // --- Column widths (matching original) ---
    ws.getColumn(1).width = 5.56; // A: STT
    ws.getColumn(2).width = 21.44; // B: Họ và tên
    for (let i = 0; i < numDays * numSlots; i++) {
      ws.getColumn(dayStartCol + i).width = 5.44; // day columns
    }
    ws.getColumn(tongCol).width = 5.56; // Tổng
    ws.getColumn(kyCol).width = 17.31; // Ký nhận

    // --- Write file ---
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(
      blob,
      `com-ca_${dateRange[0].format("DD-MM-YYYY")}_${dateRange[1].format("DD-MM-YYYY")}.xlsx`
    );
  }, [dateRange, personnelList, mealData, grandTotal, activeSlots]);

  // --- Image Export ---

  const handleExportImage = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `com-ca_${dateRange[0].format("DD-MM-YYYY")}_${dateRange[1].format("DD-MM-YYYY")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      message.error("Export image failed");
    }
  }, [dateRange]);

  // --- Sync to Google Sheet ---

  const handleSyncSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const allDays = getDaysInRange(dateRange[0], dateRange[1]);

      const res = await fetch("/api/google-sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatRows,
          days: allDays.map((d) => d.format("DD")),
          dateRange: [dateRange[0].format("DD/MM/YYYY"), dateRange[1].format("DD/MM/YYYY")],
          grandTotal,
          grandTotalText: numberToVietnamese(grandTotal),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSheetUrl(data.sheetUrl);
      message.success(t("syncSuccess", { count: data.rowCount }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("syncError", { message: msg }));
    } finally {
      setSyncing(false);
    }
  }, [flatRows, dateRange, grandTotal, t]);

  const handleOpenSheet = useCallback(async () => {
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
      return;
    }
    try {
      const res = await fetch("/api/google-sheets/sync");
      const data = await res.json();
      if (data.sheetUrl) {
        setSheetUrl(data.sheetUrl);
        window.open(data.sheetUrl, "_blank");
      }
    } catch {
      // silently fail
    }
  }, [sheetUrl]);

  // --- Table columns ---

  const columns: ColumnsType<FlatRow> = useMemo(() => {
    const cols: ColumnsType<FlatRow> = [
      {
        title: "STT",
        dataIndex: "stt",
        key: "stt",
        width: 50,
        fixed: "left",
        render: (val: number | string, record: FlatRow) =>
          record.isSection ? (
            <span className="font-bold">{val}</span>
          ) : (
            <span>{val}</span>
          ),
      },
      {
        title: t("driverName"),
        dataIndex: "hoTen",
        key: "hoTen",
        width: 180,
        fixed: "left",
        render: (val: string, record: FlatRow) =>
          record.isSection ? (
            <span className="font-bold text-neutral-700">{val}</span>
          ) : (
            <span>{val}</span>
          ),
      },
    ];

    // Day columns
    for (const day of days) {
      const dateStr = day.format("DD");
      const dayLabel = day.date();

      cols.push({
        title: String(dayLabel),
        key: `day-${dateStr}`,
        children: activeSlots.map((slot) => ({
          title: slot.label.charAt(0), // T, C, T
          key: `${dateStr}-${slot.key}`,
          width: 35,
          align: "center" as const,
          render: (_: unknown, record: FlatRow) => {
            if (record.isSection) return null;
            const dm = record.meals[dateStr];
            if (!dm) return null;
            const hasIt = dm[slot.key];
            return hasIt ? (
              <Tag color="success" className="m-0 px-1">
                <CheckCircle size={12} />
              </Tag>
            ) : null;
          },
        })),
      });
    }

    cols.push({
      title: "Tổng",
      dataIndex: "total",
      key: "total",
      width: 60,
      fixed: "right",
      render: (val: number, record: FlatRow) =>
        record.isSection ? null : (
          <span className="font-semibold">{val}</span>
        ),
    });

    return cols;
  }, [days, activeSlots, t]);

  return (
    <div className="px-6 py-8 max-w-[1600px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <UtensilsCrossed size={22} className="text-amber-600" strokeWidth={2.5} />
          <h1 className="text-2xl font-bold m-0 tracking-tight text-neutral-800">
            {t("title")}
          </h1>
        </div>
        <p className="text-neutral-500 text-sm m-0 ml-[34px]">{t("description")}</p>
      </div>

      {/* Controls */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-end gap-5">
          {/* Date range */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {t("date")}
            </label>
            <RangePicker
              value={dateRange}
              onChange={(val) => {
                if (val && val[0] && val[1]) setDateRange([val[0], val[1]]);
              }}
              format="DD/MM/YYYY"
              allowClear={false}
              style={{ width: 280 }}
            />
          </div>

          {/* Meal slots select */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {t("timeRange")}
            </label>
            <Select
              mode="multiple"
              value={selectedSlots}
              onChange={setSelectedSlots}
              placeholder={t("timeRange")}
              style={{ minWidth: 280 }}
              options={MEAL_SLOTS.map((slot) => ({
                value: slot.key,
                label: `${slot.label}: ${String(slot.fromH).padStart(2, "0")}:${String(slot.fromM).padStart(2, "0")}-${String(slot.toH).padStart(2, "0")}:${String(slot.toM).padStart(2, "0")}`,
              }))}
            />
          </div>

          {/* Location toggle */}
          <button
            type="button"
            onClick={() => setShowLocation(!showLocation)}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide
              hover:text-neutral-700 transition-colors cursor-pointer bg-transparent border-0 pb-2"
          >
            <MapPin size={13} />
            {t("locationSettings")}
            {showLocation ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Check button */}
          <div className="ml-auto">
            <Button
              type="primary"
              icon={<Search size={15} />}
              onClick={handleCheck}
              loading={loading}
              disabled={selectedSlots.length === 0}
              size="large"
              style={{
                backgroundColor: "#b45309",
                borderColor: "#b45309",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {t("check")}
            </Button>
          </div>
        </div>

        {/* Location settings */}
        {showLocation && (
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-neutral-200">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("latitude")}
              </label>
              <InputNumber
                value={latitude}
                onChange={(val) => val !== null && setLatitude(val)}
                step={0.0001}
                style={{ width: 180 }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("longitude")}
              </label>
              <InputNumber
                value={longitude}
                onChange={(val) => val !== null && setLongitude(val)}
                step={0.0001}
                style={{ width: 180 }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("radius")}
              </label>
              <InputNumber
                value={radius}
                onChange={(val) => val !== null && setRadius(val)}
                min={10}
                max={1000}
                step={10}
                style={{ width: 120 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {loading && progress.total > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-neutral-500">
              {t("progress", { current: progress.current, total: progress.total })}
            </span>
            <span className="text-sm font-semibold text-neutral-700">
              {Math.round((progress.current / progress.total) * 100)}%
            </span>
          </div>
          <Progress
            percent={Math.round((progress.current / progress.total) * 100)}
            showInfo={false}
            strokeColor="#b45309"
            size="small"
          />
        </div>
      )}

      {/* Summary */}
      {checked && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-md px-4 py-2.5">
            <span className="text-2xl font-bold text-neutral-800 tabular-nums leading-none">
              {flatRows.filter((r) => !r.isSection).length}
            </span>
            <span className="text-xs text-neutral-500 font-medium uppercase">
              Nhân viên
            </span>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5">
            <span className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
              {grandTotal}
            </span>
            <span className="text-xs text-emerald-600 font-medium uppercase">
              Tổng bữa ăn
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              icon={<Download size={15} />}
              onClick={handleExportExcel}
              disabled={flatRows.length === 0}
              style={{ fontWeight: 600 }}
            >
              {t("exportExcel")}
            </Button>
            <Button
              icon={<ImageDown size={15} />}
              onClick={handleExportImage}
              disabled={flatRows.length === 0}
              style={{ fontWeight: 600 }}
            >
              {t("exportImage")}
            </Button>
            <Button
              icon={<RefreshCw size={15} className={syncing ? "animate-spin" : ""} />}
              onClick={handleSyncSheet}
              loading={syncing}
              disabled={flatRows.length === 0}
              style={{ fontWeight: 600 }}
            >
              {t("syncSheet")}
            </Button>
            <Button
              icon={<ExternalLink size={15} />}
              onClick={handleOpenSheet}
              style={{ fontWeight: 600 }}
            >
              {t("openSheet")}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef}>
        <Table
          columns={columns}
          dataSource={flatRows}
          rowKey={(record, index) => `${record.stt}-${record.hoTen}-${index}`}
          loading={loading && progress.total === 0}
          pagination={false}
          scroll={{ x: 800 + days.length * 35 * activeSlots.length }}
          size="small"
          bordered
          rowClassName={(record) =>
            record.isSection ? "bg-amber-50/60 font-semibold" : ""
          }
        />
      </div>
    </div>
  );
}
