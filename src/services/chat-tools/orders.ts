import { z } from "zod";
import dayjs from "dayjs";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import type { ToolDefinition } from "./types";

const ORDER_STATUSES = [
  "init",
  "pending",
  "collecting",
  "transporting",
  "running",
  "completed",
  "canceled",
] as const;

const STATUS_ALIASES: Record<string, ReadonlyArray<(typeof ORDER_STATUSES)[number]>> = {
  moving: ["running", "transporting", "collecting"],
  active: ["running", "transporting", "collecting"],
  processing: ["running", "transporting", "collecting"],
  in_progress: ["running", "transporting", "collecting"],
  open: ["init", "pending", "collecting", "running", "transporting"],
};

const STATUS_OR_ALIAS = [
  ...ORDER_STATUSES,
  ...Object.keys(STATUS_ALIASES),
] as ReadonlyArray<string>;

interface OrderListResponse {
  data?: Order[];
  total?: number;
}

function summarizeOrders(orders: Order[]) {
  const byStatus: Record<string, number> = {};
  const vehicleSet = new Set<number>();
  const stationSet = new Set<number>();
  for (const o of orders) {
    byStatus[o.order_status] = (byStatus[o.order_status] ?? 0) + 1;
    if (o.vehicles?.vehicle_id) vehicleSet.add(o.vehicles.vehicle_id);
    if (o.stations?.station_id) stationSet.add(o.stations.station_id);
  }
  return {
    total: orders.length,
    byStatus,
    vehicles: vehicleSet.size,
    stations: stationSet.size,
  };
}

function compactOrder(o: Order) {
  return {
    order_id: o.order_id,
    order_number: o.order_number,
    status: o.order_status,
    init_at: o.order_init_datetime,
    start_at: o.order_start_datetime,
    end_at: o.order_end_datetime,
    vehicle: o.vehicles?.vehicle_license_plate ?? null,
    driver: o.users?.user_full_name ?? null,
    station: o.stations?.station_name ?? null,
  };
}

function unwrapOrders(payload: unknown): Order[] {
  if (Array.isArray(payload)) return payload as Order[];
  const p = payload as OrderListResponse | undefined;
  if (Array.isArray(p?.data)) return p!.data!;
  return [];
}

const todayOrdersArgs = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

const ordersByStatusArgs = z.object({
  status: z
    .string()
    .refine((value) => STATUS_OR_ALIAS.includes(value), {
      message: `status must be one of: ${STATUS_OR_ALIAS.join(", ")}`,
    }),
});

function resolveStatusList(status: string): ReadonlyArray<(typeof ORDER_STATUSES)[number]> {
  const alias = STATUS_ALIASES[status as keyof typeof STATUS_ALIASES];
  if (alias) return alias;
  return [status as (typeof ORDER_STATUSES)[number]];
}

function dedupeOrders(lists: Order[][]): Order[] {
  const seen = new Set<number>();
  const merged: Order[] = [];
  for (const list of lists) {
    for (const order of list) {
      const id = order.order_id;
      if (typeof id === "number" && seen.has(id)) continue;
      if (typeof id === "number") seen.add(id);
      merged.push(order);
    }
  }
  return merged;
}

export const getTodayOrdersTool: ToolDefinition<z.infer<typeof todayOrdersArgs>> = {
  name: "getTodayOrders",
  description:
    "Lấy danh sách chuyến (đơn hàng) trong một ngày cụ thể. Mặc định là hôm nay nếu không truyền date. Trả về tổng số chuyến, phân loại theo trạng thái, số xe và trạm liên quan.",
  schema: todayOrdersArgs,
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Ngày cần tra cứu, định dạng YYYY-MM-DD. Bỏ trống để lấy hôm nay.",
      },
    },
  },
  execute: async ({ date }) => {
    const target = date ?? dayjs().format("YYYY-MM-DD");
    const res = await orderApi.getByInitDate(target);
    const orders = unwrapOrders(res?.data ?? res);
    return {
      date: target,
      summary: summarizeOrders(orders),
      orders: orders.slice(0, 50).map(compactOrder),
      truncated: orders.length > 50,
    };
  },
};

export const getOrdersByStatusTool: ToolDefinition<z.infer<typeof ordersByStatusArgs>> = {
  name: "getOrdersByStatus",
  description:
    'Lấy danh sách chuyến (đơn hàng) theo trạng thái. Trạng thái đơn lẻ: init, pending, collecting, transporting, running, completed, canceled. Alias nhóm: "moving"/"active"/"processing"/"in_progress" (= running+transporting+collecting, dùng cho câu hỏi "đang di chuyển"/"đang xử lý"/"đang chạy"), "open" (= init+pending+collecting+running+transporting). LUÔN dùng alias "moving" khi user hỏi về đơn "đang di chuyển"/"đang chạy", KHÔNG dùng riêng "transporting".',
  schema: ordersByStatusArgs,
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description:
          'Trạng thái cần lọc. Dùng alias "moving" cho "đang di chuyển/đang chạy", "open" cho "đang mở".',
        enum: STATUS_OR_ALIAS as unknown as readonly string[],
      },
    },
    required: ["status"],
  },
  execute: async ({ status }) => {
    const targets = resolveStatusList(status);
    const responses = await Promise.all(
      targets.map(async (target) => {
        const res = await orderApi.getByStatus(target);
        return unwrapOrders(res?.data ?? res);
      })
    );
    const orders = dedupeOrders(responses);
    orders.sort((left, right) => {
      const leftTime = left.order_start_datetime ?? left.order_init_datetime ?? "";
      const rightTime = right.order_start_datetime ?? right.order_init_datetime ?? "";
      return rightTime.localeCompare(leftTime);
    });
    return {
      status,
      resolvedStatuses: targets,
      summary: summarizeOrders(orders),
      orders: orders.slice(0, 50).map(compactOrder),
      truncated: orders.length > 50,
    };
  },
};
