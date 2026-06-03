import http from "@/lib/http";
import type {
  ParkingIdleEngineSettings,
  ParkingIdleEngineSettingsResponse,
  ParkingIdleEngineAlertsResponse,
  ParkingIdleEngineHistoryResponse,
} from "@/types/parking-idle-engine";

// ─── Parking Idle Engine Alert API Service ──────────────────────────────────
const parkingIdleEngineApi = {
  /* ── Settings ─────────────────────────────────────────────────────────── */
  getSettings: () =>
    http.get<ParkingIdleEngineSettingsResponse>("/multi/parking-idle-engine"),

  updateSettings: (body: ParkingIdleEngineSettings) =>
    http.put<ParkingIdleEngineSettingsResponse>("/multi/parking-idle-engine", body),

  /* ── Alert Dashboard ──────────────────────────────────────────────────── */
  getAlerts: (params?: { vehicle_id?: number; warning_only?: 1 | 0 }) =>
    http.get<ParkingIdleEngineAlertsResponse>("/fuel/parking-idle-engine-alerts", { params }),

  /* ── History ──────────────────────────────────────────────────────────── */
  getHistory: (params?: {
    vehicle_id?: number;
    status?: "open" | "closed";
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => http.get<ParkingIdleEngineHistoryResponse>("/fuel/parking-idle-engine-history", { params }),
};

export default parkingIdleEngineApi;
