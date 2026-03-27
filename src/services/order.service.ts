import http from "@/lib/http";
import type { Order } from "@/types/order";

const orderApi = {
  getAll: () => http.get("/orders?limit=1000"),
  getById: (id: number) => http.get(`/orders/${id}`),
  update: (id: number, data: Partial<Order>) => http.put(`/orders/${id}`, data),
  delete: (id: number) => http.delete(`/orders/${id}`),
};

export default orderApi;
