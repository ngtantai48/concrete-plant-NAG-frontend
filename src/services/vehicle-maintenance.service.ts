// Mock service for vehicle maintenance — will be replaced with real API later

import type { VehicleMaintenance } from "@/types/vehicle";

const MOCK_DATA: VehicleMaintenance[] = [
  {
    vehicle_maintenance_id: 1,
    vehicle_maintenance_from_datetime: "2026-03-10T08:00:00",
    vehicle_maintenance_to_datetime: "2026-03-12T17:00:00",
    vehicle_distance_covered: 15200,
    vehicle_maintenance_description: "Thay dầu động cơ, lọc dầu, lọc gió. Kiểm tra hệ thống phanh.",
    vehicle_id: 1,
  },
  {
    vehicle_maintenance_id: 2,
    vehicle_maintenance_from_datetime: "2026-03-15T07:30:00",
    vehicle_maintenance_to_datetime: "2026-03-20T16:00:00",
    vehicle_distance_covered: 32500,
    vehicle_maintenance_description: "Bảo dưỡng định kỳ 30.000km: thay bố thắng, kiểm tra bơm thuỷ lực trộn bê tông.",
    vehicle_id: 2,
  },
  {
    vehicle_maintenance_id: 3,
    vehicle_maintenance_from_datetime: "2026-02-20T09:00:00",
    vehicle_maintenance_to_datetime: "2026-02-22T15:00:00",
    vehicle_distance_covered: 8750,
    vehicle_maintenance_description: "Sửa chữa hệ thống điện, thay ắc-quy, kiểm tra đèn chiếu sáng.",
    vehicle_id: 3,
  },
  {
    vehicle_maintenance_id: 4,
    vehicle_maintenance_from_datetime: "2026-01-05T08:00:00",
    vehicle_maintenance_to_datetime: "2026-01-08T17:00:00",
    vehicle_distance_covered: 45000,
    vehicle_maintenance_description: "Thay lốp xe (4 lốp), căn chỉnh thước lái, cân bằng động.",
    vehicle_id: 1,
  },
  {
    vehicle_maintenance_id: 5,
    vehicle_maintenance_from_datetime: "2026-03-16T08:00:00",
    vehicle_maintenance_to_datetime: "2026-03-25T17:00:00",
    vehicle_distance_covered: 60200,
    vehicle_maintenance_description: "Bảo dưỡng lớn 60.000km: thay dây curoa, bộ ly hợp, kiểm tra hộp số.",
    vehicle_id: 4,
  },
  {
    vehicle_maintenance_id: 6,
    vehicle_maintenance_from_datetime: "2025-12-10T07:00:00",
    vehicle_maintenance_to_datetime: "2025-12-11T12:00:00",
    vehicle_distance_covered: 5200,
    vehicle_maintenance_description: "Kiểm tra & bơm mỡ các khớp nối bồn trộn, thay gioăng chống rò rỉ.",
    vehicle_id: 5,
  },
];

let mockStore = [...MOCK_DATA];
let nextId = 7;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const vehicleMaintenanceApi = {
  getAll: async () => {
    await delay(400);
    return { data: [...mockStore] };
  },

  create: async (data: Omit<VehicleMaintenance, "vehicle_maintenance_id">) => {
    await delay(300);
    const newRecord: VehicleMaintenance = { ...data, vehicle_maintenance_id: nextId++ };
    mockStore = [newRecord, ...mockStore];
    return { data: newRecord };
  },

  update: async (id: number, data: Partial<VehicleMaintenance>) => {
    await delay(300);
    mockStore = mockStore.map((item) =>
      item.vehicle_maintenance_id === id ? { ...item, ...data } : item
    );
    return { data: mockStore.find((item) => item.vehicle_maintenance_id === id) };
  },

  delete: async (id: number) => {
    await delay(300);
    mockStore = mockStore.filter((item) => item.vehicle_maintenance_id !== id);
    return { data: { success: true } };
  },
};

export default vehicleMaintenanceApi;
