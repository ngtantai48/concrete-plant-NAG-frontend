import http from "@/lib/http";

export type MealSlotKey = "sang" | "trua" | "toi";
export type MealCheckRunStatus = "pending" | "running" | "done" | "failed";
export type MealStatusSource = "auto" | "manual";
// Backend có thể trả id dạng số hoặc chuỗi (uuid) — chấp nhận cả hai.
export type MealCheckRunId = number | string;

export interface MealCheckLocation {
  lat: number;
  lng: number;
  radius: number;
}

export interface CreateMealCheckRunPayload {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  meal_slots: string; // "sang,trua,toi"
  location?: MealCheckLocation;
}

export interface MealCheckRun {
  meal_check_run_id: MealCheckRunId;
  status: MealCheckRunStatus;
  progress_done: number;
  progress_total: number;
  error_message?: string | null;
}

export interface UserMealStatus {
  user_meal_status_id: number;
  user_id: number;
  work_date: string; // YYYY-MM-DD
  meal_slot: MealSlotKey;
  is_allowance: boolean;
  source: MealStatusSource;
  note?: string | null;
}

export interface UpsertUserMealStatusPayload {
  user_id: number;
  work_date: string;
  meal_slot: MealSlotKey;
  is_allowance: boolean;
  note?: string;
}

// --- Report (gộp by_user + by_date trong 1 response) ---

export interface MealReportCell {
  work_date: string;
  meal_slot: MealSlotKey;
  source: MealStatusSource;
}

export interface MealReportByUser {
  user_id: number;
  user_full_name: string;
  user_short_name?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  total: number;
  cells: MealReportCell[];
}

export interface MealReportByDateMeta {
  user_id: number;
  user_full_name: string;
  user_short_name?: string | null;
  meal_slot: MealSlotKey;
  source: MealStatusSource;
}

export interface MealReportByDate {
  work_date: string;
  allowance_count: number;
  meta: MealReportByDateMeta[];
}

export interface MealCheckReport {
  from: string;
  to: string;
  grand_total: number;
  by_user: MealReportByUser[];
  by_date: MealReportByDate[];
}

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  value && typeof value === "object" ? (value as RawRecord) : {};

// Backend đôi khi bọc kết quả trong { data: ... } — bóc 1 lớp khi cần.
const unwrap = (payload: unknown): RawRecord => {
  const record = asRecord(payload);
  if (
    "data" in record &&
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
  ) {
    return record.data as RawRecord;
  }
  return record;
};

const asArray = (payload: unknown): RawRecord[] => {
  if (Array.isArray(payload)) return payload as RawRecord[];
  const record = asRecord(payload);
  if (Array.isArray(record.data)) return record.data as RawRecord[];
  for (const key of ["items", "results", "rows", "user_meal_status"]) {
    if (Array.isArray(record[key])) return record[key] as RawRecord[];
  }
  return [];
};

const normalizeSource = (value: unknown): MealStatusSource =>
  value === "manual" ? "manual" : "auto";

const normalizeUserMealStatus = (raw: RawRecord): UserMealStatus => ({
  user_meal_status_id: Number(raw.user_meal_status_id),
  user_id: Number(raw.user_id),
  work_date: String(raw.work_date ?? "").slice(0, 10),
  meal_slot: raw.meal_slot as MealSlotKey,
  is_allowance: Boolean(raw.is_allowance),
  source: normalizeSource(raw.source),
  note: (raw.note as string | null | undefined) ?? null,
});

const mealCheckApi = {
  // 1) Tạo run quét GPS (chạy nền ở backend) → trả về id để poll.
  createRun: async (payload: CreateMealCheckRunPayload): Promise<MealCheckRunId> => {
    const res = await http.post("/meal-check/runs", payload);
    const record = unwrap(res.data);
    const rawId = record.meal_check_run_id;
    return typeof rawId === "number" ? rawId : String(rawId ?? "");
  },

  // 2) Poll tiến độ 1 run.
  getRun: async (runId: MealCheckRunId): Promise<MealCheckRun> => {
    const res = await http.get(`/meal-check/runs/${runId}`);
    const record = unwrap(res.data);
    return {
      meal_check_run_id: (record.meal_check_run_id as MealCheckRunId) ?? runId,
      status: (record.status as MealCheckRunStatus) ?? "pending",
      progress_done: Number(record.progress_done ?? 0),
      progress_total: Number(record.progress_total ?? 0),
      error_message: (record.error_message as string | null | undefined) ?? null,
    };
  },

  // 3) Đọc kết quả cơm ca trong khoảng ngày (dạng phẳng).
  listUserMealStatus: async (from: string, to: string): Promise<UserMealStatus[]> => {
    const res = await http.get("/user-meal-status", { params: { from, to } });
    return asArray(res.data)
      .map(normalizeUserMealStatus)
      .filter(
        (status) => status.user_id > 0 && Boolean(status.work_date) && Boolean(status.meal_slot)
      );
  },

  // 3b) Báo cáo gộp: by_user (khớp bảng Excel) + by_date trong 1 response.
  getReport: async (from: string, to: string): Promise<MealCheckReport> => {
    const res = await http.get("/user-meal-status/report", { params: { from, to } });
    const record = unwrap(res.data);

    const byUser: MealReportByUser[] = (
      Array.isArray(record.by_user) ? (record.by_user as unknown[]) : []
    ).map((rawUser) => {
      const u = asRecord(rawUser);
      return {
        user_id: Number(u.user_id),
        user_full_name: String(u.user_full_name ?? ""),
        user_short_name: (u.user_short_name as string | null | undefined) ?? null,
        department_id: u.department_id == null ? null : Number(u.department_id),
        department_name: (u.department_name as string | null | undefined) ?? null,
        total: Number(u.total ?? 0),
        cells: (Array.isArray(u.cells) ? (u.cells as unknown[]) : []).map((rawCell) => {
          const c = asRecord(rawCell);
          return {
            work_date: String(c.work_date ?? "").slice(0, 10),
            meal_slot: c.meal_slot as MealSlotKey,
            source: normalizeSource(c.source),
          };
        }),
      };
    });

    const byDate: MealReportByDate[] = (
      Array.isArray(record.by_date) ? (record.by_date as unknown[]) : []
    ).map((rawDate) => {
      const d = asRecord(rawDate);
      return {
        work_date: String(d.work_date ?? "").slice(0, 10),
        allowance_count: Number(d.allowance_count ?? 0),
        meta: (Array.isArray(d.meta) ? (d.meta as unknown[]) : []).map((rawMeta) => {
          const m = asRecord(rawMeta);
          return {
            user_id: Number(m.user_id),
            user_full_name: String(m.user_full_name ?? ""),
            user_short_name: (m.user_short_name as string | null | undefined) ?? null,
            meal_slot: m.meal_slot as MealSlotKey,
            source: normalizeSource(m.source),
          };
        }),
      };
    });

    return {
      from: String(record.from ?? from),
      to: String(record.to ?? to),
      grand_total: Number(record.grand_total ?? 0),
      by_user: byUser,
      by_date: byDate,
    };
  },

  // 4) Chấm/sửa tay 1 ô (backend tự set source='manual').
  upsertUserMealStatus: async (
    payload: UpsertUserMealStatusPayload
  ): Promise<UserMealStatus | null> => {
    const res = await http.post("/user-meal-status", payload);
    const record = unwrap(res.data);
    if (!record.user_meal_status_id && record.is_allowance === undefined) {
      return null;
    }
    return {
      user_meal_status_id: Number(record.user_meal_status_id),
      user_id: Number(record.user_id ?? payload.user_id),
      work_date: String(record.work_date ?? payload.work_date).slice(0, 10),
      meal_slot: (record.meal_slot as MealSlotKey) ?? payload.meal_slot,
      is_allowance:
        record.is_allowance === undefined ? payload.is_allowance : Boolean(record.is_allowance),
      source: normalizeSource(record.source ?? "manual"),
      note: (record.note as string | null | undefined) ?? payload.note ?? null,
    };
  },

  // 5) Xoá 1 bản ghi chấm tay (revert về không có suất).
  deleteUserMealStatus: async (userMealStatusId: number): Promise<void> => {
    await http.delete(`/user-meal-status/${userMealStatusId}`);
  },
};

export default mealCheckApi;
