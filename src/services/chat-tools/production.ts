import dayjs from "dayjs";
import { z } from "zod";

import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";

import type { ToolDefinition } from "./types";
import { aggregateOrderStatusGroups, orderStatusLabel, ORDER_STATUS_BUSINESS_RULES } from "./order-status";

interface OrderListResponse {
  data?: Order[];
  total?: number;
}

interface GroupMetric {
  label: string;
  total_orders: number;
  total_distance_km: number;
  extra?: string | null;
}

const productionReportArgs = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  group_by: z.enum(["day", "vehicle"]).optional(),
});

function unwrapOrders(payload: unknown): Order[] {
  if (Array.isArray(payload)) return payload as Order[];
  const response = payload as OrderListResponse | undefined;
  return Array.isArray(response?.data) ? response.data : [];
}

function distanceKm(order: Order): number {
  const multi = order.order_multi;
  if (!multi) return 0;
  const start = typeof multi.distance_start === "number" ? multi.distance_start : 0;
  const end = typeof multi.distance_end === "number" ? multi.distance_end : 0;
  return Math.max(0, end - start);
}

function orderScheduleAt(order: Order): string | null {
  return order.order_start_datetime ?? order.order_init_datetime ?? null;
}

function compactOrder(order: Order) {
  return {
    order_id: order.order_id,
    order_number: order.order_number,
    status: order.order_status,
    status_label: orderStatusLabel(order.order_status),
    init_at: order.order_init_datetime,
    start_at: order.order_start_datetime,
    end_at: order.order_end_datetime,
    checkin_time_station: order.checkin_time_station ?? order.order_multi?.checkin_time_station ?? null,
    checkout_time_station: order.checkout_time_station ?? order.order_multi?.checkout_time_station ?? null,
    vehicle_name: order.vehicles?.vehicle_name ?? null,
    vehicle_license_plate: order.vehicles?.vehicle_license_plate ?? null,
    station_name: order.stations?.station_name ?? null,
    distance_km: Math.round(distanceKm(order)),
  };
}

function buildHourlyActivity(orders: Order[]) {
  const map = new Map<
    string,
    {
      hour: string;
      total_orders: number;
      completed: number;
      moving: number;
      waiting: number;
      collecting: number;
      canceled: number;
      total_distance_km: number;
      vehicles: Set<string>;
    }
  >();

  for (const order of orders) {
    const scheduledAt = orderScheduleAt(order);
    if (!scheduledAt) continue;
    const parsed = dayjs(scheduledAt);
    if (!parsed.isValid()) continue;

    const hour = `${parsed.format("HH")}:00`;
    const metric =
      map.get(hour) ??
      {
        hour,
        total_orders: 0,
        completed: 0,
        moving: 0,
        waiting: 0,
        collecting: 0,
        canceled: 0,
        total_distance_km: 0,
        vehicles: new Set<string>(),
      };

    metric.total_orders += 1;
    metric.total_distance_km += distanceKm(order);
    if (order.vehicles?.vehicle_license_plate) metric.vehicles.add(order.vehicles.vehicle_license_plate);

    if (order.order_status === "completed") metric.completed += 1;
    else if (order.order_status === "running" || order.order_status === "transporting") metric.moving += 1;
    else if (order.order_status === "collecting") metric.collecting += 1;
    else if (order.order_status === "canceled") metric.canceled += 1;
    else metric.waiting += 1;

    map.set(hour, metric);
  }

  return [...map.values()]
    .sort((left, right) => left.hour.localeCompare(right.hour))
    .map((metric) => ({
      hour: metric.hour,
      total_orders: metric.total_orders,
      completed: metric.completed,
      moving: metric.moving,
      waiting: metric.waiting,
      collecting: metric.collecting,
      canceled: metric.canceled,
      total_distance_km: Math.round(metric.total_distance_km),
      vehicle_count: metric.vehicles.size,
    }));
}

function buildTimeCoverage(orders: Order[]) {
  const scheduled = orders
    .map(orderScheduleAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    order_count: orders.length,
    orders_with_schedule_time: scheduled.length,
    earliest_at: scheduled[0] ?? null,
    latest_at: scheduled[scheduled.length - 1] ?? null,
  };
}

function addGroupMetric(
  map: Map<string, GroupMetric>,
  key: string,
  label: string,
  order: Order,
  extra?: string | null,
) {
  const metric = map.get(key) ?? { label, total_orders: 0, total_distance_km: 0, extra };
  metric.total_orders += 1;
  metric.total_distance_km += distanceKm(order);
  metric.extra ??= extra;
  map.set(key, metric);
}

function topRows(map: Map<string, GroupMetric>) {
  return [...map.values()]
    .sort((left, right) => right.total_orders - left.total_orders || right.total_distance_km - left.total_distance_km)
    .slice(0, 10);
}

export const getProductionReportTool: ToolDefinition<z.infer<typeof productionReportArgs>> = {
  name: "getProductionReport",
  description:
    `Lấy báo cáo sản lượng và đội xe từ orders theo ngày trong phạm vi trạm NGUYÊN ANH. Trả về tổng đơn, trạng thái, quãng đường, top xe, compact orders có mốc thời gian và hourly_activity. Không dùng để phân tích phân bổ theo trạm hoặc theo tài xế. ${ORDER_STATUS_BUSINESS_RULES}`,
  schema: productionReportArgs,
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Ngày bắt đầu YYYY-MM-DD" },
      to: { type: "string", description: "Ngày kết thúc YYYY-MM-DD" },
      group_by: { type: "string", enum: ["day", "vehicle"] },
    },
  },
  execute: async ({ from, to, group_by }) => {
    const targetFrom = from ?? dayjs().format("YYYY-MM-DD");
    const targetTo = to ?? targetFrom;
    const response = targetFrom === targetTo
      ? await orderApi.getByInitDate(targetFrom)
      : await orderApi.getAll({ order_start_datetime: targetFrom, limit: "1000" });
    const orders = unwrapOrders(response?.data ?? response);

    const byStatus: Record<string, number> = {};
    const vehicles = new Map<string, GroupMetric>();
    for (const order of orders) {
      byStatus[order.order_status] = (byStatus[order.order_status] ?? 0) + 1;
      const vehicleKey = String(order.vehicles?.vehicle_id ?? order.vehicles?.vehicle_license_plate ?? "unknown");

      addGroupMetric(
        vehicles,
        vehicleKey,
        order.vehicles?.vehicle_name ?? order.vehicles?.vehicle_license_plate ?? "Xe",
        order,
        order.vehicles?.vehicle_license_plate,
      );
    }

    const totalDistance = orders.reduce((sum, order) => sum + distanceKm(order), 0);
    const completed = byStatus.completed ?? 0;
    const moving = (byStatus.running ?? 0) + (byStatus.transporting ?? 0);
    const collecting = byStatus.collecting ?? 0;
    const waiting = (byStatus.init ?? 0) + (byStatus.pending ?? 0);
    const canceled = byStatus.canceled ?? 0;

    return {
      from: targetFrom,
      to: targetTo,
      group_by: group_by ?? "day",
      summary: {
        total_orders: orders.length,
        completed,
        running: byStatus.running ?? 0,
        collecting,
        transporting: byStatus.transporting ?? 0,
        pending: waiting,
        moving,
        waiting,
        canceled,
        byStatus,
        status_groups: aggregateOrderStatusGroups(byStatus),
        status_meaning: ORDER_STATUS_BUSINESS_RULES,
        total_distance_km: Math.round(totalDistance),
      },
      top_vehicles: topRows(vehicles).map((row) => ({
        vehicle_name: row.label,
        vehicle_license_plate: row.extra ?? row.label,
        total_orders: row.total_orders,
        total_distance_km: Math.round(row.total_distance_km),
      })),
      time_coverage: buildTimeCoverage(orders),
      hourly_activity: buildHourlyActivity(orders),
      orders: orders.slice(0, 100).map(compactOrder),
      truncated: orders.length > 100,
    };
  },
};
