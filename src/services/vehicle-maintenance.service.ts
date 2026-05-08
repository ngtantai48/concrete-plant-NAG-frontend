import http from "@/lib/http";
import type { VehicleMaintenance } from "@/types/vehicle";

type VehicleMaintenanceListPayload =
  | VehicleMaintenance[]
  | {
      data?: VehicleMaintenance[];
    };

function normalizeList(payload: VehicleMaintenanceListPayload): VehicleMaintenance[] {
  return Array.isArray(payload) ? payload : (payload.data ?? []);
}

const vehicleMaintenanceApi = {
  getAll: async (params?: Record<string, unknown>) => {
    const response = await http.get<VehicleMaintenanceListPayload>("/vehicle-maintenances", { params });
    return { ...response, data: normalizeList(response.data) };
  },

  create: (data: Omit<VehicleMaintenance, "vehicle_maintenance_id">) =>
    http.post<VehicleMaintenance>("/vehicle-maintenances", data),

  update: (id: number, data: Partial<VehicleMaintenance>) =>
    http.put<VehicleMaintenance>(`/vehicle-maintenances/${id}`, data),

  delete: (id: number) => http.delete(`/vehicle-maintenances/${id}`),
};

export default vehicleMaintenanceApi;
