import { z } from "zod";
import dayjs from "dayjs";
import vehicleApi from "@/services/vehicle.service";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import reportApi from "@/services/report.service";
import type { EndOfDayStatusResponse } from "@/services/vehicle.service";
import type { VehicleMaintenance } from "@/types/vehicle";
import type { MaintenanceForecastResponse } from "@/types/report";
import type { ToolDefinition } from "./types";

interface MaintenanceListResponse {
  data?: VehicleMaintenance[];
}

const vehicleStatusArgs = z.object({
  license_plate: z.string().min(1).optional(),
});

const maintenanceForecastArgs = z.object({
  days_ahead: z.number().int().min(1).max(365).optional(),
  risk_level: z.enum(["all", "normal", "warning", "critical"]).optional(),
});

const RISK_LEVELS = ["all", "normal", "warning", "critical"] as const;

export const getVehicleStatusTool: ToolDefinition<z.infer<typeof vehicleStatusArgs>> = {
  name: "getVehicleStatus",
  description:
    "Tra cứu trạng thái cuối ngày của xe (end-of-day). Có thể truyền biển số (license_plate) để lọc một xe cụ thể, hoặc bỏ trống để lấy toàn bộ đội xe. Trả về số xe bất thường, ngày, danh sách xe.",
  schema: vehicleStatusArgs,
  parameters: {
    type: "object",
    properties: {
      license_plate: {
        type: "string",
        description: "Biển số xe cần tra cứu. Bỏ trống để lấy tất cả xe.",
      },
    },
  },
  execute: async ({ license_plate }) => {
    const res = await vehicleApi.getEndOfDayStatus();
    const payload = (res?.data ?? res) as EndOfDayStatusResponse;
    const vehicles = payload?.vehicles ?? [];
    const filtered = license_plate
      ? vehicles.filter((v) =>
          v.vehicle_license_plate?.toLowerCase().includes(license_plate.toLowerCase())
        )
      : vehicles;

    const summary = {
      date: payload?.date ?? dayjs().format("YYYY-MM-DD"),
      total: payload?.total ?? vehicles.length,
      abnormal_total: payload?.abnormal_total ?? 0,
      matched: filtered.length,
    };

    const slim = filtered.slice(0, 30).map((v) => ({
      vehicle_id: v.vehicle_id,
      license_plate: v.vehicle_license_plate,
      name: v.vehicle_name,
      driver: v.driver_name,
      final_status: v.final_status,
      is_abnormal: v.is_abnormal,
      finished_at: v.finished_at,
      station: v.station_name,
      order_id: v.order_id,
    }));

    return {
      summary,
      vehicles: slim,
      truncated: filtered.length > 30,
    };
  },
};

export const getMaintenanceForecastTool: ToolDefinition<z.infer<typeof maintenanceForecastArgs>> = {
  name: "getMaintenanceForecast",
  description:
    "Lấy danh sách dự báo bảo trì xe cho N ngày tới (mặc định 30). Có thể lọc theo mức độ rủi ro (normal/warning/critical/all). Dùng để biết xe nào sắp hoặc cần bảo trì gấp.",
  schema: maintenanceForecastArgs,
  parameters: {
    type: "object",
    properties: {
      days_ahead: {
        type: "number",
        description: "Khoảng dự báo tính từ hôm nay (số ngày). Mặc định 30.",
        default: 30,
      },
      risk_level: {
        type: "string",
        description: "Mức rủi ro để lọc.",
        enum: RISK_LEVELS,
      },
    },
  },
  execute: async ({ days_ahead, risk_level }) => {
    try {
      const res = await reportApi.getMaintenanceForecast({
        days_ahead: days_ahead ?? 30,
        risk_level: risk_level ?? "all",
      });
      const payload = (res?.data ?? res) as MaintenanceForecastResponse;
      const items = payload?.items ?? [];

      const counts = {
        critical: items.filter((i) => i.risk_level === "critical").length,
        warning: items.filter((i) => i.risk_level === "warning").length,
        normal: items.filter((i) => i.risk_level === "normal").length,
        total: payload?.total ?? items.length,
      };

      return {
        date: payload?.date,
        days_ahead: payload?.days_ahead,
        thresholds: payload?.thresholds,
        counts,
        items: items.slice(0, 25).map((i) => ({
          vehicle_id: i.vehicle_id,
          license_plate: i.vehicle_license_plate,
          name: i.vehicle_name,
          status: i.vehicle_status,
          risk_level: i.risk_level,
          last_maintenance_at: i.last_maintenance_at,
          distance_since_km: i.distance_since_last_maintenance_km,
          km_until_due: i.km_until_due,
          rule: i.rule_hit,
          note: i.note,
        })),
        truncated: items.length > 25,
      };
    } catch {
      const res = await vehicleMaintenanceApi.getAll();
      const payload = (res?.data ?? res) as MaintenanceListResponse | VehicleMaintenance[];
      const records: VehicleMaintenance[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data!
          : [];
      const now = dayjs();
      const horizon = now.add(days_ahead ?? 30, "day");
      const upcoming = records
        .filter((r) => {
          const from = dayjs(r.vehicle_maintenance_from_datetime);
          return from.isValid() && from.isAfter(now.subtract(1, "day")) && from.isBefore(horizon);
        })
        .sort(
          (a, b) =>
            dayjs(a.vehicle_maintenance_from_datetime).valueOf() -
            dayjs(b.vehicle_maintenance_from_datetime).valueOf()
        );
      return {
        fallback: "vehicle_maintenance_mock",
        counts: { upcoming: upcoming.length, total: records.length },
        items: upcoming.slice(0, 20).map((r) => ({
          vehicle_id: r.vehicle_id,
          from: dayjs(r.vehicle_maintenance_from_datetime).format("YYYY-MM-DD"),
          to: dayjs(r.vehicle_maintenance_to_datetime).format("YYYY-MM-DD"),
          distance_km: r.vehicle_distance_covered,
          description: r.vehicle_maintenance_description,
        })),
      };
    }
  },
};
