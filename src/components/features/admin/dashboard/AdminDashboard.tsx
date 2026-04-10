"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/types/station";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/types/vehicle";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import { RefreshCw, Map as MapIcon, Maximize2, Minimize2, Truck, Radio, CheckCircle2, Clock, Route, MapPin, Search, CalendarClock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ADMIN } from "@/constants/route";
import { Dialog, DialogContent, DialogHeader, DialogTitle as DlgTitle } from "@/components/ui/dialog";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import StationStatusPanel from "./StationStatusPanel";
import ActivityFlow, { type DispatchMode } from "./ActivityFlow";

const StationMap = dynamic(
  () => import("@/components/features/admin/dashboard/StationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--dd-bg-primary)' }}>
        <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
      </div>
    )
  }
);

const getTodayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};
const getTomorrowDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  const today = new Date(now.getTime() - timezoneOffset);
  today.setDate(today.getDate() + 1);
  return today.toISOString().slice(0, 10);
};
const getYesterdayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  const today = new Date(now.getTime() - timezoneOffset);
  today.setDate(today.getDate() - 1);
  return today.toISOString().slice(0, 10);
};

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tEndOfDay = useTranslations("EndOfDayPage");
  const tVehiclePage = useTranslations("VehiclePage");
  const locale = useLocale();

  const [geofenceStation, setGeofenceStation] = useState<Station | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tomorrowOrders, setTomorrowOrders] = useState<Order[]>([]);
  const [yesterdayOrders, setYesterdayOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isShiftSubmitting, setIsShiftSubmitting] = useState(false);
  const operationDate = getTodayDate();
  const [clock, setClock] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);



  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [locale]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await orderApi.getByInitDate(getTodayDate());
      setOrders(res.data?.data || res.data || []);
    } catch {
      //
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        stationApi.getAll(),
        vehicleApi.getAll({ limit: 100 }),
        orderApi.getByInitDate(getTodayDate()),
        orderApi.getByInitDate(getTomorrowDate()),
        orderApi.getByInitDate(getYesterdayDate()),
      ]);

      if (results[0].status === 'fulfilled') {
        const sRes = results[0].value;
        const fetchedStations = sRes.data?.data || sRes.data || [];
        setStations(fetchedStations);
        setGeofenceStation(fetchedStations.find((s: Station) => s.station_gps_longitude != null && s.station_gps_latitude != null) || fetchedStations[0] || null);
      }
      if (results[1].status === 'fulfilled') {
        const vRes = results[1].value;
        setVehicles(vRes.data?.data || vRes.data || []);
      }
      if (results[2].status === 'fulfilled') {
        const oRes = results[2].value;
        setOrders(oRes.data?.data || oRes.data || []);
      }
      if (results[3].status === 'fulfilled') {
        const tmRes = results[3].value;
        setTomorrowOrders(tmRes.data?.data || tmRes.data || []);
      }
      if (results[4]?.status === 'fulfilled') {
        const ydRes = results[4].value;
        setYesterdayOrders(ydRes.data?.data || ydRes.data || []);
      }
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  };

  const isShiftClosedForDate = useMemo(
    () => orders.some((o) => o.order_status === "canceled"),
    [orders],
  );

  const isTomorrowScheduleReady = useMemo(
    () => tomorrowOrders.some((o) => o.order_status === "pending"),
    [tomorrowOrders],
  );

  const pendingAction = useMemo(() => {
    const hasTodayAnyOrder = orders.length > 0;
    const hasYesterdayPending = yesterdayOrders.some((o) => o.order_status === "pending");
    const hasYesterdayCanceledOrInit = yesterdayOrders.some(
      (o) => o.order_status === "canceled" || o.order_status === "init"
    );

    if (!hasTodayAnyOrder) {
      if (hasYesterdayPending) return "forgotShiftClose" as const;
      if (hasYesterdayCanceledOrInit) return "forgotScheduleConfirm" as const;
    }
    return "none" as const;
  }, [orders, yesterdayOrders]);

  const handleShiftToggle = useCallback(async () => {
    if (!operationDate) {
      toast.error(t('shiftCloseDateRequired'), { position: 'top-right' });
      return;
    }

    setIsShiftSubmitting(true);

    try {
      if (isShiftClosedForDate) {
        await orderApi.shiftReopen({ operation_date: operationDate });
        const [y, m, d] = operationDate.split("-");
        toast.success(t('shiftReopenSuccess', { date: `${d}/${m}/${y}` }), { position: 'top-right' });
      } else {
        await orderApi.shiftClose({ operation_date: operationDate });
        const [y, m, d] = operationDate.split("-");
        toast.success(t('shiftCloseSuccess', { date: `${d}/${m}/${y}` }), { position: 'top-right' });
      }

      await fetchAll();
    } catch {
      toast.error(isShiftClosedForDate ? t('shiftReopenFailed') : t('shiftCloseFailed'), { position: 'top-right' });
    } finally {
      setIsShiftSubmitting(false);
    }
  }, [fetchAll, isShiftClosedForDate, operationDate, t]);

  const activeStations = useMemo(
    () => stations.filter((s) => s.station_types?.station_type_id === 1 && s.station_status === "operating"),
    [stations],
  );

  const { vehicles: vtrackingVehicles, inRangeCount, loading: nearbyLoading, lastUpdated, error: nearbyError, refetch: refetchVehicles } = useNearbyVehicles(
    geofenceStation?.station_gps_longitude ?? null,
    geofenceStation?.station_gps_latitude ?? null,
    geofenceStation?.station_gps_geofencing || 500,
  );

  const { isConnected: socketConnected, lastSignal, lastSignalTime } = useRealtimeUpdates(fetchAll);
  const { stationStatusMap, isLedConnected } = useDeviceHeartbeat();

  const inYardVehicles = useMemo(() => vtrackingVehicles.filter(v => v.inRange), [vtrackingVehicles]);

  const stoppedMaintenanceList = useMemo(() => {
    const list: { id: string; label: string; statusLabel: string; chipClass: string }[] = [];

    vehicles.forEach(v => {
      if (v.vehicle_status === "incident" || v.vehicle_status === "maintenance") {
        const isIncident = v.vehicle_status === "incident";
        list.push({
          id: `veh-${v.vehicle_id}`,
          label: v.vehicle_license_plate ? `${v.vehicle_license_plate}${v.vehicle_name ? ` | ${v.vehicle_name}` : ''}` : '',
          statusLabel: isIncident ? (t('incident') || 'Sự cố') : (tVehiclePage('maintenanceOption') || 'Bảo dưỡng'),
          chipClass: isIncident ? 'dd-chip-red' : 'dd-chip-amber'
        });
      }
    });

    // orders.filter(o => o.order_status === "canceled").forEach(o => {
    //   const plate = o.vehicles?.vehicle_license_plate || `#${o.order_id}`;
    //   if (!list.some(item => item.label === plate)) {
    //     list.push({
    //       id: `ord-${o.order_id}`,
    //       label: plate,
    //       statusLabel: t('canceled'),
    //       chipClass: 'dd-chip-amber'
    //     });
    //   }
    // });

    return list;
  }, [vehicles, orders, t, tVehiclePage]);

  const activeFlowOrders = useMemo(() => {
    return orders.filter(o => {
      const vStatus = o.vehicles?.vehicle_status;
      return vStatus !== 'maintenance' && vStatus !== 'incident';
    });
  }, [orders]);

  const ordersAtStation = useMemo(() => orders.filter(o => o.order_status === "collecting"), [orders]);
  const ordersPending = useMemo(() => {
    const today = getTodayDate();
    return orders.filter(o => o.order_status === "pending" && o.order_init_datetime?.slice(0, 10) === today && o.vehicles?.vehicle_status === "available");
  }, [orders]);
  const ordersInTransit = useMemo(() => orders.filter(o => o.order_status === "transporting" || o.order_status === "running"), [orders]);
  const ordersCompleted = useMemo(() => {
    const today = getTodayDate();
    return orders.filter(o => o.order_status === "completed" && o.order_end_datetime?.slice(0, 10) === today);
  }, [orders]);

  useEffect(() => {
    if (!loading && ordersPending.length === 0 && ordersAtStation.length === 0 && ordersInTransit.length === 0 && !isTomorrowScheduleReady) {
      setShowNoPendingModal(true);
    }
  }, [loading, ordersPending.length, ordersAtStation.length, ordersInTransit.length, isTomorrowScheduleReady]);

  const ordersActive = useMemo(() => {
    return orders.filter(o =>
      o.order_status === "collecting" || o.order_status === "transporting" || o.order_status === "running"
    );
  }, [orders]);

  const ordersTodayPanel = useMemo(() => {
    return [...ordersActive, ...ordersCompleted].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [ordersActive, ordersCompleted]);

  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('auto');
  const [showMap, setShowMap] = useState(false);
  const [showNoPendingModal, setShowNoPendingModal] = useState(false);
  const router = useRouter();
  const [mapSearch, setMapSearch] = useState('');
  const [focusVehicleId, setFocusVehicleId] = useState<string | null>(null);
  const [mapStatusFilter, setMapStatusFilter] = useState<'all' | 'run' | 'park' | 'offline'>('all');

  const focusVehicle = useMemo(() => {
    if (!focusVehicleId) return null;
    const v = vtrackingVehicles.find(v => v.device_id === focusVehicleId);
    return v ? { latitude: v.latitude, longitude: v.longitude } : null;
  }, [focusVehicleId, vtrackingVehicles]);

  // if (loading) {
  //   return (
  //     <div className="dashboard-dark">
  //       <div className="m-10 max-w-[800px] lg:mx-auto space-y-6">
  //         <Skeleton active paragraph={{ rows: 1 }} />
  //         <div className="grid grid-cols-3 gap-4">
  //           {[1, 2, 3].map((i) => (
  //             <div key={i} className="dd-card p-5">
  //               <Skeleton active paragraph={{ rows: 2 }} title={false} />
  //             </div>
  //           ))}
  //         </div>
  //         <div className="dd-card p-6">
  //           <Skeleton active paragraph={{ rows: 10 }} />
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  const statCards = [
    {
      label: t('completed'),
      value: ordersCompleted.length.toString().padStart(3, '0'),
      accentColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.12)',
    },
    {
      label: t('pending'),
      value: ordersPending.length.toString().padStart(2, '0'),
      accentColor: '#f59e0b',
      glowColor: 'rgba(245, 158, 11, 0.12)',
    },
    {
      label: t('collecting'),
      value: ordersAtStation.length.toString().padStart(2, '0'),
      accentColor: '#8b5cf6',
      glowColor: 'rgba(139, 92, 246, 0.12)',
    },
    {
      label: t('inTransit'),
      value: ordersInTransit.length.toString().padStart(2, '0'),
      accentColor: '#38bdf8',
      glowColor: 'rgba(56, 189, 248, 0.12)',
    },
    {
      label: t('activeStationsShort'),
      value: `${activeStations.length}/${stations.filter(s => s.station_types?.station_type_id === 1).length}`,
      accentColor: '#10b981',
      glowColor: 'rgba(16, 185, 129, 0.12)',
    },
  ];

  return (
    <div className={`dashboard-light bg-cover bg-center ${isFullScreen ? 'fixed inset-0 z-[100] bg-slate-50 h-screen' : 'h-[calc(100vh-64px)]'} overflow-hidden flex flex-col`}>
      <div className={`p-2 lg:px-4 lg:py-2 mx-auto bg-transparent w-full flex-1 flex flex-col min-h-0`}>

        {/* ═══ HEADER ═══ */}
        <div className="dd-header mb-1 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between gap-3">
            {/* Title + Clock */}
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-xl font-black uppercase leading-none whitespace-nowrap" style={{ color: 'var(--dd-text-primary)' }}>
                {t("title")}
              </h1>
              <span className="text-xs font-bold uppercase whitespace-nowrap"
                style={{ color: 'var(--dd-text-muted)' }}>
                {t('systemTime')}: {clock}
              </span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* LED Status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-bold uppercase cursor-default ${isLedConnected
                    ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                    : "border-red-200 bg-red-50 text-red-700"
                    }`}>
                    {isLedConnected
                      ? <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                      : <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 6px rgba(248, 113, 113, 0.5)' }} />
                    }
                    LED
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isLedConnected ? 'Bảng LED đang kết nối' : 'Bảng LED đang mất kết nối'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Network Status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div key={lastSignalTime?.toISOString() || 'offline'} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-bold uppercase cursor-default ${socketConnected
                    ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                    : "border-red-200 bg-red-50 text-red-700"
                    }`}>
                    {socketConnected
                      ? <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                      : <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 6px rgba(248, 113, 113, 0.5)' }} />
                    }
                    {socketConnected ? 'ONLINE' : 'OFFLINE'}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{socketConnected ? t('socketConnected') : t('socketDisconnected')}</p>
                </TooltipContent>
              </Tooltip>

              {/* Sync Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-7 px-2.5 text-xs font-bold uppercase gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                {t('sync')}
              </Button>

              {/* Shift Close */}
              {!isTomorrowScheduleReady && (
                <div
                  className="border-l pl-2 flex items-center"
                  style={{ borderColor: "var(--dd-border)" }}
                >
                  <Button
                    variant={isShiftClosedForDate ? "outline" : "secondary"}
                    size="sm"
                    onClick={handleShiftToggle}
                    disabled={isShiftSubmitting}
                    className="h-7 px-2.5 text-xs font-bold uppercase gap-1"
                    style={{
                      background: isShiftClosedForDate
                        ? "linear-gradient(135deg, rgba(217, 119, 6, 0.14), rgba(245, 158, 11, 0.12))"
                        : "linear-gradient(135deg, rgba(109, 40, 217, 0.14), rgba(14, 165, 233, 0.1))",
                      border: isShiftClosedForDate
                        ? "1px solid rgba(217, 119, 6, 0.2)"
                        : "1px solid rgba(109, 40, 217, 0.2)",
                      color: isShiftClosedForDate ? "#b45309" : "#6d28d9",
                    }}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${isShiftSubmitting ? "animate-pulse" : ""}`}
                      style={{
                        background: isShiftClosedForDate ? "#d97706" : "#6d28d9",
                      }}
                    />
                    {isShiftClosedForDate
                      ? t("shiftReopenAction")
                      : t("shiftCloseAction")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ═══ STAT CARDS ═══ */}
          <div className="mt-1.5 grid grid-cols-2 gap-2 md:grid-cols-5 shrink-0">
            {statCards.map((card, i) => (
              <Card
                key={i}
                className="dd-stat-card py-0 animate-fade-up hover:scale-[1.02] active:scale-[0.98] transition-all cursor-default"
                style={{
                  '--accent-color': card.accentColor,
                  animationDelay: `${i * 0.1}s`
                } as React.CSSProperties}
              >
                <CardContent className="p-2 lg:px-3 lg:py-1.5 flex items-center justify-between gap-2 h-full">
                  <span className="text-sm font-extrabold uppercase truncate"
                    style={{ color: 'var(--dd-text-muted)' }}>
                    {card.label}
                  </span>
                  <div className="text-xl lg:text-2xl font-black leading-none shrink-0"
                    style={{ color: card.accentColor }}>
                    {card.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ═══ WARNING BANNER (YESTERDAY) ═══ */}
        {!loading && pendingAction !== "none" && (
          <div
            className="mb-1.5 shrink-0 rounded-lg border px-3 py-1.5"
            style={{
              background:
                pendingAction === "forgotShiftClose"
                  ? "linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(245, 158, 11, 0.06))"
                  : "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(124, 58, 237, 0.06))",
              borderColor:
                pendingAction === "forgotShiftClose"
                  ? "rgba(239, 68, 68, 0.25)"
                  : "rgba(245, 158, 11, 0.25)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: pendingAction === "forgotShiftClose" ? "#ef4444" : "#d97706" }}
                />
                <span className="text-xs font-bold uppercase" style={{ color: "var(--dd-text-primary)" }}>
                  {tEndOfDay(
                    pendingAction === "forgotShiftClose"
                      ? "alertForgotShiftCloseTitle"
                      : "alertForgotScheduleConfirmTitle"
                  )} — {tEndOfDay(
                    pendingAction === "forgotShiftClose"
                      ? "alertForgotShiftCloseDescription"
                      : "alertForgotScheduleConfirmDescription"
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-bold uppercase gap-1"
                style={{
                  borderColor: pendingAction === "forgotShiftClose" ? "#fca5a5" : "#fcd34d",
                  color: pendingAction === "forgotShiftClose" ? "#b91c1c" : "#b45309",
                }}
                asChild
              >
                <Link href={`${ADMIN.END_OF_DAY_VEHICLES}?mode=previous`}>
                  {tEndOfDay("alertGoToPrevious")}
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* ═══ END-OF-DAY BANNER ═══ */}
        {!loading && isShiftClosedForDate && pendingAction === "none" && (
          isTomorrowScheduleReady ? (
            <div
              className="mb-1.5 shrink-0 rounded-lg border px-3 py-1.5"
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.06))",
                borderColor: "rgba(16, 185, 129, 0.25)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold uppercase" style={{ color: "var(--dd-text-primary)" }}>
                    {t("tomorrowScheduleReadyTitle")} — {t("tomorrowScheduleReadyDescription", { count: tomorrowOrders.length })}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-bold uppercase gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  asChild
                >
                  <Link href={`${ADMIN.END_OF_DAY_VEHICLES}?mode=today`}>
                    {t("undoScheduleAction")}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="mb-1.5 shrink-0 rounded-lg border px-3 py-1.5"
              style={{
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.06))",
                borderColor: "rgba(245, 158, 11, 0.25)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold uppercase" style={{ color: "var(--dd-text-primary)" }}>
                    {t("endOfDayBannerTitle")} — {t("endOfDayBannerDescription")}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-bold uppercase gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  asChild
                >
                  <Link href={`${ADMIN.END_OF_DAY_VEHICLES}?mode=today`}>
                    {t("endOfDayBannerAction")}
                  </Link>
                </Button>
              </div>
            </div>
          )
        )}

        {/* \u2550\u2550\u2550 SYSTEM TELEMETRY \u2550\u2550\u2550 */}
        <div className="mb-1.5 shrink-0">
          <StationStatusPanel stations={stations} orders={orders} deviceStationStatusMap={stationStatusMap} onStationUpdated={fetchAll} />
        </div>

        {/* ═══ COMMAND CORE GRID ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">

          {/* Left: Asset Management (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-1.5 h-full min-h-0 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            {/* Ready Vehicles */}
            <div className="flex max-h-[45%] flex-col overflow-hidden dd-card">
              <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <span>{t('readyVehiclesPanel')}</span>
                <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">{inYardVehicles.length}</span>
              </div>
              <div className="overflow-y-auto p-0 flex-1">
                {inYardVehicles.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-3">
                    <span className="text-xs font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('noReadyVehicles')}</span>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1 px-4 py-2">
                    {inYardVehicles.map((v) => (
                      <li key={v.device_id} className="flex items-center gap-2 px-2 py-1 transition-colors rounded-md border shadow-sm cursor-default hover:shadow-md"
                        style={{ background: 'var(--dd-bg-surface)', borderColor: 'var(--dd-border)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dd-emerald)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                        <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                          <Truck className="h-2.5 w-2.5 animate-drive-idle" style={{ color: 'var(--dd-emerald)' }} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold" style={{ color: 'var(--dd-text-primary)' }}>{v.license_plate}{v.vehicle_name ? ` | ${v.vehicle_name}` : ''}</span>
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--dd-text-muted)' }}>
                            {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)} km` : `${v.distance} m`}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Canceled / Stopped */}
            <div className="flex flex-1 min-h-[60px] flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <span>{t('stoppedMaintenance')}</span>
                <span className="dd-chip dd-chip-amber text-[10px] px-1.5 py-0.5">{stoppedMaintenanceList.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {stoppedMaintenanceList.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-2">
                    <span className="text-xs font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('empty')}</span>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1 px-4 py-2">
                    {stoppedMaintenanceList.map((item) => (
                      <li key={item.id} className="flex items-center justify-between px-2 py-1 rounded-md border shadow-sm cursor-default"
                        style={{ background: 'var(--dd-bg-surface)', borderColor: 'var(--dd-border)' }}>
                        <span className="text-xs font-bold truncate pr-2" style={{ color: 'var(--dd-text-primary)' }}>
                          {item.label}
                        </span>
                        <span className={`dd-chip text-[10px] px-1.5 py-0.5 ${item.chipClass}`}>{item.statusLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Center: Command Core (col-span-6) */}
          <div className="lg:col-span-6 flex flex-col h-full min-h-0 dd-card overflow-hidden animate-fade-up"
            style={{ boxShadow: '0 0 20px rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.2)', animationDelay: '0.4s' }}>

            {/* Core Header with Toggle */}
            <div className="flex items-center justify-between px-3 py-1.5 relative z-10"
              style={{ background: 'var(--dd-bg-header)', borderBottom: '1px solid var(--dd-border)' }}>
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <div className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#0ea5e9', boxShadow: '0 0 10px rgba(14, 165, 233, 0.8)' }} />
                <span className="text-xs font-black uppercase truncate" style={{ color: 'var(--dd-text-primary)' }} title="TRUNG TÂM ĐIỀU PHỐI">
                  TRUNG TÂM ĐIỀU PHỐI
                </span>
              </div>

              {/* Segmented Toggle HUD */}
              <div className="flex items-center rounded-md p-0.5 backdrop-blur-md shrink-0"
                style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDispatchMode('auto')}
                  className={`h-5 px-2 text-[10px] font-bold uppercase ${dispatchMode === 'auto'
                    ? 'bg-sky-500/20 text-sky-600 border border-sky-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-700'
                    }`}
                >
                  AUTO
                </Button>
                <div className="w-[1px] h-3 mx-0.5 opacity-20" style={{ background: 'var(--dd-text-muted)' }} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDispatchMode('manual')}
                  className={`h-5 px-2 text-[10px] font-bold uppercase ${dispatchMode === 'manual'
                    ? 'bg-indigo-500/20 text-indigo-600 border border-indigo-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-700'
                    }`}
                >
                  MANUAL
                </Button>
                <div className="w-[1px] h-3 mx-0.5 opacity-20" style={{ background: 'var(--dd-text-muted)' }} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMap(true)}
                  className="h-5 px-2 text-[10px] font-bold uppercase text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-100"
                >
                  <MapIcon className="h-3 w-3 shrink-0" />
                  MAP
                </Button>
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
                      onOrdersUpdated={fetchAll}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Today's Orders (col-span-3) */}
          <div className="lg:col-span-3 h-full min-h-0 animate-fade-up" style={{ animationDelay: '0.6s' }}>
            <div className="flex h-full flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t('completedToday')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {ordersActive.length > 0 && (
                    <span className="dd-chip text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                      {ordersActive.length} {t('running')}
                    </span>
                  )}
                  <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">{ordersCompleted.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {ordersTodayPanel.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-md"
                        style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                        <CheckCircle2 className="h-6 w-6 text-emerald-400 opacity-50" />
                      </div>
                      <span className="mt-3 text-xs font-bold uppercase"
                        style={{ color: 'var(--dd-text-muted)' }}>
                        {t('noCompletedToday')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1.5 p-2">
                    {ordersTodayPanel.map((o) => {
                      const isCompleted = o.order_status === "completed";
                      const accentColor = isCompleted ? '#10b981' : '#0ea5e9';
                      const hoverBorder = isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(14, 165, 233, 0.4)';
                      return (
                        <li key={o.order_id} className="dd-surface px-2 py-1.5 transition-all relative overflow-hidden"
                          style={{ borderRadius: '6px', border: '1px solid var(--dd-border)' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = hoverBorder}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />

                          <div className="flex justify-between items-end pl-2">
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5" style={{ color: accentColor }} />
                              <span className="text-xs font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                                {o.vehicles?.vehicle_license_plate ? `${o.vehicles.vehicle_license_plate}${o.vehicles.vehicle_name ? ` | ${o.vehicles.vehicle_name}` : ''}` : `#${o.order_id}`}
                              </span>
                            </div>
                            {isCompleted ? (
                              <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                                {t('completed')}
                              </span>
                            ) : (
                              <span className="dd-chip text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                                {o.order_status === "collecting" ? t('collecting') : t('running')}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 pl-2 flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase"
                              style={{ color: 'var(--dd-text-muted)' }}>
                              {o.stations?.station_name || t('unassigned')}
                            </div>
                            <div className="flex items-center gap-3">
                              {o.order_start_datetime && o.order_end_datetime && (() => {
                                const diffMs = new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime();
                                const diffMins = Math.floor(diffMs / 60000);
                                const hours = Math.floor(diffMins / 60);
                                const mins = diffMins % 60;
                                return (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: accentColor }}>
                                    <Clock className="w-3 h-3" />
                                    <span>{hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}m` : `${mins}m`}</span>
                                  </div>
                                );
                              })()}
                              {o.order_end_datetime && (
                                <div className="text-[10px] font-semibold" style={{ color: 'var(--dd-text-muted)' }}>
                                  {new Date(o.order_end_datetime).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Distance & Stops from order_multi */}
                          {o.order_multi && (() => {
                            const distanceKm = ((o.order_multi.distance_end - o.order_multi.distance_start) / 1000).toFixed(1);
                            const stops = o.order_multi.nStop_end - o.order_multi.nStop_start;
                            return (
                              <div className="mt-1.5 pl-2 flex items-center gap-3">
                                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#0ea5e9' }}>
                                  <Route className="w-3 h-3" />
                                  <span>{distanceKm} km</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
                                  <MapPin className="w-3 h-3" />
                                  <span>{stops} {t('stops') || 'lần dừng'}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
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

      {/* ═══ NO PENDING MODAL ═══ */}
      <Dialog open={showNoPendingModal} onOpenChange={() => { }}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center gap-5 py-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))",
                border: "2px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              <CalendarClock className="h-8 w-8 text-amber-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black uppercase" style={{ color: "var(--dd-text-primary)" }}>
                {t("endOfDayBannerTitle")}
              </h3>
              <p className="mt-2 text-sm font-semibold" style={{ color: "var(--dd-text-muted)" }}>
                {t("endOfDayBannerDescription")}
              </p>
            </div>
            <div className="flex w-full gap-3">
              <Button
                variant="outline"
                onClick={() => setShowNoPendingModal(false)}
                className="flex-1 py-3 text-sm font-bold uppercase"
              >
                {t("endOfDayBannerDismiss")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push(`${ADMIN.END_OF_DAY_VEHICLES}`)}
                className="flex-1 py-3 text-sm font-bold uppercase border-amber-300 text-amber-700 hover:bg-amber-50"
                style={{
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15))",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  color: "#92400e",
                }}
              >
                {t("endOfDayBannerAction")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ MAP DIALOG ═══ */}
      <Dialog open={showMap} onOpenChange={(open) => { if (!open) { setShowMap(false); setMapSearch(''); setFocusVehicleId(null); setMapStatusFilter('all'); } }}>
        <DialogContent className="max-w-7xl sm:max-w-7xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden" showCloseButton={false}>
          <div className="flex h-full overflow-hidden">
            {/* Left: Vehicle Search */}
            <div className="w-[300px] shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--dd-border)' }}>
              <DialogHeader className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--dd-border)' }}>
                <DlgTitle className="text-base font-bold uppercase flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-sky-500" />
                  {t('searchVehicle')}
                </DlgTitle>
              </DialogHeader>
              <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--dd-border)' }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <Input
                    type="text"
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder={t('searchVehicle')}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--dd-border)' }}>
                {([
                  { key: 'all', label: t('all') || 'Tất cả', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
                  { key: 'run', label: t('running'), color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
                  { key: 'park', label: t('stopped'), color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                  { key: 'offline', label: t('disconnected'), color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
                ] as const).map((f) => (
                  <Button
                    key={f.key}
                    variant={mapStatusFilter === f.key ? 'outline' : 'ghost'}
                    size="sm"
                    onClick={() => setMapStatusFilter(f.key)}
                    className="h-7 px-2.5 text-xs font-bold rounded-md"
                    style={{
                      background: mapStatusFilter === f.key ? f.bg : 'transparent',
                      color: mapStatusFilter === f.key ? f.color : 'var(--dd-text-muted)',
                      borderColor: mapStatusFilter === f.key ? f.color + '40' : 'transparent',
                    }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain p-2">
                {vtrackingVehicles
                  .filter(v => {
                    if (mapStatusFilter !== 'all' && v.status !== mapStatusFilter) return false;
                    if (!mapSearch) return true;
                    const q = mapSearch.toLowerCase();
                    return v.license_plate?.toLowerCase().includes(q) || v.vehicle_name?.toLowerCase().includes(q);
                  })
                  .map((v) => {
                    const isActive = focusVehicleId === v.device_id;
                    return (
                      <Button
                        key={v.device_id}
                        variant={isActive ? 'outline' : 'ghost'}
                        onClick={() => setFocusVehicleId(v.device_id)}
                        className={`w-full justify-start h-auto p-3 mb-1.5 transition-all flex-col items-stretch ${isActive
                          ? 'border-sky-400 bg-sky-50 shadow-sm'
                          : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                          }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="h-3 w-3 rounded-full shrink-0 border-2 border-white shadow-sm"
                            style={{
                              background: v.status === 'run' ? '#10b981' : v.status === 'park' ? '#f59e0b' : '#94a3b8',
                            }}
                          />
                          <span className="text-sm font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                            {v.license_plate}
                          </span>
                        </div>
                        <div className="mt-1.5 pl-5 flex items-center justify-between text-xs" style={{ color: 'var(--dd-text-muted)' }}>
                          <span>{v.status === 'run' ? t('running') : v.status === 'park' ? t('stopped') : t('disconnected')}</span>
                          <span className="font-semibold tabular-nums">{v.speed} km/h</span>
                        </div>
                        <div className="mt-0.5 pl-5 text-xs text-left" style={{ color: 'var(--dd-text-muted)' }}>
                          {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)} km` : `${v.distance} m`}
                        </div>
                      </Button>
                    );
                  })}
                {vtrackingVehicles.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-sm font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>
                    {t('empty')}
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
    </div>
  );
};
