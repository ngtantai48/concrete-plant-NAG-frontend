import type { Dayjs } from "dayjs";
import type { WorkAttendanceStatus, WorkPersonnel } from "@/types/work-arrangement";

export const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const PREFERRED_DEPARTMENT_ORDER = ["QLSX", "VHT", "QA/QC", "Tổ bơm", "Bơm tĩnh", "Xe bồn"];

export const STATUS_META: Record<
  WorkAttendanceStatus,
  { dot: string; text: string; tint: string; border: string }
> = {
  working: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    tint: "bg-emerald-50",
    border: "border-emerald-200",
  },
  morning: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    tint: "bg-amber-50",
    border: "border-amber-200",
  },
  afternoon: {
    dot: "bg-sky-500",
    text: "text-sky-700",
    tint: "bg-sky-50",
    border: "border-sky-200",
  },
  full_day: {
    dot: "bg-rose-500",
    text: "text-rose-700",
    tint: "bg-rose-50",
    border: "border-rose-200",
  },
};

export const STATUS_ORDER: { key: WorkAttendanceStatus; tkey: string }[] = [
  { key: "working", tkey: "working" },
  { key: "morning", tkey: "morning" },
  { key: "afternoon", tkey: "afternoon" },
  { key: "full_day", tkey: "fullDayOff" },
];

export const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

export const getDateList = (from: Dayjs, to: Dayjs) => {
  const dates: Dayjs[] = [];
  let current = from.startOf("day");
  const end = to.startOf("day");

  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current);
    current = current.add(1, "day");
  }

  return dates;
};

export const getAttendanceCellValue = (
  status: WorkAttendanceStatus | undefined,
  isMarkedDate: boolean
): number | "" => {
  if (!isMarkedDate) return "";
  if (!status) return 1;
  if (status === "morning" || status === "afternoon") return 0.5;
  if (status === "full_day") return 0;
  return 1;
};

export const getAttendancePoints = (
  status: WorkAttendanceStatus | undefined,
  isMarkedDate: boolean
) => {
  if (!isMarkedDate) return 0;
  if (!status) return 1;
  if (status === "morning" || status === "afternoon") return 0.5;
  if (status === "full_day") return 0;
  return 1;
};

export type AttendancePreviewRow = {
  stt: number;
  person: WorkPersonnel;
  values: (number | "")[];
  total: number;
};

export type AttendancePreviewGroup = {
  departmentName: string;
  groupIndex: number;
  rows: AttendancePreviewRow[];
};

export type AttendancePreviewReport = {
  title: string;
  dates: Dayjs[];
  groups: AttendancePreviewGroup[];
  totalByDay: number[];
  grandTotal: number;
};

export const groupByDepartment = (
  people: WorkPersonnel[],
  unknownLabel: string
): [string, WorkPersonnel[]][] => {
  const groups = new Map<string, WorkPersonnel[]>();
  for (const person of people) {
    const name = person.department_name || unknownLabel;
    const list = groups.get(name) || [];
    list.push(person);
    groups.set(name, list);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => {
    const aIndex = PREFERRED_DEPARTMENT_ORDER.indexOf(a);
    const bIndex = PREFERRED_DEPARTMENT_ORDER.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.localeCompare(b, "vi");
  });
};
