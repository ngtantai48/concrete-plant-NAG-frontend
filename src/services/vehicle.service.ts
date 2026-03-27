import http from "@/lib/http";
import type { Vehicle } from "@/types/vehicle";

const vehicleApi = {
  getAll: () => http.get("/vehicles?limit=1000"),
  getById: (id: number) => http.get(`/vehicles/${id}`),
  create: (data: Partial<Vehicle>) => http.post("/vehicles", data),
  update: (id: number, data: Partial<Vehicle>) => http.put(`/vehicles/${id}`, data),
  delete: (id: number) => http.delete(`/vehicles/${id}`),
};

export default vehicleApi;
