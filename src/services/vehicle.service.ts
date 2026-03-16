import http from "@/lib/http";

export interface Vehicle {
  vehicle_id: number;
  vehicle_license_plate: string;
  vehicle_status: string;
  vehicle_description: string | null;
  vehicle_type_id: number;
  updated_at?: string;
  updated_by?: number;
}

const vehicleApi = {
  getAll: () => http.get("/vehicles"),
  create: (data: Partial<Vehicle>) => http.post("/vehicles", data),
  update: (id: number, data: Partial<Vehicle>) => http.put(`/vehicles/${id}`, data),
  delete: (id: number) => http.delete(`/vehicles/${id}`),
};

export default vehicleApi;
