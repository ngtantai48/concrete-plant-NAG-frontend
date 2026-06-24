"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle as DlgTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { cn } from "@/lib/utils";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import systemApi, { type TankerQueueSnapshotItem } from "@/services/system.service";
import vehicleApi from "@/services/vehicle.service";
import { usePermissions } from "@/hooks/use-permissions";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import type { Vehicle } from "@/types/vehicle";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  CalendarClock,
  CheckCircle2,
  Clock,
  Ellipsis,
  Eye,
  EyeOff,
  LayoutGrid,
  History,
  Map as MapIcon,
  MapPin,
  Radio,
  RefreshCw,
  Route,
  Search,
  Timer,
  Truck,
  X,
  Save,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import ActivityFlow, { type DispatchMode } from "./ActivityFlow";
import ClockDisplay from "./ClockDisplay";
import StationStatusPanel from "./StationStatusPanel";
import { computeTripStats, formatDuration } from "./trip-stats";
import VehicleLocationDialog from "./VehicleLocationDialog";
import VehicleStatusChange from "./VehicleStatusChange";
import EndOfDayModal from "./EndOfDayModal";
import SystemSettingsForm from "../system-settings/SystemSettingsForm";
import { SIDEBAR } from "@/constants/route";
import { PERMISSIONS } from "@/constants/permissions";

const StationMap = dynamic(() => import("@/components/features/dashboard/StationMap"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "var(--dd-bg-primary)" }}
    >
      <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
    </div>
  ),
});

const getTodayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const getYesterdayDate = () => {
  const today = new Date(getTodayDate());
  today.setDate(today.getDate() - 1);
  return format(today, "yyyy-MM-dd");
};

const YARD_ENTRY_TIME_VISIBILITY_STORAGE_KEY = "admin-dashboard-yard-entry-time-visible";
const YARD_ENTRY_TIME_VISIBILITY_STORAGE_EVENT = "admin-dashboard-yard-entry-time-visible-change";

const getYardEntryTimeVisibilitySnapshot = () =>
  typeof window === "undefined" ||
  window.localStorage.getItem(YARD_ENTRY_TIME_VISIBILITY_STORAGE_KEY) !== "false";

const subscribeYardEntryTimeVisibility = (onStoreChange: () => void) => {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(YARD_ENTRY_TIME_VISIBILITY_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(YARD_ENTRY_TIME_VISIBILITY_STORAGE_EVENT, onStoreChange);
  };
};

const normalizeVehicleKey = (value?: string | null) => value?.trim().toUpperCase() || "";

const getVehicleOrderInitTime = (
  orderInitTimeByVehicleKey: Map<string, number>,
  licensePlate?: string | null,
  vehicleName?: string | null
) =>
  orderInitTimeByVehicleKey.get(normalizeVehicleKey(licensePlate)) ??
  orderInitTimeByVehicleKey.get(normalizeVehicleKey(vehicleName)) ??
  null;

const getVtrackingDisplayStatus = (status: string, timestamp?: number) => {
  const isStale = timestamp ? Date.now() - timestamp > 10 * 60 * 1000 : false;
  if (isStale) return "offline";

  const normalizedStatus = (status || "").toLowerCase();
  if (["run", "running"].includes(normalizedStatus)) return "run";
  if (["stop", "park", "idle", "parking", "stopped"].includes(normalizedStatus)) return "park";
  return "offline";
};

const isOutsideYardWithoutLoadOrder = (order: Order) =>
  order.order_multi?.outside_yard_without_load === true;

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tVehiclePage = useTranslations("VehiclePage");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();

  const [geofenceStation, setGeofenceStation] = useState<Station | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const { hasActionAccess } = usePermissions();

  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [yardOrders, setYardOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDate());
  const showYardEntryTime = useSyncExternalStore(
    subscribeYardEntryTimeVisibility,
    getYardEntryTimeVisibilitySnapshot,
    () => true
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEndOfDayModalOpen, setIsEndOfDayModalOpen] = useState(false);
  const isPastDate = selectedDate < getTodayDate();

  const handleToggleYardEntryTime = useCallback(() => {
    window.localStorage.setItem(YARD_ENTRY_TIME_VISIBILITY_STORAGE_KEY, String(!showYardEntryTime));
    window.dispatchEvent(new Event(YARD_ENTRY_TIME_VISIBILITY_STORAGE_EVENT));
  }, [showYardEntryTime]);

  const fetchAll = useCallback(async () => {
    try {
      const apiCalls = [
        stationApi.getAll(),
        vehicleApi.getAll({ limit: 100 }),
        orderApi.getByInitDate(selectedDate),
        orderApi.getByStatus("pending"),
        orderApi.getByStatus("collecting"),
        orderApi.getByStatus("transporting"),
      ] as any[];

      const results = await Promise.allSettled(apiCalls);

      if (results[0].status === "fulfilled") {
        const sRes = results[0].value;
        const fetchedStations = sRes.data?.data || sRes.data || [];
        // console.log('[AdminDashboard] Fetched stations list:', fetchedStations.map((s: any) => ({ id: s.station_id, name: s.station_name, type: s.station_types?.station_type_id, status: s.station_status })));
        setStations(fetchedStations);
        setGeofenceStation(
          fetchedStations.find(
            (s: Station) => s.station_gps_longitude != null && s.station_gps_latitude != null
          ) ||
            fetchedStations[0] ||
            null
        );
      } else {
        console.warn("[fetchAll] stations failed:", results[0].reason);
      }
      if (results[1].status === "fulfilled") {
        const vRes = results[1].value;
        setVehicles(vRes.data?.data || vRes.data || []);
      } else {
        console.warn("[fetchAll] vehicles failed:", results[1].reason);
      }
      if (results[2].status === "fulfilled") {
        const oRes = results[2].value;
        setOrders(oRes.data?.data || oRes.data || []);
      } else {
        console.warn("[fetchAll] ordersByDate failed:", results[2].reason);
      }
      const pendingList =
        results[3]?.status === "fulfilled"
          ? results[3].value.data?.data || results[3].value.data || []
          : [];
      setPendingOrders(Array.isArray(pendingList) ? pendingList : []);

      const yardOrderResults = results.slice(3, 6);
      const fulfilledYardOrders = yardOrderResults.flatMap((result) => {
        if (result.status !== "fulfilled") return [];
        const list = result.value.data?.data || result.value.data || [];
        return Array.isArray(list) ? list : [];
      });
      setYardOrders(fulfilledYardOrders);

      yardOrderResults.forEach((result, index) => {
        if (result.status === "rejected") {
          const status = ["pending", "collecting", "transporting"][index];
          console.warn(`[fetchAll] ${status} orders failed:`, result.reason);
        }
      });
    } catch (err) {
      console.error("[fetchAll] unexpected:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const { vehicles: vtrackingVehicles } = useNearbyVehicles(
    geofenceStation?.station_gps_longitude ?? null,
    geofenceStation?.station_gps_latitude ?? null,
    geofenceStation?.station_gps_geofencing || 500,
    45000
  );

  const { stationStatusMap, isLedConnected } = useDeviceHeartbeat();
  const { isConnected: socketConnected, lastSignalTime } = useRealtimeUpdates(fetchAll);

  // useEffect(() => {
  //   console.log("[AdminDashboard] Socket/LED connection state updated:", {
  //     socketConnected,
  //     isLedConnected,
  //     stationStatusMap
  //   });
  // }, [socketConnected, isLedConnected, stationStatusMap]);

  const vehicleTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [locale]
  );

  const vehicleDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [locale]
  );

  const yardOrderInitTimeByVehicleKey = useMemo(() => {
    const map = new Map<string, number>();

    yardOrders.forEach((order) => {
      const initTime = new Date(order.order_init_datetime).getTime();
      if (!Number.isFinite(initTime)) return;

      [
        normalizeVehicleKey(order.vehicles?.vehicle_license_plate),
        normalizeVehicleKey(order.vehicles?.vehicle_name),
      ].forEach((key) => {
        if (!key) return;
        const current = map.get(key);
        if (current == null || initTime < current) {
          map.set(key, initTime);
        }
      });
    });

    return map;
  }, [yardOrders]);

  const inYardVehicles = useMemo(
    () =>
      vtrackingVehicles
        .filter((v) => v.inRange && v.vehicle_name?.toUpperCase().startsWith("X"))
        .sort((a, b) => {
          const aOrderInitTime =
            getVehicleOrderInitTime(
              yardOrderInitTimeByVehicleKey,
              a.license_plate,
              a.vehicle_name
            ) ?? Number.POSITIVE_INFINITY;
          const bOrderInitTime =
            getVehicleOrderInitTime(
              yardOrderInitTimeByVehicleKey,
              b.license_plate,
              b.vehicle_name
            ) ?? Number.POSITIVE_INFINITY;

          const orderInitDiff = aOrderInitTime - bOrderInitTime;
          if (orderInitDiff !== 0) return orderInitDiff;
          return (a.license_plate || "").localeCompare(b.license_plate || "");
        }),
    [yardOrderInitTimeByVehicleKey, vtrackingVehicles]
  );

  const otherVehiclesInYard = useMemo(
    () =>
      vtrackingVehicles
        .filter((v) => v.inRange && !v.vehicle_name?.toUpperCase().startsWith("X"))
        .sort((a, b) => (a.license_plate || "").localeCompare(b.license_plate || "")),
    [vtrackingVehicles]
  );

  const stoppedMaintenanceList = useMemo(() => {
    const list: { id: string; label: string; statusLabel: string; chipClass: string }[] = [];

    vehicles.forEach((v) => {
      if (
        v.vehicle_status === "incident" ||
        v.vehicle_status === "maintenance" ||
        v.vehicle_status === "other"
      ) {
        const isIncident = v.vehicle_status === "incident";
        const isOther = v.vehicle_status === "other";
        list.push({
          id: `veh-${v.vehicle_id}`,
          label: v.vehicle_license_plate
            ? `${v.vehicle_license_plate}${v.vehicle_name ? ` | ${v.vehicle_name}` : ""}`
            : "",
          statusLabel: isIncident
            ? t("incident") || "Sự cố"
            : isOther
              ? t("otherStatus") || "Việc khác"
              : tVehiclePage("maintenanceOption") || "Bảo dưỡng",
          chipClass: isIncident ? "dd-chip-red" : isOther ? "dd-chip-slate" : "dd-chip-amber",
        });
      }
    });

    return list;
  }, [vehicles, t, tVehiclePage]);

  const activeFlowOrders = useMemo(() => {
    return pendingOrders.filter((o) => {
      const vStatus = o.vehicles?.vehicle_status?.toLowerCase();
      const isShiftClosed = o.shift_closing?.shift_status === 1;
      return (
        !isShiftClosed && vStatus !== "maintenance" && vStatus !== "incident" && vStatus !== "other"
      );
    });
  }, [pendingOrders]);

  const ordersCompleted = useMemo(() => {
    return orders.filter((o) => o.order_status === "completed");
  }, [orders]);

  const [isSyncingShift, setIsSyncingShift] = useState(false);
  const [isSyncShiftDialogOpen, setIsSyncShiftDialogOpen] = useState(false);
  const [isSystemSettingsDialogOpen, setIsSystemSettingsDialogOpen] = useState(false);
  const [isQueueHistoryDialogOpen, setIsQueueHistoryDialogOpen] = useState(false);
  const [queueHistoryDate, setQueueHistoryDate] = useState(() => getYesterdayDate());
  const [isQueueHistoryDatePickerOpen, setIsQueueHistoryDatePickerOpen] = useState(false);
  const [queueHistoryLoading, setQueueHistoryLoading] = useState(false);
  const [queueHistoryItems, setQueueHistoryItems] = useState<TankerQueueSnapshotItem[]>([]);
  const queueHistoryDateLabel = useMemo(() => {
    const parsed = new Date(queueHistoryDate);
    return Number.isNaN(parsed.getTime()) ? queueHistoryDate : format(parsed, "dd/MM/yyyy");
  }, [queueHistoryDate]);

  const handleSyncShift = useCallback(async () => {
    setIsSyncShiftDialogOpen(false);
    setIsSyncingShift(true);

    const sorted = [...activeFlowOrders].sort(
      (a, b) => (a.order_number || 0) - (b.order_number || 0)
    );
    const maToStt: Record<string, number> = {};
    const skipped: { order_number: number; reason: string; raw: unknown }[] = [];
    let stt = 1;
    for (const o of sorted) {
      const raw = o.vehicles?.vehicle_name;
      if (!raw) {
        skipped.push({ order_number: o.order_number, reason: "no_vehicle_name", raw });
        continue;
      }
      const upper = String(raw).trim().toUpperCase().replace(/\s+/g, "");
      const m = upper.match(/^X0*(\d+)$/);
      const maX = m ? `X${m[1]}` : upper;
      if (!/^X\d+$/.test(maX)) {
        skipped.push({ order_number: o.order_number, reason: "invalid_format", raw });
        continue;
      }
      if (maX in maToStt) {
        skipped.push({ order_number: o.order_number, reason: "duplicate", raw: maX });
        continue;
      }
      maToStt[maX] = stt++;
    }

    if (skipped.length > 0) console.log("[handleSyncShift] skipped:", skipped);

    // Đẩy STT lên Google Sheet (giữ nguyên hành vi cũ).
    const pushToSheet = async () => {
      const res = await fetch("/api/google-sheets/bo-tri-cv/sync-lot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maToStt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed");
      if (data.unmatchedMaX?.length > 0) {
        console.warn("[handleSyncShift] mã X không có trong sheet cột H:", data.unmatchedMaX);
      }
      return data;
    };

    try {
      const [sheetResult, snapshotResult] = await Promise.allSettled([
        pushToSheet(),
        systemApi.captureTankerLotSync(),
      ]);

      if (sheetResult.status === "fulfilled") {
        const data = sheetResult.value;
        toast.success(
          t("syncShiftSuccess", { count: data.updated ?? Object.keys(maToStt).length })
        );
      } else {
        console.error("[handleSyncShift] sheet error:", sheetResult.reason);
        toast.error(t("syncShiftFailed"));
      }

      if (snapshotResult.status === "fulfilled") {
        toast.success(t("syncSnapshotSuccess"));
      } else {
        console.error("[handleSyncShift] snapshot error:", snapshotResult.reason);
        toast.error(t("syncSnapshotFailed"));
      }
    } finally {
      setIsSyncingShift(false);
    }
  }, [activeFlowOrders, t]);

  const fetchQueueHistory = useCallback(async (targetDate: string) => {
    if (!targetDate) return;
    const parsedTargetDate = new Date(targetDate);
    const targetDateLabel = Number.isNaN(parsedTargetDate.getTime())
      ? targetDate
      : format(parsedTargetDate, "dd/MM/yyyy");
    setQueueHistoryLoading(true);
    try {
      const response = await systemApi.getTankerQueueSnapshot(targetDate);
      const payload = response.data?.multi_data;
      const sortedItems = [...(payload?.items || [])].sort(
        (a, b) => (a.position || 0) - (b.position || 0)
      );
      setQueueHistoryItems(sortedItems);
      if (sortedItems.length === 0) {
        toast(`Chưa có lịch sử lốt xe ngày ${targetDateLabel}`);
      }
    } catch (error) {
      const status = (error as any)?.response?.status;
      if (status === 404) {
        setQueueHistoryItems([]);
        toast(`Chưa có lịch sử lốt xe ngày ${targetDateLabel}`);
      } else {
        console.error("[fetchQueueHistory] error:", error);
        toast.error("Không tải được lịch sử lốt xe");
        setQueueHistoryItems([]);
      }
    } finally {
      setQueueHistoryLoading(false);
    }
  }, []);

  const handleOpenQueueHistory = useCallback(async () => {
    const defaultHistoryDate = getYesterdayDate();
    setQueueHistoryDate(defaultHistoryDate);
    setIsQueueHistoryDialogOpen(true);
    await fetchQueueHistory(defaultHistoryDate);
  }, [fetchQueueHistory]);

  const [selectedSyncOrderIds, setSelectedSyncOrderIds] = useState<number[]>([]);
  const [isApplyingToEnd, setIsApplyingToEnd] = useState(false);

  const sortedActiveFlowOrders = useMemo(() => {
    return [...activeFlowOrders].sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
  }, [activeFlowOrders]);

  useEffect(() => {
    if (!isSyncShiftDialogOpen) {
      setSelectedSyncOrderIds([]);
    }
  }, [isSyncShiftDialogOpen]);

  const handleApplyToEnd = useCallback(async () => {
    if (selectedSyncOrderIds.length === 0) {
      toast.error(t("syncShiftNoSelection"));
      return;
    }
    setIsApplyingToEnd(true);
    try {
      const vehicleIds = activeFlowOrders
        .filter((o) => selectedSyncOrderIds.includes(o.order_id))
        .map((o) => o.vehicles?.vehicle_id)
        .filter((id): id is number => typeof id === "number");

      if (vehicleIds.length === 0) {
        toast.error(t("syncShiftApplyToEndFailed"));
        return;
      }

      await orderApi.arrangeTime({ vehicle_ids: vehicleIds });
      await fetchAll();
      setSelectedSyncOrderIds([]);
      toast.success(t("syncShiftApplyToEndSuccess", { count: vehicleIds.length }));
    } catch (err) {
      console.error("[handleApplyToEnd] error:", err);
      toast.error(t("syncShiftApplyToEndFailed"));
    } finally {
      setIsApplyingToEnd(false);
    }
  }, [selectedSyncOrderIds, activeFlowOrders, t, fetchAll]);

  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("auto");
  const [showMap, setShowMap] = useState(false);

  const [mapSearch, setMapSearch] = useState("");
  const [focusVehicleId, setFocusVehicleId] = useState<string | null>(null);
  const [mapStatusFilter, setMapStatusFilter] = useState<"all" | "run" | "park" | "offline">("all");
  const [selectedVehicleTrips, setSelectedVehicleTrips] = useState<{
    vehicle: Vehicle;
    orders: Order[];
  } | null>(null);
  const [showVehicleLocation, setShowVehicleLocation] = useState(false);
  const [isOtherVehiclesInYardDialogOpen, setIsOtherVehiclesInYardDialogOpen] = useState(false);

  const vehicleTripMap = useMemo(() => {
    const map = new Map<number, Order[]>();
    orders
      .filter((o) => ["completed", "running", "transporting"].includes(o.order_status))
      .forEach((o) => {
        if (o.vehicles?.vehicle_id) {
          const existing = map.get(o.vehicles.vehicle_id) || [];
          existing.push(o);
          map.set(o.vehicles.vehicle_id, existing);
        }
      });
    return map;
  }, [orders]);

  const sortedVehiclesWithTrips = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aTrips = vehicleTripMap.get(a.vehicle_id) || [];
      const bTrips = vehicleTripMap.get(b.vehicle_id) || [];

      // Priority score: transporting=2, running=1, rest=0
      const getPriority = (trips: typeof aTrips) => {
        if (trips.some((o) => o.order_status === "transporting")) return 2;
        if (trips.some((o) => o.order_status === "running")) return 1;
        return 0;
      };
      const aPriority = getPriority(aTrips);
      const bPriority = getPriority(bTrips);

      // Sort by priority group first
      if (aPriority !== bPriority) return bPriority - aPriority;

      // Within same group: sort by latest updated_at descending
      const aLatestTime =
        aTrips.length > 0
          ? Math.max(0, ...aTrips.map((o) => (o.updated_at ? new Date(o.updated_at).getTime() : 0)))
          : 0;
      const bLatestTime =
        bTrips.length > 0
          ? Math.max(0, ...bTrips.map((o) => (o.updated_at ? new Date(o.updated_at).getTime() : 0)))
          : 0;
      if (bLatestTime !== aLatestTime) return bLatestTime - aLatestTime;

      // Fallback: license plate A-Z
      return a.vehicle_license_plate.localeCompare(b.vehicle_license_plate);
    });
  }, [vehicles, vehicleTripMap]);

  const mixerVehicles = useMemo(() => {
    return sortedVehiclesWithTrips.filter((v) => v.vehicle_name?.toUpperCase().startsWith("X"));
  }, [sortedVehiclesWithTrips]);

  const otherVehicleTypes = useMemo(() => {
    return sortedVehiclesWithTrips.filter((v) => !v.vehicle_name?.toUpperCase().startsWith("X"));
  }, [sortedVehiclesWithTrips]);

  const focusVehicle = useMemo(() => {
    if (!focusVehicleId) return null;
    const v = vtrackingVehicles.find((v) => v.device_id === focusVehicleId);
    return v ? { latitude: v.latitude, longitude: v.longitude } : null;
  }, [focusVehicleId, vtrackingVehicles]);

  const mapVehicles = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();

    return vtrackingVehicles
      .filter((v) => {
        if (mapStatusFilter !== "all" && v.status !== mapStatusFilter) return false;
        if (!q) return true;
        return (
          v.license_plate?.toLowerCase().includes(q) || v.vehicle_name?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.distance - b.distance);
  }, [mapSearch, mapStatusFilter, vtrackingVehicles]);

  // Pre-compute trip stats for all vehicles (Fix #2: avoid recomputing inside render)
  const vehicleStatsMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof computeTripStats>>();
    sortedVehiclesWithTrips.forEach((v) => {
      const trips = vehicleTripMap.get(v.vehicle_id) || [];
      if (trips.length > 0) {
        map.set(v.vehicle_id, computeTripStats(trips));
      }
    });
    return map;
  }, [sortedVehiclesWithTrips, vehicleTripMap]);

  // const statCards = useMemo(() => [
  //   {
  //     label: t('completed'),
  //     value: ordersCompleted.length.toString().padStart(3, '0'),
  //     accentColor: '#06b6d4',
  //     glowColor: 'rgba(6, 182, 212, 0.12)',
  //   },
  //   {
  //     label: t('pending'),
  //     value: ordersPending.length.toString().padStart(2, '0'),
  //     accentColor: '#f59e0b',
  //     glowColor: 'rgba(245, 158, 11, 0.12)',
  //   },
  //   {
  //     label: t('collecting'),
  //     value: ordersAtStation.length.toString().padStart(2, '0'),
  //     accentColor: '#22c55e',
  //     glowColor: 'rgba(34, 197, 94, 0.12)',
  //   },
  //   {
  //     label: t('inTransit'),
  //     value: ordersInTransit.length.toString().padStart(2, '0'),
  //     accentColor: '#38bdf8',
  //     glowColor: 'rgba(56, 189, 248, 0.12)',
  //   },
  //   {
  //     label: t('activeStationsShort'),
  //     value: `${activeStations.length}/${stations.filter(s => s.station_types?.station_type_id === 1).length}`,
  //     accentColor: '#10b981',
  //     glowColor: 'rgba(16, 185, 129, 0.12)',
  //   },
  // ], [t, ordersCompleted.length, ordersPending.length, ordersAtStation.length, ordersInTransit.length, activeStations.length, stations]);

  const renderVehicleTripListItem = (v: Vehicle) => {
    const trips = vehicleTripMap.get(v.vehicle_id) || [];
    const hasTrips = trips.length > 0;
    const hasRunning = trips.some((o) => o.order_status === "running");
    const hasTransporting = trips.some((o) => o.order_status === "transporting");
    const accentColor = hasTransporting
      ? "#f59e0b"
      : hasRunning
        ? "#0ea5e9"
        : hasTrips
          ? "#10b981"
          : "#94a3b8";
    const hoverBorder = hasTransporting
      ? "rgba(245, 158, 11, 0.4)"
      : hasRunning
        ? "rgba(14, 165, 233, 0.4)"
        : hasTrips
          ? "rgba(16, 185, 129, 0.4)"
          : "rgba(148, 163, 184, 0.3)";
    const chipClass = hasTransporting
      ? "dd-chip-amber"
      : hasRunning
        ? "dd-chip-sky"
        : "dd-chip-emerald";
    const stats = vehicleStatsMap.get(v.vehicle_id);
    const stopDurationStr = stats
      ? formatDuration(
          stats.totalStopMins,
          stats.stopHours,
          stats.stopMinsRemain,
          tCommon("hour"),
          tCommon("minute")
        )
      : "";
    const mixTotalDurationStr = stats
      ? formatDuration(
          stats.totalMixMins,
          stats.mixTotalHours,
          stats.mixTotalMinsRemain,
          tCommon("hour"),
          tCommon("minute")
        )
      : "";

    return (
      <li
        key={v.vehicle_id}
        className="dd-surface px-2 py-1.5 transition-all relative overflow-hidden cursor-pointer"
        style={{ borderRadius: "6px", border: "1px solid var(--dd-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = hoverBorder)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--dd-border)")}
        onClick={() => setSelectedVehicleTrips({ vehicle: v, orders: trips })}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
        <div className="flex justify-between items-center pl-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold">
              {v.vehicle_license_plate}
              {v.vehicle_name ? ` | ${v.vehicle_name}` : ""}
            </span>
          </div>
          {hasTrips ? (
            <span className={`dd-chip ${chipClass} text-[10px] px-1.5 py-0.5`}>
              {hasTransporting
                ? t("collected")
                : hasRunning
                  ? t("moving")
                  : t("tripCount", { count: trips.length })}
            </span>
          ) : (
            <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">{t("noTrips")}</span>
          )}
        </div>
        {hasTrips && stats && (
          <div className="mt-1 pl-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {stats.totalDistanceKm > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: "#0ea5e9" }}
              >
                <Route className="w-3 h-3" />
                <span>{stats.totalDistanceKm.toFixed(1)} km</span>
              </div>
            )}
            <div
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: "#ec4899" }}
            >
              <MapPin className="w-3 h-3" />
              {Number.isNaN(stats.totalStops) ? (
                <>
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>
                  {stats.totalStops} {t("stops")}
                  {stats.totalStopSecs > 0 ? ` ( ${stopDurationStr} )` : ""}
                </span>
              )}
            </div>
            {stats.totalMins > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: "#f59e0b" }}
              >
                <Clock className="w-3 h-3" />
                <span>
                  {stats.hours > 0
                    ? `${stats.hours} ${tCommon("hour")} ${stats.mins} ${tCommon("minute")}`
                    : `${stats.mins} ${tCommon("minute")}`}
                </span>
              </div>
            )}
            {stats.totalMixMs > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                style={{ color: "#8b5cf6" }}
              >
                <Timer className="w-3 h-3" />
                <span>
                  {t("mixing")}: {mixTotalDurationStr}
                </span>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div
      className={`dashboard-light bg-cover bg-center ${isFullScreen ? "fixed inset-0 z-[100] bg-slate-50 h-screen" : "h-[calc(100vh-64px)]"} overflow-hidden flex flex-col`}
    >
      <div
        className={`p-2 lg:p-4 mx-auto bg-transparent w-full flex-1 flex flex-col min-h-0`}
        style={{ zoom: zoomLevel }}
      >
        {/* ═══ HEADER ═══ */}
        <div className="dd-header mb-2 p-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            {/* Title + Clock */}
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-xl font-black uppercase leading-none whitespace-nowrap">
                {t("title")}
              </h1>
              <div className="flex items-center gap-2 border-l border-slate-300 pl-3">
                <ClockDisplay locale={locale} />
              </div>
              {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.SYSTEM_SETTINGS) && (
                <div className="px-5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-300"
                        onClick={() => setIsSystemSettingsDialogOpen(true)}
                      >
                        <CalendarClock />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Cấu hình vận hành</p>
                    </TooltipContent>
                  </Tooltip>

                  <Dialog
                    open={isSystemSettingsDialogOpen}
                    onOpenChange={setIsSystemSettingsDialogOpen}
                  >
                    <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
                      <SystemSettingsForm />
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Zoom Control - LED style */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setZoomLevel((z) => {
                        const nextZoom = z === 1 ? 0.75 : 1;
                        const sidebarBtn = document.getElementById("sidebar-toggle-btn");
                        if (sidebarBtn) {
                          const isCollapsed = sidebarBtn.getAttribute("data-collapsed") === "true";
                          if (nextZoom === 0.75 && !isCollapsed) {
                            sidebarBtn.click();
                          } else if (nextZoom === 1 && isCollapsed) {
                            sidebarBtn.click();
                          }
                        }
                        return nextZoom;
                      });
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-sm font-bold uppercase cursor-pointer transition-all ${
                      zoomLevel === 1
                        ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                  >
                    {zoomLevel === 1 ? (
                      <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                    ) : (
                      <Radio className="h-2.5 w-2.5 text-sky-500 animate-pulse" />
                    )}
                    MONITOR
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{zoomLevel === 1 ? "Thu nhỏ giao diện (75%)" : "Khôi phục (100%)"}</p>
                </TooltipContent>
              </Tooltip>

              {/* LED Status */}
              {/* <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-sm font-bold uppercase cursor-default ${
                      isLedConnected
                        ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {isLedConnected ? (
                      <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                    ) : (
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: "#f87171",
                          boxShadow: "0 0 6px rgba(248, 113, 113, 0.5)",
                        }}
                      />
                    )}
                    LED
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isLedConnected ? "Bảng LED đang kết nối" : "Bảng LED đang mất kết nối"}</p>
                </TooltipContent>
              </Tooltip> */}

              {/* Network Status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    key={lastSignalTime?.toISOString() || "offline"}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-sm font-bold uppercase cursor-default ${
                      socketConnected
                        ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {socketConnected ? (
                      <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                    ) : (
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: "#f87171",
                          boxShadow: "0 0 6px rgba(248, 113, 113, 0.5)",
                        }}
                      />
                    )}
                    {socketConnected ? "ONLINE" : "OFFLINE"}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{socketConnected ? t("socketConnected") : t("socketDisconnected")}</p>
                </TooltipContent>
              </Tooltip>

              {/* Date Picker */}
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "font-bold justify-start text-left border-slate-200 bg-white/80 transition-all hover:bg-white hover:border-sky-400 focus-visible:ring-1 focus-visible:ring-sky-500",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="text-sky-500" />
                    {selectedDate ? (
                      format(new Date(selectedDate), "dd/MM/yyyy")
                    ) : (
                      <span>Chọn ngày</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    // captionLayout="dropdown"
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(format(date, "yyyy-MM-dd"));
                        setLoading(true);
                        setIsDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Action buttons: Nhật ký vận hành, Lịch sử, Đồng bộ ca */}
              <div className="border-l border-slate-200 pl-2 flex items-center gap-2">
                {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.CHECKLOG) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEndOfDayModalOpen(true)}
                        className="uppercase border-sky-200 text-sky-700 hover:bg-sky-50"
                      >
                        <Save /> Nhật ký vận hành
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Nhật ký vận hành {format(new Date(selectedDate), "dd/MM/yyyy")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.HISTORY) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenQueueHistory}
                        className="uppercase border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      >
                        <History />
                        Lịch sử
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Xem thứ tự lốt xe theo ngày</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <Dialog open={isQueueHistoryDialogOpen} onOpenChange={setIsQueueHistoryDialogOpen}>
                  <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="px-5 pt-5 pb-2 border-b bg-white">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <CalendarIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <DlgTitle className="text-2xl font-bold">Lịch sử lốt xe</DlgTitle>
                          <DialogDescription className="mt-1">
                            Chọn ngày để xem lịch sử thứ tự lốt xe cuối ngày.
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="px-5 space-y-3">
                      <div className="rounded-xl border bg-slate-100 p-3">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                          <div className="text-sm font-bold">Chọn ngày</div>
                          <Popover
                            open={isQueueHistoryDatePickerOpen}
                            onOpenChange={setIsQueueHistoryDatePickerOpen}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "text-sm font-bold justify-start text-left border-slate-200 transition-all shadow-none hover:bg-white hover:border-sky-400 focus-visible:ring-1 focus-visible:ring-sky-500",
                                  !queueHistoryDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="text-sky-500" />
                                {queueHistoryDate ? (
                                  format(new Date(queueHistoryDate), "dd/MM/yyyy")
                                ) : (
                                  <span>Chọn ngày</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={queueHistoryDate ? new Date(queueHistoryDate) : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    setQueueHistoryDate(format(date, "yyyy-MM-dd"));
                                    setIsQueueHistoryDatePickerOpen(false);
                                  }
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <Button
                            variant="primary"
                            onClick={() => fetchQueueHistory(queueHistoryDate)}
                            disabled={queueHistoryLoading || !queueHistoryDate}
                          >
                            {queueHistoryLoading ? (
                              <RefreshCw className="animate-spin" />
                            ) : (
                              <Search />
                            )}
                            Xem lịch sử
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50/40">
                        <div className="h-[50vh] max-h-[50vh] overflow-y-auto space-y-2">
                          {queueHistoryItems.map((item) => (
                            <div
                              key={`${item.order_id}-${item.position}`}
                              className="flex items-center gap-8 px-6 py-3 rounded-xl border hover:border-slate-200 hover:bg-slate-100 transition-all shadow-sm"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-base font-bold">
                                {item.position}
                              </span>
                              <div className="font-bold text-slate-800 truncate">
                                {item.vehicle_license_plate} | {item.vehicle_name}
                              </div>
                            </div>
                          ))}

                          {!queueHistoryLoading && queueHistoryItems.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                              <CalendarIcon className="h-8 w-8 opacity-20" />
                              <p className="text-sm italic">
                                Chưa có lịch sử lốt xe ngày {queueHistoryDateLabel}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="border-t bg-white px-5 py-3 sm:justify-between">
                      <div className="text-xs text-slate-500 font-semibold">
                        Tổng số {queueHistoryItems.length} kết quả
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsQueueHistoryDialogOpen(false)}
                        >
                          Đóng
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ COMMAND CORE GRID ═══ */}
        <div className={`flex ${isPastDate ? "" : "gap-4"} flex-1 min-h-0 overflow-hidden`}>
          {/* Left: Stations + Vehicles + Dispatch Center (70%) */}
          {!isPastDate && (
            <div
              className="flex flex-col gap-1.5 h-full min-h-0 animate-fade-up"
              style={{ flex: "7 1 0%", animationDelay: "0.2s" }}
            >
              {/* ═══ SYSTEM TELEMETRY ═══ */}
              <div className="shrink-0">
                <StationStatusPanel
                  stations={stations}
                  orders={orders}
                  deviceStationStatusMap={stationStatusMap}
                  onStationUpdated={fetchAll}
                  pendingOrders={activeFlowOrders}
                  hasManualFallbackAccess={hasActionAccess(
                    SIDEBAR.DASHBOARD,
                    PERMISSIONS.DASHBOARD.MANUAL_CAMERA_FALLBACK
                  )}
                  yardOrders={yardOrders}
                  isPastDate={isPastDate}
                />
              </div>

              {/* Vehicles + Dispatch side by side */}
              <div className="flex gap-2 flex-1 min-h-0">
                {/* Vehicles Column: Xe trong bãi + Dừng/Bảo trì stacked vertically */}
                <div className="flex flex-col gap-1.5 shrink-0 min-h-0" style={{ width: "350px" }}>
                  {/* Ready Vehicles */}
                  <div
                    className="flex flex-col overflow-hidden dd-card min-h-0"
                    style={{ flex: "6 1 0%" }}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 text-sm font-extrabold uppercase"
                      style={{ borderBottom: "1px solid var(--dd-border)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{t("mixerVehiclesInYard")}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setIsOtherVehiclesInYardDialogOpen(true)}
                              className="h-6 w-6 text-sky-500 hover:text-sky-700 hover:bg-sky-50"
                            >
                              <LayoutGrid />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>
                              {t("otherVehiclesInYardTitle")} ({otherVehiclesInYard.length})
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleYardEntryTime}
                              className="h-6 w-6 text-slate-500 hover:text-slate-700"
                              aria-label={
                                showYardEntryTime ? t("hideYardEntryTime") : t("showYardEntryTime")
                              }
                            >
                              {showYardEntryTime ? <EyeOff /> : <Eye />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>
                              {showYardEntryTime ? t("hideYardEntryTime") : t("showYardEntryTime")}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-sm font-extrabold">
                          {inYardVehicles.length} {t("vehicleCount")}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-y-auto p-0 flex-1">
                      {inYardVehicles.length === 0 ? (
                        <div className="flex h-full items-center justify-center p-3">
                          <span
                            className="text-xs font-bold uppercase"
                            style={{ color: "var(--dd-text-muted)" }}
                          >
                            {t("noReadyVehicles")}
                          </span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-1 px-2 py-2">
                          {inYardVehicles.map((v) => {
                            const orderInitTime = getVehicleOrderInitTime(
                              yardOrderInitTimeByVehicleKey,
                              v.license_plate,
                              v.vehicle_name
                            );

                            return (
                              <li
                                key={v.device_id}
                                className="justify-between flex items-center gap-2 px-3 py-2 transition-colors rounded-md border shadow-sm cursor-default hover:shadow-md"
                                style={{
                                  background: "var(--dd-bg-surface)",
                                  borderColor: "var(--dd-border)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.borderColor = "var(--dd-emerald)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.borderColor = "var(--dd-border)")
                                }
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-black text-sm truncate">
                                    {v.license_plate}
                                    {v.vehicle_name ? ` | ${v.vehicle_name}` : ""}
                                  </span>
                                </div>
                                <div className="text-xs font-semibold flex flex-col items-end">
                                  <span style={{ color: "var(--dd-text-muted)" }}>
                                    {v.distance >= 1000
                                      ? `${(v.distance / 1000).toFixed(1)} km`
                                      : `${v.distance} m`}
                                  </span>
                                  {showYardEntryTime && (
                                    <div className="flex flex-row items-end gap-3">
                                      <span>
                                        {orderInitTime
                                          ? vehicleTimeFormatter.format(new Date(orderInitTime))
                                          : "--:--:--"}
                                      </span>
                                      <span>
                                        {orderInitTime
                                          ? vehicleDateFormatter.format(new Date(orderInitTime))
                                          : "--/--/----"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Canceled / Stopped */}
                  <div
                    className="flex flex-col overflow-hidden dd-card min-h-0"
                    style={{ flex: "3 1 0%", borderColor: "rgba(245, 158, 11, 0.2)" }}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 text-sm font-extrabold uppercase"
                      style={{
                        background: "var(--dd-bg-header)",
                        color: "var(--dd-text-primary)",
                        borderBottom: "1px solid var(--dd-border)",
                      }}
                    >
                      <span>{t("stoppedMaintenance")}</span>
                      <span className="text-sm font-extrabold">
                        {stoppedMaintenanceList.length} {t("vehicleCount")}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                      {stoppedMaintenanceList.length === 0 ? (
                        <div className="flex h-full items-center justify-center p-2">
                          <span
                            className="text-xs font-bold uppercase"
                            style={{ color: "var(--dd-text-muted)" }}
                          >
                            {t("empty")}
                          </span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-1 px-2 py-2">
                          {stoppedMaintenanceList.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between px-2 py-1 rounded-md border shadow-sm cursor-default"
                              style={{
                                background: "var(--dd-bg-surface)",
                                borderColor: "var(--dd-border)",
                              }}
                            >
                              <span
                                className="text-xs font-bold truncate pr-2"
                                style={{ color: "var(--dd-text-primary)" }}
                              >
                                {item.label}
                              </span>
                              <span
                                className={`dd-chip text-[10px] px-1.5 py-0.5 ${item.chipClass}`}
                              >
                                {item.statusLabel}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dispatch Center */}
                <div
                  className="flex flex-1 flex-col h-full min-h-0 dd-card overflow-hidden"
                  style={{
                    boxShadow: "0 0 20px rgba(14, 165, 233, 0.05)",
                    border: "1px solid rgba(14, 165, 233, 0.2)",
                  }}
                >
                  {/* Core Header with Toggle */}
                  <div
                    className="flex items-center justify-between p-2 relative z-10"
                    style={{
                      background: "var(--dd-bg-header)",
                      borderBottom: "1px solid var(--dd-border)",
                    }}
                  >
                    <div className="flex items-center gap-2 ms-4">
                      <div
                        className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0"
                        style={{
                          background: "#0ea5e9",
                          boxShadow: "0 0 10px rgba(14, 165, 233, 0.8)",
                        }}
                      />
                      <span className="text-base font-extrabold uppercase" title="Thứ tự lốt xe">
                        Thứ tự lốt xe
                      </span>
                    </div>

                    {/* Segmented Toggle HUD */}
                    <div
                      className="flex items-center rounded-md backdrop-blur-md shrink-0 gap-1"
                      style={{
                        background: "var(--dd-bg-surface)",
                        border: "1px solid var(--dd-border)",
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDispatchMode("auto")}
                        className={cn(
                          "h-5 px-2 text-[10px] font-bold uppercase border border-transparent",
                          dispatchMode === "auto"
                            ? "bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        AUTO
                      </Button>
                      {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.MANUAL_SORT) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDispatchMode("manual")}
                          className={cn(
                            "h-5 px-2 text-[10px] font-bold uppercase border border-transparent",
                            dispatchMode === "manual"
                              ? "bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          MANUAL
                        </Button>
                      )}

                      {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.VIEW_MAP) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowMap(true)}
                          className="h-5 px-2 text-[10px] font-bold uppercase text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-100"
                        >
                          <MapIcon className="shrink-0" />
                          MAP
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Core Display Area */}
                  <div className="flex-1 overflow-hidden relative bg-transparent p-2">
                    <div className="flex h-full flex-col gap-2">
                      <div className="min-h-0 flex-1 overflow-y-auto w-full scrollbar-hide">
                        <div className="h-full">
                          <ActivityFlow
                            stations={stations}
                            vehicles={vehicles}
                            orders={activeFlowOrders}
                            dispatchMode={dispatchMode}
                            disableDrag={true}
                            onOrdersUpdated={fetchAll}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* end: Vehicles + Dispatch side by side */}
              </div>
            </div>
          )}

          {/* Right: Today's Trips by Vehicle (30%) */}
          {hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.ORDER_DETAIL) &&
            !isPastDate && (
              <div
                className="flex flex-col gap-1.5 h-full min-h-0 animate-fade-up"
                style={{ flex: "3 1 0%", animationDelay: "0.6s" }}
              >
                {/* Section 1: Mixer Vehicles (Xe bồn) */}
                <div
                  className="flex flex-col overflow-hidden dd-card min-h-0"
                  style={{ flex: "6 1 0%", borderColor: "rgba(16, 185, 129, 0.2)" }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 text-sm font-extrabold uppercase"
                    style={{ borderBottom: "1px solid var(--dd-border)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("mixerVehicles")}</span>
                      <span className="text-sm font-extrabold">
                        ({mixerVehicles.length} {t("vehicleCount")})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ordersCompleted.filter((o) =>
                        o.vehicles?.vehicle_name?.toUpperCase().startsWith("X")
                      ).length > 0 && (
                        <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                          {
                            ordersCompleted.filter((o) =>
                              o.vehicles?.vehicle_name?.toUpperCase().startsWith("X")
                            ).length
                          }{" "}
                          {t("completed")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                    {mixerVehicles.length === 0 ? (
                      <div className="flex h-full items-center justify-center p-3">
                        <span
                          className="text-xs font-bold uppercase"
                          style={{ color: "var(--dd-text-muted)" }}
                        >
                          {t("noTrips")}
                        </span>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-1.5 p-2">
                        {mixerVehicles.map((v) => renderVehicleTripListItem(v))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Section 2: Other Vehicles (Xe khác) */}
                <div
                  className="flex flex-col overflow-hidden dd-card min-h-0"
                  style={{ flex: "3 1 0%", borderColor: "rgba(148, 163, 184, 0.2)" }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 text-sm font-extrabold uppercase"
                    style={{
                      background: "var(--dd-bg-header)",
                      borderBottom: "1px solid var(--dd-border)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("otherVehicleTypes")}</span>
                      <span className="text-sm font-extrabold">
                        ({otherVehicleTypes.length} {t("vehicleCount")})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ordersCompleted.filter(
                        (o) => !o.vehicles?.vehicle_name?.toUpperCase().startsWith("X")
                      ).length > 0 && (
                        <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                          {
                            ordersCompleted.filter(
                              (o) => !o.vehicles?.vehicle_name?.toUpperCase().startsWith("X")
                            ).length
                          }{" "}
                          {t("completed")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                    {otherVehicleTypes.length === 0 ? (
                      <div className="flex h-full items-center justify-center p-3">
                        <span
                          className="text-xs font-bold uppercase"
                          style={{ color: "var(--dd-text-muted)" }}
                        >
                          {t("empty")}
                        </span>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-1.5 p-2">
                        {otherVehicleTypes.map((v) => renderVehicleTripListItem(v))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Past date: full-width Today's Trips by Vehicle */}
          {isPastDate && (
            <div
              className="flex-1 h-full min-h-0 animate-fade-up"
              style={{ animationDelay: "0.6s" }}
            >
              <div
                className="flex h-full flex-col overflow-hidden dd-card"
                style={{ borderColor: "rgba(16, 185, 129, 0.2)" }}
              >
                <div
                  className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase"
                  style={{
                    background: "var(--dd-bg-header)",
                    color: "var(--dd-text-primary)",
                    borderBottom: "1px solid var(--dd-border)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("completedToday")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ordersCompleted.length > 0 && (
                      <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                        {ordersCompleted.length} {t("completed")}
                      </span>
                    )}
                    <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">
                      {vehicles.length} xe
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sortedVehiclesWithTrips.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center justify-center">
                        <div
                          className="h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-md"
                          style={{
                            background: "var(--dd-bg-surface)",
                            border: "2px dashed var(--dd-border)",
                          }}
                        >
                          <Truck className="h-6 w-6 text-emerald-400 opacity-50" />
                        </div>
                        <span
                          className="mt-3 text-xs font-bold uppercase"
                          style={{ color: "var(--dd-text-muted)" }}
                        >
                          {t("noCompletedToday")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5 p-2">
                      {sortedVehiclesWithTrips.map((v) => {
                        const trips = vehicleTripMap.get(v.vehicle_id) || [];
                        const hasTrips = trips.length > 0;
                        const accentColor = hasTrips ? "#10b981" : "#94a3b8";
                        const hoverBorder = hasTrips
                          ? "rgba(16, 185, 129, 0.4)"
                          : "rgba(148, 163, 184, 0.3)";
                        const stats = vehicleStatsMap.get(v.vehicle_id);
                        const stopDurationStr = stats
                          ? formatDuration(
                              stats.totalStopMins,
                              stats.stopHours,
                              stats.stopMinsRemain,
                              tCommon("hour"),
                              tCommon("minute")
                            )
                          : "";
                        const mixTotalDurationStr = stats
                          ? formatDuration(
                              stats.totalMixMins,
                              stats.mixTotalHours,
                              stats.mixTotalMinsRemain,
                              tCommon("hour"),
                              tCommon("minute")
                            )
                          : "";
                        return (
                          <li
                            key={v.vehicle_id}
                            className="dd-surface px-2 py-1.5 transition-all relative overflow-hidden cursor-pointer"
                            style={{ borderRadius: "6px", border: "1px solid var(--dd-border)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = hoverBorder)}
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.borderColor = "var(--dd-border)")
                            }
                            onClick={() => setSelectedVehicleTrips({ vehicle: v, orders: trips })}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-1"
                              style={{ background: accentColor }}
                            />
                            <div className="flex justify-between items-center pl-2">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: "var(--dd-text-primary)" }}
                                >
                                  {v.vehicle_license_plate}
                                  {v.vehicle_name ? ` | ${v.vehicle_name}` : ""}
                                </span>
                              </div>
                              {hasTrips ? (
                                <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                                  {t("tripCount", { count: trips.length })}
                                </span>
                              ) : (
                                <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">
                                  {t("noTrips")}
                                </span>
                              )}
                            </div>
                            {hasTrips && stats && (
                              <div className="mt-1.5 pl-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {stats.totalDistanceKm > 0 && (
                                  <div
                                    className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                                    style={{ color: "#0ea5e9" }}
                                  >
                                    <Route className="w-3 h-3" />
                                    <span>{stats.totalDistanceKm.toFixed(1)} km</span>
                                  </div>
                                )}
                                <div
                                  className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                                  style={{ color: "#ec4899" }}
                                >
                                  <MapPin className="w-3 h-3" />
                                  {Number.isNaN(stats.totalStops) ? (
                                    <>
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Loading...</span>
                                    </>
                                  ) : (
                                    <span>
                                      {stats.totalStops} {t("stops")}
                                      {stats.totalStopSecs > 0 ? ` ( ${stopDurationStr} )` : ""}
                                    </span>
                                  )}
                                </div>
                                {stats.totalMins > 0 && (
                                  <div
                                    className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                                    style={{ color: "#f59e0b" }}
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>
                                      {stats.hours > 0
                                        ? `${stats.hours} ${tCommon("hour")} ${stats.mins} ${tCommon("minute")}`
                                        : `${stats.mins} ${tCommon("minute")}`}
                                    </span>
                                  </div>
                                )}
                                {stats.totalMixMs > 0 && (
                                  <div
                                    className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                                    style={{ color: "#8b5cf6" }}
                                  >
                                    <Timer className="w-3 h-3" />
                                    <span>
                                      {t("mixing")}: {mixTotalDurationStr}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        {/* <div className="mt-1 flex justify-between pt-1 shrink-0 items-center whitespace-nowrap"
          style={{ borderTop: '1px solid var(--dd-border)' }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase"
            style={{ color: 'var(--dd-text-muted)' }}>
            <span className="dd-chip dd-chip-red flex items-center gap-1 px-1.5 py-0.5 text-[10px]">
              <div className="h-1 w-1 rounded-full animate-ping" style={{ background: '#f87171' }} />
              {t('systemSignal')}
            </span>
            <span>{t('systemListening')}</span>
          </div>
          <p className="text-[10px] uppercase" style={{ color: 'var(--dd-text-muted)' }}>
            {t('connectionStable')} • {t('plantName')}
          </p>
        </div> */}
      </div>

      {/* ═══ TRIP DETAIL DIALOG ═══ */}
      <Dialog
        open={!!selectedVehicleTrips}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVehicleTrips(null);
            setShowVehicleLocation(false);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-4xl max-h-[80vh] p-0 gap-0 overflow-hidden flex flex-col"
          showCloseButton={false}
        >
          {selectedVehicleTrips &&
            (() => {
              const { vehicle, orders: tripOrders } = selectedVehicleTrips;
              const stats = computeTripStats(tripOrders);
              const stopDurationStr = formatDuration(
                stats.totalStopMins,
                stats.stopHours,
                stats.stopMinsRemain,
                tCommon("hour"),
                tCommon("minute")
              );
              const mixTotalDurationStr = formatDuration(
                stats.totalMixMins,
                stats.mixTotalHours,
                stats.mixTotalMinsRemain,
                tCommon("hour"),
                tCommon("minute")
              );
              const outsideYardWithoutLoadCount = tripOrders.filter(
                isOutsideYardWithoutLoadOrder
              ).length;

              return (
                <div className="flex flex-col flex-1 min-h-0">
                  {/* Header */}
                  <div className="bg-slate-300 px-4 py-3 shrink-0 border-b">
                    <div className="flex items-center justify-between">
                      <DlgTitle className="flex items-center gap-6 font-bold uppercase">
                        {vehicle.vehicle_license_plate}
                        {vehicle.vehicle_name ? ` | ${vehicle.vehicle_name}` : ""}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setShowVehicleLocation(true)}
                        >
                          {t("viewLocation")}
                        </Button>
                      </DlgTitle>
                      <div className="flex items-center gap-10 ms-2">
                        <VehicleStatusChange
                          vehicleId={vehicle.vehicle_id}
                          currentStatus={vehicle.vehicle_status}
                          vehiclePlate={vehicle.vehicle_license_plate}
                          onStatusChanged={fetchAll}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setSelectedVehicleTrips(null)}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Trip List */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {tripOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <div
                          className="h-14 w-14 rounded-full flex items-center justify-center"
                          style={{
                            background: "var(--dd-bg-surface)",
                            border: "2px dashed var(--dd-border)",
                          }}
                        >
                          <Truck
                            className="h-6 w-6 opacity-30"
                            style={{ color: "var(--dd-text-muted)" }}
                          />
                        </div>
                        <span
                          className="mt-3 text-sm font-bold uppercase"
                          style={{ color: "var(--dd-text-muted)" }}
                        >
                          {t("noTrips")}
                        </span>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {tripOrders.map((o, idx) => {
                          const distanceKm = o.order_multi
                            ? o.order_multi.distance_end - o.order_multi.distance_start
                            : 0;
                          const stops = o.order_multi
                            ? o.order_multi.nStop_end - o.order_multi.nStop_start
                            : 0;
                          const stopSecs =
                            o.order_multi && o.order_multi.stop_duration_seconds
                              ? o.order_multi.stop_duration_seconds
                              : 0;
                          const diffMs =
                            o.order_start_datetime && o.order_end_datetime
                              ? new Date(o.order_end_datetime).getTime() -
                                new Date(o.order_start_datetime).getTime()
                              : 0;
                          const diffMins = Math.floor(diffMs / 60000);
                          const h = Math.floor(diffMins / 60);
                          const m = diffMins % 60;
                          const stopMins = Math.floor(stopSecs / 60);
                          const stopH = Math.floor(stopMins / 60);
                          const stopM = stopMins % 60;
                          const orderStopDurationStr = formatDuration(
                            stopMins,
                            stopH,
                            stopM,
                            tCommon("hour"),
                            tCommon("minute")
                          );

                          const mixInVal =
                            o.order_multi?.checkin_time_station || o.checkin_time_station;
                          const mixOutVal =
                            o.order_multi?.checkout_time_station || o.checkout_time_station;
                          const mixIn = mixInVal ? new Date(mixInVal).getTime() : 0;
                          const mixOut = mixOutVal ? new Date(mixOutVal).getTime() : 0;
                          const mixMs = mixIn > 0 && mixOut > 0 ? mixOut - mixIn : 0;
                          const mixMinsTotal = Math.floor(mixMs / 60000);
                          const mixH = Math.floor(mixMinsTotal / 60);
                          const mixM = mixMinsTotal % 60;
                          const orderMixDurationStr = formatDuration(
                            mixMinsTotal,
                            mixH,
                            mixM,
                            tCommon("hour"),
                            tCommon("minute")
                          );
                          const isTripActive =
                            o.order_status === "running" || o.order_status === "transporting";
                          const isOutsideYardWithoutLoad = isOutsideYardWithoutLoadOrder(o);

                          return (
                            <Card
                              key={o.order_id}
                              className="relative overflow-hidden border shadow-sm"
                            >
                              <div
                                className={`absolute left-0 top-0 bottom-0 w-1 ${isOutsideYardWithoutLoad ? "bg-amber-500" : isTripActive ? "bg-sky-500" : "bg-emerald-500"}`}
                              />
                              <CardContent>
                                <div className="px-2 space-y-2">
                                  {/* Trip number + Station */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`text-sm font-black rounded-full px-2.5 py-0.5 ${
                                          isTripActive
                                            ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                        }`}
                                      >
                                        {tripOrders.length - idx}
                                      </Badge>
                                      <span className="text-sm font-bold uppercase text-slate-900">
                                        {o.stations?.station_name || t("unassigned")}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {isOutsideYardWithoutLoad && (
                                        <Badge
                                          variant="outline"
                                          className="bg-amber-50 text-amber-700 border-amber-300 text-sm px-2 py-0.5 font-semibold shadow-none"
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                          {t("outsideYardWithoutLoadLabel")}
                                        </Badge>
                                      )}
                                      {/* {o.order_status === 'running' && (
                                      <Button size="sm" variant="primary" onClick={() => setShowVehicleLocation(true)}>
                                        {t('viewLocation')}
                                      </Button>
                                    )} */}
                                      <Badge
                                        variant="secondary"
                                        className={`${isTripActive ? "bg-sky-100 text-sky-600 hover:bg-sky-200" : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"} text-sm px-2 py-0.5 font-semibold border-transparent shadow-none`}
                                      >
                                        {o.order_status === "running"
                                          ? t("moving")
                                          : o.order_status === "transporting"
                                            ? t("collected")
                                            : t("completed")}
                                      </Badge>
                                    </div>
                                  </div>
                                  {/* Time row */}
                                  <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-1.5">
                                      <Clock size={14} className="text-sky-500" />
                                      <span className="font-semibold text-slate-700">
                                        {o.order_start_datetime ? (
                                          new Date(o.order_start_datetime).toLocaleTimeString(
                                            locale === "vi" ? "vi-VN" : "en-US",
                                            { hour: "2-digit", minute: "2-digit" }
                                          )
                                        ) : (
                                          <Ellipsis size={20} />
                                        )}
                                      </span>
                                      <ArrowRight size={14} />
                                      <span className="font-semibold text-slate-700">
                                        {o.order_end_datetime ? (
                                          new Date(o.order_end_datetime).toLocaleTimeString(
                                            locale === "vi" ? "vi-VN" : "en-US",
                                            { hour: "2-digit", minute: "2-digit" }
                                          )
                                        ) : (
                                          <Ellipsis size={20} />
                                        )}
                                      </span>
                                    </div>
                                    {diffMins > 0 && (
                                      <span className="font-bold text-amber-500">
                                        {h > 0
                                          ? `${h} ${tCommon("hour")} ${m} ${tCommon("minute")}`
                                          : `${m} ${tCommon("minute")}`}
                                      </span>
                                    )}
                                  </div>
                                  {/* Distance + Stops */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    {distanceKm > 0 && (
                                      <div className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-sky-500">
                                        <Route size={14} />
                                        <span>{distanceKm.toFixed(1)} km</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-pink-500">
                                      <MapPin size={14} />
                                      {Number.isNaN(stops) ? (
                                        <>
                                          <RefreshCw size={14} className="animate-spin" />
                                          <span>Loading...</span>
                                        </>
                                      ) : (
                                        <span>
                                          {stops} {t("stops")}
                                          {stopSecs > 0 ? ` (${orderStopDurationStr})` : ""}
                                        </span>
                                      )}
                                    </div>
                                    {mixMs > 0 && (
                                      <div className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-violet-500">
                                        <Timer size={14} />
                                        <span>
                                          {t("mixing")}: {orderMixDurationStr}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Summary Footer */}
                  {tripOrders.length > 0 && (
                    <div className="shrink-0 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t">
                      <span className="text-base font-bold uppercase">{t("tripSummary")}</span>
                      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-x-4 gap-y-2">
                        <div
                          className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                          style={{ color: "#10b981" }}
                        >
                          <CheckCircle2 size={16} />
                          <span>
                            {tripOrders.filter((o) => o.order_status === "completed").length}{" "}
                            {t("completed")}
                          </span>
                        </div>
                        {stats.totalDistanceKm > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                            style={{ color: "#0ea5e9" }}
                          >
                            <Route size={16} />
                            <span>{stats.totalDistanceKm.toFixed(1)} km</span>
                          </div>
                        )}
                        {stats.totalMins > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                            style={{ color: "#f59e0b" }}
                          >
                            <Clock size={16} />
                            <span>
                              {stats.hours > 0
                                ? `${stats.hours} ${tCommon("hour")} ${stats.mins} ${tCommon("minute")}`
                                : `${stats.mins} ${tCommon("minute")}`}
                            </span>
                          </div>
                        )}
                        <div
                          className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                          style={{ color: "#ec4899" }}
                        >
                          <MapPin size={16} />
                          {Number.isNaN(stats.totalStops) ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Loading...</span>
                            </>
                          ) : (
                            <span>
                              {stats.totalStops} {t("stops")}
                              {stats.totalStopSecs > 0 ? ` (${stopDurationStr})` : ""}
                            </span>
                          )}
                        </div>
                        {stats.totalMixMs > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                            style={{ color: "#8b5cf6" }}
                          >
                            <Timer size={16} />
                            <span>
                              {t("mixing")}: {mixTotalDurationStr}
                            </span>
                          </div>
                        )}
                        {outsideYardWithoutLoadCount > 0 && (
                          <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap text-amber-600">
                            <AlertTriangle size={16} />
                            <span>
                              {t("outsideYardWithoutLoadCount", {
                                count: outsideYardWithoutLoadCount,
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* ═══ OTHER VEHICLES IN YARD DIALOG ═══ */}
      <Dialog
        open={isOtherVehiclesInYardDialogOpen}
        onOpenChange={setIsOtherVehiclesInYardDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl max-h-[70vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="bg-slate-50 px-4 py-3 shrink-0 border-b">
            <DlgTitle className="text-base font-bold uppercase flex items-center gap-2">
              <Truck className="w-5 h-5 text-sky-500" />
              {t("otherVehiclesInYardTitle")}
            </DlgTitle>
            <DialogDescription>{t("otherVehiclesInYardDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 overscroll-contain">
            {otherVehiclesInYard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                <Truck className="h-10 w-10 mb-2" />
                <span className="text-sm font-bold uppercase">{t("noReadyVehicles")}</span>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {otherVehiclesInYard.map((v) => (
                  <li
                    key={v.device_id}
                    className="bg-white p-3 rounded-md border border-[#cbd5e1] flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base">
                        {v?.license_plate} | {v?.vehicle_name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-1">
                        <MapPin size={15} />
                        <span>
                          {v.distance >= 1000
                            ? `${(v.distance / 1000).toFixed(1)} km`
                            : `${v.distance} m`}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-bold",
                          v.status === "run"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {v.status === "run" ? t("moving") : t("stopped")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* <DialogFooter className="p-3 bg-slate-50 border-t">
            <Button onClick={() => setIsOtherVehiclesInYardDialogOpen(false)} variant="primary" size="sm" className="uppercase font-bold">
              {tCommon('back')}
            </Button>
          </DialogFooter> */}
        </DialogContent>
      </Dialog>

      {/* ═══ MAP DIALOG ═══ */}
      <Dialog
        open={showMap}
        onOpenChange={(open) => {
          if (!open) {
            setShowMap(false);
            setMapSearch("");
            setFocusVehicleId(null);
            setMapStatusFilter("all");
          }
        }}
      >
        <DialogContent
          className="max-w-7xl sm:max-w-7xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden"
          showCloseButton={false}
        >
          <div className="flex h-full overflow-hidden">
            {/* Left: Vehicle Search */}
            <div
              className="w-75 shrink-0 flex flex-col border-r"
              style={{ borderColor: "var(--dd-border)" }}
            >
              <DialogHeader
                className="p-4 shrink-0"
                style={{ borderBottom: "1px solid var(--dd-border)" }}
              >
                <DlgTitle className="text-base font-bold uppercase flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-sky-500" />
                  {t("searchVehicle")}
                </DlgTitle>
              </DialogHeader>
              <div
                className="px-3 py-2 shrink-0"
                style={{ borderBottom: "1px solid var(--dd-border)" }}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <Input
                    type="text"
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder={t("searchVehicle")}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
              {/* Status Filter */}
              <div
                className="flex items-center gap-1.5 px-3 py-2 shrink-0"
                style={{ borderBottom: "1px solid var(--dd-border)" }}
              >
                {(
                  [
                    {
                      key: "all",
                      label: t("all") || "Tất cả",
                      color: "#64748b",
                      bg: "rgba(100,116,139,0.1)",
                    },
                    {
                      key: "run",
                      label: t("running"),
                      color: "#10b981",
                      bg: "rgba(16,185,129,0.1)",
                    },
                    {
                      key: "park",
                      label: t("stopped"),
                      color: "#f59e0b",
                      bg: "rgba(245,158,11,0.1)",
                    },
                    {
                      key: "offline",
                      label: t("disconnected"),
                      color: "#94a3b8",
                      bg: "rgba(148,163,184,0.1)",
                    },
                  ] as const
                ).map((f) => (
                  <Button
                    key={f.key}
                    variant={mapStatusFilter === f.key ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setMapStatusFilter(f.key)}
                    className="h-7 px-2.5 text-xs font-bold rounded-md"
                    style={{
                      background: mapStatusFilter === f.key ? f.bg : "transparent",
                      color: mapStatusFilter === f.key ? f.color : "var(--dd-text-muted)",
                      borderColor: mapStatusFilter === f.key ? f.color + "40" : "transparent",
                    }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain p-2">
                {mapVehicles.map((v) => {
                  const isActive = focusVehicleId === v.device_id;
                  const displayStatus = getVtrackingDisplayStatus(v.status, v.timestamp);
                  const statusColor =
                    displayStatus === "run"
                      ? "#10b981"
                      : displayStatus === "park"
                        ? "#f59e0b"
                        : "#94a3b8";
                  const statusLabel =
                    displayStatus === "run"
                      ? t("running")
                      : displayStatus === "park"
                        ? t("stopped")
                        : t("disconnected");

                  return (
                    <Button
                      key={v.device_id}
                      variant={isActive ? "outline" : "ghost"}
                      onClick={() => setFocusVehicleId(v.device_id)}
                      className={`w-full justify-start h-auto p-3 mb-1.5 transition-all flex-col items-stretch ${
                        isActive
                          ? "border-sky-400 bg-sky-50 shadow-sm"
                          : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-3 w-3 rounded-full shrink-0 border-2 border-white shadow-sm"
                          style={{
                            background: statusColor,
                          }}
                        />
                        <span
                          className="text-sm font-bold"
                          style={{ color: "var(--dd-text-primary)" }}
                        >
                          {v.license_plate}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 pl-5 flex items-center justify-between text-xs"
                        style={{ color: "var(--dd-text-muted)" }}
                      >
                        <span>{statusLabel}</span>
                        <span className="font-semibold tabular-nums">{v.speed} km/h</span>
                      </div>
                      <div
                        className="mt-0.5 pl-5 text-xs text-left"
                        style={{ color: "var(--dd-text-muted)" }}
                      >
                        {v.distance >= 1000
                          ? `${(v.distance / 1000).toFixed(1)} km`
                          : `${v.distance} m`}
                      </div>
                    </Button>
                  );
                })}
                {vtrackingVehicles.length === 0 && (
                  <div
                    className="flex items-center justify-center h-32 text-sm font-bold uppercase"
                    style={{ color: "var(--dd-text-muted)" }}
                  >
                    {t("empty")}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Map */}
            <div className="flex-1 relative">
              <StationMap
                stationLongitude={geofenceStation?.station_gps_longitude ?? null}
                stationLatitude={geofenceStation?.station_gps_latitude ?? null}
                radius={geofenceStation?.station_gps_geofencing || 500}
                vehicles={vtrackingVehicles}
                focusVehicle={focusVehicle}
                focusDeviceId={focusVehicleId}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedVehicleTrips && (
        <VehicleLocationDialog
          open={showVehicleLocation}
          onOpenChange={setShowVehicleLocation}
          vehicleLicensePlate={selectedVehicleTrips.vehicle.vehicle_license_plate}
          vehicleName={selectedVehicleTrips.vehicle.vehicle_name}
          cachedVehicles={vtrackingVehicles}
          t={t}
        />
      )}

      <EndOfDayModal
        open={isEndOfDayModalOpen}
        onCancel={() => setIsEndOfDayModalOpen(false)}
        onAccept={() => {
          toast.success("Đã chốt ngày thành công");
        }}
      />
    </div>
  );
}
