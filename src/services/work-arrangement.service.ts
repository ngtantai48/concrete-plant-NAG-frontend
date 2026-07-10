import http from "@/lib/http";
import orderApi from "@/services/order.service";
import { workApi } from "@/services/work.service";
import { userAssignmentApi } from "@/services/user-assignment.service";
import vehicleApi from "@/services/vehicle.service";
import vehicleTypeApi from "@/services/vehicle-type.service";
import {
  buildMixerItemNote,
  isVehicleDayTag,
  parseMixerItemNoteTag,
  type VehicleDayTag,
} from "@/services/vehicle-day-tag-utils";
import { buildWorkMixSlotItems, getDisplayShortName } from "@/services/work-mix-slot-utils";
import type {
  WorkArrangementBootstrap,
  WorkAssignmentColumnKey,
  WorkAssignmentDraft,
  WorkAttendanceBootstrap,
  WorkAttendanceDraft,
  WorkAttendanceStatus,
  WorkLegacyAssignmentDraft,
  WorkMixerAssignmentDraft,
  WorkMixSlotItem,
  WorkPersonnel,
  WorkPumpRoleKey,
  WorkTaskAssignmentDraft,
  WorkTaskBootstrap,
  WorkVehicle,
} from "@/types/work-arrangement";
import type { Order } from "@/types/order";
import type { Vehicle, VehicleType } from "@/types/vehicle";
import type { Work } from "@/types/work";

const ATTENDANCE_STORAGE_PREFIX = "nag-work-attendance:";
const ASSIGNMENT_STORAGE_PREFIX = "nag-work-assignment:";

export const WORK_ASSIGNMENT_COLUMNS: {
  key: WorkAssignmentColumnKey;
  label: string;
  workType: string;
}[] = [
  { key: "pump_vehicle", label: "XE BƠM", workType: "XE BƠM" },
  { key: "driver", label: "LÁI XE", workType: "LÁI XE" },
  { key: "operator", label: "VẬN HÀNH", workType: "VẬN HÀNH" },
  { key: "hose", label: "ÔM VÒI", workType: "ÔM VÒI" },
];

export const WORK_PUMP_ROLES: {
  key: WorkPumpRoleKey;
  label: string;
  workType: string;
}[] = [
  { key: "driver", label: "LÁI XE", workType: "LÁI XE" },
  { key: "operator", label: "VẬN HÀNH", workType: "VẬN HÀNH" },
  { key: "hose", label: "ÔM VÒI", workType: "ÔM VÒI" },
];

export const MIXER_WORK_TYPE = "XE BỒN";
export const MIXER_DRIVER_ROLE = "LÁI XE";

export interface WorkAttendanceRangeExportData {
  personnel: WorkPersonnel[];
  statusesByDate: Record<string, Record<number, WorkAttendanceStatus>>;
  markedDates: Record<string, boolean>;
}

type BackendArrangementDay = {
  work_arrangement_day_id?: number;
  arrangement_day_id?: number;
  id?: number;
  arrangement_date?: string;
  arrangement_status?: string;
  delete_flag?: boolean;
};

type BackendArrangementItem = {
  work_arrangement_item_id?: number;
  arrangement_item_id?: number;
  item_id?: number;
  id?: number;
  work_arrangement_day_id?: number;
  vehicle_id?: number | null;
  work_type?: string | null;
  department_id?: number | null;
  skill_id?: number | null;
  item_note?: string | null;
  display_order?: number;
  delete_flag?: boolean;
};

type BackendArrangementPersonnel = {
  work_arrangement_personnel_id?: number;
  arrangement_personnel_id?: number;
  personnel_id?: number;
  id?: number;
  work_arrangement_item_id?: number;
  user_id?: number;
  department_id_snapshot?: number | null;
  skill_id_snapshot?: number | null;
  personnel_role?: string | null;
  replacement_for_user_id?: number | null;
  delete_flag?: boolean;
};

type BackendUserDayStatus = {
  user_day_status_id?: number;
  day_status_id?: number;
  id?: number;
  user_id?: number;
  work_date?: string;
  day_status?: "working" | "off" | "half_day" | "leave" | "absent" | string;
  status_reason?: string | null;
  status_source?: string | null;
  delete_flag?: boolean;
};

type BackendAttendanceDailyRecord = {
  attendance_daily_record_id?: number;
  daily_record_id?: number;
  record_id?: number;
  id?: number;
  work_date?: string;
  attendance_date?: string;
  record_date?: string;
  date?: string;
  record_status?: string;
  attendance_status?: string;
  status_source?: string;
  delete_flag?: boolean;
};

type BackendAttendanceDailyRecordItem = BackendAttendanceDailyRecord | string;

export const createEmptyAssignmentColumns = (): Record<WorkAssignmentColumnKey, number[]> => ({
  pump_vehicle: [],
  driver: [],
  operator: [],
  hose: [],
});

export const createEmptyPumpRoles = (): Record<WorkPumpRoleKey, number[]> => ({
  driver: [],
  operator: [],
  hose: [],
});

export const createEmptyAttendanceDraft = (workDate: string): WorkAttendanceDraft => ({
  work_date: workDate,
  user_statuses: [],
});

export const createEmptyAssignmentDraft = (workDate: string): WorkAssignmentDraft => ({
  work_date: workDate,
  pump_assignments: [],
});

export const createEmptyMixerAssignmentDraft = (workDate: string): WorkMixerAssignmentDraft => ({
  work_date: workDate,
  mixer_assignments: [],
});

export const WORK_TASK_PREFIX = "CV:";
const WORK_TASK_ROLE = "CV";

export const createEmptyWorkTaskDraft = (workDate: string): WorkTaskAssignmentDraft => ({
  work_date: workDate,
  task_assignments: [],
});

const getRecord = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

const getArrayFromPayload = <T>(payload: unknown, keys: string[]): T[] => {
  if (Array.isArray(payload)) return payload as T[];

  const record = getRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
  }

  const data = record.data;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }

  return [];
};

const getNumberFromPayload = (payload: unknown, keys: string[]) => {
  const record = getRecord(payload);
  const candidates: Record<string, unknown>[] = [record];

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    candidates.push(record.data as Record<string, unknown>);
  }
  if (record.meta && typeof record.meta === "object") {
    candidates.push(record.meta as Record<string, unknown>);
  }
  if (record.pagination && typeof record.pagination === "object") {
    candidates.push(record.pagination as Record<string, unknown>);
  }

  for (const candidate of candidates) {
    for (const key of keys) {
      const value = Number(candidate[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return 0;
};

const getItemFromPayload = <T>(payload: unknown): T => {
  const record = getRecord(payload);
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    return record.data as T;
  }
  return payload as T;
};

const shouldUseLocalFallback = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !status || status === 404 || status === 405 || status === 501;
};

const readLocalJson = <T>(key: string): T | null => {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeLocalJson = <T extends { updated_at?: string }>(key: string, value: T): T => {
  const next = { ...value, updated_at: new Date().toISOString() };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(next));
  }

  return next;
};

const normalizeAttendanceDraftShape = (
  draft: (Partial<WorkAttendanceDraft> & { half_day_user_ids?: number[] }) | null,
  workDate: string
): WorkAttendanceDraft | null => {
  if (!draft) return null;

  if (Array.isArray(draft.user_statuses)) {
    return {
      work_date: draft.work_date || workDate,
      user_statuses: draft.user_statuses.filter((entry) => entry.status !== "working"),
      updated_at: draft.updated_at,
    };
  }

  return {
    work_date: draft.work_date || workDate,
    user_statuses: Array.isArray(draft.half_day_user_ids)
      ? draft.half_day_user_ids.map((userId) => ({ user_id: userId, status: "morning" }))
      : [],
    updated_at: draft.updated_at,
  };
};

const getLocalAttendanceDraft = (workDate: string) =>
  normalizeAttendanceDraftShape(
    readLocalJson<Partial<WorkAttendanceDraft> & { half_day_user_ids?: number[] }>(
      `${ATTENDANCE_STORAGE_PREFIX}${workDate}`
    ),
    workDate
  );

const setLocalAttendanceDraft = (draft: WorkAttendanceDraft) =>
  writeLocalJson(`${ATTENDANCE_STORAGE_PREFIX}${draft.work_date}`, draft);

const normalizeAssignmentDraftShape = (
  draft: (Partial<WorkAssignmentDraft> & Partial<WorkLegacyAssignmentDraft>) | null,
  workDate: string
): WorkAssignmentDraft | null => {
  if (!draft) return null;

  if (Array.isArray(draft.pump_assignments)) {
    return {
      work_date: draft.work_date || workDate,
      pump_assignments: draft.pump_assignments.map((assignment) => ({
        assignment_id: assignment.assignment_id,
        vehicle_id: Number(assignment.vehicle_id),
        roles: {
          ...createEmptyPumpRoles(),
          ...assignment.roles,
        },
      })),
      updated_at: draft.updated_at,
    };
  }

  return {
    work_date: draft.work_date || workDate,
    pump_assignments: [],
    columns: draft.columns,
    updated_at: draft.updated_at,
  };
};

const getLocalAssignmentDraft = (workDate: string) =>
  normalizeAssignmentDraftShape(
    readLocalJson<Partial<WorkAssignmentDraft> & Partial<WorkLegacyAssignmentDraft>>(
      `${ASSIGNMENT_STORAGE_PREFIX}${workDate}`
    ),
    workDate
  );

const setLocalAssignmentDraft = (draft: WorkAssignmentDraft) =>
  writeLocalJson(`${ASSIGNMENT_STORAGE_PREFIX}${draft.work_date}`, draft);

const MIXER_STORAGE_PREFIX = "nag-work-mixer:";

const getLocalMixerDraft = (workDate: string): WorkMixerAssignmentDraft | null => {
  const raw = readLocalJson<Partial<WorkMixerAssignmentDraft>>(
    `${MIXER_STORAGE_PREFIX}${workDate}`
  );
  if (!raw || !Array.isArray(raw.mixer_assignments)) return null;
  return {
    work_date: raw.work_date || workDate,
    mixer_assignments: raw.mixer_assignments
      .filter((a) => a && a.vehicle_id != null)
      .map((a) => ({
        assignment_id: a.assignment_id || `mixer:${a.vehicle_id}`,
        vehicle_id: Number(a.vehicle_id),
        user_id: a.user_id != null ? Number(a.user_id) : null,
        day_tag: isVehicleDayTag(a.day_tag) ? a.day_tag : null,
      })),
    updated_at: raw.updated_at,
  };
};

const setLocalMixerDraft = (draft: WorkMixerAssignmentDraft) =>
  writeLocalJson(`${MIXER_STORAGE_PREFIX}${draft.work_date}`, draft);

const getBackendId = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = Number(record[key]);
    if (value > 0) return value;
  }
  return 0;
};

const getArrangementDayId = (day: BackendArrangementDay) =>
  getBackendId(day as Record<string, unknown>, [
    "work_arrangement_day_id",
    "arrangement_day_id",
    "id",
  ]);

const getArrangementItemId = (item: BackendArrangementItem) =>
  getBackendId(item as Record<string, unknown>, [
    "work_arrangement_item_id",
    "arrangement_item_id",
    "item_id",
    "id",
  ]);

const getArrangementPersonnelId = (personnel: BackendArrangementPersonnel) =>
  getBackendId(personnel as Record<string, unknown>, [
    "work_arrangement_personnel_id",
    "arrangement_personnel_id",
    "personnel_id",
    "id",
  ]);

const getUserDayStatusId = (status: BackendUserDayStatus) =>
  getBackendId(status as Record<string, unknown>, ["user_day_status_id", "day_status_id", "id"]);

const normalizeDate = (value?: string) => String(value || "").slice(0, 10);

const getAttendanceDailyRecordDate = (record: BackendAttendanceDailyRecordItem) => {
  if (typeof record === "string") return normalizeDate(record);

  return normalizeDate(
    record.work_date || record.attendance_date || record.record_date || record.date
  );
};

const ATTENDANCE_DAILY_RECORD_KEYS = [
  "attendance_daily_records",
  "daily_records",
  "records",
  "dates",
  "items",
  "results",
  "rows",
];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDateList = (fromDate: string, toDate: string) => {
  const dates: string[] = [];
  const current = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);

  while (current <= end) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

const getPreviousDate = (workDate: string) => {
  const current = new Date(`${workDate}T00:00:00`);
  if (Number.isNaN(current.getTime())) return "";

  current.setDate(current.getDate() - 1);
  return formatDateKey(current);
};

const normalizeStatusReason = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

const getAttendanceStatusFromBackend = (status: BackendUserDayStatus): WorkAttendanceStatus => {
  if (status.day_status === "half_day") {
    const reason = normalizeStatusReason(status.status_reason || status.status_source);
    return reason.includes("chieu") || reason.includes("afternoon") ? "afternoon" : "morning";
  }

  if (
    status.day_status === "off" ||
    status.day_status === "leave" ||
    status.day_status === "absent"
  ) {
    return "full_day";
  }

  return "working";
};

const getBackendDayStatusFromAttendanceStatus = (status: WorkAttendanceStatus) => {
  if (status === "morning" || status === "afternoon") return "half_day";
  if (status === "full_day") return "off";
  return "working";
};

const getHalfDayUserIdsFromAttendanceDraft = (draft?: WorkAttendanceDraft | null) =>
  (draft?.user_statuses || [])
    .filter((entry) => entry.status === "morning" || entry.status === "afternoon")
    .map((entry) => entry.user_id);

const normalizeWorkType = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getColumnByWorkType = (value: unknown): WorkAssignmentColumnKey | null => {
  const normalized = normalizeWorkType(value);

  for (const column of WORK_ASSIGNMENT_COLUMNS) {
    if (
      normalized === normalizeWorkType(column.key) ||
      normalized === normalizeWorkType(column.label) ||
      normalized === normalizeWorkType(column.workType)
    ) {
      return column.key;
    }
  }

  return null;
};

const getPumpRoleByWorkType = (value: unknown): WorkPumpRoleKey | null => {
  const normalized = normalizeWorkType(value);

  for (const role of WORK_PUMP_ROLES) {
    if (
      normalized === normalizeWorkType(role.key) ||
      normalized === normalizeWorkType(role.label) ||
      normalized === normalizeWorkType(role.workType)
    ) {
      return role.key;
    }
  }

  return null;
};

// Nhiều khối trên trang Bố trí công việc cùng mount (kèm StrictMode dev gọi đôi) nên các request
// giống nhau bắn trùng trong cùng một nhịp, khiến backend rate-limit (429) và browser báo Network Error.
// Gộp các request đang bay theo key: cùng key đang chạy thì dùng chung 1 promise.
const inflightRequests = new Map<string, Promise<unknown>>();
const dedupeInflight = <T>(key: string, run: () => Promise<T>): Promise<T> => {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const request = run().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, request);
  return request;
};

const getVehicleTypesShared = () => dedupeInflight("vehicle-types", () => vehicleTypeApi.getAll());

const getPersonnelFallback = (): Promise<WorkPersonnel[]> =>
  dedupeInflight("personnel", async () => {
    const assignments = await userAssignmentApi.list({ limit: 1000 });

    return assignments.data
      .filter((assignment) => !assignment.delete_flag && assignment.user_id)
      .map((assignment) => ({
        user_id: Number(assignment.user_id),
        user_full_name: assignment.user_full_name,
        user_short_name: assignment.user_short_name,
        department_id: assignment.department_id ?? null,
        department_name: assignment.department_name,
        skill_id: assignment.skill_id ?? null,
        skill_name: assignment.skill_name,
      }));
  });

const getVehiclesFromPayload = (payload: unknown) =>
  getArrayFromPayload<Vehicle>(payload, ["vehicles", "data", "items", "results", "rows"]);

const getAllVehicles = async (): Promise<Vehicle[]> => {
  const limit = 1000;
  const firstRes = await vehicleApi.getAll({ page: 1, limit });
  const firstPayload = firstRes.data;
  const firstVehicles = getVehiclesFromPayload(firstPayload);
  const total = getNumberFromPayload(firstPayload, ["total", "count"]);
  const responseLimit =
    getNumberFromPayload(firstPayload, ["limit", "pageSize", "page_size", "per_page"]) ||
    firstVehicles.length ||
    limit;
  const totalPages = total > responseLimit ? Math.ceil(total / responseLimit) : 1;

  if (totalPages <= 1) return firstVehicles;

  const pageGroups = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      vehicleApi.getAll({ page: index + 2, limit: responseLimit })
    )
  );
  const byId = new Map<number, Vehicle>();

  for (const vehicle of [
    ...firstVehicles,
    ...pageGroups.flatMap((res) => getVehiclesFromPayload(res.data)),
  ]) {
    const vehicleId = Number(vehicle.vehicle_id);
    if (vehicleId > 0) byId.set(vehicleId, vehicle);
  }

  return Array.from(byId.values());
};

const SYMBOL_MIXER = "x";

const fetchWorkVehicleSets = async (): Promise<{
  pump: WorkVehicle[];
  mixer: WorkVehicle[];
}> => {
  const [vehicles, vehicleTypeRes] = await Promise.all([getAllVehicles(), getVehicleTypesShared()]);
  const vehicleTypes = getArrayFromPayload<VehicleType>(vehicleTypeRes.data, [
    "vehicle_types",
    "data",
    "items",
    "results",
    "rows",
  ]);
  const typeById = new Map(vehicleTypes.map((type) => [Number(type.vehicle_type_id), type]));

  const pump: WorkVehicle[] = [];
  const mixer: WorkVehicle[] = [];

  for (const vehicle of vehicles) {
    const type = typeById.get(Number(vehicle.vehicle_type_id));
    const symbol = normalizeWorkType(
      (vehicle as WorkVehicle).vehicle_type_symbol || type?.vehicle_type_symbol
    );
    const mapped: WorkVehicle = {
      vehicle_id: Number(vehicle.vehicle_id),
      vehicle_name: vehicle.vehicle_name,
      vehicle_license_plate: vehicle.vehicle_license_plate,
      vehicle_status: vehicle.vehicle_status,
      vehicle_type_id: vehicle.vehicle_type_id,
      vehicle_type_name: type?.vehicle_type_name,
      vehicle_type_symbol:
        (vehicle as WorkVehicle).vehicle_type_symbol || type?.vehicle_type_symbol,
    };
    if (symbol === SYMBOL_MIXER) mixer.push(mapped);
    else pump.push(mapped);
  }

  return { pump, mixer };
};

const getWorkVehicleSets = (): Promise<{ pump: WorkVehicle[]; mixer: WorkVehicle[] }> =>
  dedupeInflight("work-vehicle-sets", fetchWorkVehicleSets);

const listUserDayStatuses = (workDate: string): Promise<BackendUserDayStatus[]> =>
  dedupeInflight(`user-day-status:${workDate}`, async () => {
    const res = await http.get("/user-day-status", {
      params: { work_date: workDate, limit: 1000 },
    });

    return getArrayFromPayload<BackendUserDayStatus>(res.data, [
      "user_day_status",
      "day_statuses",
      "items",
      "results",
      "rows",
    ]).filter((status) => !status.delete_flag && normalizeDate(status.work_date) === workDate);
  });

const createUserDayStatus = async (payload: {
  user_id: number;
  work_date: string;
  day_status: string;
  status_source: string;
  status_reason?: string;
}) => {
  const res = await http.post("/user-day-status", payload);
  return getItemFromPayload<BackendUserDayStatus>(res.data);
};

const updateUserDayStatus = async (
  statusId: number,
  payload: {
    user_id: number;
    work_date: string;
    day_status: string;
    status_source: string;
    status_reason?: string;
  }
) => {
  const res = await http.put(`/user-day-status/${statusId}`, payload);
  return getItemFromPayload<BackendUserDayStatus>(res.data);
};

const deleteUserDayStatus = async (statusId: number) => {
  await http.delete(`/user-day-status/${statusId}`);
};

const uniqueDates = (dates: string[]) => Array.from(new Set(dates.filter(Boolean)));

const filterAttendanceDailyRecordDates = (
  records: BackendAttendanceDailyRecordItem[],
  fromDate: string,
  toDate: string
) =>
  uniqueDates(
    records
      .filter((record) => typeof record === "string" || !record.delete_flag)
      .map((record) => getAttendanceDailyRecordDate(record))
      .filter((date) => date >= fromDate && date <= toDate)
  );

const listAttendanceDailyRecordDatesLegacy = async (workDate: string): Promise<string[]> => {
  const fetchRecords = async (params: Record<string, unknown>) => {
    const res = await http.get("/attendance-daily-records", { params });
    return getArrayFromPayload<BackendAttendanceDailyRecordItem>(
      res.data,
      ATTENDANCE_DAILY_RECORD_KEYS
    );
  };

  try {
    return filterAttendanceDailyRecordDates(
      await fetchRecords({ work_date: workDate, limit: 1000 }),
      workDate,
      workDate
    );
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 400 && status !== 422) throw error;
    return filterAttendanceDailyRecordDates(
      await fetchRecords({ limit: 1000 }),
      workDate,
      workDate
    );
  }
};

const listAttendanceDailyRecordDates = (
  fromDate: string,
  toDate: string,
  recordStatus?: string
): Promise<string[]> =>
  dedupeInflight(`attendance-dates:${fromDate}:${toDate}:${recordStatus || ""}`, async () => {
    try {
      const res = await http.get("/attendance-daily-records/report", {
        params: {
          from: fromDate,
          to: toDate,
          ...(recordStatus ? { record_status: recordStatus } : {}),
        },
      });

      return filterAttendanceDailyRecordDates(
        getArrayFromPayload<BackendAttendanceDailyRecordItem>(
          res.data,
          ATTENDANCE_DAILY_RECORD_KEYS
        ),
        fromDate,
        toDate
      );
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;

      const dates = buildDateList(fromDate, toDate);
      const legacyGroups = await Promise.all(
        dates.map((date) => listAttendanceDailyRecordDatesLegacy(date))
      );
      return uniqueDates(legacyGroups.flat());
    }
  });

type BackendMonthlyReportDay = {
  work_date?: string;
  record_status?: string;
  meta?: BackendUserDayStatus[];
};

// Single month fetch: the report endpoint returns every marked day + its off people
// (with names) in ONE request, replacing the previous one-request-per-day loop.
const fetchMonthlyOffReport = async (
  fromDate: string,
  toDate: string
): Promise<{
  markedDates: string[];
  statusesByDate: Record<string, Record<number, WorkAttendanceStatus>>;
}> => {
  const res = await http.get("/attendance-daily-records/report", {
    params: { from: fromDate, to: toDate },
  });
  const days = getArrayFromPayload<BackendMonthlyReportDay>(res.data, ATTENDANCE_DAILY_RECORD_KEYS);
  const markedDates: string[] = [];
  const statusesByDate: Record<string, Record<number, WorkAttendanceStatus>> = {};

  for (const day of days) {
    const date = normalizeDate(day.work_date);
    if (!date || date < fromDate || date > toDate) continue;

    markedDates.push(date);
    const map: Record<number, WorkAttendanceStatus> = {};
    for (const entry of day.meta || []) {
      const userId = Number(entry.user_id);
      if (userId > 0 && !entry.delete_flag) {
        const status = getAttendanceStatusFromBackend(entry);
        if (status !== "working") map[userId] = status;
      }
    }
    statusesByDate[date] = map;
  }

  return { markedDates: uniqueDates(markedDates), statusesByDate };
};

const createAttendanceDailyRecord = async (workDate: string) => {
  const res = await http.post("/attendance-daily-records", {
    work_date: workDate,
    record_status: "draft",
    status_source: "manual",
  });
  return getItemFromPayload<BackendAttendanceDailyRecord>(res.data);
};

const ensureAttendanceDailyRecord = async (workDate: string) => {
  const existing = (await listAttendanceDailyRecordDates(workDate, workDate))[0];

  if (existing) return existing;

  return createAttendanceDailyRecord(workDate);
};

const listArrangementDays = (workDate: string): Promise<BackendArrangementDay[]> =>
  dedupeInflight(`arrangement-days:${workDate}`, async () => {
    const res = await http.get("/work-arrangement-days", {
      params: { arrangement_date: workDate, limit: 1000 },
    });

    return getArrayFromPayload<BackendArrangementDay>(res.data, [
      "work_arrangement_days",
      "arrangement_days",
      "items",
      "results",
      "rows",
    ]).filter((day) => !day.delete_flag && normalizeDate(day.arrangement_date) === workDate);
  });

const getPreviousArrangementDay = async (workDate: string) => {
  const previousDate = getPreviousDate(workDate);
  if (!previousDate || previousDate === workDate) return undefined;

  return (await listArrangementDays(previousDate))[0];
};

const createArrangementDay = async (workDate: string) => {
  const res = await http.post("/work-arrangement-days", {
    arrangement_date: workDate,
    arrangement_status: "draft",
  });
  return getItemFromPayload<BackendArrangementDay>(res.data);
};

const updateArrangementDay = async (dayId: number, workDate: string) => {
  const res = await http.put(`/work-arrangement-days/${dayId}`, {
    arrangement_date: workDate,
    arrangement_status: "draft",
  });
  return getItemFromPayload<BackendArrangementDay>(res.data);
};

const ensureArrangementDay = async (workDate: string) => {
  const existing = (await listArrangementDays(workDate))[0];
  const existingId = existing ? getArrangementDayId(existing) : 0;

  if (existing && existingId) {
    return updateArrangementDay(existingId, workDate);
  }

  return createArrangementDay(workDate);
};

const listArrangementItems = (dayId: number): Promise<BackendArrangementItem[]> =>
  dedupeInflight(`arrangement-items:${dayId}`, async () => {
    const res = await http.get("/work-arrangement-items", {
      params: { work_arrangement_day_id: dayId, limit: 1000 },
    });

    return getArrayFromPayload<BackendArrangementItem>(res.data, [
      "work_arrangement_items",
      "arrangement_items",
      "items",
      "results",
      "rows",
    ]).filter((item) => !item.delete_flag && Number(item.work_arrangement_day_id) === dayId);
  });

const createArrangementItem = async (
  dayId: number,
  column: (typeof WORK_ASSIGNMENT_COLUMNS)[number],
  displayOrder: number
) => {
  const res = await http.post("/work-arrangement-items", {
    work_arrangement_day_id: dayId,
    vehicle_id: null,
    work_type: column.workType,
    department_id: null,
    skill_id: null,
    item_note: column.label,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const updateArrangementItem = async (
  itemId: number,
  dayId: number,
  column: (typeof WORK_ASSIGNMENT_COLUMNS)[number],
  displayOrder: number
) => {
  const res = await http.put(`/work-arrangement-items/${itemId}`, {
    work_arrangement_day_id: dayId,
    vehicle_id: null,
    work_type: column.workType,
    department_id: null,
    skill_id: null,
    item_note: column.label,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const createPumpArrangementItem = async (
  dayId: number,
  assignment: WorkAssignmentDraft["pump_assignments"][number],
  displayOrder: number
) => {
  const res = await http.post("/work-arrangement-items", {
    work_arrangement_day_id: dayId,
    vehicle_id: assignment.vehicle_id,
    work_type: WORK_ASSIGNMENT_COLUMNS[0].workType,
    department_id: null,
    skill_id: null,
    item_note: WORK_ASSIGNMENT_COLUMNS[0].label,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const updatePumpArrangementItem = async (
  itemId: number,
  dayId: number,
  assignment: WorkAssignmentDraft["pump_assignments"][number],
  displayOrder: number
) => {
  const res = await http.put(`/work-arrangement-items/${itemId}`, {
    work_arrangement_day_id: dayId,
    vehicle_id: assignment.vehicle_id,
    work_type: WORK_ASSIGNMENT_COLUMNS[0].workType,
    department_id: null,
    skill_id: null,
    item_note: WORK_ASSIGNMENT_COLUMNS[0].label,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const deleteArrangementItem = async (itemId: number) => {
  await http.delete(`/work-arrangement-items/${itemId}`);
};

const ensureArrangementItems = async (dayId: number) => {
  const existingItems = await listArrangementItems(dayId);
  const byColumn = new Map<WorkAssignmentColumnKey, BackendArrangementItem>();

  for (const item of existingItems) {
    const columnKey = getColumnByWorkType(item.work_type || item.item_note);
    if (columnKey && !byColumn.has(columnKey)) byColumn.set(columnKey, item);
  }

  const result = new Map<WorkAssignmentColumnKey, BackendArrangementItem>();

  for (const [index, column] of WORK_ASSIGNMENT_COLUMNS.entries()) {
    const existing = byColumn.get(column.key);
    const existingId = existing ? getArrangementItemId(existing) : 0;
    const item = existingId
      ? await updateArrangementItem(existingId, dayId, column, index + 1)
      : await createArrangementItem(dayId, column, index + 1);

    result.set(column.key, item);
  }

  return result;
};

const listArrangementPersonnel = (itemId: number): Promise<BackendArrangementPersonnel[]> =>
  dedupeInflight(`arrangement-personnel:${itemId}`, async () => {
    const res = await http.get("/work-arrangement-personnel", {
      params: { work_arrangement_item_id: itemId, limit: 1000 },
    });

    return getArrayFromPayload<BackendArrangementPersonnel>(res.data, [
      "work_arrangement_personnel",
      "arrangement_personnel",
      "personnel",
      "items",
      "results",
      "rows",
    ]).filter(
      (person) => !person.delete_flag && Number(person.work_arrangement_item_id) === itemId
    );
  });

const createArrangementPersonnel = async (itemId: number, person: WorkPersonnel, role: string) => {
  const res = await http.post("/work-arrangement-personnel", {
    work_arrangement_item_id: itemId,
    user_id: person.user_id,
    department_id_snapshot: person.department_id ?? null,
    skill_id_snapshot: person.skill_id ?? null,
    personnel_role: role,
    replacement_for_user_id: null,
  });
  return getItemFromPayload<BackendArrangementPersonnel>(res.data);
};

const updateArrangementPersonnel = async (
  personnelId: number,
  itemId: number,
  person: WorkPersonnel,
  role: string
) => {
  const res = await http.put(`/work-arrangement-personnel/${personnelId}`, {
    work_arrangement_item_id: itemId,
    user_id: person.user_id,
    department_id_snapshot: person.department_id ?? null,
    skill_id_snapshot: person.skill_id ?? null,
    personnel_role: role,
    replacement_for_user_id: null,
  });
  return getItemFromPayload<BackendArrangementPersonnel>(res.data);
};

const deleteArrangementPersonnel = async (personnelId: number) => {
  await http.delete(`/work-arrangement-personnel/${personnelId}`);
};

const buildDraftFromBackend = async (
  workDate: string,
  day: BackendArrangementDay | undefined
): Promise<WorkAssignmentDraft> => {
  const dayId = day ? getArrangementDayId(day) : 0;
  if (!dayId) return createEmptyAssignmentDraft(workDate);

  const items = await listArrangementItems(dayId);
  const pumpAssignments: WorkAssignmentDraft["pump_assignments"] = [];

  for (const item of items.sort(
    (a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)
  )) {
    if (item.work_type === MIXER_WORK_TYPE) continue; // mixer thuộc về board Xe bồn
    const itemId = getArrangementItemId(item);
    const vehicleId = Number(item.vehicle_id);
    if (!itemId || !vehicleId) continue;

    const people = await listArrangementPersonnel(itemId);
    const roles = createEmptyPumpRoles();

    for (const person of people) {
      const userId = Number(person.user_id);
      const roleKey = getPumpRoleByWorkType(person.personnel_role);
      if (userId > 0 && roleKey) roles[roleKey].push(userId);
    }

    pumpAssignments.push({
      assignment_id: `item:${itemId}`,
      vehicle_id: vehicleId,
      roles,
    });
  }

  return { work_date: workDate, pump_assignments: pumpAssignments };
};

const buildMixerDraftFromBackend = async (
  workDate: string,
  day: BackendArrangementDay | undefined
): Promise<WorkMixerAssignmentDraft> => {
  const dayId = day ? getArrangementDayId(day) : 0;
  if (!dayId) return createEmptyMixerAssignmentDraft(workDate);

  const items = await listArrangementItems(dayId);
  const mixerAssignments: WorkMixerAssignmentDraft["mixer_assignments"] = [];

  for (const item of items
    .filter((it) => it.work_type === MIXER_WORK_TYPE)
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))) {
    const itemId = getArrangementItemId(item);
    const vehicleId = Number(item.vehicle_id);
    if (!itemId || !vehicleId) continue;

    const people = await listArrangementPersonnel(itemId);
    const driver = people.find((p) => Number(p.user_id) > 0);

    mixerAssignments.push({
      assignment_id: `item:${itemId}`,
      vehicle_id: vehicleId,
      user_id: driver ? Number(driver.user_id) : null,
      day_tag: parseMixerItemNoteTag(item.item_note),
    });
  }

  return { work_date: workDate, mixer_assignments: mixerAssignments };
};

const hasWorkAssignmentDraftData = (
  pumpDraft: WorkAssignmentDraft,
  mixerDraft: WorkMixerAssignmentDraft
) => pumpDraft.pump_assignments.length > 0 || mixerDraft.mixer_assignments.length > 0;

const withPrefilledFromDate = <T extends { prefilled_from_date?: string }>(
  draft: T,
  sourceDate: string
): T => ({
  ...draft,
  prefilled_from_date: sourceDate,
});

const withoutPrefilledFromDate = <T extends { prefilled_from_date?: string }>(draft: T): T => {
  const next = { ...draft };
  delete next.prefilled_from_date;
  return next;
};

const syncArrangementPersonnel = async (
  itemId: number,
  column: (typeof WORK_ASSIGNMENT_COLUMNS)[number],
  desiredUserIds: number[],
  personnelById: Map<number, WorkPersonnel>
) => {
  const existing = await listArrangementPersonnel(itemId);
  const existingByUserId = new Map(existing.map((record) => [Number(record.user_id), record]));
  const desiredSet = new Set(desiredUserIds);

  for (const userId of desiredUserIds) {
    const person = personnelById.get(userId);
    if (!person) continue;

    const existingRecord = existingByUserId.get(userId);
    const existingId = existingRecord ? getArrangementPersonnelId(existingRecord) : 0;

    if (existingId) {
      await updateArrangementPersonnel(existingId, itemId, person, column.workType);
    } else {
      await createArrangementPersonnel(itemId, person, column.workType);
    }
  }

  for (const record of existing) {
    const userId = Number(record.user_id);
    const recordId = getArrangementPersonnelId(record);

    if (recordId && !desiredSet.has(userId)) {
      await deleteArrangementPersonnel(recordId);
    }
  }
};

const syncPumpAssignmentPersonnel = async (
  itemId: number,
  assignment: WorkAssignmentDraft["pump_assignments"][number],
  personnelById: Map<number, WorkPersonnel>
) => {
  const existing = await listArrangementPersonnel(itemId);
  const desired = WORK_PUMP_ROLES.flatMap((role) =>
    (assignment.roles[role.key] || []).map((userId) => ({ userId, role }))
  );
  const desiredKeys = new Set(desired.map((entry) => `${entry.role.key}:${entry.userId}`));
  const existingByRoleAndUser = new Map(
    existing.map((record) => [
      `${getPumpRoleByWorkType(record.personnel_role)}:${Number(record.user_id)}`,
      record,
    ])
  );

  for (const entry of desired) {
    const person = personnelById.get(entry.userId);
    if (!person) continue;

    const existingRecord = existingByRoleAndUser.get(`${entry.role.key}:${entry.userId}`);
    const existingId = existingRecord ? getArrangementPersonnelId(existingRecord) : 0;

    if (existingId) {
      await updateArrangementPersonnel(existingId, itemId, person, entry.role.workType);
    } else {
      await createArrangementPersonnel(itemId, person, entry.role.workType);
    }
  }

  for (const record of existing) {
    const roleKey = getPumpRoleByWorkType(record.personnel_role);
    const userId = Number(record.user_id);
    const recordId = getArrangementPersonnelId(record);

    if (recordId && (!roleKey || !desiredKeys.has(`${roleKey}:${userId}`))) {
      await deleteArrangementPersonnel(recordId);
    }
  }
};

const syncPumpArrangementItems = async (
  dayId: number,
  draft: WorkAssignmentDraft,
  personnelById: Map<number, WorkPersonnel>
) => {
  const existingItems = await listArrangementItems(dayId);
  const existingByVehicleId = new Map<number, BackendArrangementItem>();

  for (const item of existingItems) {
    if (item.work_type === MIXER_WORK_TYPE) continue; // không khớp/ghi đè item Xe bồn khi lưu Xe bơm
    const vehicleId = Number(item.vehicle_id);
    if (vehicleId > 0 && !existingByVehicleId.has(vehicleId)) {
      existingByVehicleId.set(vehicleId, item);
    }
  }

  const desiredVehicleIds = new Set(
    draft.pump_assignments.map((assignment) => assignment.vehicle_id)
  );

  for (const [index, assignment] of draft.pump_assignments.entries()) {
    const existing = existingByVehicleId.get(assignment.vehicle_id);
    const existingId = existing ? getArrangementItemId(existing) : 0;
    const item = existingId
      ? await updatePumpArrangementItem(existingId, dayId, assignment, index + 1)
      : await createPumpArrangementItem(dayId, assignment, index + 1);
    const itemId = getArrangementItemId(item);

    if (itemId) await syncPumpAssignmentPersonnel(itemId, assignment, personnelById);
  }

  for (const item of existingItems) {
    if (item.work_type === MIXER_WORK_TYPE) continue; // không đụng item Xe bồn
    const itemId = getArrangementItemId(item);
    const vehicleId = Number(item.vehicle_id);
    const ownedByPumpBoard =
      vehicleId > 0 || Boolean(getColumnByWorkType(item.work_type || item.item_note));

    if (itemId && ownedByPumpBoard && !desiredVehicleIds.has(vehicleId)) {
      await deleteArrangementItem(itemId);
    }
  }
};

const createMixerArrangementItem = async (
  dayId: number,
  vehicleId: number,
  displayOrder: number,
  dayTag: VehicleDayTag | null
) => {
  const res = await http.post("/work-arrangement-items", {
    work_arrangement_day_id: dayId,
    vehicle_id: vehicleId,
    work_type: MIXER_WORK_TYPE,
    department_id: null,
    skill_id: null,
    item_note: buildMixerItemNote(MIXER_WORK_TYPE, dayTag),
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const updateMixerArrangementItem = async (
  itemId: number,
  dayId: number,
  vehicleId: number,
  displayOrder: number,
  dayTag: VehicleDayTag | null
) => {
  const res = await http.put(`/work-arrangement-items/${itemId}`, {
    work_arrangement_day_id: dayId,
    vehicle_id: vehicleId,
    work_type: MIXER_WORK_TYPE,
    department_id: null,
    skill_id: null,
    item_note: buildMixerItemNote(MIXER_WORK_TYPE, dayTag),
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const syncMixerArrangementItems = async (
  dayId: number,
  draft: WorkMixerAssignmentDraft,
  personnelById: Map<number, WorkPersonnel>
) => {
  // Giữ cả xe chỉ có tag (chưa/không gán tài xế) để tag không bị vòng cleanup xóa mất.
  const desired = draft.mixer_assignments.filter((a) => a.user_id != null || a.day_tag != null);
  const desiredVehicleIds = new Set(desired.map((a) => a.vehicle_id));

  const existingItems = (await listArrangementItems(dayId)).filter(
    (it) => it.work_type === MIXER_WORK_TYPE
  );
  const existingByVehicleId = new Map<number, BackendArrangementItem>();
  for (const item of existingItems) {
    const vehicleId = Number(item.vehicle_id);
    if (vehicleId > 0 && !existingByVehicleId.has(vehicleId)) {
      existingByVehicleId.set(vehicleId, item);
    }
  }

  for (const [index, assignment] of desired.entries()) {
    const person = assignment.user_id != null ? personnelById.get(assignment.user_id) : undefined;
    if (assignment.user_id != null && !person) continue;

    const existing = existingByVehicleId.get(assignment.vehicle_id);
    const existingId = existing ? getArrangementItemId(existing) : 0;
    const dayTag = assignment.day_tag ?? null;
    const item = existingId
      ? await updateMixerArrangementItem(
          existingId,
          dayId,
          assignment.vehicle_id,
          index + 1,
          dayTag
        )
      : await createMixerArrangementItem(dayId, assignment.vehicle_id, index + 1, dayTag);
    const itemId = getArrangementItemId(item);

    if (itemId) {
      // mỗi xe bồn chỉ 1 tài xế → đồng bộ đúng 1 personnel role "LÁI XE"; xe chỉ có tag thì xóa hết người
      const existingPeople = await listArrangementPersonnel(itemId);
      for (const record of existingPeople) {
        const recordId = getArrangementPersonnelId(record);
        if (recordId && (!person || Number(record.user_id) !== person.user_id)) {
          await deleteArrangementPersonnel(recordId);
        }
      }
      if (person) {
        const already = existingPeople.find((r) => Number(r.user_id) === person.user_id);
        if (!already) {
          await createArrangementPersonnel(itemId, person, MIXER_DRIVER_ROLE);
        }
      }
    }
  }

  for (const item of existingItems) {
    const itemId = getArrangementItemId(item);
    const vehicleId = Number(item.vehicle_id);
    if (itemId && !desiredVehicleIds.has(vehicleId)) {
      await deleteArrangementItem(itemId);
    }
  }
};

export const workAttendanceApi = {
  getBootstrap: async (workDate: string): Promise<WorkAttendanceBootstrap> => {
    const localDraft = getLocalAttendanceDraft(workDate);

    try {
      const [personnel, statuses, markedDates] = await Promise.all([
        getPersonnelFallback(),
        listUserDayStatuses(workDate),
        listAttendanceDailyRecordDates(workDate, workDate),
      ]);

      return {
        work_date: workDate,
        personnel,
        is_attendance_marked: markedDates.includes(workDate),
        draft: {
          work_date: workDate,
          user_statuses: statuses
            .map((status) => ({
              user_id: Number(status.user_id),
              status: getAttendanceStatusFromBackend(status),
            }))
            .filter((entry) => entry.user_id > 0 && entry.status !== "working"),
        },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return {
        work_date: workDate,
        personnel: await getPersonnelFallback(),
        is_attendance_marked: Boolean(localDraft),
        draft: localDraft,
      };
    }
  },

  saveDraft: async (draft: WorkAttendanceDraft): Promise<WorkAttendanceDraft> => {
    try {
      await ensureAttendanceDailyRecord(draft.work_date);

      const existingStatuses = await listUserDayStatuses(draft.work_date);
      const desiredStatuses = draft.user_statuses.filter((entry) => entry.status !== "working");
      const selectedUserIds = new Set(desiredStatuses.map((entry) => entry.user_id));
      const existingByUserId = new Map(
        existingStatuses.map((status) => [Number(status.user_id), status])
      );

      for (const entry of desiredStatuses) {
        const payload = {
          user_id: entry.user_id,
          work_date: draft.work_date,
          day_status: getBackendDayStatusFromAttendanceStatus(entry.status),
          status_source: "manual",
          status_reason: entry.status,
        };
        const existing = existingByUserId.get(entry.user_id);
        const existingId = existing ? getUserDayStatusId(existing) : 0;

        if (existingId) await updateUserDayStatus(existingId, payload);
        else await createUserDayStatus(payload);
      }

      for (const status of existingStatuses) {
        const userId = Number(status.user_id);
        const statusId = getUserDayStatusId(status);
        if (!statusId || selectedUserIds.has(userId)) continue;

        await deleteUserDayStatus(statusId);
      }

      return draft;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return setLocalAttendanceDraft(draft);
    }
  },

  getRangeExportData: async (
    fromDate: string,
    toDate: string
  ): Promise<WorkAttendanceRangeExportData> => {
    const statusesByDate: WorkAttendanceRangeExportData["statusesByDate"] = {};
    const markedDates: WorkAttendanceRangeExportData["markedDates"] = {};

    try {
      // One report call for the whole month instead of one request per day.
      const [personnel, report] = await Promise.all([
        getPersonnelFallback(),
        fetchMonthlyOffReport(fromDate, toDate),
      ]);

      for (const date of report.markedDates) markedDates[date] = true;
      Object.assign(statusesByDate, report.statusesByDate);

      return { personnel, statusesByDate, markedDates };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;

      const personnel = await getPersonnelFallback();
      for (const date of buildDateList(fromDate, toDate)) {
        statusesByDate[date] = {};
        const draft = getLocalAttendanceDraft(date);
        markedDates[date] = Boolean(draft);
        for (const entry of draft?.user_statuses || []) {
          statusesByDate[date][entry.user_id] = entry.status;
        }
      }

      return { personnel, statusesByDate, markedDates };
    }
  },
};

export const workAssignmentApi = {
  getBootstrap: async (workDate: string): Promise<WorkArrangementBootstrap> => {
    const localPump = getLocalAssignmentDraft(workDate);
    const localMixer = getLocalMixerDraft(workDate);
    const localAttendance = getLocalAttendanceDraft(workDate);

    try {
      const [personnel, vehicleSets, statuses, arrangementDays] = await Promise.all([
        getPersonnelFallback(),
        getWorkVehicleSets(),
        listUserDayStatuses(workDate),
        listArrangementDays(workDate),
      ]);
      const day = arrangementDays[0];
      const previousDate = getPreviousDate(workDate);
      let [pumpDraft, mixerDraft] = await Promise.all([
        buildDraftFromBackend(workDate, day),
        buildMixerDraftFromBackend(workDate, day),
      ]);

      if (!hasWorkAssignmentDraftData(pumpDraft, mixerDraft)) {
        const previousDay = await getPreviousArrangementDay(workDate);
        if (previousDay && previousDate) {
          const [previousPumpDraft, previousMixerDraft] = await Promise.all([
            buildDraftFromBackend(workDate, previousDay),
            buildMixerDraftFromBackend(workDate, previousDay),
          ]);

          if (hasWorkAssignmentDraftData(previousPumpDraft, previousMixerDraft)) {
            pumpDraft = previousPumpDraft.pump_assignments.length
              ? withPrefilledFromDate(previousPumpDraft, previousDate)
              : previousPumpDraft;
            mixerDraft = previousMixerDraft.mixer_assignments.length
              ? withPrefilledFromDate(previousMixerDraft, previousDate)
              : previousMixerDraft;
          }
        }
      }

      return {
        work_date: workDate,
        personnel,
        half_day_user_ids: statuses
          .filter((status) => status.day_status === "half_day")
          .map((status) => Number(status.user_id))
          .filter((userId) => userId > 0),
        pump: { vehicles: vehicleSets.pump, draft: pumpDraft },
        mixer: { vehicles: vehicleSets.mixer, draft: mixerDraft },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      const [personnel, vehicleSets] = await Promise.all([
        getPersonnelFallback(),
        getWorkVehicleSets(),
      ]);
      return {
        work_date: workDate,
        personnel,
        half_day_user_ids: getHalfDayUserIdsFromAttendanceDraft(localAttendance),
        pump: {
          vehicles: vehicleSets.pump,
          draft: localPump || createEmptyAssignmentDraft(workDate),
        },
        mixer: {
          vehicles: vehicleSets.mixer,
          draft: localMixer || createEmptyMixerAssignmentDraft(workDate),
        },
      };
    }
  },

  savePump: async (
    draft: WorkAssignmentDraft,
    personnel: WorkPersonnel[]
  ): Promise<WorkAssignmentDraft> => {
    const nextDraft = withoutPrefilledFromDate({
      ...draft,
      pump_assignments: draft.pump_assignments || [],
    });
    try {
      const day = await ensureArrangementDay(draft.work_date);
      const dayId = getArrangementDayId(day);
      if (!dayId) throw new Error("Missing work_arrangement_day_id");
      const personnelById = new Map(personnel.map((p) => [p.user_id, p]));
      await syncPumpArrangementItems(dayId, nextDraft, personnelById);
      return nextDraft;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return setLocalAssignmentDraft(nextDraft);
    }
  },

  saveMixer: async (
    draft: WorkMixerAssignmentDraft,
    personnel: WorkPersonnel[]
  ): Promise<WorkMixerAssignmentDraft> => {
    const nextDraft = withoutPrefilledFromDate({
      ...draft,
      mixer_assignments: draft.mixer_assignments || [],
    });
    try {
      const day = await ensureArrangementDay(draft.work_date);
      const dayId = getArrangementDayId(day);
      if (!dayId) throw new Error("Missing work_arrangement_day_id");
      const personnelById = new Map(personnel.map((p) => [p.user_id, p]));
      await syncMixerArrangementItems(dayId, nextDraft, personnelById);
      return nextDraft;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return setLocalMixerDraft(nextDraft);
    }
  },
};

// Tab "Công việc": bố trí người vào công việc (work_id) theo ngày, tái dùng work-arrangement-items
// với work_type = "CV:<work_id>" (vehicle_id null) → không đụng Xe bơm/Xe bồn.
const parseWorkTaskId = (workType?: string | null): number => {
  const value = String(workType || "");
  if (!value.startsWith(WORK_TASK_PREFIX)) return 0;
  return Number(value.slice(WORK_TASK_PREFIX.length)) || 0;
};

const buildWorkTaskDraftFromBackend = async (
  workDate: string,
  day: BackendArrangementDay | undefined
): Promise<WorkTaskAssignmentDraft> => {
  const dayId = day ? getArrangementDayId(day) : 0;
  if (!dayId) return createEmptyWorkTaskDraft(workDate);

  const items = await listArrangementItems(dayId);
  const taskAssignments: WorkTaskAssignmentDraft["task_assignments"] = [];

  for (const item of items
    .filter((it) => String(it.work_type || "").startsWith(WORK_TASK_PREFIX))
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))) {
    const itemId = getArrangementItemId(item);
    const workId = parseWorkTaskId(item.work_type);
    if (!itemId || !workId) continue;

    const people = await listArrangementPersonnel(itemId);
    const userIds = people.map((p) => Number(p.user_id)).filter((id) => id > 0);

    taskAssignments.push({ assignment_id: `item:${itemId}`, work_id: workId, user_ids: userIds });
  }

  return { work_date: workDate, task_assignments: taskAssignments };
};

const hasWorkTaskDraftData = (draft: WorkTaskAssignmentDraft) => draft.task_assignments.length > 0;

const createWorkTaskItem = async (
  dayId: number,
  workId: number,
  workName: string,
  displayOrder: number
) => {
  const res = await http.post("/work-arrangement-items", {
    work_arrangement_day_id: dayId,
    vehicle_id: null,
    work_type: `${WORK_TASK_PREFIX}${workId}`,
    department_id: null,
    skill_id: null,
    item_note: workName,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const updateWorkTaskItem = async (
  itemId: number,
  dayId: number,
  workId: number,
  workName: string,
  displayOrder: number
) => {
  const res = await http.put(`/work-arrangement-items/${itemId}`, {
    work_arrangement_day_id: dayId,
    vehicle_id: null,
    work_type: `${WORK_TASK_PREFIX}${workId}`,
    department_id: null,
    skill_id: null,
    item_note: workName,
    display_order: displayOrder,
  });
  return getItemFromPayload<BackendArrangementItem>(res.data);
};

const syncWorkTaskItems = async (
  dayId: number,
  draft: WorkTaskAssignmentDraft,
  personnelById: Map<number, WorkPersonnel>,
  worksById: Map<number, Work>
) => {
  const desired = draft.task_assignments.filter((task) => task.user_ids.length > 0);
  const desiredWorkIds = new Set(desired.map((task) => task.work_id));

  const existingItems = (await listArrangementItems(dayId)).filter((it) =>
    String(it.work_type || "").startsWith(WORK_TASK_PREFIX)
  );
  const existingByWorkId = new Map<number, BackendArrangementItem>();
  for (const item of existingItems) {
    const workId = parseWorkTaskId(item.work_type);
    if (workId > 0 && !existingByWorkId.has(workId)) existingByWorkId.set(workId, item);
  }

  for (const [index, task] of desired.entries()) {
    const workName = worksById.get(task.work_id)?.work_name || `#${task.work_id}`;
    const existing = existingByWorkId.get(task.work_id);
    const existingId = existing ? getArrangementItemId(existing) : 0;
    const item = existingId
      ? await updateWorkTaskItem(existingId, dayId, task.work_id, workName, index + 1)
      : await createWorkTaskItem(dayId, task.work_id, workName, index + 1);
    const itemId = getArrangementItemId(item);
    if (!itemId) continue;

    const existingPeople = await listArrangementPersonnel(itemId);
    const existingUserSet = new Set(existingPeople.map((record) => Number(record.user_id)));
    const desiredUserSet = new Set(task.user_ids);

    for (const userId of task.user_ids) {
      const person = personnelById.get(userId);
      if (person && !existingUserSet.has(userId)) {
        await createArrangementPersonnel(itemId, person, WORK_TASK_ROLE);
      }
    }
    for (const record of existingPeople) {
      const recordId = getArrangementPersonnelId(record);
      if (recordId && !desiredUserSet.has(Number(record.user_id))) {
        await deleteArrangementPersonnel(recordId);
      }
    }
  }

  for (const item of existingItems) {
    const itemId = getArrangementItemId(item);
    const workId = parseWorkTaskId(item.work_type);
    if (itemId && !desiredWorkIds.has(workId)) {
      await deleteArrangementItem(itemId);
    }
  }
};

export const workTaskApi = {
  getBootstrap: async (workDate: string): Promise<WorkTaskBootstrap> => {
    try {
      const [personnel, worksRes, arrangementDays] = await Promise.all([
        getPersonnelFallback(),
        dedupeInflight("works:list", () => workApi.list({ limit: 1000 })),
        listArrangementDays(workDate),
      ]);
      const works = worksRes.data.filter((work) => !work.delete_flag);
      const previousDate = getPreviousDate(workDate);
      let draft = await buildWorkTaskDraftFromBackend(workDate, arrangementDays[0]);

      if (!hasWorkTaskDraftData(draft)) {
        const previousDay = await getPreviousArrangementDay(workDate);
        if (previousDay && previousDate) {
          const previousDraft = await buildWorkTaskDraftFromBackend(workDate, previousDay);
          if (hasWorkTaskDraftData(previousDraft)) {
            draft = withPrefilledFromDate(previousDraft, previousDate);
          }
        }
      }

      return { work_date: workDate, personnel, works, draft };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      const personnel = await getPersonnelFallback();
      let works: Work[] = [];
      try {
        works = (await workApi.list({ limit: 1000 })).data.filter((work) => !work.delete_flag);
      } catch {
        works = [];
      }
      return { work_date: workDate, personnel, works, draft: createEmptyWorkTaskDraft(workDate) };
    }
  },

  save: async (
    draft: WorkTaskAssignmentDraft,
    personnel: WorkPersonnel[],
    works: Work[]
  ): Promise<WorkTaskAssignmentDraft> => {
    const nextDraft = withoutPrefilledFromDate({
      ...draft,
      task_assignments: draft.task_assignments || [],
    });
    try {
      const day = await ensureArrangementDay(draft.work_date);
      const dayId = getArrangementDayId(day);
      if (!dayId) throw new Error("Missing work_arrangement_day_id");
      const personnelById = new Map(personnel.map((person) => [person.user_id, person]));
      const worksById = new Map(works.map((work) => [work.work_id, work]));
      await syncWorkTaskItems(dayId, nextDraft, personnelById, worksById);
      return nextDraft;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return nextDraft;
    }
  },
};

// Lốt trộn: cùng nguồn dữ liệu với popup "Đồng bộ lốt xe" ở Dashboard (đơn pending),
// nhưng hiển thị dạng `tênRútGọn_mã` cho trang Bố trí công việc.
const MIX_SLOT_ORDER_STATUSES: Order["order_status"][] = [
  "pending",
  "collecting",
  "transporting",
  "running",
];

// Popup "Chụp lốt" bật includeAllMixerVehicles để thêm đủ xe X chưa nằm trong lệnh hiện tại.
export const workMixSlotApi = {
  getList: (options?: { includeAllMixerVehicles?: boolean }): Promise<WorkMixSlotItem[]> =>
    dedupeInflight(
      `mix-slot-list:${options?.includeAllMixerVehicles ? "all-mixers" : "active-orders"}`,
      async () => {
        const includeAllMixerVehicles = options?.includeAllMixerVehicles === true;
        const [vehicleTypeRes, personnel, vehicles, ...orderResponses] = await Promise.all([
          getVehicleTypesShared(),
          getPersonnelFallback(),
          includeAllMixerVehicles ? getAllVehicles() : Promise.resolve([]),
          ...MIX_SLOT_ORDER_STATUSES.map((status) => orderApi.getByStatus(status)),
        ]);

        const orders = orderResponses.flatMap((ordersRes) =>
          getArrayFromPayload<Order>(ordersRes.data, ["orders", "data", "items", "results", "rows"])
        );
        const vehicleTypes = getArrayFromPayload<VehicleType>(vehicleTypeRes.data, [
          "vehicle_types",
          "data",
          "items",
          "results",
          "rows",
        ]);

        const symbolByTypeId = new Map(
          vehicleTypes.map((type) => [
            Number(type.vehicle_type_id),
            type.vehicle_type_symbol ?? null,
          ])
        );
        const shortNameByUserId = new Map(
          personnel.map((person) => [
            Number(person.user_id),
            getDisplayShortName(person.user_full_name, person.user_short_name),
          ])
        );

        return buildWorkMixSlotItems({
          orders,
          vehicles,
          symbolByTypeId,
          shortNameByUserId,
          includeAllMixerVehicles,
        });
      }
    ),
};
