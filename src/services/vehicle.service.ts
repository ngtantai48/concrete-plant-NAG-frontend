import http from "@/lib/http";
import type { Vehicle } from "@/types/vehicle";

export interface ListVehicles {
  data: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

export interface EndOfDayVehicle {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
  driver_name: string;
  final_status: string;
  is_abnormal: boolean;
  finished_at: string | null;
  operation_note: string;
  operation_notes?: string[];
  abnormal_notes?: string[];
  order_id: number;
  order_number: number;
  order_status: string;
  station_name: string;
}

export interface EndOfDayStatusResponse {
  date: string;
  total: number;
  abnormal_total: number;
  vehicles: EndOfDayVehicle[];
}

const vehicleApi = {
  getAll: (params?: { page?: number; limit?: number; vehicle_license_plate?: string; vehicle_status?: string; user_id?: number }) => 
    http.get<ListVehicles>("/vehicles", { params }),
  getById: (id: number) => http.get(`/vehicles/${id}`),
  create: (data: Partial<Vehicle>) => http.post("/vehicles", data),
  update: (id: number, data: Partial<Vehicle>) => http.put(`/vehicles/${id}`, data),
  delete: (id: number) => http.delete(`/vehicles/${id}`),
  getEndOfDayStatus: () => http.get<EndOfDayStatusResponse>("/vehicles/end-of-day-status"),
};

export default vehicleApi;
