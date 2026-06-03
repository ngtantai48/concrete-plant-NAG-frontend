import type { Dayjs } from "dayjs";
import type { MealCheckReport, MealSlotKey, MealStatusSource } from "@/services/meal-check.service";
import type { UserAssignment } from "@/types/user-assignment";
import type { WorkPersonnel } from "@/types/work-arrangement";

export const MEAL_SLOTS: { key: MealSlotKey; short: string }[] = [
  { key: "sang", short: "S" },
  { key: "trua", short: "Tr" },
  { key: "toi", short: "T" },
];

export const SLOT_SHORT: Record<MealSlotKey, string> = { sang: "S", trua: "Tr", toi: "T" };

export interface CellState {
  id?: number;
  is_allowance: boolean;
  source: MealStatusSource;
  note?: string;
}

// key = `${user_id}__${YYYY-MM-DD}__${slot}`
export type StatusMap = Record<string, CellState>;

export type PendingEdit = {
  userId: number;
  date: string;
  slot: MealSlotKey;
  is_allowance: boolean;
};
export type PendingMap = Record<string, PendingEdit>;

export const cellKey = (userId: number, date: string, slot: MealSlotKey) =>
  `${userId}__${date}__${slot}`;

// Dựng statusMap từ report.by_user.cells (mỗi cell = 1 suất đã ghi DB).
export const buildStatusMapFromReport = (report: MealCheckReport): StatusMap => {
  const map: StatusMap = {};
  for (const user of report.by_user) {
    for (const cell of user.cells) {
      if (!cell.work_date || !cell.meal_slot) continue;
      map[cellKey(user.user_id, cell.work_date, cell.meal_slot)] = {
        is_allowance: true,
        source: cell.source,
      };
    }
  }
  return map;
};

// Chuẩn hoá roster (UserAssignment) về WorkPersonnel để dùng chung tiện ích nhóm/lọc với Chấm Công.
export const rosterToPersonnel = (roster: UserAssignment[]): WorkPersonnel[] =>
  roster.map((p) => ({
    user_id: Number(p.user_id),
    user_full_name: p.user_full_name,
    user_short_name: p.user_short_name ?? null,
    department_id: p.department_id ?? null,
    department_name: p.department_name ?? null,
    skill_id: p.skill_id ?? null,
    skill_name: p.skill_name ?? null,
  }));

export const getDaysInRange = (from: Dayjs, to: Dayjs): Dayjs[] => {
  const days: Dayjs[] = [];
  let current = from.startOf("day");
  const end = to.startOf("day");
  while (current.isBefore(end) || current.isSame(end, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
};

// Số -> chữ tiếng Việt (cơ bản) — dùng cho dòng tổng trong Excel.
export function numberToVietnamese(n: number): string {
  const ones = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
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
    else if (remainder >= 10) s += " " + numberToVietnamese(remainder).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (n < 1000000) {
    const th = Math.floor(n / 1000);
    const remainder = n % 1000;
    let s = numberToVietnamese(th).toLowerCase() + " nghìn";
    if (remainder > 0 && remainder < 100)
      s += " không trăm " + numberToVietnamese(remainder).toLowerCase();
    else if (remainder >= 100) s += " " + numberToVietnamese(remainder).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return String(n);
}
