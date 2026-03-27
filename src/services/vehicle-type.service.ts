import http from "@/lib/http";
import type { VehicleType } from "@/types/vehicle";

const vehicleTypeApi = {
  getAll: () => http.get("/vehicle-types"),
  create: (data: Partial<VehicleType>) => http.post("/vehicle-types", data),
  update: (id: number, data: Partial<VehicleType>) => http.put(`/vehicle-types/${id}`, data),
  delete: (id: number) => http.delete(`/vehicle-types/${id}`),
};

export default vehicleTypeApi;
