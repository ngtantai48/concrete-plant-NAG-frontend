// ─── Production Report ─────────────────────────────────────────────────────────
export interface ProductionQuery {
  from?: string;
  to?: string;
  group_by?: "day" | "week" | "month";
  station_id?: number;
  vehicle_id?: number;
  user_id?: number;
  order_status?: "all" | "pending" | "running" | "collecting" | "transporting" | "completed" | "canceled";
}

export interface ProductionSummary {
  total_orders: number;
  completed: number;
  running: number;
  collecting: number;
  transporting: number;
  pending: number;
  canceled: number;
  total_distance_km: number;
}

export interface ProductionSeriesItem {
  period: string;
  total_orders: number;
  completed: number;
  running: number;
  collecting: number;
  transporting: number;
  pending: number;
  canceled: number;
  distance_km: number;
}

export interface ProductionTopVehicle {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
  total_orders: number;
  total_distance_km: number;
}

export interface ProductionTopStation {
  station_id: number;
  station_name: string;
  total_orders: number;
}

export interface ProductionTopDriver {
  user_id: number;
  user_name: string;
  total_orders: number;
}

export interface ProductionReportResponse {
  from: string;
  to: string;
  group_by: string;
  summary: ProductionSummary;
  series: ProductionSeriesItem[];
  top_vehicles: ProductionTopVehicle[];
  top_stations: ProductionTopStation[];
  top_drivers: ProductionTopDriver[];
}

// ─── Maintenance Forecast ──────────────────────────────────────────────────────
export interface MaintenanceForecastQuery {
  date?: string;
  days_ahead?: number;
  vehicle_id?: number;
  risk_level?: "all" | "normal" | "warning" | "critical";
  km_to_warning?: number;
  km_to_maintenance?: number;
}

export interface MaintenanceForecastItem {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
  vehicle_status: string;
  last_maintenance_at: string;
  distance_since_last_maintenance_km: number;
  estimated_due_km: number;
  km_until_due: number;
  risk_level: "normal" | "warning" | "critical";
  rule_hit: string;
  note: string;
  projected_window_days: number;
}

export interface MaintenanceForecastResponse {
  date: string;
  days_ahead: number;
  thresholds: {
    km_to_warning: number;
    km_to_maintenance: number;
  };
  total: number;
  items: MaintenanceForecastItem[];
}

// ─── Fuel Consumption ──────────────────────────────────────────────────────────
export interface FuelConsumptionQuery {
  from?: string;
  to?: string;
  group_by?: "day" | "week" | "month";
  station_id?: number;
  vehicle_id?: number;
  default_l_per_100km?: number;
}

export interface FuelConsumptionSummary {
  total_distance_km: number;
  estimated_fuel_liters: number;
  fuel_rate_l_per_100km: number;
}

export interface FuelConsumptionItem {
  period: string;
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
  distance_km: number;
  estimated_fuel_liters: number;
  fuel_rate_l_per_100km: number;
}

export interface FuelConsumptionResponse {
  from: string;
  to: string;
  group_by: string;
  summary: FuelConsumptionSummary;
  items: FuelConsumptionItem[];
}

// ─── Fuel Management System ────────────────────────────────────────────────────

export interface VehicleFuelProfile {
  vehicle_fuel_profile_id: number;
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_license_plate?: string;
  fuel_type?: string;
  tank_capacity_liters: number | null;
  default_l_per_100km: number;
  idle_l_per_hour: number;
  load_factor: number;
  opening_fuel_liters?: number;
  opening_fuel_at?: string;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface FuelEvent {
  fuel_event_id: number;
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_license_plate?: string;
  event_type: "refuel_full" | "refuel_partial" | "drain" | "adjust_plus" | "adjust_minus";
  event_time: string;
  liters: number;
  unit_price: number | null;
  odometer_km: number | null;
  note: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface OrderFuelMetric {
  order_fuel_metric_id: number;
  order_id: number;
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_license_plate?: string;
  distance_km: number;
  idle_minutes: number;
  drive_fuel_liters: number;
  idle_fuel_liters: number;
  total_fuel_liters: number;
  formula_version: string;
  computed_at: string;
  order_start_datetime?: string;
  order_end_datetime?: string;
  station_name?: string;
  order_status?: string;
}

export interface FuelAlert {
  fuel_alert_id: number;
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_license_plate?: string;
  order_id: number | null;
  alert_type: "high_consumption" | "suspicious_drop" | "long_idle_consumption" | "missing_refuel_pattern";
  severity: "low" | "medium" | "high";
  detected_at: string;
  expected_value: number | null;
  actual_value: number | null;
  deviation_percent: number | null;
  status: "open" | "ack" | "resolved";
  note: string | null;
}

export interface FuelDashboardSeries {
  period: string;
  total_distance_km: number;
  total_estimated_fuel_liters: number;
}

export interface FuelDashboardResponse {
  from: string;
  to: string;
  group_by: string;
  summary: {
    total_distance_km: number;
    total_estimated_fuel_liters: number;
    total_refuel_liters: number;
    variance_liters: number;
    fuel_rate_l_per_100km: number;
    // New breakdown fields
    distance_component_liters: number;
    idle_component_liters: number;
    total_drain_liters: number;
    actual_net_used_liters: number;
  };
  series: FuelDashboardSeries[];
}

export interface FuelVehicleSummary {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
  total_distance_km: number;
  total_estimated_fuel_liters: number;
  total_refuel_liters: number;
  variance_liters: number;
  fuel_rate_l_per_100km: number;
  trip_count: number;
  alert_count: number;
  profile?: VehicleFuelProfile;
}

export interface VehicleTankStatus {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;

  tank_capacity_liters: number;
  configured_opening_fuel_liters?: number;
  configured_opening_balance_liters?: number; // New field for original baseline
  configured_opening_fuel_at?: string;

  can_compute_balance?: boolean;
  data_quality?: "ok" | "missing_baseline_for_range";
  data_quality_reason?: "opening_after_range_start" | "no_opening_no_full_refuel_before_range" | null;

  opening_balance_liters: number;
  period_opening_balance_liters?: number; // New dynamic opening balance
  refuel_in_liters: number;
  drain_out_liters: number;
  net_refuel_liters?: number;

  distance_component_liters: number;
  idle_component_liters: number;
  estimated_used_liters: number;

  actual_used_semantic?: string;
  actual_used_liters?: number;

  balance_used_liters?: number;
  current_fuel_liters: number;
  current_fuel_percent: number;

  variance_liters: number;
  variance_percent: number;

  // Fuel estimation source
  fuel_estimation_source?: "vtracking_engine_runtime" | "vtracking_motion_runtime" | "order_metrics";
  idle_estimation_source?: "vtracking_engine_runtime" | "vtracking_motion_runtime" | "order_metrics" | "order_metrics_fallback_for_motion";
  idle_fallback_applied?: boolean;
  engine_on_minutes_total?: number;
  engine_on_idle_minutes?: number;
  engine_on_moving_minutes?: number;
  vtracking_runtime_samples?: number;
  vtracking_engine_signal_available?: boolean;

  total_distance_km: number;
  total_idle_minutes: number;
  opening_strategy: string;

  // New scope fields
  metric_scope?: "realtime_from_configured_opening" | "realtime_fallback_today" | "range";
  metrics_from?: string;
  metrics_to?: string;

  // Debug & source info
  distance_estimation_source?: "vtracking_odometer_delta" | "vtracking_geo_distance" | "order_metrics";
  odometer_start_km?: number;
  odometer_end_km?: number;
  odometer_delta_km?: number;
  odometer_samples?: number;
}
