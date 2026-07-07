export type LotTagRequestStatus = "pending" | "approved" | "rejected" | "canceled";
export type LotTagRequestWorkflowAction = "approve" | "reject" | "cancel";

export interface LotTagRequestVehicle {
  vehicle_id: number;
  vehicle_name?: string | null;
  vehicle_license_plate?: string | null;
}

export interface LotTagRequestTag {
  lot_tag_id?: number | null;
  lot_tag_key: string;
  lot_tag_name: string;
  sort_group?: number | null;
}

export interface LotTagRequestUser {
  user_id: number;
  user_full_name?: string | null;
  user_short_name?: string | null;
  username?: string | null;
}

export interface LotTagRequest {
  lot_tag_request_id: number;
  work_date: string;
  vehicle_id: number | null;
  lot_tag_id?: number | null;
  lot_tag_key: string;
  request_reason: string | null;
  review_note?: string | null;
  reject_reason?: string | null;
  request_status: LotTagRequestStatus;
  requested_by?: number | null;
  reviewed_by?: number | null;
  requested_at?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  vehicle?: LotTagRequestVehicle | null;
  lot_tag?: LotTagRequestTag | null;
  requested_by_user?: LotTagRequestUser | null;
  reviewed_by_user?: LotTagRequestUser | null;
  workflow_available_actions?: LotTagRequestWorkflowAction[];
}

export interface ListLotTagRequests {
  data: LotTagRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface ListLotTagRequestParams {
  page?: number;
  limit?: number;
  status?: LotTagRequestStatus | "all";
  work_date?: string;
  mine?: boolean;
}

export interface LotTagRequestWorkflowLike {
  request_status?: string | null;
  status?: string | null;
  workflow_available_actions?: Array<string | null | undefined> | null;
}

const TERMINAL_STATUSES = new Set<LotTagRequestStatus>(["approved", "rejected", "canceled"]);

export const normalizeLotTagRequestStatus = (status?: string | null): LotTagRequestStatus => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";

  return "pending";
};

export const isLotTagRequestTerminal = (status?: string | null) =>
  TERMINAL_STATUSES.has(normalizeLotTagRequestStatus(status));

const isWorkflowAction = (action: string): action is LotTagRequestWorkflowAction =>
  action === "approve" || action === "reject" || action === "cancel";

export const getLotTagRequestAvailableActions = (
  request: LotTagRequestWorkflowLike,
  options: { canReview?: boolean; canCancel?: boolean } = {}
): LotTagRequestWorkflowAction[] => {
  const status = normalizeLotTagRequestStatus(request.request_status ?? request.status);
  if (isLotTagRequestTerminal(status)) return [];

  const backendActions =
    request.workflow_available_actions
      ?.map((action) =>
        String(action || "")
          .trim()
          .toLowerCase()
      )
      .filter(isWorkflowAction) ?? [];
  const baseActions =
    backendActions.length > 0
      ? backendActions
      : (["approve", "reject", "cancel"] as LotTagRequestWorkflowAction[]);

  return baseActions.filter((action) =>
    action === "cancel" ? Boolean(options.canCancel) : Boolean(options.canReview)
  );
};

export const getLotTagRequestStatusTone = (status?: string | null) => {
  const normalized = normalizeLotTagRequestStatus(status);
  if (normalized === "approved") return "emerald";
  if (normalized === "rejected") return "red";
  if (normalized === "canceled") return "slate";
  return "amber";
};

const getRecord = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

const pickArray = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;

  const record = getRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  const data = record.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return pickArray(data, keys);

  return [];
};

const pickNumber = (payload: unknown, keys: string[], fallback = 0) => {
  const record = getRecord(payload);
  const candidates = [record];
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
  return fallback;
};

const normalizeDate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
};

const normalizeVehicle = (payload: unknown): LotTagRequestVehicle | null => {
  const record = getRecord(payload);
  const id = Number(record.vehicle_id ?? record.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    vehicle_id: id,
    vehicle_name: typeof record.vehicle_name === "string" ? record.vehicle_name : null,
    vehicle_license_plate:
      typeof record.vehicle_license_plate === "string" ? record.vehicle_license_plate : null,
  };
};

const normalizeTag = (payload: unknown): LotTagRequestTag | null => {
  const record = getRecord(payload);
  const key = String(record.lot_tag_key ?? record.tag_key ?? "").trim();
  const name = String(record.lot_tag_name ?? record.tag_name ?? key).trim();
  if (!key) return null;
  const id = Number(record.lot_tag_id ?? record.id);
  const sortGroup = Number(record.sort_group);
  return {
    lot_tag_id: Number.isFinite(id) && id > 0 ? id : null,
    lot_tag_key: key,
    lot_tag_name: name || key,
    sort_group: Number.isFinite(sortGroup) ? sortGroup : null,
  };
};

const normalizeUser = (payload: unknown): LotTagRequestUser | null => {
  const record = getRecord(payload);
  const id = Number(record.user_id ?? record.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    user_id: id,
    user_full_name:
      typeof record.user_full_name === "string"
        ? record.user_full_name
        : typeof record.name === "string"
          ? record.name
          : null,
    user_short_name: typeof record.user_short_name === "string" ? record.user_short_name : null,
    username: typeof record.username === "string" ? record.username : null,
  };
};

export const normalizeLotTagRequest = (payload: unknown): LotTagRequest => {
  const record = getRecord(payload);
  const vehicle = normalizeVehicle(record.vehicle ?? record.vehicles);
  const tag = normalizeTag(record.lot_tag ?? record.lotTag ?? record.tag);
  const requester = normalizeUser(
    record.requested_by_user ?? record.requester ?? record.created_by_user
  );
  const reviewer = normalizeUser(record.reviewed_by_user ?? record.reviewer);
  const id = Number(record.lot_tag_request_id ?? record.request_id ?? record.id);
  const vehicleId = Number(record.vehicle_id ?? vehicle?.vehicle_id);
  const lotTagId = Number(record.lot_tag_id ?? tag?.lot_tag_id);
  const requestedBy = Number(record.requested_by ?? record.created_by ?? requester?.user_id);
  const reviewedBy = Number(record.reviewed_by ?? reviewer?.user_id);

  return {
    lot_tag_request_id: Number.isFinite(id) && id > 0 ? id : 0,
    work_date: normalizeDate(record.work_date ?? record.date ?? record.request_date),
    vehicle_id: Number.isFinite(vehicleId) && vehicleId > 0 ? vehicleId : null,
    lot_tag_id: Number.isFinite(lotTagId) && lotTagId > 0 ? lotTagId : null,
    lot_tag_key: String(record.lot_tag_key ?? tag?.lot_tag_key ?? "").trim(),
    request_reason:
      String(record.request_reason ?? record.reason ?? record.note ?? "").trim() || null,
    review_note: String(record.review_note ?? "").trim() || null,
    reject_reason: String(record.reject_reason ?? record.rejection_reason ?? "").trim() || null,
    request_status: normalizeLotTagRequestStatus(
      String(record.request_status ?? record.status ?? "")
    ),
    requested_by: Number.isFinite(requestedBy) && requestedBy > 0 ? requestedBy : null,
    reviewed_by: Number.isFinite(reviewedBy) && reviewedBy > 0 ? reviewedBy : null,
    requested_at:
      typeof record.requested_at === "string"
        ? record.requested_at
        : typeof record.created_at === "string"
          ? record.created_at
          : null,
    reviewed_at: typeof record.reviewed_at === "string" ? record.reviewed_at : null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
    vehicle,
    lot_tag:
      tag ??
      (String(record.lot_tag_key ?? "").trim()
        ? {
            lot_tag_id: Number.isFinite(lotTagId) && lotTagId > 0 ? lotTagId : null,
            lot_tag_key: String(record.lot_tag_key).trim(),
            lot_tag_name: String(record.lot_tag_name ?? record.lot_tag_key).trim(),
            sort_group: null,
          }
        : null),
    requested_by_user: requester,
    reviewed_by_user: reviewer,
    workflow_available_actions:
      record.workflow_available_actions && Array.isArray(record.workflow_available_actions)
        ? record.workflow_available_actions
            .map((action) =>
              String(action || "")
                .trim()
                .toLowerCase()
            )
            .filter(isWorkflowAction)
        : undefined,
  };
};

export const normalizeLotTagRequestList = (
  payload: unknown,
  params: ListLotTagRequestParams = {}
): ListLotTagRequests => {
  const data = pickArray(payload, [
    "lot_tag_requests",
    "lotTagRequests",
    "requests",
    "items",
    "results",
    "rows",
    "data",
  ]).map(normalizeLotTagRequest);

  return {
    data,
    total: pickNumber(payload, ["total", "totalItems", "count"], data.length),
    page: pickNumber(payload, ["page", "currentPage"], params.page ?? 1),
    limit: pickNumber(payload, ["limit", "pageSize"], params.limit ?? (data.length || 10)),
  };
};
