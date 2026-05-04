import http from "@/lib/http";
import type {
  VehicleFuelProfile,
  FuelEvent,
  OrderFuelMetric,
  FuelAlert,
  FuelDashboardResponse,
  FuelVehicleSummary,
  VehicleTankStatus,
} from "@/types/report";

// ─── Fuel Management API Service ───────────────────────────────────────────────
const fuelApi = {
  /* ── Profiles (cấu hình nhiên liệu theo xe) ─────────────────────────── */
  getProfiles: (params?: { vehicle_id?: number; page?: number; limit?: number }) =>
    http.get<{ data: VehicleFuelProfile[]; total: number }>("/fuel/profiles", { params }),

  updateProfile: (vehicleId: number, body: Partial<Omit<VehicleFuelProfile, "vehicle_fuel_profile_id" | "vehicle_id" | "created_at" | "updated_at">>) =>
    http.put<VehicleFuelProfile>(`/fuel/profiles/${vehicleId}`, body),

  /* ── Events (sổ cái sự kiện nhiên liệu) ──────────────────────────────── */
  getEvents: (params?: { vehicle_id?: number; from?: string; to?: string; event_type?: string; page?: number; limit?: number }) =>
    http.get<{ data: FuelEvent[]; total: number }>("/fuel/events", { params }),

  createEvent: (body: Omit<FuelEvent, "fuel_event_id" | "created_at" | "updated_at" | "created_by" | "vehicle_name" | "vehicle_license_plate">) =>
    http.post<FuelEvent>("/fuel/events", body),

  updateEvent: (id: number, body: Partial<FuelEvent>) =>
    http.put<FuelEvent>(`/fuel/events/${id}`, body),

  deleteEvent: (id: number) =>
    http.delete(`/fuel/events/${id}`),

  /* ── Order Fuel Metrics (tiêu hao theo chuyến) ───────────────────────── */
  getOrderMetrics: (params?: { vehicle_id?: number; from?: string; to?: string; station_id?: number; page?: number; limit?: number }) =>
    http.get<{ data: OrderFuelMetric[]; total: number }>("/fuel/order-metrics", { params }),

  recomputeMetrics: (body: { from: string; to: string; vehicle_id?: number }) =>
    http.post("/fuel/order-metrics/recompute", body),

  /* ── Dashboard & Reports ─────────────────────────────────────────────── */
  getDashboard: (params?: { from?: string; to?: string; vehicle_id?: number; group_by?: "day" | "week" | "month" }) =>
    http.get<FuelDashboardResponse>("/fuel/dashboard", { params }),

  getVehiclesSummary: (params?: { from?: string; to?: string; sort_by?: string; direction?: "asc" | "desc" }) =>
    http.get<{ from: string; to: string; total: number; items: FuelVehicleSummary[] }>("/fuel/vehicles-summary", { params }),

  /* ── Tank Status (tồn dầu hiện tại theo xe) ─────────────────────────── */
  getTankStatus: (params?: { from?: string; to?: string; vehicle_id?: number; include_vtracking_runtime?: number; runtime_concurrency?: number }) =>
    http.get<{ from: string; to: string; total: number; items: VehicleTankStatus[] }>("/fuel/tank-status", { params }),

  getTankTimeseries: (params: { vehicle_id: number; from?: string; to?: string; step_minutes?: number }) =>
    http.get<{ vehicle_id: number; timeseries: { time: string; fuel_liters: number; is_event: boolean; event_type?: string; event_liters?: number; raw_event_types?: string[] }[] }>("/fuel/tank-timeseries", { params }),

  /* ── Alerts (cảnh báo bất thường) ────────────────────────────────────── */
  getAlerts: (params?: { status?: string; severity?: string; vehicle_id?: number; from?: string; to?: string; page?: number; limit?: number }) =>
    http.get<{ data: FuelAlert[]; total: number }>("/fuel/alerts", { params }),

  ackAlert: (id: number) =>
    http.put(`/fuel/alerts/${id}/ack`),

  resolveAlert: (id: number) =>
    http.put(`/fuel/alerts/${id}/resolve`),
};

export default fuelApi;
