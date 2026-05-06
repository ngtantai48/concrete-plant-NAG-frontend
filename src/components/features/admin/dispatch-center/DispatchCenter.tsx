"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN } from "@/constants/route";
import { useAppSelector } from "@/hooks/use-app-selector";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { cn } from "@/lib/utils";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import type { VtrackingVehicle } from "@/types/vtracking";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CalendarClock,
  ChevronRight,
  Clock3,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Truck,
  TruckIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { DispatchMapStatus, DispatchMapVehicle } from "./DispatchCenterMap";

const DispatchCenterMap = dynamic(() => import("./DispatchCenterMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-[26px] bg-slate-100 text-sm font-semibold text-slate-500">
      Đang tải bản đồ...
    </div>
  ),
});

type VehicleStatusFilter = "all" | DispatchMapStatus;

interface DispatchVehicle extends DispatchMapVehicle {
  stationName: string;
  statusLabel: string;
  dispatchLabel: string;
  updatedAtText: string;
  locationText: string;
  distanceText: string;
  runtimeText: string;
  waitTimeText: string;
  activeOrderLabel: string;
  noteText: string;
  queuePosition?: number;
  inYard: boolean;
  order: Order | null;
}

interface TimelineItem {
  id: string;
  level: "info" | "success" | "warning";
  title: string;
  description: string;
  timeText: string;
  vehicleId?: string | null;
}

interface AlertItem {
  id: string;
  title: string;
  description: string;
  timeText: string;
  vehicleId?: string | null;
  severity: "warning" | "critical";
}

const panelClass =
  "rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)]";

const getTodayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const normalizeVehicleKey = (value?: string | null) => value?.trim().toUpperCase() || "";

const formatMinutes = (minutes: number, shortHour: string, shortMinute: string) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return `0 ${shortMinute}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainMinutes} ${shortMinute}`;
  }

  if (remainMinutes <= 0) {
    return `${hours} ${shortHour}`;
  }

  return `${hours} ${shortHour} ${remainMinutes} ${shortMinute}`;
};

const formatDistanceKm = (meters?: number | null) => {
  if (!Number.isFinite(meters)) {
    return "--";
  }

  if ((meters ?? 0) < 1000) {
    return `${Math.round(meters ?? 0)} m`;
  }

  return `${((meters ?? 0) / 1000).toFixed(1)} km`;
};

const uniqueOrders = (orders: Order[]) => {
  const map = new Map<number, Order>();
  orders.forEach((order) => {
    map.set(order.order_id, order);
  });
  return Array.from(map.values());
};

const getVtrackingDisplayStatus = (status: string, timestamp?: number) => {
  const isStale = timestamp ? Date.now() - timestamp > 10 * 60 * 1000 : false;
  if (isStale) return "offline";

  const normalizedStatus = (status || "").toLowerCase();
  if (["run", "running"].includes(normalizedStatus)) return "run";
  if (["stop", "park", "idle", "parking", "stopped"].includes(normalizedStatus)) return "park";
  return "offline";
};

const getOrderReferenceTime = (order: Order) =>
  new Date(
    order.order_end_datetime ||
      order.order_start_datetime ||
      order.updated_at ||
      order.order_init_datetime,
  ).getTime();

const getCurrentShiftIndex = (currentTime: number) => {
  const hour = new Date(currentTime).getHours();
  if (hour >= 8 && hour < 17) return 0;
  if (hour >= 17 && hour < 23) return 1;
  return 2;
};

function getDispatchStatus(track: VtrackingVehicle, order: Order | null, inYard: boolean, queuePosition?: number) {
  const liveStatus = getVtrackingDisplayStatus(track.status, track.timestamp);
  if (liveStatus === "offline") return "offline" as const;

  if (inYard && order?.order_status === "pending" && queuePosition === 1) {
    return "alert" as const;
  }

  if (inYard && order?.order_status === "pending") {
    return "idle" as const;
  }

  return liveStatus === "run" ? ("running" as const) : ("idle" as const);
}

function getStatusLabel(status: DispatchMapStatus, t: ReturnType<typeof useTranslations<"DispatchCenterPage">>) {
  if (status === "running") return t("runningStatus");
  if (status === "idle") return t("idleStatus");
  if (status === "alert") return t("alertStatus");
  return t("offlineStatus");
}

function getStatusClass(status: DispatchMapStatus) {
  if (status === "running") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "idle") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "alert") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function getDispatchLabel(
  status: DispatchMapStatus,
  inYard: boolean,
  queuePosition: number | undefined,
  t: ReturnType<typeof useTranslations<"DispatchCenterPage">>,
) {
  if (status === "alert") return t("turnBadge");
  if (inYard && queuePosition) return t("waitingBadge", { order: queuePosition });
  if (status === "running") return t("runningMini");
  if (status === "offline") return t("offlineMini");
  return t("idleMini");
}

function getTimelineLevel(order: Order): TimelineItem["level"] {
  if (order.order_status === "completed") return "success";
  if (order.order_status === "pending") return "warning";
  return "info";
}

function getTimelineTitle(order: Order, t: ReturnType<typeof useTranslations<"DispatchCenterPage">>) {
  const vehicleLabel = order.vehicles?.vehicle_name || order.vehicles?.vehicle_license_plate;

  if (order.order_status === "completed") {
    return `${vehicleLabel} ${t("completedTrip")}`;
  }

  if (order.order_status === "collecting") {
    return `${vehicleLabel} ${t("collectingTrip")}`;
  }

  if (order.order_status === "transporting" || order.order_status === "running") {
    return `${vehicleLabel} ${t("dispatchingTrip")}`;
  }

  return `${vehicleLabel} ${t("queuedTrip")}`;
}

export default function DispatchCenter() {
  const t = useTranslations("DispatchCenterPage");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const currentUser = useAppSelector((state) => state.auth.user);

  const [stations, setStations] = useState<Station[]>([]);
  const [dayOrders, setDayOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatusFilter>("all");
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(searchQuery);

  const selectedDate = useMemo(() => getTodayDate(), []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        stationApi.getAll(),
        orderApi.getByInitDate(selectedDate),
        orderApi.getByStatus("pending"),
        orderApi.getByStatus("collecting"),
        orderApi.getByStatus("transporting"),
        orderApi.getByStatus("running"),
      ]);

      if (results[0].status === "fulfilled") {
        const stationList = results[0].value.data?.data || results[0].value.data || [];
        setStations(Array.isArray(stationList) ? stationList : []);
      }

      if (results[1].status === "fulfilled") {
        const orderList = results[1].value.data?.data || results[1].value.data || [];
        setDayOrders(Array.isArray(orderList) ? orderList : []);
      }

      const mergedActive = results.slice(2).flatMap((result) => {
        if (result.status !== "fulfilled") return [];
        const list = result.value.data?.data || result.value.data || [];
        return Array.isArray(list) ? list : [];
      });
      setActiveOrders(uniqueOrders(mergedActive));
    } catch (error) {
      console.error("[DispatchCenter] fetch failed", error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const workingStations = useMemo(() => {
    const filtered = stations.filter(
      (station) => station.station_types?.station_type_name === "working_station",
    );
    return filtered.length ? filtered : stations;
  }, [stations]);

  const stationWithGps = useMemo(
    () =>
      workingStations.find(
        (station) =>
          station.station_gps_latitude != null && station.station_gps_longitude != null,
      ) ||
      stations.find(
        (station) =>
          station.station_gps_latitude != null && station.station_gps_longitude != null,
      ) ||
      null,
    [stations, workingStations],
  );

  const {
    vehicles: liveVehicles,
    refetch: refetchLiveVehicles,
    lastUpdated,
  } = useNearbyVehicles(
    stationWithGps?.station_gps_longitude ?? null,
    stationWithGps?.station_gps_latitude ?? null,
    stationWithGps?.station_gps_geofencing || 500,
    45000,
  );

  const { isConnected: socketConnected, lastSignalTime } = useRealtimeUpdates(fetchAll);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAll(), refetchLiveVehicles()]);
    toast.success(t("refreshDone"));
  }, [fetchAll, refetchLiveVehicles, t]);

  const orderByVehicleKey = useMemo(() => {
    const map = new Map<string, Order>();
    const sorted = [...activeOrders].sort((a, b) => getOrderReferenceTime(b) - getOrderReferenceTime(a));

    sorted.forEach((order) => {
      [order.vehicles?.vehicle_license_plate, order.vehicles?.vehicle_name].forEach((key) => {
        const normalized = normalizeVehicleKey(key);
        if (!normalized || map.has(normalized)) return;
        map.set(normalized, order);
      });
    });

    return map;
  }, [activeOrders]);

  const queuePositionByKey = useMemo(() => {
    const map = new Map<string, number>();
    const pendingOrders = activeOrders
      .filter((order) => order.order_status === "pending")
      .sort((a, b) => a.order_number - b.order_number);

    pendingOrders.forEach((order, index) => {
      [order.vehicles?.vehicle_license_plate, order.vehicles?.vehicle_name].forEach((key) => {
        const normalized = normalizeVehicleKey(key);
        if (!normalized || map.has(normalized)) return;
        map.set(normalized, index + 1);
      });
    });

    return map;
  }, [activeOrders]);

  const dispatchVehicles = useMemo<DispatchVehicle[]>(() => {
    const formatter = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return liveVehicles
      .filter((vehicle) => Boolean(vehicle.vehicle_name || vehicle.license_plate))
      .map((track) => {
        const vehicleKey = normalizeVehicleKey(track.license_plate) || normalizeVehicleKey(track.vehicle_name);
        const matchedOrder = orderByVehicleKey.get(vehicleKey) || null;
        const queuePosition = queuePositionByKey.get(vehicleKey);
        const inYard = Boolean(track.inRange);
        const dispatchStatus = getDispatchStatus(track, matchedOrder, inYard, queuePosition);
        const lastUpdateMinutes = Math.max(0, Math.round((Date.now() - track.timestamp) / 60000));
        const runtimeMinutes = matchedOrder?.order_start_datetime
          ? Math.max(
              0,
              Math.round(
                ((matchedOrder.order_end_datetime
                  ? new Date(matchedOrder.order_end_datetime).getTime()
                  : Date.now()) - new Date(matchedOrder.order_start_datetime).getTime()) / 60000,
              ),
            )
          : 0;
        const waitMinutes = matchedOrder
          ? Math.max(0, Math.round((Date.now() - new Date(matchedOrder.order_init_datetime).getTime()) / 60000))
          : lastUpdateMinutes;
        const stationName = matchedOrder?.stations?.station_name || t("unassigned");
        const dispatchLabel = getDispatchLabel(dispatchStatus, inYard, queuePosition, t);
        const noteText =
          queuePosition === 1 && inYard
            ? t("turnVehicleNote")
            : inYard && queuePosition
              ? t("waitingVehicleNote", { order: queuePosition })
              : dispatchStatus === "offline"
                ? t("offlineVehicleNote")
                : dispatchStatus === "running"
                  ? t("normalVehicleNote")
                  : t("idleVehicleNote");

        const activeOrderLabel =
          matchedOrder?.order_status === "pending" && inYard && queuePosition
            ? queuePosition === 1
              ? t("turnNow")
              : t("queueOrder", { order: queuePosition })
            : matchedOrder
              ? `#${matchedOrder.order_number}`
              : t("activeOrderEmpty");

        return {
          id: track.device_id || track.id,
          vehicleName: track.vehicle_name || track.license_plate,
          licensePlate: track.license_plate || "--",
          latitude: track.latitude,
          longitude: track.longitude,
          speed: track.speed || 0,
          direction: track.direction || 0,
          status: dispatchStatus,
          labelText: dispatchLabel,
          stationName,
          statusLabel: getStatusLabel(dispatchStatus, t),
          dispatchLabel,
          updatedAtText: formatter.format(new Date(track.timestamp)),
          locationText: track.geocoding || t("locationUnavailable"),
          distanceText: formatDistanceKm(track.distance),
          runtimeText: formatMinutes(runtimeMinutes, tCommon("hour"), tCommon("minute")),
          waitTimeText: formatMinutes(waitMinutes, tCommon("hour"), tCommon("minute")),
          activeOrderLabel,
          noteText,
          queuePosition,
          inYard,
          order: matchedOrder,
        };
      })
      .sort((a, b) => {
        const score = { alert: 0, running: 1, idle: 2, offline: 3 } as Record<DispatchMapStatus, number>;
        return score[a.status] - score[b.status];
      });
  }, [liveVehicles, locale, orderByVehicleKey, queuePositionByKey, t, tCommon]);

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toUpperCase();

    return dispatchVehicles.filter((vehicle) => {
      const matchesSearch =
        !normalizedSearch ||
        vehicle.vehicleName.toUpperCase().includes(normalizedSearch) ||
        vehicle.licensePlate.toUpperCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === "all" || vehicle.status === statusFilter;
      const matchesStation = stationFilter === "all" || vehicle.stationName === stationFilter;

      return matchesSearch && matchesStatus && matchesStation;
    });
  }, [deferredSearch, dispatchVehicles, stationFilter, statusFilter]);

  useEffect(() => {
    if (!dispatchVehicles.length) {
      setSelectedVehicleId(null);
      return;
    }

    if (!selectedVehicleId || !dispatchVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(dispatchVehicles[0].id);
    }
  }, [dispatchVehicles, selectedVehicleId]);

  useEffect(() => {
    if (!filteredVehicles.length) return;
    if (selectedVehicleId && filteredVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) return;
    setSelectedVehicleId(filteredVehicles[0].id);
  }, [filteredVehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => dispatchVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [dispatchVehicles, selectedVehicleId],
  );

  const pendingYardVehicles = useMemo(
    () =>
      dispatchVehicles
        .filter((vehicle) => vehicle.inYard && vehicle.order?.order_status === "pending")
        .sort((a, b) => (a.queuePosition || 999) - (b.queuePosition || 999)),
    [dispatchVehicles],
  );

  const counts = useMemo(
    () => ({
      total: dispatchVehicles.length,
      inYard: dispatchVehicles.filter((vehicle) => vehicle.inYard).length,
      running: dispatchVehicles.filter((vehicle) => vehicle.status === "running").length,
      idle: dispatchVehicles.filter((vehicle) => vehicle.status === "idle").length,
      alert: dispatchVehicles.filter((vehicle) => vehicle.status === "alert").length,
    }),
    [dispatchVehicles],
  );

  const alertItems = useMemo<AlertItem[]>(() => {
    return dispatchVehicles
      .filter((vehicle) => vehicle.status === "alert")
      .map((vehicle) => ({
        id: `vehicle-${vehicle.id}`,
        title: `${vehicle.vehicleName} ${t("dispatchAlertTitle")}`,
        description: t("dispatchAlertDescription"),
        timeText: vehicle.updatedAtText,
        vehicleId: vehicle.id,
        severity: "critical" as const,
      }))
      .slice(0, 6);
  }, [dispatchVehicles, t]);

  const liveTimeline = useMemo<TimelineItem[]>(() => {
    const formatter = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const events: TimelineItem[] = dayOrders
      .slice()
      .sort((a, b) => getOrderReferenceTime(b) - getOrderReferenceTime(a))
      .slice(0, 8)
      .map((order) => {
        const vehicleId = dispatchVehicles.find((vehicle) => {
          const vehicleName = normalizeVehicleKey(order.vehicles?.vehicle_name);
          const licensePlate = normalizeVehicleKey(order.vehicles?.vehicle_license_plate);
          return (
            normalizeVehicleKey(vehicle.vehicleName) === vehicleName ||
            normalizeVehicleKey(vehicle.licensePlate) === licensePlate
          );
        })?.id;

        return {
          id: `event-${order.order_id}`,
          level: getTimelineLevel(order),
          title: getTimelineTitle(order, t),
          description: `#${order.order_number}`,
          timeText: formatter.format(new Date(getOrderReferenceTime(order))),
          vehicleId,
        };
      });

    if (lastSignalTime) {
      events.unshift({
        id: "socket-sync",
        level: "info",
        title: t("socketSynced"),
        description: t("socketSyncedDescription"),
        timeText: new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(lastSignalTime),
        vehicleId: null,
      });
    }

    return events.slice(0, 8);
  }, [dayOrders, dispatchVehicles, lastSignalTime, locale, t]);

  const selectedHistory = useMemo(
    () => liveTimeline.filter((item) => item.vehicleId === selectedVehicleId).slice(0, 5),
    [liveTimeline, selectedVehicleId],
  );

  const shiftSlots = useMemo(
    () => [
      { label: t("shiftMorning"), timeText: "08:00 - 17:00" },
      { label: t("shiftEvening"), timeText: "17:00 - 23:00" },
      { label: t("shiftNight"), timeText: "23:00 - 08:00" },
    ],
    [t],
  );
  const currentShiftIndex = getCurrentShiftIndex(currentTime);
  const currentShift = shiftSlots[currentShiftIndex];
  const mapCenter = useMemo(() => {
    if (stationFilter !== "all") {
      const matchedStation = stations.find((station) => station.station_name === stationFilter);
      if (matchedStation?.station_gps_latitude != null && matchedStation.station_gps_longitude != null) {
        return {
          latitude: matchedStation.station_gps_latitude,
          longitude: matchedStation.station_gps_longitude,
          radius: matchedStation.station_gps_geofencing || 500,
        };
      }
    }

    if (
      stationWithGps?.station_gps_latitude != null &&
      stationWithGps.station_gps_longitude != null
    ) {
      return {
        latitude: stationWithGps.station_gps_latitude,
        longitude: stationWithGps.station_gps_longitude,
        radius: stationWithGps.station_gps_geofencing || 500,
      };
    }

    return null;
  }, [stationFilter, stationWithGps, stations]);

  const handleQuickSelect = useCallback((vehicleId?: string | null) => {
    if (vehicleId) {
      setSelectedVehicleId(vehicleId);
    }
  }, []);

  const handleAssignTrip = useCallback(() => {
    const queued = dispatchVehicles.find((vehicle) => vehicle.status === "alert");
    if (queued) {
      setSelectedVehicleId(queued.id);
      setStatusFilter("alert");
      toast.message(t("assignTripFocus"));
      return;
    }
    toast.message(t("assignTripEmpty"));
  }, [dispatchVehicles, t]);

  const handleTransferVehicle = useCallback(() => {
    const idleVehicle = dispatchVehicles.find((vehicle) => vehicle.status === "idle");
    if (idleVehicle) {
      setSelectedVehicleId(idleVehicle.id);
      setStatusFilter("idle");
      toast.message(t("transferVehicleFocus"));
      return;
    }
    toast.message(t("transferVehicleEmpty"));
  }, [dispatchVehicles, t]);

  const handleSendMessage = useCallback(() => {
    if (!selectedVehicle) {
      toast.message(t("noVehicleSelected"));
      return;
    }
    toast.message(t("messageQueued", { vehicle: selectedVehicle.vehicleName }));
  }, [selectedVehicle, t]);

  const handleIncident = useCallback(() => {
    if (!selectedVehicle) {
      toast.message(t("noVehicleSelected"));
      return;
    }
    setStatusFilter("alert");
    toast.message(t("incidentLogged", { vehicle: selectedVehicle.vehicleName }));
  }, [selectedVehicle, t]);

  const headerClock = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(currentTime)),
    [currentTime, locale],
  );

  if (loading && !dispatchVehicles.length) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f4f7fb]">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t("loadingCenter")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] p-4">
      <div className="mx-auto flex max-w-[1880px] flex-col gap-4">
        <section className={cn(panelClass, "px-5 py-4")}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-600/10 p-3 text-blue-600">
                <TruckIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">{t("title")}</h1>
                <p className="text-sm font-medium text-slate-500">{t("subtitle")}</p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {socketConnected ? t("connected") : t("disconnected")}
                </p>
                <p className="text-base font-bold text-slate-900">{headerClock}</p>
              </div>
              <Button
                onClick={() => router.push(ADMIN.END_OF_DAY)}
                className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-semibold hover:bg-blue-700"
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                {t("handover")}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-6">
          {[
            {
              key: "shift",
              title: t("currentShift"),
              value: currentShift.timeText,
              subValue: currentShift.label,
              icon: <Clock3 className="h-5 w-5" />,
              accent: "bg-emerald-50 text-emerald-700",
            },
            {
              key: "yard",
              title: t("vehiclesInYard"),
              value: String(counts.inYard),
              subValue: t("yardPresence"),
              icon: <MapPin className="h-5 w-5" />,
              accent: "bg-violet-50 text-violet-700",
            },
            {
              key: "total",
              title: t("totalVehicles"),
              value: String(counts.total),
              subValue: t("fleetOnline"),
              icon: <Truck className="h-5 w-5" />,
              accent: "bg-sky-50 text-sky-700",
            },
            {
              key: "running",
              title: t("runningVehicles"),
              value: String(counts.running),
              subValue: t("runningStatus"),
              icon: <RefreshCw className="h-5 w-5" />,
              accent: "bg-emerald-50 text-emerald-700",
            },
            {
              key: "idle",
              title: t("idleVehicles"),
              value: String(counts.idle),
              subValue: t("idleStatus"),
              icon: <Bell className="h-5 w-5" />,
              accent: "bg-amber-50 text-amber-700",
            },
            {
              key: "alert",
              title: t("alertVehicles"),
              value: String(alertItems.length),
              subValue: t("needAttention"),
              icon: <AlertTriangle className="h-5 w-5" />,
              accent: "bg-rose-50 text-rose-700",
            },
          ].map((item) => (
            <div key={item.key} className={cn(panelClass, "p-3.5")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-[28px] font-black leading-none text-slate-900">{item.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{item.subValue}</p>
                </div>
                <div className={cn("rounded-2xl p-2.5", item.accent)}>{item.icon}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 2xl:grid-cols-[250px_minmax(0,1fr)_340px]">
          <aside className="flex flex-col gap-4">
            <div className={cn(panelClass, "overflow-hidden p-4")}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                  {t("shiftDesk")}
                </h2>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
                      {t("current")}
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-900">
                      {currentUser?.fullName || t("unassignedOperator")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{currentShift.timeText}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    {t("onDuty")}
                  </span>
                </div>
              </div>
            </div>

            <div className={cn(panelClass, "p-4")}>
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                {t("shiftNotes")}
              </h2>
              <div className="mt-3 space-y-3">
                {pendingYardVehicles.slice(0, 3).map((vehicle) => (
                  <div key={vehicle.id} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-slate-600">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 rounded-full bg-white p-1 text-amber-500 shadow-sm">
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {vehicle.vehicleName} {vehicle.queuePosition === 1 ? t("turnNow") : t("queueOrder", { order: vehicle.queuePosition || 0 })}
                        </p>
                        <p className="mt-1 leading-6">
                          {vehicle.queuePosition === 1 ? t("shiftTurnNote") : t("shiftWaitingNote")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {!pendingYardVehicles.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                    {t("emptyNotes")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={cn(panelClass, "p-4")}>
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                {t("shiftMetrics")}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  { label: t("totalTrips"), value: String(dayOrders.length) },
                  {
                    label: t("completedTrips"),
                    value: String(dayOrders.filter((order) => order.order_status === "completed").length),
                  },
                  {
                    label: t("inTransit"),
                    value: String(activeOrders.filter((order) => ["collecting", "transporting", "running"].includes(order.order_status)).length),
                  },
                  {
                    label: t("queuedVehicles"),
                    value: String(activeOrders.filter((order) => order.order_status === "pending").length),
                  },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex flex-col gap-4">
            <div className={cn(panelClass, "p-4")}>
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    {t("liveMap")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{t("mapSubheading")}</p>
                </div>
                <div className="flex flex-col gap-3 xl:flex-row">
                  <div className="relative min-w-[260px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="h-11 rounded-2xl border-slate-200 pl-9"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as VehicleStatusFilter)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none"
                  >
                    <option value="all">{t("allStatuses")}</option>
                    <option value="running">{t("runningStatus")}</option>
                    <option value="idle">{t("idleStatus")}</option>
                    <option value="alert">{t("alertStatus")}</option>
                    <option value="offline">{t("offlineStatus")}</option>
                  </select>

                  <select
                    value={stationFilter}
                    onChange={(event) => setStationFilter(event.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none"
                  >
                    <option value="all">{t("allStations")}</option>
                    {workingStations.map((station) => (
                      <option key={station.station_id} value={station.station_name}>
                        {station.station_name}
                      </option>
                    ))}
                  </select>

                  <Button variant="outline" onClick={refreshAll} className="h-11 rounded-2xl border-slate-200 px-4">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {tCommon("refresh")}
                  </Button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("alertVehicles")}: {alertItems.length}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  <Bell className="h-3.5 w-3.5" />
                  {t("queuedVehicles")}: {pendingYardVehicles.length}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("runningVehicles")}: {counts.running}
                </div>
              </div>

              <DispatchCenterMap
                vehicles={filteredVehicles}
                selectedVehicleId={selectedVehicleId}
                center={mapCenter}
                onSelectVehicle={setSelectedVehicleId}
              />
            </div>

            <div className="relative z-10 grid gap-4 xl:grid-cols-[1.05fr_1.1fr_0.95fr]">
              <div className={cn(panelClass, "p-4")}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    {t("liveEvents")}
                  </h2>
                  <span className="text-xs font-semibold text-blue-600">{t("seeAll")}</span>
                </div>
                <div className="space-y-3">
                  {liveTimeline.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleQuickSelect(item.vehicleId)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
                    >
                      <div className="pt-0.5">
                        <span
                          className={cn(
                            "mt-1 inline-block h-2.5 w-2.5 rounded-full",
                            item.level === "success" && "bg-emerald-500",
                            item.level === "info" && "bg-sky-500",
                            item.level === "warning" && "bg-rose-500",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className="text-xs font-semibold text-slate-400">{item.timeText}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={cn(panelClass, "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,rgba(255,255,255,1)_100%)] p-4")}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    {t("unresolvedAlerts")}
                  </h2>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                    {alertItems.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {alertItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-rose-200 bg-white/90 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className={cn("h-4 w-4", item.severity === "critical" ? "text-rose-500" : "text-amber-500")} />
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">{item.timeText}</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          onClick={() => handleQuickSelect(item.vehicleId)}
                          className="h-8 rounded-xl border-rose-200 px-3 text-rose-600 hover:bg-rose-50"
                        >
                          {t("handleAlert")}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!alertItems.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                      {t("emptyAlerts")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={cn(panelClass, "p-4")}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    {t("quickDispatch")}
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {[
                    {
                      key: "assign",
                      icon: <ChevronRight className="h-5 w-5 text-amber-500" />,
                      title: t("assignNewTrip"),
                      description: t("assignNewTripHint"),
                      onClick: handleAssignTrip,
                    },
                    {
                      key: "transfer",
                      icon: <ArrowRightLeft className="h-5 w-5 text-emerald-500" />,
                      title: t("transferVehicle"),
                      description: t("transferVehicleHint"),
                      onClick: handleTransferVehicle,
                    },
                    {
                      key: "message",
                      icon: <Send className="h-5 w-5 text-blue-500" />,
                      title: t("sendMessage"),
                      description: t("sendMessageHint"),
                      onClick: handleSendMessage,
                    },
                    {
                      key: "incident",
                      icon: <AlertTriangle className="h-5 w-5 text-rose-500" />,
                      title: t("createAlert"),
                      description: t("createAlertHint"),
                      onClick: handleIncident,
                    },
                  ].map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={action.onClick}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="mb-3 inline-flex rounded-2xl bg-white p-2 shadow-sm">{action.icon}</div>
                      <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{action.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className={cn(panelClass, "flex flex-col p-4")}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                {t("selectedVehicle")}
              </h2>
              <span className="text-xs font-semibold text-slate-400">{selectedVehicle?.updatedAtText || "--"}</span>
            </div>

            {selectedVehicle ? (
              <>
                <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(160deg,#f8fbff_0%,#eef5ff_100%)] p-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold", getStatusClass(selectedVehicle.status))}>
                        {selectedVehicle.statusLabel}
                      </span>
                      <h3 className="mt-3 text-3xl font-black text-slate-900">{selectedVehicle.vehicleName}</h3>
                      <p className="mt-1 text-base font-medium text-slate-500">{selectedVehicle.licensePlate}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                          {selectedVehicle.dispatchLabel}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                          {selectedVehicle.inYard ? t("insideYard") : t("outsideYard")}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-24 w-28 shrink-0 rounded-[24px] bg-white/80 p-2 shadow-sm">
                      <Image
                        src={
                          selectedVehicle.status === "idle"
                            ? "/icons/truck-park.png"
                            : selectedVehicle.status === "offline"
                              ? "/icons/truck-offline.png"
                              : "/icons/truck-run.png"
                        }
                        alt={selectedVehicle.vehicleName}
                        fill
                        className="object-contain p-2"
                        sizes="128px"
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t("speedLabel")}</p>
                      <p className="mt-2 font-bold text-slate-900">{Math.round(selectedVehicle.speed)} km/h</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t("headingLabel")}</p>
                      <p className="mt-2 font-bold text-slate-900">{selectedVehicle.direction}&deg;</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t("queueStateLabel")}</p>
                      <p className="mt-2 font-bold text-slate-900">{selectedVehicle.activeOrderLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t("updatedAtLabel")}</p>
                      <p className="mt-2 font-bold text-slate-900">{selectedVehicle.updatedAtText}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: t("distanceLabel"), value: selectedVehicle.distanceText },
                    { label: t("runtimeLabel"), value: selectedVehicle.runtimeText },
                    { label: t("waitTimeLabel"), value: selectedVehicle.waitTimeText },
                    { label: t("activeOrderLabel"), value: selectedVehicle.activeOrderLabel },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.35)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.35)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t("currentLocationLabel")}
                  </p>
                  <div className="mt-3 flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-blue-500" />
                    <p className="text-sm font-medium leading-6 text-slate-700">{selectedVehicle.locationText}</p>
                  </div>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t("noteLabel")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedVehicle.noteText}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={handleSendMessage}
                    className="h-11 rounded-2xl border-blue-200 bg-white text-blue-600 hover:bg-blue-50"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t("sendMessage")}
                  </Button>
                  <Button onClick={handleAssignTrip} className="h-11 rounded-2xl bg-amber-500 text-white hover:bg-amber-600">
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t("dispatchVehicle")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleIncident}
                    className="h-11 rounded-2xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {t("incidentLog")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTransferVehicle}
                    className="h-11 rounded-2xl border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50"
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t("transferVehicle")}
                  </Button>
                </div>

                <div className="mt-5 min-h-0 flex-1 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">
                      {t("activityHistory")}
                    </h3>
                    <span className="text-xs font-semibold text-blue-600">{t("seeAll")}</span>
                  </div>
                  <div className="space-y-3">
                    {selectedHistory.map((item) => (
                      <div key={item.id} className="rounded-2xl bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className="text-xs font-semibold text-slate-400">{item.timeText}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                      </div>
                    ))}
                    {!selectedHistory.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">
                        {t("emptyHistory")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
                {t("noVehicleSelected")}
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
