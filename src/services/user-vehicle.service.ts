import http from "@/lib/http";

export interface UserVehicle {
  user_vehicle_id: number;
  user_id: number;
  vehicle_id: number;
  check_in_gps: string | null;
  check_in_datetime: string | null;
  check_out_gps: string | null;
  check_out_datetime: string | null;
}

const userVehicleApi = {
  getAll: () => http.get("/user-vehicle"),
  create: (data: Partial<UserVehicle>) => http.post("/user-vehicle", data),
  update: (id: number, data: Partial<UserVehicle>) => http.put(`/user-vehicle/${id}`, data),
  delete: (id: number) => http.delete(`/user-vehicle/${id}`),
};

export default userVehicleApi;
