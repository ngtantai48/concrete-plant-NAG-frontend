import http from "@/lib/http";
import type { Driver } from "@/types/driver";

const driverApi = {
    getAll: (params?: Record<string, unknown>) => http.get("/users", { params }),
    create: (data: Omit<Driver, "id" | "created_at">) => http.post("/users", data),
    update: (id: number, data: Partial<Driver>) => http.put(`/users/${id}`, data),
    delete: (id: number) => http.delete(`/users/${id}`),
};

export default driverApi;
