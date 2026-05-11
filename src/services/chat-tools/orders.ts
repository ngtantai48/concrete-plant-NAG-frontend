import { z } from "zod";
import dayjs from "dayjs";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import type { ToolDefinition } from "./types";
import {
  aggregateOrderStatusGroups,
  ORDER_STATUSES,
  ORDER_STATUS_BUSINESS_RULES,
  orderStatusLabel,
} from "./order-status";

interface OrderListResponse {
  data?: Order[];
  total?: number;
}

function summarizeOrders(orders: Order[]) {
  const byStatus: Record<string, number> = {};
  const vehicleSet = new Set<number>();
  for (const o of orders) {
    byStatus[o.order_status] = (byStatus[o.order_status] ?? 0) + 1;
    if (o.vehicles?.vehicle_id) vehicleSet.add(o.vehicles.vehicle_id);
  }
  return {
    total: orders.length,
    byStatus,
    status_groups: aggregateOrderStatusGroups(byStatus),
    status_meaning: ORDER_STATUS_BUSINESS_RULES,
    vehicles: vehicleSet.size,
  };
}

function compactOrder(o: Order) {
  return {
    order_id: o.order_id,
    order_number: o.order_number,
    status: o.order_status,
    status_label: orderStatusLabel(o.order_status),
    init_at: o.order_init_datetime,
    start_at: o.order_start_datetime,
    end_at: o.order_end_datetime,
    vehicle: o.vehicles?.vehicle_license_plate ?? null,
  };
}

function orderScheduleAt(order: Order): string | null {
  return order.order_start_datetime ?? order.order_init_datetime ?? null;
}

function isAfternoonOrder(order: Order): boolean {
  const scheduledAt = orderScheduleAt(order);
  if (!scheduledAt) return false;
  const parsed = dayjs(scheduledAt);
  return parsed.isValid() && parsed.hour() >= 12;
}

function buildAfternoonAvailability(orders: Order[]) {
  const activeStatuses = new Set<Order["order_status"]>([
    "init",
    "pending",
    "collecting",
    "transporting",
    "running",
  ]);
  const vehicleMap = new Map<
    number,
    {
      vehicle_id: number;
      license_plate: string | null;
      name: string | null;
      orders: ReturnType<typeof compactOrder>[];
      busyAfternoonOrders: ReturnType<typeof compactOrder>[];
    }
  >();

  for (const order of orders) {
    const vehicleId = order.vehicles?.vehicle_id;
    if (!vehicleId) continue;
    const existing =
      vehicleMap.get(vehicleId) ??
      {
        vehicle_id: vehicleId,
        license_plate: order.vehicles?.vehicle_license_plate ?? null,
        name: order.vehicles?.vehicle_name ?? null,
        orders: [],
        busyAfternoonOrders: [],
      };
    const compact = compactOrder(order);
    existing.orders.push(compact);
    if (isAfternoonOrder(order) && activeStatuses.has(order.order_status)) {
      existing.busyAfternoonOrders.push(compact);
    }
    vehicleMap.set(vehicleId, existing);
  }

  const vehicles = [...vehicleMap.values()];
  const busy = vehicles
    .filter((vehicle) => vehicle.busyAfternoonOrders.length > 0)
    .map((vehicle) => ({
      vehicle_id: vehicle.vehicle_id,
      license_plate: vehicle.license_plate,
      name: vehicle.name,
      orders: vehicle.busyAfternoonOrders,
    }));
  const candidates = vehicles
    .filter((vehicle) => vehicle.busyAfternoonOrders.length === 0)
    .map((vehicle) => {
      const sortedOrders = [...vehicle.orders].sort((left, right) =>
        String(right.start_at ?? right.init_at ?? "").localeCompare(String(left.start_at ?? left.init_at ?? "")),
      );
      return {
        vehicle_id: vehicle.vehicle_id,
        license_plate: vehicle.license_plate,
        name: vehicle.name,
        last_order: sortedOrders[0] ?? null,
      };
    });

  return {
    source: "orders",
    rule:
      `Ca chiều tính từ 12:00. Xe bận nếu có order ca chiều ở trạng thái init/pending/collecting/transporting/running. ${ORDER_STATUS_BUSINESS_RULES}`,
    caveat: "Xe không xuất hiện trong orders hôm nay không được kết luận từ dữ liệu này.",
    busy_count: busy.length,
    candidate_count: candidates.length,
    busy,
    candidates,
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
  status: z.enum(ORDER_STATUSES),
});

export const getTodayOrdersTool: ToolDefinition<z.infer<typeof todayOrdersArgs>> = {
  name: "getTodayOrders",
  description:
    `Lấy danh sách chuyến (đơn hàng) trong một ngày cụ thể, trong phạm vi trạm NGUYÊN ANH. Mặc định là hôm nay nếu không truyền date. Trả về tổng số chuyến, phân loại theo trạng thái và số xe liên quan; không dùng để phân tích phân bổ theo trạm. ${ORDER_STATUS_BUSINESS_RULES}`,
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
      afternoon_availability: buildAfternoonAvailability(orders),
      orders: orders.slice(0, 50).map(compactOrder),
      truncated: orders.length > 50,
    };
  },
};

export const getOrdersByStatusTool: ToolDefinition<z.infer<typeof ordersByStatusArgs>> = {
  name: "getOrdersByStatus",
  description:
    `Lấy danh sách chuyến (đơn hàng) theo trạng thái. Trạng thái hợp lệ: init, pending, collecting, transporting, running, completed, canceled. ${ORDER_STATUS_BUSINESS_RULES}`,
  schema: ordersByStatusArgs,
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: `Trạng thái đơn cần lọc. ${ORDER_STATUS_BUSINESS_RULES}`,
        enum: ORDER_STATUSES,
      },
    },
    required: ["status"],
  },
  execute: async ({ status }) => {
    const res = await orderApi.getByStatus(status);
    const orders = unwrapOrders(res?.data ?? res);
    return {
      status,
      summary: summarizeOrders(orders),
      orders: orders.slice(0, 50).map(compactOrder),
      truncated: orders.length > 50,
    };
  },
};
