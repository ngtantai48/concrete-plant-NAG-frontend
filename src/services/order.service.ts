import http from "@/lib/http";

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

export interface Order {
  order_id: number;
  order_number: number;
  order_status: "pending" | "collecting" | "transporting" | "running" | "completed" | "canceled";
  order_init_datetime: string;
  order_start_datetime: string | null;
  order_end_datetime: string | null;
  order_description: string | null;
  users: OrderUser;
  vehicles: OrderVehicle;
  stations: OrderStation;
  user_vehicle: OrderCheck & { user_vehicle_id: number | null };
  station_checks: OrderCheck & { station_check_id: number | null };
  updated_at: string;
  updated_by: number;
}

const orderApi = {
  getAll: () => http.get("/orders?limit=1000"),
  getById: (id: number) => http.get(`/orders/${id}`),
  update: (id: number, data: Partial<Order>) => http.put(`/orders/${id}`, data),
  delete: (id: number) => http.delete(`/orders/${id}`),
};

export default orderApi;
