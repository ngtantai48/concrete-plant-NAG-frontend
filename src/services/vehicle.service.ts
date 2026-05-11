import http from "@/lib/http";
import type { Vehicle } from "@/types/vehicle";

export interface ListVehicles {
  data: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

export interface EndOfDayVehicleStatus {
  vehicle_id: number;
  vehicle_license_plate?: string | null;
  vehicle_name?: string | null;
  driver_name?: string | null;
  final_status?: string | null;
  is_abnormal?: boolean;
  finished_at?: string | null;
  station_name?: string | null;
  order_id?: number | null;
}

export interface EndOfDayStatusResponse {
  date?: string;
  total?: number;
  abnormal_total?: number;
  vehicles?: EndOfDayVehicleStatus[];
}

const vehicleApi = {
  getAll: (params?: { page?: number; limit?: number; vehicle_license_plate?: string; vehicle_status?: string; user_id?: number }) => 
    http.get<ListVehicles>("/vehicles", { params }),
  getEndOfDayStatus: () => http.get<EndOfDayStatusResponse>("/vehicles/end-of-day-status"),
  getById: (id: number) => http.get(`/vehicles/${id}`),
  create: (data: Partial<Vehicle>) => http.post("/vehicles", data),
  update: (id: number, data: Partial<Vehicle>) => http.put(`/vehicles/${id}`, data),
  delete: (id: number) => http.delete(`/vehicles/${id}`),
};

export default vehicleApi;
