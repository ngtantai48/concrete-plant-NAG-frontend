export type MaintenanceRiskLevel = "normal" | "warning" | "critical";

export interface MaintenanceForecastItem {
  vehicle_id: number;
  vehicle_license_plate: string;
  vehicle_name?: string | null;
  vehicle_status?: string | null;
  risk_level: MaintenanceRiskLevel;
  last_maintenance_at?: string | null;
  distance_since_last_maintenance_km?: number | null;
  km_until_due?: number | null;
  rule_hit?: string | null;
  note?: string | null;
}

export interface MaintenanceForecastResponse {
  date?: string;
  days_ahead?: number;
  thresholds?: Record<string, unknown>;
  total?: number;
  items?: MaintenanceForecastItem[];
}
