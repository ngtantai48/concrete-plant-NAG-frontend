export interface OrderUser {
  user_id: number;
  user_full_name: string;
  user_status: string;
  user_work_shift: string;
  user_email: string;
  user_phone_number: string;
}

export interface OrderVehicle {
  vehicle_id: number;
  vehicle_name?: string | null;
  vehicle_license_plate: string;
  vehicle_rfid: string;
  vehicle_status: string;
  vehicle_description: string;
  vehicle_type_id: number;
  vehicle_type_name: string;
  vehicle_type_description: string | null;
}

export interface OrderStation {
  station_id: number;
  station_status: string;
  station_name: string;
  station_gps: string;
  station_gps_geofencing: number;
  station_address: string;
  station_description: string;
  station_type_id: number;
  station_type_name: string;
  station_type_description: string;
}

export interface OrderCheck {
  check_in_datetime: string | null;
  check_in_gps: string | null;
  check_out_datetime: string | null;
  check_out_gps: string | null;
}

export interface OrderMulti {
  distance_start: number;
  nStop_start: number;
  vehicle_checkin_gps?: string | null;
  auto_pending_vehicle_flow?: boolean;
  auto_non_tanker_vehicle_flow?: boolean;
  distance_end: number;
  nStop_end: number;
  stop_duration_seconds?: number;
  vehicle_checkout_gps?: string | null;
  checkin_time_station?: string | null;
  checkout_time_station?: string | null;
  outside_yard_without_load?: boolean;
  outside_yard_without_load_note?: string | null;
  outside_yard_without_load_started_at?: string | null;
  outside_yard_without_load_returned_at?: string | null;
  outside_yard_without_load_duration_seconds?: number | null;
}

export interface Order {
  order_id: number;
  order_number: number;
  order_status: "init" | "pending" | "collecting" | "transporting" | "running" | "completed" | "canceled";
  order_init_datetime: string;
  order_start_datetime: string | null;
  order_end_datetime: string | null;
  order_description: string | null;
  checkin_time_station?: string | null;
  checkout_time_station?: string | null;
  order_multi: OrderMulti | null;
  shift_id?: number | null;
  shift_closing?: {
    shift_id: number;
    shift_status: number;
  } | null;
  users: OrderUser;
  vehicles: OrderVehicle;
  stations: OrderStation;
  user_vehicle: OrderCheck & { user_vehicle_id: number | null };
  station_checks: OrderCheck & { station_check_id: number | null };
  updated_at: string;
  updated_by: number;
}
