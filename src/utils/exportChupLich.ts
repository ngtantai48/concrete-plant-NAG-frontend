import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { Work } from "@/types/work";
import type {
  WorkAssignmentDraft,
  WorkMixerAssignmentDraft,
  WorkPersonnel,
  WorkTaskAssignmentDraft,
  WorkVehicle,
} from "@/types/work-arrangement";

export interface ChupLichExportParams {
  workDate: string; // YYYY-MM-DD
  personnel: WorkPersonnel[];
  pumpDraft: WorkAssignmentDraft;
  pumpVehicles: WorkVehicle[];
  mixerDraft: WorkMixerAssignmentDraft;
  mixerVehicles: WorkVehicle[];
  works: Work[];
  taskDraft: WorkTaskAssignmentDraft;
  lotLabels: string[];
  offNames: string[];
}

export type ChupLichFormat = "excel" | "image";

const HEADER_FILL = "FFD9E1F2"; // xanh nhạt cho tiêu đề
const PUMP_FILL: Record<string, string> = {
  B1: "FFFFFF00",
  B2: "FF92D050",
  B3: "FF00FFFF",
  B4: "FFFFC000",
  B5: "FFFF99FF",
};

const THIN = { style: "thin" as const, color: { argb: "FF9AA7B8" } };
const MED = { style: "medium" as const, color: { argb: "FF5B6B7F" } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

type CellStyle = {
  bold?: boolean;
  fill?: string;
  align?: "left" | "center" | "right";
  wrap?: boolean;
  size?: number;
};

const styleCell = (cell: ExcelJS.Cell, style: CellStyle = {}) => {
  cell.border = ALL_BORDERS;
  cell.alignment = {
    vertical: "middle",
    horizontal: style.align ?? "left",
    wrapText: style.wrap ?? false,
  };
  cell.font = { name: "Arial", size: style.size ?? 11, bold: style.bold ?? false };
  if (style.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
  }
};

const formatDateTitle = (workDate: string) => {
  const [year, month, day] = workDate.split("-");
  if (!year || !month || !day) return workDate;
  return `${day}/${month}/${year.slice(2)}`;
};

const getPumpBCode = (vehicle?: WorkVehicle): string | null => {
  const match = String(vehicle?.vehicle_name || "").match(/B\s*0*(\d+)/i);
  return match ? `B${match[1]}` : null;
};

// ---- Model dùng chung cho cả Excel và Ảnh (tránh lệch logic) ----
export interface ChupLichPumpRow {
  tt: number;
  label: string;
  fill: string | null; // ARGB ("FFFFFF00") hoặc null
  driver: string;
  operator: string;
  hose: string;
}

export interface ChupLichWorkSection {
  letter: string; // C, D, E...
  title: string;
  rows: { tt: number; name: string; people: string }[];
}

export interface ChupLichModel {
  title: string;
  pumpRows: ChupLichPumpRow[];
  lotLabels: string[];
  workSections: ChupLichWorkSection[];
  mixers: { name: string; plate: string; driver: string }[];
  offNames: string[];
}

export function buildChupLichModel(params: ChupLichExportParams): ChupLichModel {
  const {
    workDate,
    personnel,
    pumpDraft,
    pumpVehicles,
    mixerDraft,
    mixerVehicles,
    works,
    taskDraft,
    lotLabels,
    offNames,
  } = params;

  const personnelById = new Map(personnel.map((person) => [person.user_id, person]));
  const shortName = (userId: number) => {
    const person = personnelById.get(userId);
    return person?.user_short_name || person?.user_full_name || `#${userId}`;
  };
  const joinPeople = (userIds: number[]) => userIds.map(shortName).join("; ");

  const pumpVehicleById = new Map(pumpVehicles.map((vehicle) => [vehicle.vehicle_id, vehicle]));
  const mixerDriverByVehicle = new Map<number, number>();
  for (const item of mixerDraft.mixer_assignments) {
    if (item.user_id != null) mixerDriverByVehicle.set(item.vehicle_id, item.user_id);
  }
  const worksById = new Map(works.map((work) => [work.work_id, work]));

  const pumpRows: ChupLichPumpRow[] = pumpDraft.pump_assignments.map((assignment, index) => {
    const vehicle = pumpVehicleById.get(assignment.vehicle_id);
    const label =
      [vehicle?.vehicle_license_plate, vehicle?.vehicle_name].filter(Boolean).join(" - ") ||
      `#${assignment.vehicle_id}`;
    return {
      tt: index + 1,
      label,
      fill: PUMP_FILL[getPumpBCode(vehicle) || ""] ?? null,
      driver: joinPeople(assignment.roles.driver || []),
      operator: joinPeople(assignment.roles.operator || []),
      hose: joinPeople(assignment.roles.hose || []),
    };
  });

  const sectionMap = new Map<number, { parent: Work; rows: { name: string; people: string }[] }>();
  for (const task of taskDraft.task_assignments) {
    if (task.user_ids.length === 0) continue;
    const work = worksById.get(task.work_id);
    if (!work) continue;
    const parent = work.work_root ? worksById.get(work.work_root) || work : work;
    let section = sectionMap.get(parent.work_id);
    if (!section) {
      section = { parent, rows: [] };
      sectionMap.set(parent.work_id, section);
    }
    section.rows.push({
      name: parent.work_id === work.work_id ? "" : work.work_name,
      people: joinPeople(task.user_ids),
    });
  }
  const workSections: ChupLichWorkSection[] = Array.from(sectionMap.values())
    .sort((a, b) => a.parent.work_id - b.parent.work_id)
    .map((section, index) => ({
      letter: String.fromCharCode(67 + index), // C, D, E...
      title: section.parent.work_name.toUpperCase(),
      rows: section.rows.map((row, rowIndex) => ({
        tt: rowIndex + 1,
        name: row.name,
        people: row.people,
      })),
    }));

  const sortedMixers = [...mixerVehicles].sort((a, b) =>
    String(a.vehicle_name || a.vehicle_license_plate || "").localeCompare(
      String(b.vehicle_name || b.vehicle_license_plate || ""),
      "en",
      { numeric: true, sensitivity: "base" }
    )
  );
  const mixers = sortedMixers.map((vehicle) => {
    const driverId = mixerDriverByVehicle.get(vehicle.vehicle_id);
    return {
      name: vehicle.vehicle_name || "",
      plate: vehicle.vehicle_license_plate || "",
      driver: driverId != null ? shortName(driverId) : "",
    };
  });

  return {
    title: `CÔNG VIỆC NGÀY ${formatDateTitle(workDate)}`,
    pumpRows,
    lotLabels,
    workSections,
    mixers,
    offNames,
  };
}

export async function exportChupLichExcel(params: ChupLichExportParams): Promise<void> {
  const { workDate } = params;
  const model = buildChupLichModel(params);

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("CHUP LICH", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  ws.getColumn(1).width = 5; // A - TT
  ws.getColumn(2).width = 31; // B - biển số / công việc
  ws.getColumn(3).width = 15; // C - lái xe
  ws.getColumn(4).width = 15; // D - vận hành
  ws.getColumn(5).width = 15; // E - ôm vòi
  ws.getColumn(6).width = 2.5; // F - gap
  ws.getColumn(7).width = 6; // G - KH
  ws.getColumn(8).width = 25; // H - biển số xe bồn
  ws.getColumn(9).width = 14; // I - thực hiện

  // ----- Tiêu đề -----
  ws.mergeCells(1, 1, 2, 9);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = model.title;
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.font = { name: "Arial", size: 18, bold: true };
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 14;

  // ===== VÙNG TRÁI =====
  let leftRow = 3;

  // Header trái
  ws.getCell(leftRow, 1).value = "TT";
  styleCell(ws.getCell(leftRow, 1), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(leftRow, 2).value = "BIỂN SỐ XE/KÝ HIỆU";
  styleCell(ws.getCell(leftRow, 2), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.mergeCells(leftRow, 3, leftRow, 5);
  ws.getCell(leftRow, 3).value = "NGƯỜI THỰC HIỆN";
  styleCell(ws.getCell(leftRow, 3), { bold: true, fill: HEADER_FILL, align: "center" });
  styleCell(ws.getCell(leftRow, 4), { fill: HEADER_FILL });
  styleCell(ws.getCell(leftRow, 5), { fill: HEADER_FILL });
  leftRow += 1;

  // Section A - Xe bơm header
  ws.getCell(leftRow, 1).value = "A";
  styleCell(ws.getCell(leftRow, 1), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(leftRow, 2).value = "XE BƠM";
  styleCell(ws.getCell(leftRow, 2), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(leftRow, 3).value = "LÁI XE";
  styleCell(ws.getCell(leftRow, 3), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(leftRow, 4).value = "VẬN HÀNH";
  styleCell(ws.getCell(leftRow, 4), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(leftRow, 5).value = "ÔM VÒI";
  styleCell(ws.getCell(leftRow, 5), { bold: true, fill: HEADER_FILL, align: "center" });
  leftRow += 1;

  model.pumpRows.forEach((row) => {
    const fill = row.fill ?? undefined;
    ws.getCell(leftRow, 1).value = row.tt;
    styleCell(ws.getCell(leftRow, 1), { align: "center", fill });
    ws.getCell(leftRow, 2).value = row.label;
    styleCell(ws.getCell(leftRow, 2), { bold: true, fill });
    ws.getCell(leftRow, 3).value = row.driver;
    styleCell(ws.getCell(leftRow, 3), { align: "center" });
    ws.getCell(leftRow, 4).value = row.operator;
    styleCell(ws.getCell(leftRow, 4), { align: "center" });
    ws.getCell(leftRow, 5).value = row.hose;
    styleCell(ws.getCell(leftRow, 5), { align: "center" });
    leftRow += 1;
  });

  // Section B - Lốt trộn
  if (model.lotLabels.length > 0) {
    ws.getCell(leftRow, 1).value = "B";
    styleCell(ws.getCell(leftRow, 1), { bold: true, fill: HEADER_FILL, align: "center" });
    ws.mergeCells(leftRow, 2, leftRow, 5);
    ws.getCell(leftRow, 2).value = "LỐT XE 12H TRỘN";
    styleCell(ws.getCell(leftRow, 2), { bold: true, fill: HEADER_FILL, align: "center" });
    leftRow += 1;

    ws.mergeCells(leftRow, 2, leftRow, 5);
    ws.getCell(leftRow, 2).value = model.lotLabels.join("; ");
    styleCell(ws.getCell(leftRow, 2), { wrap: true });
    styleCell(ws.getCell(leftRow, 1));
    ws.getRow(leftRow).height = 40;
    leftRow += 1;
  }

  // Section C, D, E... - Công việc
  model.workSections.forEach((section) => {
    ws.getCell(leftRow, 1).value = section.letter;
    styleCell(ws.getCell(leftRow, 1), { bold: true, fill: HEADER_FILL, align: "center" });
    ws.getCell(leftRow, 2).value = section.title;
    styleCell(ws.getCell(leftRow, 2), { bold: true, fill: HEADER_FILL, align: "center" });
    ws.mergeCells(leftRow, 3, leftRow, 5);
    ws.getCell(leftRow, 3).value = "NGƯỜI THỰC HIỆN";
    styleCell(ws.getCell(leftRow, 3), { bold: true, fill: HEADER_FILL, align: "center" });
    styleCell(ws.getCell(leftRow, 4), { fill: HEADER_FILL });
    styleCell(ws.getCell(leftRow, 5), { fill: HEADER_FILL });
    leftRow += 1;

    section.rows.forEach((row) => {
      ws.getCell(leftRow, 1).value = row.tt;
      styleCell(ws.getCell(leftRow, 1), { align: "center" });
      if (row.name) {
        ws.getCell(leftRow, 2).value = row.name;
        styleCell(ws.getCell(leftRow, 2));
        ws.mergeCells(leftRow, 3, leftRow, 5);
        ws.getCell(leftRow, 3).value = row.people;
        styleCell(ws.getCell(leftRow, 3));
      } else {
        ws.mergeCells(leftRow, 2, leftRow, 5);
        ws.getCell(leftRow, 2).value = row.people;
        styleCell(ws.getCell(leftRow, 2));
      }
      leftRow += 1;
    });
  });

  // ===== VÙNG PHẢI: Xe bồn + Nhân sự nghỉ =====
  let rightRow = 3;
  ws.getCell(rightRow, 7).value = "KH";
  styleCell(ws.getCell(rightRow, 7), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(rightRow, 8).value = "BIỂN SỐ XE";
  styleCell(ws.getCell(rightRow, 8), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.getCell(rightRow, 9).value = "THỰC HIỆN";
  styleCell(ws.getCell(rightRow, 9), { bold: true, fill: HEADER_FILL, align: "center" });
  rightRow += 1;

  model.mixers.forEach((mixer) => {
    ws.getCell(rightRow, 7).value = mixer.name;
    styleCell(ws.getCell(rightRow, 7), { bold: true, align: "center" });
    ws.getCell(rightRow, 8).value = mixer.plate;
    styleCell(ws.getCell(rightRow, 8));
    ws.getCell(rightRow, 9).value = mixer.driver;
    styleCell(ws.getCell(rightRow, 9), { align: "center" });
    rightRow += 1;
  });

  // Nhân sự nghỉ
  ws.getCell(rightRow, 7).value = "TT";
  styleCell(ws.getCell(rightRow, 7), { bold: true, fill: HEADER_FILL, align: "center" });
  ws.mergeCells(rightRow, 8, rightRow, 9);
  ws.getCell(rightRow, 8).value = "NHÂN SỰ NGHỈ";
  styleCell(ws.getCell(rightRow, 8), { bold: true, fill: HEADER_FILL, align: "center" });
  rightRow += 1;

  model.offNames.forEach((name, index) => {
    ws.getCell(rightRow, 7).value = index + 1;
    styleCell(ws.getCell(rightRow, 7), { align: "center" });
    ws.mergeCells(rightRow, 8, rightRow, 9);
    ws.getCell(rightRow, 8).value = name;
    styleCell(ws.getCell(rightRow, 8));
    rightRow += 1;
  });

  // Viền ngoài đậm cho 2 vùng (trái A–D + phải Xe bồn).
  const outline = (r1: number, c1: number, r2: number, c2: number) => {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r1, c).border = { ...ws.getCell(r1, c).border, top: MED };
      ws.getCell(r2, c).border = { ...ws.getCell(r2, c).border, bottom: MED };
    }
    for (let row = r1; row <= r2; row++) {
      ws.getCell(row, c1).border = { ...ws.getCell(row, c1).border, left: MED };
      ws.getCell(row, c2).border = { ...ws.getCell(row, c2).border, right: MED };
    }
  };
  outline(3, 1, leftRow - 1, 5);
  outline(3, 7, rightRow - 1, 9);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `BO_TRI_CONG_VIEC_${workDate}.xlsx`);
}
