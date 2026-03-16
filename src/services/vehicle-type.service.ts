import http from "@/lib/http";

export interface VehicleType {
  vehicle_type_id: number;
  vehicle_type_name: string;
  vehicle_type_description: string | null;
  updated_at?: string;
  updated_by?: number;
}

const vehicleTypeApi = {
  getAll: () => http.get("/vehicle-types"),
  create: (data: Partial<VehicleType>) => http.post("/vehicle-types", data),
  update: (id: number, data: Partial<VehicleType>) => http.put(`/vehicle-types/${id}`, data),
  delete: (id: number) => http.delete(`/vehicle-types/${id}`),
};

export default vehicleTypeApi;
