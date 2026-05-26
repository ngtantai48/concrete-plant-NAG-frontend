// ─── Parking Idle Engine Alert Types ────────────────────────────────────────

export interface ParkingIdleEngineSettings {
  enabled: boolean;
  warning_after_minutes: number;
  min_confidence: "high" | "medium" | "low";
  notification_ttl_seconds: number;
}

export interface ParkingIdleEngineSettingsResponse {
  multi_id: number | null;
  multi_name: "parking_idle_engine_alert_settings";
  multi_type: "system_setting";
  multi_data: ParkingIdleEngineSettings;
  updated_at: string | null;
  updated_by: number | null;
}

export interface ParkingIdleEngineAlert {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;

  station_id: number;
  station_name: string;

  order_id: number | null;
  order_number: number | null;
  order_status: string | null;
  is_collecting_at_station: boolean;

  engine_on: boolean;
  warning_active: boolean;

  idle_started_at: string | null;
  elapsed_minutes: number;
  idle_l_per_hour: number;
  estimated_idle_fuel_liters: number;
  warning_after_minutes: number;

  engine_state: "on" | "off" | "unknown";
  engine_source: string | null;
  engine_confidence: "high" | "medium" | "low";
  engine_signal_available: boolean;

  motion_state: "moving" | "idle" | "parked" | "offline" | "unknown";

  raw_engine_fields: Record<string, unknown>;

  vtracking_status: string;
  vtracking_speed: number;
  vtracking_timestamp: number;

  latitude: number;
  longitude: number;
  geocoding: string;
}

export interface ParkingIdleEngineAlertsResponse {
  settings: ParkingIdleEngineSettings;
  total: number;
  warning_count: number;
  engine_on_count: number;
  estimated_idle_fuel_liters: number;
  items: ParkingIdleEngineAlert[];
}

export interface ParkingIdleEngineNotificationPayload {
  type: "parking_idle_engine";
  event: "parking_idle_engine_warning";
  alert_status: "warning";

  vehicle_id: number;
  vehicle_license_plate: string | null;
  vehicle_name: string | null;

  station_id: number | null;
  station_name: string | null;

  order_id: number | null;
  order_number: number | null;
  order_status: string | null;

  idle_started_at: string;
  warning_after_minutes: number;
  elapsed_minutes: number;
  idle_l_per_hour: number;
  estimated_idle_fuel_liters: number;

  engine_state: "on" | "off" | "unknown";
  engine_source: string | null;
  engine_confidence: "high" | "medium" | "low";
  engine_signal_available: boolean;
  motion_state: string;

  vtracking_status: string;
  vtracking_speed: number;
  vtracking_latitude: number;
  vtracking_longitude: number;
  vtracking_timestamp: number;

  title: string;
  message: string;
}

export interface ParkingIdleEngineHistoryItem {
  multi_id: number;
  session_name: string;

  status: "open" | "closed";

  vehicle_id: number;
  vehicle_name: string | null;
  vehicle_license_plate: string | null;

  station_id: number | null;
  station_name: string | null;

  order_id: number | null;
  order_number: number | null;
  order_status: string | null;

  idle_started_at: string;
  idle_ended_at?: string;
  end_reason?:
    | "engine_off"
    | "left_yard"
    | "collecting_at_station"
    | "disabled"
    | "low_confidence"
    | string;

  elapsed_minutes: number;
  idle_l_per_hour: number;
  estimated_idle_fuel_liters: number;

  engine_state: "on" | "off" | "unknown";
  engine_source: string | null;
  engine_confidence: "high" | "medium" | "low";
  engine_signal_available: boolean;
  motion_state: string;

  raw_engine_fields: Record<string, unknown>;

  vtracking_status: string;
  vtracking_speed: number;
  vtracking_timestamp: number;

  vtracking_latitude: number;
  vtracking_longitude: number;
  geocoding: string;

  created_at: string;
  updated_at: string;
}

export interface ParkingIdleEngineHistoryResponse {
  total: number;
  page: number;
  limit: number;
  items: ParkingIdleEngineHistoryItem[];
}
