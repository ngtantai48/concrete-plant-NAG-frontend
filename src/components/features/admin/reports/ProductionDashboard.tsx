"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Row, Col, Typography, Space, Table, Tag, Button, Select, DatePicker, Spin, Empty, Tabs, Progress, Drawer, Tooltip, Dropdown, Modal, message, Input } from "antd";
import { CheckCircle, Activity, BarChart3, Download, Truck, MapPin, Route, Timer, ArrowUpRight, TrendingUp, ChevronDown, ChevronUp, ChevronRight, Info, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import type { ProductionReportResponse, ProductionQuery, ProductionSeriesItem, ProductionSummary, ProductionTopVehicle, ProductionTopStation, ProductionTopDriver } from "@/types/report";
import { exportProductionProExcel } from "@/utils/exportProductionProExcel";
import type { ProProductionSection, ProReportSummaryCard, ProReportTripRow } from "@/utils/exportProductionProReport";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import VehicleRanking from "@/components/features/admin/reports/VehicleRanking";
import vehicleApi from "@/services/vehicle.service";
import vehicleTypeApi from "@/services/vehicle-type.service";
import stationApi from "@/services/station.service";
import type { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const TARGET_VEHICLE_TYPE_NAME = "Xe bồn";
const TARGET_VEHICLE_TYPE_KEY = TARGET_VEHICLE_TYPE_NAME.toLowerCase();
const N = (v: any) => Number(v || 0);
const norm = (v: any) => String(v || "").trim().toLowerCase();
const toFilePart = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "report";
const ORDER_STATUS_LABELS: Record<string, string> = {
  completed: "Hoàn thành",
  canceled: "Đã hủy",
  running: "Đang chạy",
  collecting: "Nhận hàng",
  transporting: "Vận chuyển",
  pending: "Chờ xử lý",
  init: "Khởi tạo",
};
const ORDER_STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info"> = {
  completed: "ok",
  canceled: "bad",
  running: "info",
  collecting: "warn",
  transporting: "warn",
  pending: "warn",
  init: "info",
};
type GroupByMode = "day" | "week" | "month";
type TankerVehicleInfo = {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_license_plate: string;
};
type ExportScope = "by_vehicle" | "all_vehicles" | "by_station" | "all_stations";
type ReportScopeOptions = {
  vehicleId?: number;
  stationId?: number;
  includeAllVehiclesInRanking?: boolean;
};
type StationOption = {
  station_id: number;
  station_name: string;
};
const getOrderDistanceKm = (order: Order) => {
  const start = N(order.order_multi?.distance_start);
  const end = N(order.order_multi?.distance_end);
  if (end > 0 && end >= start) {
    return end - start;
  }
  return 0;
};

const readNumberFromUnknown = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const readValueByPath = (source: Record<string, any>, path: string): unknown => {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
};

const ORDER_TRIP_VOLUME_CANDIDATE_PATHS = [
  "order_volume_m3",
  "order_volume",
  "order_quantity_m3",
  "order_quantity",
  "volume_m3",
  "volume",
  "quantity_m3",
  "quantity",
  "concrete_volume_m3",
  "concrete_volume",
  "delivery_volume_m3",
  "delivery_volume",
  "dispatch_volume_m3",
  "dispatch_volume",
  "mix_volume",
  "mix_quantity",
  "product_volume_m3",
  "product_volume",
  "order_multi.volume_m3",
  "order_multi.volume",
] as const;

const getOrderTripVolumeM3 = (order: Order): number | null => {
  const raw = order as unknown as Record<string, any>;
  for (const path of ORDER_TRIP_VOLUME_CANDIDATE_PATHS) {
    const candidate = readNumberFromUnknown(readValueByPath(raw, path));
    if (candidate !== null && candidate >= 0) return candidate;
  }
  return null;
};

const EMPTY_SUMMARY: ProductionSummary = {
  total_orders: 0,
  completed: 0,
  running: 0,
  collecting: 0,
  transporting: 0,
  pending: 0,
  canceled: 0,
  total_distance_km: 0,
};

const buildEmptyReport = (query: ProductionQuery): ProductionReportResponse => ({
  from: query.from || dayjs().startOf("month").format("YYYY-MM-DD"),
  to: query.to || dayjs().format("YYYY-MM-DD"),
  group_by: query.group_by || "day",
  summary: { ...EMPTY_SUMMARY },
  series: [],
  top_vehicles: [],
  top_stations: [],
  top_drivers: [],
});

const ensureAllVehiclesInRanking = (
  report: ProductionReportResponse,
  tankerVehicles: TankerVehicleInfo[]
): ProductionReportResponse => {
  if (!tankerVehicles.length) return report;
  const map = new Map<number, ProductionTopVehicle>();
  (report.top_vehicles || []).forEach((item) => {
    map.set(item.vehicle_id, {
      ...item,
      total_orders: N(item.total_orders),
      total_distance_km: N(item.total_distance_km),
    });
  });

  tankerVehicles.forEach((vehicle) => {
    if (!map.has(vehicle.vehicle_id)) {
      map.set(vehicle.vehicle_id, {
        vehicle_id: vehicle.vehicle_id,
        vehicle_name: vehicle.vehicle_name || `Xe ${vehicle.vehicle_id}`,
        vehicle_license_plate: vehicle.vehicle_license_plate || "—",
        total_orders: 0,
        total_distance_km: 0,
      });
    } else {
      const current = map.get(vehicle.vehicle_id)!;
      map.set(vehicle.vehicle_id, {
        ...current,
        vehicle_name: current.vehicle_name || vehicle.vehicle_name || `Xe ${vehicle.vehicle_id}`,
        vehicle_license_plate: current.vehicle_license_plate || vehicle.vehicle_license_plate || "—",
      });
    }
  });

  return {
    ...report,
    top_vehicles: Array.from(map.values()).sort(
      (a, b) =>
        N(b.total_orders) - N(a.total_orders) ||
        N(b.total_distance_km) - N(a.total_distance_km) ||
        String(a.vehicle_name || "").localeCompare(String(b.vehicle_name || ""))
    ),
  };
};

const aggregateReports = (reports: ProductionReportResponse[], query: ProductionQuery): ProductionReportResponse => {
  if (!reports.length) return buildEmptyReport(query);

  const summary: ProductionSummary = { ...EMPTY_SUMMARY };
  const seriesMap = new Map<string, ProductionSeriesItem>();
  const vehicleMap = new Map<number, ProductionTopVehicle>();
  const stationMap = new Map<number, ProductionTopStation>();
  const driverMap = new Map<number, ProductionTopDriver>();

  reports.forEach((report) => {
    summary.total_orders += N(report.summary?.total_orders);
    summary.completed += N(report.summary?.completed);
    summary.running += N(report.summary?.running);
    summary.collecting += N(report.summary?.collecting);
    summary.transporting += N(report.summary?.transporting);
    summary.pending += N(report.summary?.pending);
    summary.canceled += N(report.summary?.canceled);
    summary.total_distance_km += N(report.summary?.total_distance_km);

    (report.series || []).forEach((item) => {
      const prev = seriesMap.get(item.period);
      if (!prev) {
        seriesMap.set(item.period, { ...item });
        return;
      }
      seriesMap.set(item.period, {
        ...prev,
        total_orders: N(prev.total_orders) + N(item.total_orders),
        completed: N(prev.completed) + N(item.completed),
        running: N(prev.running) + N(item.running),
        collecting: N(prev.collecting) + N(item.collecting),
        transporting: N(prev.transporting) + N(item.transporting),
        pending: N(prev.pending) + N(item.pending),
        canceled: N(prev.canceled) + N(item.canceled),
        distance_km: N(prev.distance_km) + N(item.distance_km),
      });
    });

    (report.top_vehicles || []).forEach((item) => {
      const prev = vehicleMap.get(item.vehicle_id);
      if (!prev) {
        vehicleMap.set(item.vehicle_id, { ...item });
        return;
      }
      vehicleMap.set(item.vehicle_id, {
        ...prev,
        total_orders: N(prev.total_orders) + N(item.total_orders),
        total_distance_km: N(prev.total_distance_km) + N(item.total_distance_km),
      });
    });

    (report.top_stations || []).forEach((item) => {
      const prev = stationMap.get(item.station_id);
      if (!prev) {
        stationMap.set(item.station_id, { ...item });
        return;
      }
      stationMap.set(item.station_id, {
        ...prev,
        total_orders: N(prev.total_orders) + N(item.total_orders),
      });
    });

    (report.top_drivers || []).forEach((item) => {
      const prev = driverMap.get(item.user_id);
      if (!prev) {
        driverMap.set(item.user_id, { ...item });
        return;
      }
      driverMap.set(item.user_id, {
        ...prev,
        total_orders: N(prev.total_orders) + N(item.total_orders),
      });
    });
  });

  return {
    from: query.from || reports[0].from,
    to: query.to || reports[0].to,
    group_by: query.group_by || reports[0].group_by,
    summary,
    series: Array.from(seriesMap.values()).sort((a, b) => dayjs(a.period).valueOf() - dayjs(b.period).valueOf()),
    top_vehicles: Array.from(vehicleMap.values()).sort((a, b) => N(b.total_orders) - N(a.total_orders) || N(b.total_distance_km) - N(a.total_distance_km)),
    top_stations: Array.from(stationMap.values()).sort((a, b) => N(b.total_orders) - N(a.total_orders)),
    top_drivers: Array.from(driverMap.values()).sort((a, b) => N(b.total_orders) - N(a.total_orders)),
  };
};

const getWeekStart = (date: Dayjs) => date.startOf("day").subtract((date.day() + 6) % 7, "day");

const getPeriodStart = (period: string, groupBy: GroupByMode) => {
  const base = dayjs(period).startOf("day");
  if (groupBy === "month") return base.startOf("month");
  if (groupBy === "week") return getWeekStart(base);
  return base;
};

const getPeriodRange = (period: string, groupBy: GroupByMode) => {
  const start = getPeriodStart(period, groupBy);
  const end =
    groupBy === "month"
      ? start.endOf("month")
      : groupBy === "week"
        ? start.add(6, "day").endOf("day")
        : start.endOf("day");
  return { start, end };
};

const formatPeriodLabel = (period: string, groupBy: GroupByMode) => {
  const start = getPeriodStart(period, groupBy);
  if (!start.isValid()) return String(period);
  if (groupBy === "month") return start.format("MM/YYYY");
  if (groupBy === "week") return `${start.format("DD/MM")} - ${start.add(6, "day").format("DD/MM")}`;
  return start.format("DD/MM");
};

const formatPeriodLongLabel = (period: string, groupBy: GroupByMode) => {
  const start = getPeriodStart(period, groupBy);
  if (!start.isValid()) return String(period);
  if (groupBy === "month") return `Tháng ${start.format("MM/YYYY")}`;
  if (groupBy === "week") return `${start.format("DD/MM/YYYY")} - ${start.add(6, "day").format("DD/MM/YYYY")}`;
  return start.format("DD/MM/YYYY");
};

const normalizeSeriesByGroup = (series: ProductionSeriesItem[], groupBy: GroupByMode) => {
  const mapped = new Map<string, ProductionSeriesItem>();
  series.forEach((item) => {
    const parsed = dayjs(item.period);
    const key = parsed.isValid()
      ? getPeriodStart(item.period, groupBy).format("YYYY-MM-DD")
      : String(item.period);
    const prev = mapped.get(key);
    if (!prev) {
      mapped.set(key, {
        ...item,
        period: key,
      });
      return;
    }
    mapped.set(key, {
      ...prev,
      total_orders: N(prev.total_orders) + N(item.total_orders),
      completed: N(prev.completed) + N(item.completed),
      running: N(prev.running) + N(item.running),
      collecting: N(prev.collecting) + N(item.collecting),
      transporting: N(prev.transporting) + N(item.transporting),
      pending: N(prev.pending) + N(item.pending),
      canceled: N(prev.canceled) + N(item.canceled),
      distance_km: N(prev.distance_km) + N(item.distance_km),
    });
  });
  return Array.from(mapped.values()).sort((a, b) => dayjs(a.period).valueOf() - dayjs(b.period).valueOf());
};

const getQueryDayRange = (query: ProductionQuery) => {
  const fromRaw = dayjs(query.from);
  const toRaw = dayjs(query.to);
  const from = (fromRaw.isValid() ? fromRaw : dayjs()).startOf("day");
  const to = (toRaw.isValid() ? toRaw : from).endOf("day");
  if (to.isBefore(from)) {
    return { from, to: from.endOf("day") };
  }
  return { from, to };
};

const getRangePeriodCount = (query: ProductionQuery, groupBy: GroupByMode) => {
  const { from, to } = getQueryDayRange(query);
  if (groupBy === "month") {
    return to.startOf("month").diff(from.startOf("month"), "month") + 1;
  }
  if (groupBy === "week") {
    return getWeekStart(to).diff(getWeekStart(from), "week") + 1;
  }
  return to.startOf("day").diff(from.startOf("day"), "day") + 1;
};

const buildPreviousRangeQuery = (query: ProductionQuery, groupBy: GroupByMode): ProductionQuery => {
  const { from, to } = getQueryDayRange(query);
  if (groupBy === "month") {
    const count = getRangePeriodCount(query, groupBy);
    const currentStart = from.startOf("month");
    const currentEnd = to.endOf("month");
    return {
      ...query,
      from: currentStart.subtract(count, "month").format("YYYY-MM-DD"),
      to: currentEnd.subtract(count, "month").format("YYYY-MM-DD"),
      group_by: groupBy,
    };
  }
  if (groupBy === "week") {
    const count = getRangePeriodCount(query, groupBy);
    const currentStart = getWeekStart(from);
    const currentEnd = getWeekStart(to).add(6, "day").endOf("day");
    return {
      ...query,
      from: currentStart.subtract(count, "week").format("YYYY-MM-DD"),
      to: currentEnd.subtract(count, "week").format("YYYY-MM-DD"),
      group_by: groupBy,
    };
  }
  const count = getRangePeriodCount(query, groupBy);
  return {
    ...query,
    from: from.subtract(count, "day").format("YYYY-MM-DD"),
    to: to.subtract(count, "day").format("YYYY-MM-DD"),
    group_by: groupBy,
  };
};

const getStationCheckInTime = (order: Order) =>
  order.checkin_time_station ??
  order.order_multi?.checkin_time_station ??
  order.station_checks?.check_in_datetime ??
  order.order_start_datetime ??
  null;

const getStationCheckOutTime = (order: Order) =>
  order.checkout_time_station ??
  order.order_multi?.checkout_time_station ??
  order.station_checks?.check_out_datetime ??
  order.order_end_datetime ??
  null;

const getStationLoadingMinutes = (order: Order) => {
  const checkIn = getStationCheckInTime(order);
  const checkOut = getStationCheckOutTime(order);
  if (!checkIn || !checkOut) return 0;
  const start = dayjs(checkIn);
  const end = dayjs(checkOut);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 0;
  return end.diff(start, "minute");
};

/* ── Dark-tech tooltip ── */
const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(255,255,255,.98)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "14px 18px", boxShadow: "0 8px 32px rgba(0,0,0,.12)", border: "1px solid #e2e8f0", minWidth: 200, zIndex: 9999, position: "relative" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#0f172a", fontSize: 14 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-6 text-[14px] py-0.5">
          <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
          <span className="font-black text-gray-900">{typeof p.value === "number" ? p.value.toLocaleString("vi-VN") : p.value}</span>
        </div>
      ))}
    </div>
  );
};

/* Compact metric strip — single card, 4 metrics side by side */
const MetricStrip = ({ metrics }: { metrics: { label: string; value: string | number; sub?: string; accent: string; icon: React.ReactNode; border: string }[] }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
    <Card className="border-0 shadow-sm rounded-2xl" styles={{ body: { padding: 0 } }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <div style={{ background: m.border, width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", color: m.accent, flexShrink: 0 }}>{m.icon}</div>
            <div className="min-w-0">
              <Text type="secondary" className="text-[10px] font-bold uppercase tracking-wider block leading-tight mb-0.5">{m.label}</Text>
              <div className="font-extrabold text-gray-900 text-xl leading-tight truncate">{m.value}</div>
              {m.sub && <Text type="secondary" className="text-[11px] block mt-0.5 leading-tight">{m.sub}</Text>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  </motion.div>
);

export default function ProductionDashboard() {
  const [data, setData] = useState<ProductionReportResponse | null>(null);
  const [comparisonSummary, setComparisonSummary] = useState<ProductionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState<ProductionQuery>({ from: dayjs().startOf("month").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD"), group_by: "day" });
  const [tankerVehicleIds, setTankerVehicleIds] = useState<number[]>([]);
  const [tankerVehicles, setTankerVehicles] = useState<TankerVehicleInfo[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loadingVehicleScope, setLoadingVehicleScope] = useState(true);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pendingExportScope, setPendingExportScope] = useState<ExportScope | null>(null);
  const [selectedExportVehicleId, setSelectedExportVehicleId] = useState<number | undefined>(undefined);
  const [selectedExportStationId, setSelectedExportStationId] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const fetchVehicleScope = async () => {
      setLoadingVehicleScope(true);
      try {
        const [vehicleRes, typeRes] = await Promise.all([
          vehicleApi.getAll({ limit: 1000 }),
          vehicleTypeApi.getAll(),
        ]);
        const vehiclesRaw = vehicleRes.data as any;
        const vehicleList: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data : (Array.isArray(vehiclesRaw) ? vehiclesRaw : []);
        const typesRaw = typeRes.data as any;
        const typeList: any[] = Array.isArray(typesRaw?.data) ? typesRaw.data : (Array.isArray(typesRaw) ? typesRaw : []);
        const tankerTypeIds = new Set<number>(
          typeList
            .filter((t) => norm(t?.vehicle_type_name) === TARGET_VEHICLE_TYPE_KEY)
            .map((t) => N(t?.vehicle_type_id))
            .filter((id) => id > 0)
        );
        const ids = vehicleList
          .filter((v) => {
            const typeId = N(v?.vehicle_type_id);
            const typeName = norm(v?.vehicle_type_name);
            return tankerTypeIds.has(typeId) || typeName === TARGET_VEHICLE_TYPE_KEY;
          })
          .map((v) => N(v?.vehicle_id))
          .filter((id) => id > 0);
        const tankerList = vehicleList
          .filter((v) => {
            const typeId = N(v?.vehicle_type_id);
            const typeName = norm(v?.vehicle_type_name);
            return tankerTypeIds.has(typeId) || typeName === TARGET_VEHICLE_TYPE_KEY;
          })
          .map((v) => ({
            vehicle_id: N(v?.vehicle_id),
            vehicle_name: String(v?.vehicle_name || "").trim() || `Xe ${N(v?.vehicle_id)}`,
            vehicle_license_plate: String(v?.vehicle_license_plate || "").trim() || "—",
          }))
          .filter((v) => v.vehicle_id > 0)
          .sort((a, b) => a.vehicle_name.localeCompare(b.vehicle_name));
        if (!alive) return;
        setTankerVehicleIds(Array.from(new Set(ids)));
        setTankerVehicles(tankerList);
      } catch (error) {
        console.error("Load vehicle scope failed", error);
        if (alive) {
          setTankerVehicleIds([]);
          setTankerVehicles([]);
        }
      } finally {
        if (alive) setLoadingVehicleScope(false);
      }
    };
    fetchVehicleScope();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const stationRes = await stationApi.getAll();
        const raw = stationRes.data as any;
        const stationList: any[] = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
        const normalized = stationList
          .map((station) => ({
            station_id: N(station?.station_id),
            station_name: String(station?.station_name || "").trim() || `Trạm ${N(station?.station_id)}`,
          }))
          .filter((station) => station.station_id > 0)
          .sort((a, b) => a.station_name.localeCompare(b.station_name));
        if (!alive) return;
        setStations(normalized);
      } catch (error) {
        console.error("Load station list failed", error);
        if (alive) setStations([]);
      } finally {
        if (alive) setLoadingStations(false);
      }
    };
    fetchStations();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedExportVehicleId && tankerVehicles.length) {
      setSelectedExportVehicleId(tankerVehicles[0].vehicle_id);
    }
  }, [selectedExportVehicleId, tankerVehicles]);

  useEffect(() => {
    if (!selectedExportStationId && stations.length) {
      setSelectedExportStationId(stations[0].station_id);
    }
  }, [selectedExportStationId, stations]);

  const getAggregatedReportByQuery = useCallback(async (targetQuery: ProductionQuery, options?: ReportScopeOptions) => {
    if (!tankerVehicleIds.length) {
      return buildEmptyReport(targetQuery);
    }
    const scopedQuery: ProductionQuery = {
      ...targetQuery,
      ...(options?.stationId ? { station_id: options.stationId } : {}),
    };
    if (options?.vehicleId) {
      const response = await reportApi.getProduction({ ...scopedQuery, vehicle_id: options.vehicleId });
      return response.data as ProductionReportResponse;
    }
    const settled = await Promise.allSettled(
      tankerVehicleIds.map((vehicleId) =>
        reportApi.getProduction({ ...scopedQuery, vehicle_id: vehicleId })
      )
    );
    const reports = settled
      .filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled")
      .map((item) => item.value.data as ProductionReportResponse);
    const aggregated = aggregateReports(reports, scopedQuery);
    if (options?.includeAllVehiclesInRanking === false) {
      return aggregated;
    }
    return ensureAllVehiclesInRanking(aggregated, tankerVehicles);
  }, [tankerVehicleIds, tankerVehicles]);

  const fetch = useCallback(async () => {
    if (loadingVehicleScope) return;
    setLoading(true);
    try {
      if (!tankerVehicleIds.length) {
        setData(buildEmptyReport(query));
        setComparisonSummary(null);
        return;
      }
      const groupBy = (query.group_by || "day") as GroupByMode;
      const previousQuery = buildPreviousRangeQuery(query, groupBy);
      const [currentReport, previousReport] = await Promise.all([
        getAggregatedReportByQuery(query),
        getAggregatedReportByQuery(previousQuery),
      ]);
      setData(currentReport);
      setComparisonSummary(previousReport.summary);
    } catch (error) {
      console.error("Production report fetch failed", error);
      setData(buildEmptyReport(query));
      setComparisonSummary(null);
    } finally {
      setLoading(false);
    }
  }, [query, tankerVehicleIds, loadingVehicleScope, getAggregatedReportByQuery]);
  useEffect(() => { fetch(); }, [fetch]);

  // period drill-down drawer
  const [periodDrawer, setPeriodDrawer] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [periodOrders, setPeriodOrders] = useState<Order[]>([]);
  const [periodVehicleSearch, setPeriodVehicleSearch] = useState("");
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [drawerPage, setDrawerPage] = useState(1);
  const DRAWER_PAGE_SIZE = 20;
  const [stationDrawer, setStationDrawer] = useState(false);
  const [selectedStation, setSelectedStation] = useState<ProductionTopStation | null>(null);
  const [stationOrders, setStationOrders] = useState<Order[]>([]);
  const [loadingStationOrders, setLoadingStationOrders] = useState(false);
  const [stationPage, setStationPage] = useState(1);
  const STATION_PAGE_SIZE = 20;

  const filteredPeriodOrders = useMemo(() => {
    const keyword = norm(periodVehicleSearch);
    if (!keyword) return periodOrders;

    return periodOrders.filter((order) => {
      const vehicleName = norm(order.vehicles?.vehicle_name);
      const licensePlate = norm(order.vehicles?.vehicle_license_plate);
      return vehicleName.includes(keyword) || licensePlate.includes(keyword);
    });
  }, [periodOrders, periodVehicleSearch]);

  useEffect(() => {
    setDrawerPage(1);
  }, [periodVehicleSearch]);

  const fetchOrdersInRange = useCallback(async (from: Dayjs, to: Dayjs) => {
    const dayRequests: string[] = [];
    let cursor = from.startOf("day");
    while (!cursor.isAfter(to, "day")) {
      dayRequests.push(cursor.format("YYYY-MM-DD"));
      cursor = cursor.add(1, "day");
    }

    const dayResults = await Promise.all(
      dayRequests.map((date) => orderApi.getAll({ order_start_datetime: date }))
    );
    const merged = dayResults.flatMap((res) => {
      const raw = res.data as any;
      return Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
    }) as Order[];

    const uniqueOrders = Array.from(
      merged.reduce((map, order) => {
        const key = N((order as any).order_id);
        if (!key) return map;
        if (!map.has(key)) map.set(key, order);
        return map;
      }, new Map<number, Order>()).values()
    );

    return uniqueOrders.filter((order) => {
      const date = dayjs(order.order_start_datetime ?? order.order_init_datetime);
      if (!date.isValid() || date.isBefore(from) || date.isAfter(to)) return false;
      const vehicleId = N(order.vehicles?.vehicle_id);
      const vehicleTypeName = norm((order as any)?.vehicles?.vehicle_type_name);
      return tankerVehicleIds.includes(vehicleId) || vehicleTypeName === TARGET_VEHICLE_TYPE_KEY;
    });
  }, [tankerVehicleIds]);

  const handlePeriodClick = useCallback(async (row: ProductionSeriesItem) => {
    setPeriodDrawer(true);
    setSelectedPeriod(row.period);
    setPeriodVehicleSearch("");
    setLoadingPeriod(true);
    setPeriodOrders([]);
    setDrawerPage(1);
    try {
      const group = (query.group_by || "day") as GroupByMode;
      const resolvedRange = getPeriodRange(row.period, group);
      const start = resolvedRange.start.isValid() ? resolvedRange.start : dayjs(query.from).startOf("day");
      const end = resolvedRange.end.isValid() ? resolvedRange.end : dayjs(query.to).endOf("day");
      const filtered = await fetchOrdersInRange(start, end);
      setPeriodOrders(filtered);
    } catch (e) {
      console.error("Period fetch error", e);
    } finally {
      setLoadingPeriod(false);
    }
  }, [fetchOrdersInRange, query.from, query.group_by, query.to]);

  const handleStationClick = useCallback(async (station: ProductionTopStation) => {
    setSelectedStation(station);
    setStationDrawer(true);
    setStationPage(1);
    setLoadingStationOrders(true);
    setStationOrders([]);
    try {
      const from = dayjs(query.from).startOf("day");
      const to = dayjs(query.to).endOf("day");
      const filtered = await fetchOrdersInRange(from, to);
      const stationFiltered = filtered.filter((order) => {
        const stationId = N(order.stations?.station_id);
        if (stationId !== N(station.station_id)) return false;
        return !!getStationCheckInTime(order);
      });
      setStationOrders(
        [...stationFiltered].sort((a, b) =>
          dayjs(getStationCheckInTime(b) ?? b.order_start_datetime ?? b.order_init_datetime).valueOf() -
          dayjs(getStationCheckInTime(a) ?? a.order_start_datetime ?? a.order_init_datetime).valueOf()
        )
      );
    } catch (error) {
      console.error("Station detail fetch failed", error);
    } finally {
      setLoadingStationOrders(false);
    }
  }, [fetchOrdersInRange, query.from, query.to]);

  const s = data?.summary;
  const groupByMode = (query.group_by || "day") as GroupByMode;
  const groupedSeries = useMemo(
    () => normalizeSeriesByGroup(data?.series ?? [], groupByMode),
    [data?.series, groupByMode]
  );
  const trend = useMemo(
    () =>
      groupedSeries.map((item: ProductionSeriesItem) => ({
        period: formatPeriodLabel(item.period, groupByMode),
        rawPeriod: item.period,
        "Hoàn thành": N(item.completed),
        "Đang xử lý": N(item.running) + N(item.collecting) + N(item.transporting),
        "Chờ": N(item.pending),
        "Đã hủy": N(item.canceled),
      })),
    [groupedSeries, groupByMode]
  );
  const kmData = useMemo(
    () =>
      groupedSeries.map((item: ProductionSeriesItem) => ({
        period: formatPeriodLabel(item.period, groupByMode),
        rawPeriod: item.period,
        Km: Math.round(N(item.distance_km)),
      })),
    [groupedSeries, groupByMode]
  );
  const pie = useMemo(() => s ? [{ n: "Hoàn thành", v: s.completed, c: "#10b981" }, { n: "Đang chạy", v: s.running, c: "#3b82f6" }, { n: "Nhận hàng", v: s.collecting, c: "#8b5cf6" }, { n: "Vận chuyển", v: s.transporting, c: "#f59e0b" }, { n: "Chờ", v: s.pending, c: "#94a3b8" }, { n: "Đã hủy", v: s.canceled, c: "#ef4444" }].filter(x => x.v > 0) : [], [s]);
  const periodCount = useMemo(() => Math.max(1, getRangePeriodCount(query, groupByMode)), [groupByMode, query]);
  const previousRangeText = useMemo(() => {
    const previousQuery = buildPreviousRangeQuery(query, groupByMode);
    return `${dayjs(previousQuery.from).format("DD/MM/YYYY")} - ${dayjs(previousQuery.to).format("DD/MM/YYYY")}`;
  }, [groupByMode, query]);
  const avg = useMemo(() => {
    const currentTotalOrders = N(s?.total_orders);
    return Math.round((currentTotalOrders / periodCount) * 10) / 10;
  }, [periodCount, s?.total_orders]);
  const completionRate = s && s.total_orders > 0 ? Math.round(s.completed / s.total_orders * 100) : 0;
  const deltaPercent = useCallback((current: number, previous: number) => {
    const cur = N(current);
    const prev = N(previous);
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  }, []);
  const deltaTone = (delta: number) => (delta >= 0 ? "text-emerald-600" : "text-rose-500");
  const avgPerOrderKm = s && s.total_orders > 0 ? Math.round((s.total_distance_km / s.total_orders) * 10) / 10 : 0;
  const previousTotalOrders = N(comparisonSummary?.total_orders);
  const previousCompleted = N(comparisonSummary?.completed);
  const previousDistance = N(comparisonSummary?.total_distance_km);
  const previousRate = previousTotalOrders > 0 ? (previousCompleted / previousTotalOrders) * 100 : 0;
  const previousAvg = Math.round((previousTotalOrders / periodCount) * 10) / 10;
  const avgDelta = deltaPercent(avg, previousAvg);
  const totalOrdersDelta = deltaPercent(N(s?.total_orders), previousTotalOrders);
  const completedDelta = deltaPercent(N(s?.completed), previousCompleted);
  const distanceDelta = deltaPercent(N(s?.total_distance_km), previousDistance);
  const completionRateDelta = deltaPercent(completionRate, previousRate);

  const formatStopText = useCallback((order: Order) => {
    const stopCount = N(order.order_multi?.nStop_end);
    const stopSeconds = N(order.order_multi?.stop_duration_seconds);
    const stopMinutes = Math.max(0, Math.round(stopSeconds / 60));
    if (stopCount === 0 && stopMinutes === 0) return "0 lần · 0 phút";
    return `${stopCount} lần · ${stopMinutes} phút`;
  }, []);

  const formatTripVolumeText = useCallback((order: Order) => {
    const volume = getOrderTripVolumeM3(order);
    if (volume === null) return "—";
    const decimals = Number.isInteger(volume) ? 0 : 2;
    return `${volume.toLocaleString("vi-VN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: 2,
    })} m³`;
  }, []);

  const buildTripRows = useCallback((orders: Order[]): ProReportTripRow[] => {
    const toDisplayDate = (value: string | null | undefined, withTime = false) => {
      if (!value) return "—";
      const parsed = dayjs(value);
      if (!parsed.isValid()) return "—";
      return withTime ? parsed.format("HH:mm DD/MM/YYYY") : parsed.format("DD/MM/YYYY");
    };
    return [...orders]
      .sort((a, b) =>
        dayjs(b.order_start_datetime ?? b.order_init_datetime).valueOf() -
        dayjs(a.order_start_datetime ?? a.order_init_datetime).valueOf()
      )
      .map((order) => {
        const status = String(order.order_status || "pending");
        const orderCode = N(order.order_id) > 0 ? `#${N(order.order_id)}` : "—";
        return {
          dateLabel: toDisplayDate(order.order_start_datetime ?? order.order_init_datetime, false),
          vehicleName: order.vehicles?.vehicle_name || "—",
          licensePlate: order.vehicles?.vehicle_license_plate || "—",
          stationName: order.stations?.station_name || "—",
          orderCode,
          distanceKmText: `${Math.round(getOrderDistanceKm(order)).toLocaleString("vi-VN")} km`,
          tripVolumeText: formatTripVolumeText(order),
          stopText: formatStopText(order),
          startText: toDisplayDate(order.order_start_datetime ?? order.order_init_datetime, true),
          endText: toDisplayDate(order.order_end_datetime, true),
          statusLabel: ORDER_STATUS_LABELS[status] || status,
          statusTone: ORDER_STATUS_TONE[status] || "info",
        };
      });
  }, [formatStopText, formatTripVolumeText]);

  const buildSummaryCardsFromReport = useCallback((report: ProductionReportResponse): ProReportSummaryCard[] => {
    const summary = report.summary;
    const totalOrders = N(summary.total_orders);
    const completed = N(summary.completed);
    const processing = N(summary.running) + N(summary.collecting) + N(summary.transporting);
    const canceled = N(summary.canceled);
    const totalKm = Math.round(N(summary.total_distance_km));
    const completion = totalOrders > 0 ? Math.round((completed / totalOrders) * 100) : 0;
    return [
      { label: "Tổng chuyến", value: totalOrders.toLocaleString("vi-VN") },
      { label: "Hoàn thành", value: completed.toLocaleString("vi-VN"), hint: `${completion}%` },
      { label: "Đang xử lý", value: processing.toLocaleString("vi-VN") },
      { label: "Đã hủy", value: canceled.toLocaleString("vi-VN") },
      { label: "Tổng KM", value: `${totalKm.toLocaleString("vi-VN")} km` },
    ];
  }, []);

  const buildProSection = useCallback(
    (report: ProductionReportResponse, title: string, subtitle: string, trips: Order[]): ProProductionSection => {
      const summary = report.summary;
      const scopedSeries = normalizeSeriesByGroup(report.series ?? [], groupByMode);
      const totalOrders = N(summary.total_orders);
      const completed = N(summary.completed);
      const processing = N(summary.running) + N(summary.collecting) + N(summary.transporting);
      const pending = N(summary.pending);
      const canceled = N(summary.canceled);
      const totalKm = Math.round(N(summary.total_distance_km));
      const completion = totalOrders > 0 ? Math.round((completed / totalOrders) * 100) : 0;
      const avgKm = totalOrders > 0 ? Math.round((totalKm / totalOrders) * 10) / 10 : 0;
      const maxOrdersInVehicles = Math.max(1, ...report.top_vehicles.map((vehicle) => N(vehicle.total_orders)));
      const topVehicle = report.top_vehicles[0];
      const topStation = report.top_stations[0];
      const tripVolumes = trips
        .map((order) => getOrderTripVolumeM3(order))
        .filter((value): value is number => value !== null);
      const totalTripVolume = tripVolumes.reduce((sum, value) => sum + value, 0);
      const avgTripVolume = tripVolumes.length > 0 ? totalTripVolume / tripVolumes.length : 0;
      const tripVolumeLabel = tripVolumes.length
        ? `${totalTripVolume.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m³ · TB ${avgTripVolume.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m³/chuyến`
        : "Chưa có dữ liệu m³/chuyến";
      return {
        title,
        subtitle,
        summaryCards: [
          { label: "Tổng chuyến", value: totalOrders.toLocaleString("vi-VN") },
          { label: "Hoàn thành", value: completed.toLocaleString("vi-VN"), hint: `${completion}%` },
          { label: "Đang xử lý", value: processing.toLocaleString("vi-VN") },
          { label: "Đã hủy", value: canceled.toLocaleString("vi-VN") },
          { label: "Tổng KM", value: `${totalKm.toLocaleString("vi-VN")} km`, hint: `${avgKm.toLocaleString("vi-VN")} km/chuyến` },
        ],
        statusBreakdown: [
          { label: "Hoàn thành", value: completed, color: "#10b981" },
          { label: "Đang chạy", value: N(summary.running), color: "#3b82f6" },
          { label: "Nhận hàng", value: N(summary.collecting), color: "#8b5cf6" },
          { label: "Vận chuyển", value: N(summary.transporting), color: "#f59e0b" },
          { label: "Chờ", value: pending, color: "#94a3b8" },
          { label: "Đã hủy", value: canceled, color: "#ef4444" },
        ].filter((item) => item.value > 0),
        series: scopedSeries.map((item) => ({
          label: formatPeriodLongLabel(item.period, groupByMode),
          completed: N(item.completed),
          processing: N(item.running) + N(item.collecting) + N(item.transporting),
          km: N(item.distance_km),
        })),
        topVehicles: report.top_vehicles.map((vehicle) => ({
          vehicleName: vehicle.vehicle_name,
          licensePlate: vehicle.vehicle_license_plate,
          totalOrders: N(vehicle.total_orders),
          totalKm: N(vehicle.total_distance_km),
          performancePercent: Math.round((N(vehicle.total_orders) / maxOrdersInVehicles) * 100),
        })),
        topStations: report.top_stations.map((station) => ({
          stationName: station.station_name,
          totalOrders: N(station.total_orders),
          sharePercent: totalOrders > 0 ? Math.round((N(station.total_orders) / totalOrders) * 100) : 0,
        })),
        insights: [
          {
            label: "Xe nổi bật",
            value: topVehicle ? `${topVehicle.vehicle_name} · ${Math.round(N(topVehicle.total_distance_km)).toLocaleString("vi-VN")} km` : "—",
          },
          {
            label: "Trạm nổi bật",
            value: topStation ? `${topStation.station_name} · ${Math.round((N(topStation.total_orders) / Math.max(totalOrders, 1)) * 100)}%` : "—",
          },
          {
            label: "Chi tiết chuyến",
            value: `${trips.length.toLocaleString("vi-VN")} chuyến`,
          },
          {
            label: "Sản lượng theo chuyến",
            value: tripVolumeLabel,
          },
        ],
        trips: buildTripRows(trips),
      };
    },
    [buildTripRows, groupByMode]
  );

  const exportByScope = useCallback(async (scope: ExportScope, options?: { vehicleId?: number; stationId?: number }) => {
    if (!data) return;
    if (!tankerVehicleIds.length) {
      message.warning("Không có xe bồn để xuất báo cáo.");
      return;
    }
    setExporting(true);
    try {
      const periodLabel = `${dayjs(query.from).format("DD/MM/YYYY")} - ${dayjs(query.to).format("DD/MM/YYYY")} (${query.group_by === "day" ? "Theo ngày" : query.group_by === "week" ? "Theo tuần" : "Theo tháng"})`;
      const generatedAtLabel = dayjs().format("HH:mm DD/MM/YYYY");
      const from = dayjs(query.from).startOf("day");
      const to = dayjs(query.to).endOf("day");
      const allOrdersInRange = await fetchOrdersInRange(from, to);

      if (scope === "all_vehicles") {
        const report = await getAggregatedReportByQuery(query, { includeAllVehiclesInRanking: true });
        const section = buildProSection(report, "Toàn bộ xe bồn", `Phạm vi ${tankerVehicles.length} xe`, allOrdersInRange);
        await exportProductionProExcel(
          {
            title: "Báo cáo vận hành đội xe",
            scopeLabel: "Toàn bộ xe",
            periodLabel,
            generatedAtLabel,
            summaryCards: buildSummaryCardsFromReport(report),
            sections: [section],
          },
          `bao-cao-san-luong_toan-bo-xe_${query.from}_${query.to}`
        );
        message.success("Đang xuất Excel Pro toàn bộ xe.");
        return;
      }

      if (scope === "by_vehicle") {
        const vehicleId = options?.vehicleId;
        if (!vehicleId) {
          message.warning("Vui lòng chọn xe trước khi xuất.");
          return;
        }
        const selectedVehicle = tankerVehicles.find((vehicle) => vehicle.vehicle_id === vehicleId);
        const report = await getAggregatedReportByQuery(query, { vehicleId });
        const vehicleOrders = allOrdersInRange.filter((order) => N(order.vehicles?.vehicle_id) === vehicleId);
        const section = buildProSection(
          report,
          `${selectedVehicle?.vehicle_name || `Xe ${vehicleId}`} - ${selectedVehicle?.vehicle_license_plate || "—"}`,
          "Toàn bộ chi tiết chuyến theo xe",
          vehicleOrders
        );
        await exportProductionProExcel(
          {
            title: "Báo cáo vận hành đội xe",
            scopeLabel: `Theo xe ${selectedVehicle?.vehicle_name || vehicleId}`,
            periodLabel,
            generatedAtLabel,
            summaryCards: buildSummaryCardsFromReport(report),
            sections: [section],
          },
          `bao-cao-san-luong_xe-${toFilePart(String(selectedVehicle?.vehicle_name || vehicleId))}_${query.from}_${query.to}`
        );
        message.success("Đang xuất Excel Pro theo xe.");
        return;
      }

      if (scope === "by_station") {
        const stationId = options?.stationId;
        if (!stationId) {
          message.warning("Vui lòng chọn trạm trước khi xuất.");
          return;
        }
        const selectedStation = stations.find((station) => station.station_id === stationId);
        const report = await getAggregatedReportByQuery(query, { stationId, includeAllVehiclesInRanking: false });
        const stationOrders = allOrdersInRange.filter((order) => N(order.stations?.station_id) === stationId);
        const section = buildProSection(
          report,
          selectedStation?.station_name || `Trạm ${stationId}`,
          "Toàn bộ chi tiết chuyến theo trạm",
          stationOrders
        );
        await exportProductionProExcel(
          {
            title: "Báo cáo vận hành đội xe",
            scopeLabel: `Theo trạm ${selectedStation?.station_name || stationId}`,
            periodLabel,
            generatedAtLabel,
            summaryCards: buildSummaryCardsFromReport(report),
            sections: [section],
          },
          `bao-cao-san-luong_tram-${toFilePart(String(selectedStation?.station_name || stationId))}_${query.from}_${query.to}`
        );
        message.success("Đang xuất Excel Pro theo trạm.");
        return;
      }

      if (!stations.length) {
        message.warning("Chưa có danh sách trạm để xuất.");
        return;
      }
      const reportByStation = await Promise.all(
        stations.map(async (station) => {
          const report = await getAggregatedReportByQuery(query, { stationId: station.station_id, includeAllVehiclesInRanking: false });
          return { station, report };
        })
      );
      const sections = reportByStation.map(({ station, report }) => {
        const stationOrders = allOrdersInRange.filter((order) => N(order.stations?.station_id) === station.station_id);
        return buildProSection(report, station.station_name, "Toàn bộ chi tiết chuyến của trạm", stationOrders);
      });
      const overviewReport = aggregateReports(reportByStation.map((item) => item.report), query);
      await exportProductionProExcel(
        {
          title: "Báo cáo vận hành đội xe",
          scopeLabel: "Toàn bộ trạm",
          periodLabel,
          generatedAtLabel,
          summaryCards: buildSummaryCardsFromReport(overviewReport),
          sections,
        },
        `bao-cao-san-luong_toan-bo-tram_${query.from}_${query.to}`
      );
      message.success("Đang xuất Excel Pro toàn bộ trạm.");
    } catch (error) {
      console.error("Export report failed", error);
      message.error("Xuất báo cáo thất bại, vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  }, [buildProSection, buildSummaryCardsFromReport, data, fetchOrdersInRange, getAggregatedReportByQuery, query, stations, tankerVehicleIds.length, tankerVehicles]);

  const openExportModal = useCallback((scope: ExportScope) => {
    setPendingExportScope(scope);
    setExportModalOpen(true);
  }, []);

  const onExportMenuClick = useCallback(({ key }: { key: string }) => {
    if (key === "all_vehicles") {
      void exportByScope("all_vehicles");
      return;
    }
    if (key === "all_stations") {
      void exportByScope("all_stations");
      return;
    }
    if (key === "by_vehicle") {
      openExportModal("by_vehicle");
      return;
    }
    if (key === "by_station") {
      openExportModal("by_station");
    }
  }, [exportByScope, openExportModal]);

  const confirmScopedExport = useCallback(() => {
    if (!pendingExportScope) return;
    if (pendingExportScope === "by_vehicle") {
      void exportByScope("by_vehicle", { vehicleId: selectedExportVehicleId });
      setExportModalOpen(false);
      setPendingExportScope(null);
      return;
    }
    if (pendingExportScope === "by_station") {
      void exportByScope("by_station", { stationId: selectedExportStationId });
      setExportModalOpen(false);
      setPendingExportScope(null);
    }
  }, [exportByScope, pendingExportScope, selectedExportStationId, selectedExportVehicleId]);

  const exportMenuItems = useMemo(
    () => [
      { key: "by_vehicle", label: "Xuất báo cáo theo xe" },
      { key: "all_vehicles", label: "Xuất báo cáo toàn bộ xe" },
      { key: "by_station", label: "Xuất báo cáo theo trạm" },
      { key: "all_stations", label: "Xuất báo cáo toàn bộ trạm" },
    ],
    []
  );

  const seriesColumns = [
    { title: "Kỳ", dataIndex: "period", key: "p", width: 150, render: (v: string) => <Text strong className="text-sm">{formatPeriodLongLabel(v, groupByMode)}</Text> },
    { title: "Tổng", dataIndex: "total_orders", key: "t", width: 80, align: "center" as const, render: (v: number) => <Tag className="rounded-full border-0 px-2 font-bold" color="blue">{v}</Tag> },
    { title: "Hoàn thành", dataIndex: "completed", key: "c", width: 100, align: "center" as const, render: (v: number) => <span className="text-emerald-600 font-semibold">{v}</span> },
    { title: "Đang XL", key: "r", width: 80, align: "center" as const, render: (_: any, r: ProductionSeriesItem) => <span className="text-amber-600 font-semibold">{r.running + r.collecting + r.transporting}</span> },
    { title: "Chờ", dataIndex: "pending", key: "pe", width: 60, align: "center" as const },
    { title: "Hủy", dataIndex: "canceled", key: "ca", width: 60, align: "center" as const, render: (v: number) => v > 0 ? <span className="text-red-500 font-semibold">{v}</span> : <span className="text-gray-300">0</span> },
    { title: "Km", dataIndex: "distance_km", key: "km", width: 110, align: "right" as const, render: (v: number) => <Text className="text-sm font-mono">{Math.round(v).toLocaleString("vi-VN")}</Text>, sorter: (a: ProductionSeriesItem, b: ProductionSeriesItem) => a.distance_km - b.distance_km },
    { title: "Tỷ lệ hoàn thành", key: "rate", width: 140, render: (_: any, r: ProductionSeriesItem) => { const p = r.total_orders > 0 ? Math.round(r.completed / r.total_orders * 100) : 0; return <Progress percent={p} strokeColor={p >= 90 ? "#10b981" : p >= 70 ? "#f59e0b" : "#ef4444"} size="small" format={(v) => `${v}%`} />; } },
  ];

  return (
    <div className="space-y-3">
      {/* ═══ HEADER BAR ═══ */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="border border-slate-200/70 shadow-sm rounded-2xl" styles={{ body: { padding: "14px 20px" } }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div style={{ background: "#eff6ff", width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BarChart3 size={18} className="text-blue-500" />
              </div>
              <div>
                <Title level={5} className="m-0 text-base">Báo cáo Sản lượng</Title>
                <Text type="secondary" className="text-xs block">Báo cáo &nbsp;›&nbsp; Sản lượng</Text>
                {data && (
                  <Text type="secondary" className="text-xs">
                    {dayjs(data.from).format("DD/MM/YYYY")} — {dayjs(data.to).format("DD/MM/YYYY")} · {TARGET_VEHICLE_TYPE_NAME}
                  </Text>
                )}
              </div>
            </div>
            <Space size="middle" wrap>
              <RangePicker value={[dayjs(query.from), dayjs(query.to)]} onChange={(d) => { if (d?.[0] && d?.[1]) setQuery(p => ({ ...p, from: d[0]!.format("YYYY-MM-DD"), to: d[1]!.format("YYYY-MM-DD") })); }} className="rounded-xl" />
              <Select value={query.group_by} onChange={(v) => setQuery(p => ({ ...p, group_by: v }))} options={[{ label: "Theo ngày", value: "day" }, { label: "Theo tuần", value: "week" }, { label: "Theo tháng", value: "month" }]} className="min-w-[130px]" />
              <Dropdown menu={{ items: exportMenuItems, onClick: onExportMenuClick }} trigger={["click"]}>
                <Button
                  icon={<Download size={16} />}
                  type="primary"
                  loading={exporting}
                  disabled={!data || loadingVehicleScope}
                  style={{ background: "#10b981", border: 0, borderRadius: 10, fontWeight: 700, height: 36 }}
                >
                  Xuất báo cáo
                </Button>
              </Dropdown>
            </Space>
          </div>
        </Card>
      </motion.div>

      {loading ? <div className="flex items-center justify-center py-32"><Spin size="large" /></div> : !data ? <Empty description="Không có dữ liệu" className="py-20" /> : (<>

        {/* ═══ ROW 1: 5 KPI cards ═══ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <Card className="border border-slate-200/70 shadow-sm rounded-2xl" styles={{ body: { padding: "14px 16px 10px" } }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Text className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Sản lượng trung bình</Text>
                  <Tooltip title={`Kỳ trước: ${previousRangeText}`}>
                    <span className="inline-flex cursor-help text-slate-400 hover:text-slate-500">
                      <Info size={13} />
                    </span>
                  </Tooltip>
                </div>
                <Tag className={`${deltaTone(avgDelta)} border-0 rounded-full text-[11px] font-bold`} style={{ background: avgDelta >= 0 ? "#ecfdf3" : "#fff1f2" }}>
                  {avgDelta >= 0 ? "↑" : "↓"} {Math.abs(avgDelta)}%
                </Tag>
              </div>
              <div className="mt-1 flex items-end gap-1.5">
                <span className="text-[36px] font-black leading-none text-slate-900">{avg.toLocaleString("vi-VN")}</span>
                <span className="text-[12px] font-semibold text-slate-500 mb-1">
                  chuyến/{query.group_by === "day" ? "ngày" : query.group_by === "week" ? "tuần" : "tháng"}
                </span>
              </div>
              <div className="h-[48px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend.slice(-10)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="avg-spark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Area type="monotone" dataKey="Hoàn thành" stroke="#3b82f6" strokeWidth={2} fill="url(#avg-spark)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {[
              {
                icon: <BarChart3 size={16} />,
                label: "Tổng chuyến",
                value: (s?.total_orders ?? 0).toLocaleString("vi-VN"),
                suffix: "chuyến",
                delta: totalOrdersDelta,
                color: "#4f46e5",
                bg: "#eef2ff",
              },
              {
                icon: <CheckCircle size={16} />,
                label: "Hoàn thành",
                value: (s?.completed ?? 0).toLocaleString("vi-VN"),
                suffix: "chuyến",
                delta: completedDelta,
                color: "#059669",
                bg: "#ecfdf3",
              },
              {
                icon: <Route size={16} />,
                label: "Tổng KM",
                value: Math.round(s?.total_distance_km ?? 0).toLocaleString("vi-VN"),
                suffix: "km",
                delta: distanceDelta,
                color: "#d97706",
                bg: "#fffbeb",
              },
              {
                icon: <Timer size={16} />,
                label: "Tỷ lệ hoàn thành",
                value: `${completionRate}`,
                suffix: "%",
                delta: completionRateDelta,
                color: "#9333ea",
                bg: "#f5f3ff",
              },
            ].map((metric) => (
              <Card key={metric.label} className="border border-slate-200/70 shadow-sm rounded-2xl" styles={{ body: { padding: "14px 16px" } }}>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: metric.bg, color: metric.color }}>
                    {metric.icon}
                  </span>
                  <Text className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{metric.label}</Text>
                </div>
                <div className="flex items-end gap-1.5">
                  <span className="text-[34px] font-black leading-none text-slate-900">{metric.value}</span>
                  <span className="text-[12px] font-semibold text-slate-500 mb-1">{metric.suffix}</span>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <ArrowUpRight size={14} className={metric.delta >= 0 ? "text-emerald-500" : "text-rose-500 rotate-180"} />
                  <span className={`text-[12px] font-bold ${deltaTone(metric.delta)}`}>{Math.abs(metric.delta)}%</span>
                  <Tooltip title={`Kỳ trước: ${previousRangeText}`}>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 cursor-help">
                      so với kỳ trước
                      <Info size={12} />
                    </span>
                  </Tooltip>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* ═══ ROW 2: Mini charts + Main chart + Stations ═══ */}
        <Row gutter={[16, 16]}>
          {/* Left — 2 stacked mini cards */}
          <Col xs={24} lg={5}>
            <div className="flex flex-col gap-4 h-full">
              {/* Total this period */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex-1">
                <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: "16px 18px", overflow: "visible" } }}>
                  <span className="text-[13px] font-extrabold text-slate-700 block">{groupedSeries.length} kỳ thống kê</span>
                  <span className="text-[12px] font-bold text-slate-500 block mb-0.5">{dayjs(data.from).format("DD/MM")} – {dayjs(data.to).format("DD/MM")}</span>
                  <div className="font-black text-[32px] mb-1" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                  <div className="w-full h-[60px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={trend.slice(-8)} 
                        margin={{ top: 0, right: 2, left: 2, bottom: 0 }}
                        onClick={(e: any) => {
                          const payload = e?.activePayload?.[0]?.payload;
                          if (!payload?.rawPeriod) return;
                          handlePeriodClick({ period: payload.rawPeriod } as ProductionSeriesItem);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 600 }} dy={1} interval={0} />
                        <RTooltip content={<Tip />} />
                        <Bar dataKey="Hoàn thành" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={7} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </motion.div>
              {/* Donut gauge */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex-1">
                <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center" } }}>
                  <span className="text-[13px] font-extrabold text-slate-700 block mb-1 self-start">Tỷ lệ hoàn thành</span>
                  <div className="w-[100px] h-[100px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{ v: completionRate }, { v: 100 - completionRate }]} cx="50%" cy="50%" innerRadius={32} outerRadius={46} startAngle={90} endAngle={-270} dataKey="v" stroke="none">
                          <Cell fill={completionRate >= 90 ? "#059669" : completionRate >= 70 ? "#d97706" : "#dc2626"} />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-black text-2xl" style={{ color: "#0f172a" }}>{completionRate}%</span>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-slate-600 mt-1">{s?.completed ?? 0} / {s?.total_orders ?? 0}</span>
                </Card>
              </motion.div>
            </div>
          </Col>

          {/* Center — Main chart */}
          <Col xs={24} lg={12}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
              <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: "16px 20px 8px" } }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Title level={5} className="m-0 text-[15px]">Sản lượng theo ngày</Title>
                    <span className="text-[11px] font-semibold text-slate-500">{dayjs(data.from).format("DD/MM")} – {dayjs(data.to).format("DD/MM/YYYY")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] font-semibold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Hoàn thành</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Đang xử lý</span>
                  </div>
                </div>
                <div className="w-full h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={trend} 
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }} 
                      barCategoryGap="25%"
                      onClick={(e: any) => {
                        const payload = e?.activePayload?.[0]?.payload;
                        if (!payload?.rawPeriod) return;
                        handlePeriodClick({ period: payload.rawPeriod } as ProductionSeriesItem);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} dy={6} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                      <RTooltip content={<Tip />} />
                      <Bar dataKey="Hoàn thành" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Đang xử lý" fill="#d97706" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Summary footer */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 mt-2 -mx-5 px-5">
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Tổng số chuyến</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                    <span className="text-[12px] font-bold text-emerald-600">{completionRate}% hoàn thành</span>
                  </div>
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Tổng KM</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{Math.round(s?.total_distance_km ?? 0).toLocaleString("vi-VN")}</div>
                    <span className="text-[12px] font-bold text-amber-600">≈ {avgPerOrderKm.toLocaleString("vi-VN")} km/chuyến</span>
                  </div>
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Trung bình</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{avg}</div>
                    <span className="text-[12px] font-bold text-blue-600">chuyến/{query.group_by === "day" ? "ngày" : query.group_by === "week" ? "tuần" : "tháng"}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </Col>

          {/* Right — Station performance with circular rings */}
          <Col xs={24} lg={7}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="h-full">
              <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" } }}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                  <div>
                    <Title level={5} className="m-0 text-[15px]">Hiệu suất Trạm</Title>
                    <span className="text-[11px] text-slate-400">Nhấn vào từng trạm để xem chi tiết chuyến</span>
                  </div>
                  <Tag className="rounded-full border-0 text-[11px] font-bold" color="cyan">{data.top_stations.length} trạm</Tag>
                </div>
                <div className="flex-1 px-4 py-3 space-y-5">
                  {data.top_stations.map((st, i) => {
                    const pct = s && s.total_orders > 0 ? Math.round(st.total_orders / s.total_orders * 100) : 0;
                    const colors = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#dc2626"];
                    const cl = colors[i % 5];
                    return (
                      <button
                        key={st.station_id}
                        type="button"
                        onClick={() => handleStationClick(st)}
                        className="group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left border border-transparent hover:bg-slate-50 hover:border-slate-200 transition-all"
                      >
                        {/* Ring */}
                        <div className="shrink-0 relative" style={{ width: 48, height: 48 }}>
                          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke={cl} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 0.88} 88`} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[14px] font-bold block truncate" style={{ color: "#0f172a" }}>{st.station_name}</span>
                          <span className="text-[12px] font-semibold" style={{ color: cl }}>{st.total_orders.toLocaleString("vi-VN")} chuyến</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[15px] font-black" style={{ color: cl }}>{pct}%</span>
                        </div>
                        <ChevronRight size={15} className="text-slate-300 transition-transform duration-200 group-hover:text-blue-500 group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          </Col>
        </Row>

        {/* ═══ ROW 3: Vehicle Ranking + Recent Periods + Pie Chart ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ alignItems: "stretch" }}>
          {/* Vehicle Ranking */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="min-h-0">
            <div className="h-full">
              <VehicleRanking vehicles={data.top_vehicles} baseQuery={query} maxOrders={data.top_vehicles[0]?.total_orders || 1} />
            </div>
          </motion.div>

          {/* Recent Periods — compact list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="min-h-0">
            <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" } }}>
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <Title level={5} className="m-0 text-[15px]">Sản lượng theo kỳ gần nhất</Title>
                  <span className="text-[11px] text-slate-400">Nhấn vào từng kỳ để mở chi tiết chuyến</span>
                </div>
                <span className="text-[12px] font-bold text-slate-500">{query.group_by === "day" ? "5 ngày" : query.group_by === "week" ? "5 tuần" : "5 tháng"}</span>
              </div>
              <div className="divide-y divide-gray-50 flex-1">
                {[...groupedSeries].reverse().slice(0, 5).map((row) => {
                  const rate = row.total_orders > 0 ? Math.round(row.completed / row.total_orders * 100) : 0;
                  const rateColor = rate >= 90 ? "#059669" : rate >= 70 ? "#d97706" : "#dc2626";
                  return (
                    <div key={row.period} onClick={() => handlePeriodClick(row)} className="group flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-blue-50/60 transition-all border-l-4 border-transparent hover:border-blue-500">
                      <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1px solid #e2e8f0" }}>
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">{query.group_by === "day" ? "NGÀY" : query.group_by === "week" ? "TUẦN" : "THÁNG"}</span>
                        <span className="text-[18px] font-black leading-tight" style={{ color: "#1e40af" }}>{query.group_by === "month" ? dayjs(row.period).format("MM") : dayjs(row.period).format("DD")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[16px] font-black block leading-snug" style={{ color: "#0f172a" }}>{formatPeriodLongLabel(row.period, groupByMode)}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[13px] font-bold text-slate-500">{row.completed}/{row.total_orders} hoàn thành</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-[13px] font-bold text-slate-500">{Math.round(row.distance_km).toLocaleString("vi-VN")} km</span>
                        </div>
                      </div>
                      <div className="shrink-0 w-[96px] text-right">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-[20px] font-black leading-none" style={{ color: "#0f172a" }}>
                            {row.total_orders}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">chuyến</span>
                        </div>
                        <div className="mt-2">
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rateColor }} />
                          </div>
                          <div className="mt-1 text-[12px] font-black" style={{ color: rateColor }}>
                            {rate}%
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 transition-transform duration-200 group-hover:text-blue-500 group-hover:translate-x-0.5" />
                    </div>
                  );
                })}
              </div>
              {/* Show all table */}
              <div className="border-t border-gray-100 shrink-0">
                <button onClick={() => setShowAllSeries(!showAllSeries)} className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">
                  {showAllSeries ? <><ChevronUp size={14} /> Thu gọn</> : <><ChevronDown size={14} /> Tất cả {groupedSeries.length} kỳ</>}
                </button>
                <AnimatePresence>
                  {showAllSeries && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                      <Table columns={seriesColumns} dataSource={groupedSeries.map((item, i) => ({ ...item, key: i }))} pagination={groupedSeries.length > 20 ? { pageSize: 20, showSizeChanger: false, showTotal: (t) => `${t} kỳ` } : false} className="pro-tbl" size="small" onRow={(record) => ({ onClick: () => handlePeriodClick(record as unknown as ProductionSeriesItem), style: { cursor: "pointer" } })} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>

          {/* Pie — Status Distribution + Summary */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="min-h-0">
            <Card className="border-0 shadow-sm rounded-2xl h-full" styles={{ body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" } }}>
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <Title level={5} className="m-0 text-[15px]">Phân bổ trạng thái</Title>
                <Tag color="blue" className="rounded-full border-0 text-[11px] font-bold">{pie.length} loại</Tag>
              </div>
              <div className="flex-1 px-4 pt-2">
                <div className="w-full h-[170px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="v" nameKey="n">
                        {pie.map((e, i) => <Cell key={i} fill={e.c} />)}
                      </Pie>
                      <RTooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {pie.map(p => (
                    <div key={p.n} className="flex items-center gap-2 text-[13px]">
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: p.c, flexShrink: 0 }} />
                      <span className="text-slate-600 truncate">{p.n}: <span className="font-bold" style={{ color: "#0f172a" }}>{p.v}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Summary footer */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 shrink-0">
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Tổng chuyến</span>
                  <div className="font-black text-[17px]" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                </div>
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Hoàn thành</span>
                  <div className="font-black text-[17px] text-emerald-600">{completionRate}%</div>
                </div>
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Đang xử lý</span>
                  <div className="font-black text-[16px] text-amber-600">{((s?.running ?? 0) + (s?.collecting ?? 0) + (s?.transporting ?? 0)).toLocaleString("vi-VN")}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </>)}

      <Modal
        title={pendingExportScope === "by_vehicle" ? "Xuất báo cáo theo xe" : "Xuất báo cáo theo trạm"}
        open={exportModalOpen}
        onCancel={() => {
          setExportModalOpen(false);
          setPendingExportScope(null);
        }}
        onOk={confirmScopedExport}
        okText="Xuất báo cáo"
        cancelText="Hủy"
        confirmLoading={exporting}
        destroyOnHidden
      >
        {pendingExportScope === "by_vehicle" ? (
          <div className="space-y-3">
            <Text className="text-[12px] text-slate-500">Chọn xe để xuất file báo cáo Premium có đầy đủ thống kê và biểu đồ.</Text>
            <Select
              showSearch
              value={selectedExportVehicleId}
              className="w-full"
              placeholder="Chọn xe"
              optionFilterProp="label"
              onChange={(value) => setSelectedExportVehicleId(value)}
              options={tankerVehicles.map((vehicle) => ({
                value: vehicle.vehicle_id,
                label: `${vehicle.vehicle_name} - ${vehicle.vehicle_license_plate}`,
              }))}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <Text className="text-[12px] text-slate-500">Chọn trạm để xuất file báo cáo Premium có đầy đủ thống kê và biểu đồ.</Text>
            <Select
              showSearch
              value={selectedExportStationId}
              className="w-full"
              placeholder="Chọn trạm"
              optionFilterProp="label"
              loading={loadingStations}
              onChange={(value) => setSelectedExportStationId(value)}
              options={stations.map((station) => ({
                value: station.station_id,
                label: station.station_name,
              }))}
            />
          </div>
        )}
      </Modal>

      {/* Period drill-down Drawer */}
      <Drawer
        title={null}
        placement="right" size={980}
        open={periodDrawer} onClose={() => {
          setPeriodDrawer(false);
          setPeriodVehicleSearch("");
        }}
        styles={{ header: { display: "none" }, body: { padding: 0 } }}
      >
        {/* Custom header */}
        <div style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)", padding: "20px 28px", color: "#fff" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[20px] font-black">Chi tiết chuyến — {selectedPeriod ? formatPeriodLongLabel(selectedPeriod, groupByMode) : ""}</div>
              <div className="text-[14px] font-semibold opacity-80 mt-1">
                {filteredPeriodOrders.length}
                {periodVehicleSearch.trim() ? ` / ${periodOrders.length}` : ""} chuyến trong kỳ này
              </div>
            </div>
            <button onClick={() => setPeriodDrawer(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
              <span className="text-white text-lg font-bold">✕</span>
            </button>
          </div>
          {/* Summary strip */}
          {periodOrders.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mt-2">
                {[
                  { label: "Tổng chuyến", value: filteredPeriodOrders.length, color: "#fff" },
                  { label: "Hoàn thành", value: filteredPeriodOrders.filter(o => o.order_status === "completed").length, color: "#86efac" },
                  { label: "Đang xử lý", value: filteredPeriodOrders.filter(o => ["running", "collecting", "transporting"].includes(o.order_status ?? "")).length, color: "#fde68a" },
                  { label: "Tổng Km", value: Math.round(filteredPeriodOrders.reduce((sum, o) => sum + getOrderDistanceKm(o), 0)).toLocaleString("vi-VN"), color: "#93c5fd" },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
                  <div className="text-[11px] font-semibold opacity-70">{item.label}</div>
                  <div className="text-[22px] font-black leading-tight" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table content */}
        <div className="p-5 bg-slate-50/60">
          {loadingPeriod ? (
            <div className="flex items-center justify-center py-20"><Spin size="large" /></div>
          ) : periodOrders.length === 0 ? (
            <Empty description="Không có chuyến nào trong kỳ này" className="py-20" />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-slate-900">Tìm nhanh theo xe</div>
                    <div className="text-[12px] font-medium text-slate-500">
                      Lọc theo mã xe hoặc biển số để xem đúng chuyến cần kiểm tra.
                    </div>
                  </div>
                  <Input
                    allowClear
                    value={periodVehicleSearch}
                    onChange={(event) => setPeriodVehicleSearch(event.target.value)}
                    placeholder="Nhập mã xe hoặc biển số..."
                    prefix={<Search size={16} className="text-slate-400" />}
                    className="w-full md:max-w-[320px]"
                  />
                </div>
              </div>

              {filteredPeriodOrders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <Empty description="Không tìm thấy chuyến phù hợp với xe đang lọc" className="py-20" />
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
              <Table
                columns={[
                { title: "STT", key: "n", width: 56, align: "center" as const, render: (_: any, __: any, i: number) => <span className="text-[14px] font-bold text-slate-500">{(drawerPage - 1) * DRAWER_PAGE_SIZE + i + 1}</span> },
                {
                  title: "Xe", key: "xe", width: 164, render: (_: any, r: Order) => (
                    <div>
                      <div className="font-black text-[15px] leading-tight" style={{ color: "#0f172a" }}>{r.vehicles?.vehicle_name ?? "-"}</div>
                      <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontSize: 12, color: "#334155", fontWeight: 700, display: "inline-block", marginTop: 3 }}>{r.vehicles?.vehicle_license_plate ?? "-"}</span>
                    </div>
                  )
                },
                {
                  title: "Trạng thái", dataIndex: "order_status", key: "st", width: 124, render: (v: string) => {
                    const M: Record<string, { l: string; c: string; bg: string }> = {
                      completed: { l: "Hoàn thành", c: "#059669", bg: "#d1fae5" },
                      canceled: { l: "Đã hủy", c: "#dc2626", bg: "#fee2e2" },
                      running: { l: "Đang chạy", c: "#2563eb", bg: "#dbeafe" },
                      collecting: { l: "Nhận hàng", c: "#7c3aed", bg: "#ede9fe" },
                      transporting: { l: "Vận chuyển", c: "#d97706", bg: "#fef3c7" },
                      pending: { l: "Chờ xử lý", c: "#64748b", bg: "#f1f5f9" }
                    };
                    const m = M[v] ?? { l: v, c: "#64748b", bg: "#f1f5f9" };
                    return <span style={{ background: m.bg, color: m.c, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 20, display: "inline-block" }}>{m.l}</span>;
                  }
                },
                { title: "Trạm", key: "sta", width: 108, render: (_: any, r: Order) => <span className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{r.stations?.station_name ?? "-"}</span> },
                {
                  title: "Km", key: "km", width: 68, align: "center" as const, render: (_: any, r: Order) => {
                    const km = Math.round(getOrderDistanceKm(r));
                    return <span className="font-mono text-[15px] font-black" style={{ color: km > 0 ? "#2563eb" : "#94a3b8" }}>{km > 0 ? km.toLocaleString("vi-VN") : "0"}</span>;
                  }
                },
                {
                  title: "Dừng/Đỗ", key: "stops", width: 74, align: "center" as const, render: (_: any, r: Order) => {
                    const stops = r.order_multi?.nStop_end ?? 0;
                    return <span className="text-[14px] font-bold" style={{ color: stops > 0 ? "#d97706" : "#94a3b8" }}>{stops}</span>;
                  }
                },
                {
                  title: "Bắt đầu", dataIndex: "order_start_datetime", key: "sd", width: 130, render: (v: string | null) => v ? (
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
                      <div className="text-[12px] font-semibold text-slate-400 leading-tight">{dayjs(v).format("DD/MM/YYYY")}</div>
                    </div>
                  ) : <span className="text-slate-300 text-[14px]">—</span>
                },
                {
                  title: "Kết thúc", dataIndex: "order_end_datetime", key: "ed", width: 130, render: (v: string | null) => v ? (
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
                      <div className="text-[12px] font-semibold text-slate-400 leading-tight">{dayjs(v).format("DD/MM/YYYY")}</div>
                    </div>
                  ) : <span className="text-slate-300 text-[14px]">—</span>
                },
              ]}
              dataSource={filteredPeriodOrders.map((o, i) => ({ ...o, key: (o as any).order_id ?? i }))}
              size="middle"
              tableLayout="fixed"
              pagination={filteredPeriodOrders.length > DRAWER_PAGE_SIZE ? { pageSize: DRAWER_PAGE_SIZE, showSizeChanger: false, showTotal: (t, range) => `${range[0]}–${range[1]} / ${t} chuyến`, onChange: (p) => setDrawerPage(p) } : false}
              className="drawer-tbl"
              />
            </div>
              )}
            </div>
          )}
        </div>
      </Drawer>

      <Drawer
        title={null}
        placement="right"
        size={940}
        open={stationDrawer}
        onClose={() => setStationDrawer(false)}
        styles={{ header: { display: "none" }, body: { padding: 0 } }}
      >
        <div style={{ background: "linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)", padding: "20px 28px", color: "#fff" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[20px] font-black">Chi tiết hiệu suất trạm — {selectedStation?.station_name ?? "-"}</div>
              <div className="text-[14px] font-semibold opacity-85 mt-1">
                {dayjs(query.from).format("DD/MM/YYYY")} - {dayjs(query.to).format("DD/MM/YYYY")}
              </div>
            </div>
            <button onClick={() => setStationDrawer(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
              <span className="text-white text-lg font-bold">✕</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
              <div className="text-[11px] font-semibold opacity-75">Số chuyến vào trạm</div>
              <div className="text-[22px] font-black leading-tight">{stationOrders.length}</div>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
              <div className="text-[11px] font-semibold opacity-75">TG lấy hàng trung bình</div>
              <div className="text-[22px] font-black leading-tight">
                {stationOrders.length
                  ? Math.round(stationOrders.reduce((sum, order) => sum + getStationLoadingMinutes(order), 0) / stationOrders.length)
                  : 0} phút
              </div>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
              <div className="text-[11px] font-semibold opacity-75">Tổng TG lấy hàng</div>
              <div className="text-[22px] font-black leading-tight">
                {stationOrders.reduce((sum, order) => sum + getStationLoadingMinutes(order), 0).toLocaleString("vi-VN")} phút
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-50/60">
          {loadingStationOrders ? (
            <div className="flex items-center justify-center py-20"><Spin size="large" /></div>
          ) : stationOrders.length === 0 ? (
            <Empty description="Không có chuyến vào trạm trong khoảng thời gian này" className="py-20" />
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
              <Table
                columns={[
                  { title: "STT", key: "n", width: 56, align: "center" as const, render: (_: any, __: any, i: number) => <span className="text-[14px] font-bold text-slate-500">{(stationPage - 1) * STATION_PAGE_SIZE + i + 1}</span> },
                  {
                    title: "Xe", key: "xe", width: 170, render: (_: any, order: Order) => (
                      <div>
                        <div className="font-black text-[15px] leading-tight" style={{ color: "#0f172a" }}>{order.vehicles?.vehicle_name ?? "-"}</div>
                        <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontSize: 12, color: "#334155", fontWeight: 700, display: "inline-block", marginTop: 3 }}>{order.vehicles?.vehicle_license_plate ?? "-"}</span>
                      </div>
                    ),
                  },
                  {
                    title: "Vào trạm",
                    key: "checkin",
                    width: 150,
                    render: (_: any, order: Order) => {
                      const checkIn = getStationCheckInTime(order);
                      if (!checkIn) return <span className="text-slate-300 text-[14px]">—</span>;
                      return (
                        <div>
                          <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(checkIn).format("HH:mm")}</div>
                          <div className="text-[12px] font-semibold text-slate-400 leading-tight">{dayjs(checkIn).format("DD/MM/YYYY")}</div>
                        </div>
                      );
                    },
                  },
                  {
                    title: "Ra trạm",
                    key: "checkout",
                    width: 150,
                    render: (_: any, order: Order) => {
                      const checkOut = getStationCheckOutTime(order);
                      if (!checkOut) return <span className="text-slate-300 text-[14px]">—</span>;
                      return (
                        <div>
                          <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(checkOut).format("HH:mm")}</div>
                          <div className="text-[12px] font-semibold text-slate-400 leading-tight">{dayjs(checkOut).format("DD/MM/YYYY")}</div>
                        </div>
                      );
                    },
                  },
                  {
                    title: "Lấy hàng",
                    key: "loading",
                    width: 120,
                    align: "center" as const,
                    render: (_: any, order: Order) => {
                      const loading = getStationLoadingMinutes(order);
                      return <span className="text-[14px] font-black text-cyan-700">{loading > 0 ? `${loading} phút` : "—"}</span>;
                    },
                  },
                  {
                    title: "Trạng thái",
                    dataIndex: "order_status",
                    key: "status",
                    width: 120,
                    render: (value: string) => {
                      const mapped: Record<string, { label: string; color: string; bg: string }> = {
                        completed: { label: "Hoàn thành", color: "#059669", bg: "#d1fae5" },
                        canceled: { label: "Đã hủy", color: "#dc2626", bg: "#fee2e2" },
                        running: { label: "Đang chạy", color: "#2563eb", bg: "#dbeafe" },
                        collecting: { label: "Nhận hàng", color: "#7c3aed", bg: "#ede9fe" },
                        transporting: { label: "Vận chuyển", color: "#d97706", bg: "#fef3c7" },
                        pending: { label: "Chờ xử lý", color: "#64748b", bg: "#f1f5f9" },
                      };
                      const meta = mapped[value] ?? { label: value, color: "#64748b", bg: "#f1f5f9" };
                      return <span style={{ background: meta.bg, color: meta.color, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 20, display: "inline-block" }}>{meta.label}</span>;
                    },
                  },
                ]}
                dataSource={stationOrders.map((order, i) => ({ ...order, key: (order as any).order_id ?? i }))}
                size="middle"
                tableLayout="fixed"
                pagination={stationOrders.length > STATION_PAGE_SIZE ? { pageSize: STATION_PAGE_SIZE, showSizeChanger: false, showTotal: (t, range) => `${range[0]}–${range[1]} / ${t} chuyến`, onChange: (nextPage) => setStationPage(nextPage) } : false}
                className="drawer-tbl"
              />
            </div>
          )}
        </div>
      </Drawer>

      <style jsx global>{`
        .pro-tbl .ant-table-thead > tr > th { background: transparent !important; font-weight: 600; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #f1f5f9 !important; }
        .pro-tbl .ant-table-tbody > tr > td { border-bottom: 1px solid #f8fafc !important; }
        .pro-tbl .ant-table-tbody > tr:hover > td { background: #f8fafc !important; }
        .drawer-tbl .ant-table-thead > tr > th { background: #f8fafc !important; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 2px solid #e2e8f0 !important; padding: 10px 12px !important; white-space: nowrap; }
        .drawer-tbl .ant-table-tbody > tr > td { border-bottom: 1px solid #f1f5f9 !important; padding: 10px 12px !important; vertical-align: middle; }
        .drawer-tbl .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
        .drawer-tbl .ant-pagination { margin-top: 16px !important; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active { border-color: #3b82f6; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active a { color: #3b82f6; }
        .drawer-tbl .ant-table-cell { overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
