import http from "@/lib/http";
import type { Vehicle } from "@/types/vehicle";

export interface ListVehicles {
  data: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

const vehicleApi = {
  getAll: (params?: { page?: number; limit?: number; vehicle_license_plate?: string; vehicle_status?: string; user_id?: number }) => 
    http.get<ListVehicles>("/vehicles", { params }),
  getById: (id: number) => http.get(`/vehicles/${id}`),
  create: (data: Partial<Vehicle>) => http.post("/vehicles", data),
  update: (id: number, data: Partial<Vehicle>) => http.put(`/vehicles/${id}`, data),
  delete: (id: number) => http.delete(`/vehicles/${id}`),
};

export default vehicleApi;
