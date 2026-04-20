import http from "@/lib/http";
import type { Order } from "@/types/order";

export type OrderUpdatePayload = Partial<Order> & {
  station_id?: number;
};

export interface ShiftOperationPayload {
  operation_date: string;
}

const orderApi = {
  getAll: (params?: Record<string, string>) => {
    const query = new URLSearchParams({ limit: "1000", ...params });
    return http.get(`/orders?${query.toString()}`);
  },
  getByInitDate: (date: string) => http.get(`/orders?order_start_datetime=${date}&limit=1000`),
  getByStatus: (status: string) => http.get(`/orders?order_status=${status}&limit=1000`),
  getById: (id: number) => http.get(`/orders/${id}`),
  update: (id: number, data: OrderUpdatePayload) => http.put(`/orders/${id}`, data),
  shiftClose: (data: ShiftOperationPayload) => http.post("/orders/shift-close", data),
  shiftReopen: (data: ShiftOperationPayload) => http.post("/orders/shift-reopen", data),
  shiftOpen: (data: ShiftOperationPayload) => http.post("/orders/shift-open", data),
  shiftReopenInit: (data: ShiftOperationPayload) => http.post("/orders/shift-reopen-init", data),
  shiftRebalance: (data: ShiftOperationPayload) => http.post("/orders/shift-rebalance", data),
  reorder: (data: { order_id: number; target_position: number }) => http.put("/orders/reorder", data),
  arrangeTime: (data: { vehicle_ids: number[] }) => http.put("/orders/arrange-time", data),
  shiftOpenSlot: () => http.post("/orders/shift-open-slot"),
  delete: (id: number) => http.delete(`/orders/${id}`),
};

export default orderApi;
