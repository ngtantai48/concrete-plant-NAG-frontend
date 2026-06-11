import http from "@/lib/http";
import type {
  DriverMaintenanceContext,
  MaintenanceAiOverview,
  PendingMaintenanceCard,
  VehicleMaintenance,
  VehicleMaintenanceDocument,
  VehicleMaintenanceHistory,
  VehicleMaintenanceWorkflowAction,
} from "@/types/vehicle";

export interface ListVehicleMaintenances {
  data: VehicleMaintenance[];
  total: number;
  page: number;
  limit: number;
}

export interface BulkDeleteVehicleMaintenancesResult {
  deleted_ids: number[];
  failed_ids: Array<{ id: number; reason: string }>;
  total_deleted: number;
  total_failed: number;
}

type VehicleMaintenanceListPayload =
  | VehicleMaintenance[]
  | {
      data?: VehicleMaintenance[];
      total?: number;
      page?: number;
      limit?: number;
    };

type ApiPayload<T> = T | ({ data?: T } & Record<string, unknown>);

function normalizeList(payload: VehicleMaintenanceListPayload): ListVehicleMaintenances {
  const rows = Array.isArray(payload) ? payload : payload.data ?? [];
  return {
    data: rows,
    total: Array.isArray(payload) ? rows.length : payload.total ?? rows.length,
    page: Array.isArray(payload) ? 1 : payload.page ?? 1,
    limit: Array.isArray(payload) ? rows.length : payload.limit ?? rows.length,
  };
}

function normalizeItem<T>(payload: ApiPayload<T>): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data !== undefined
  ) {
    return payload.data as T;
  }
  return payload as T;
}

function normalizeArrayItem<T>(payload: ApiPayload<T[]>): T[] {
  const normalized = normalizeItem<T[]>(payload);
  if (Array.isArray(normalized)) return normalized;
  if (!normalized || typeof normalized !== "object") return [];

  return Object.entries(normalized as Record<string, unknown>)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, value]) => value as T);
}

const vehicleMaintenanceApi = {
  getAll: async (params?: Record<string, unknown>) => {
    const response = await http.get<VehicleMaintenanceListPayload>("/vehicle-maintenances", {
      params,
    });
    return { ...response, data: normalizeList(response.data) };
  },

  getListName: async (params?: Record<string, unknown>) => {
    const response = await http.get<VehicleMaintenanceListPayload>(
      "/vehicle-maintenances/list/name",
      { params }
    );
    return { ...response, data: normalizeList(response.data) };
  },

  getById: async (id: number) => {
    const response = await http.get<ApiPayload<VehicleMaintenance>>(`/vehicle-maintenances/${id}`);
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  getHistory: async (id: number) => {
    const response = await http.get<ApiPayload<VehicleMaintenanceHistory[]>>(
      `/vehicle-maintenances/${id}/history`
    );
    return { ...response, data: normalizeArrayItem<VehicleMaintenanceHistory>(response.data) };
  },

  create: async (data: Partial<VehicleMaintenance>) => {
    const response = await http.post<ApiPayload<VehicleMaintenance>>("/vehicle-maintenances", data);
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  update: async (id: number, data: Partial<VehicleMaintenance>) => {
    const response = await http.put<ApiPayload<VehicleMaintenance>>(
      `/vehicle-maintenances/${id}`,
      data
    );
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  delete: (id: number) => http.delete(`/vehicle-maintenances/${id}`),

  bulkDelete: async (ids: number[]) => {
    const response = await http.post<ApiPayload<BulkDeleteVehicleMaintenancesResult>>(
      "/vehicle-maintenances/bulk-delete",
      { vehicle_maintenance_ids: ids }
    );
    return {
      ...response,
      data: normalizeItem<BulkDeleteVehicleMaintenancesResult>(response.data),
    };
  },

  runWorkflowAction: async (
    id: number,
    action: VehicleMaintenanceWorkflowAction,
    payload?: { note?: string | null; reason?: string | null }
  ) => {
    const endpointByAction: Record<VehicleMaintenanceWorkflowAction, string> = {
      submit: "submit",
      dispatch_approve: "dispatch-approve",
      dispatch_reject: "dispatch-reject",
      production_approve: "production-approve",
      production_reject: "production-reject",
    };
    const endpoint = endpointByAction[action];
    const body =
      action === "dispatch_reject" || action === "production_reject"
        ? { reason: payload?.reason || payload?.note || "" }
        : { note: payload?.note || null };
    const response = await http.post<ApiPayload<VehicleMaintenance>>(
      `/vehicle-maintenances/${id}/${endpoint}`,
      body
    );
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  addDocument: async (
    maintenanceId: number,
    data: Partial<VehicleMaintenanceDocument> & { media_id: number }
  ) => {
    const response = await http.post<ApiPayload<VehicleMaintenanceDocument>>(
      `/vehicle-maintenances/${maintenanceId}/documents`,
      data
    );
    return { ...response, data: normalizeItem<VehicleMaintenanceDocument>(response.data) };
  },

  updateDocument: async (documentId: number, data: Partial<VehicleMaintenanceDocument>) => {
    const response = await http.put<ApiPayload<VehicleMaintenanceDocument>>(
      `/vehicle-maintenances/documents/${documentId}`,
      data
    );
    return { ...response, data: normalizeItem<VehicleMaintenanceDocument>(response.data) };
  },

  deleteDocument: (documentId: number) =>
    http.delete(`/vehicle-maintenances/documents/${documentId}`),

  runOcrForMaintenance: async (maintenanceId: number) => {
    const response = await http.post<ApiPayload<VehicleMaintenance>>(
      `/vehicle-maintenances/${maintenanceId}/ocr`
    );
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  runOcrForDocument: async (documentId: number) => {
    const response = await http.post<ApiPayload<VehicleMaintenanceDocument>>(
      `/vehicle-maintenances/documents/${documentId}/ocr`
    );
    return { ...response, data: normalizeItem<VehicleMaintenanceDocument>(response.data) };
  },

  getPendingActions: async () => {
    const response = await http.get<ApiPayload<{ items: PendingMaintenanceCard[]; total: number }>>(
      "/vehicle-maintenances/pending-actions"
    );
    return {
      ...response,
      data: normalizeItem<{ items: PendingMaintenanceCard[]; total: number }>(response.data),
    };
  },

  applyAiInsight: async (id: number) => {
    const response = await http.post<ApiPayload<VehicleMaintenance>>(
      `/vehicle-maintenances/${id}/ai-insight/apply`
    );
    return { ...response, data: normalizeItem<VehicleMaintenance>(response.data) };
  },

  regenerateAiInsight: (id: number) => http.post(`/vehicle-maintenances/${id}/ai-insight/regenerate`),

  getAiOverview: async (params?: { period?: string; force?: boolean }) => {
    const response = await http.get<ApiPayload<MaintenanceAiOverview>>(
      "/vehicle-maintenances/ai/overview",
      { params }
    );
    return { ...response, data: normalizeItem<MaintenanceAiOverview>(response.data) };
  },

  getDriverContext: async (params?: { date?: string }) => {
    const response = await http.get<ApiPayload<DriverMaintenanceContext>>(
      "/vehicle-maintenances/driver-context",
      { params }
    );
    return { ...response, data: normalizeItem<DriverMaintenanceContext>(response.data) };
  },
};

export default vehicleMaintenanceApi;
