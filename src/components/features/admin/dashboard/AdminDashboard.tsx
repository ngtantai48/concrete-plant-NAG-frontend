"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/types/station";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/types/vehicle";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import { Skeleton, Tooltip } from "antd";
import { RefreshCw, Map as MapIcon, Maximize2, Minimize2, Truck, Radio, CheckCircle2, Clock, Route, MapPin, Search, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN } from "@/constants/route";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tVehiclePage = useTranslations("VehiclePage");
  const locale = useLocale();

  const [geofenceStation, setGeofenceStation] = useState<Station | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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
        vehicleApi.getAll(),
        orderApi.getByInitDate(getTodayDate())
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

  const isShiftClosedForDate = useMemo(() =>
    Boolean(operationDate) && orders.some(
      (o) => o.order_status === "canceled" && o.order_init_datetime?.slice(0, 10) === operationDate
    ),
    [orders, operationDate],
  );

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

  const readyVehicles = useMemo(() => vehicles.filter(v => v.vehicle_status === "available"), [vehicles]);

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
    return orders.filter(o => o.order_status === "pending" && o.order_init_datetime?.slice(0, 10) === today);
  }, [orders]);
  const ordersInTransit = useMemo(() => orders.filter(o => o.order_status === "transporting" || o.order_status === "running"), [orders]);
  const ordersCompleted = useMemo(() => {
    const today = getTodayDate();
    return orders.filter(o => o.order_status === "completed" && o.order_end_datetime?.slice(0, 10) === today);
  }, [orders]);

  useEffect(() => {
    if (!loading && ordersPending.length === 0 && ordersAtStation.length === 0 && ordersInTransit.length === 0) {
      setShowNoPendingModal(true);
    }
  }, [loading, ordersPending.length, ordersAtStation.length, ordersInTransit.length]);

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
    <div className={`dashboard-light bg-cover bg-center min-h-screen ${isFullScreen ? 'fixed inset-0 z-[100] overflow-y-auto bg-slate-50' : ''}`}>
      <div className={`p-10 mx-auto bg-transparent`}>

        {/* ═══ HEADER ═══ */}
        <div className="dd-header mb-8 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pt-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <h1 className="text-4xl md:text-6xl font-black uppercase leading-none" style={{ color: 'var(--dd-text-primary)' }}>
                  {t("title")}
                </h1>
              </div>
              <p className="pl-2 text-base font-bold uppercase"
                style={{ color: 'var(--dd-text-muted)' }}>
                {t('systemTime')}: {clock}
              </p>
            </div>

            <div className="flex flex-wrap items-stretch justify-end gap-4">
              {/* LED Status */}
              <div className="flex flex-col items-center justify-between" style={{ borderColor: 'var(--dd-border)' }}>
                <span className="mb-1 text-md font-semibold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  Bảng LED
                </span>
                <Tooltip title={isLedConnected ? 'Bảng LED đang kết nối' : 'Bảng LED đang mất kết nối'}>
                  <div className={`flex items-center gap-2 rounded-full px-4 py-2 border transition-colors ${isLedConnected
                    ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                    : "border-red-200 bg-red-50 text-red-700"
                    }`}>
                    {isLedConnected
                      ? <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
                      : <div className="h-2 w-2 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 8px rgba(248, 113, 113, 0.5)' }} />
                    }
                    <span className="text-base font-bold uppercase">
                      {isLedConnected ? 'KẾT NỐI' : 'MẤT KẾT NỐI'}
                    </span>
                  </div>
                </Tooltip>
              </div>

              {/* Network Status */}
              <div className="flex flex-col items-center justify-between">
                <span className="mb-1 text-md font-semibold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  {t('network')}
                </span>
                <Tooltip title={socketConnected ? t('socketConnected') : t('socketDisconnected')}>
                  <div key={lastSignalTime?.toISOString() || 'offline'} className={`flex items-center gap-2 rounded-full px-4 py-2 border transition-colors ${socketConnected
                    ? "border-emerald-200 text-emerald-700 animate-flash-bg"
                    : "border-red-200 bg-red-50 text-red-700"
                    }`}>
                    {socketConnected
                      ? <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
                      : <div className="h-2 w-2 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 8px rgba(248, 113, 113, 0.5)' }} />
                    }
                    <span className="text-base font-bold uppercase">
                      {socketConnected ? 'TRỰC TUYẾN' : t('disconnected')}
                    </span>
                  </div>
                </Tooltip>
              </div>

              {/* Sync Button */}
              <div className="flex flex-col items-center justify-between">
                <span className="mb-1 text-md font-semibold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  {t('data')}
                </span>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="dd-btn dd-btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {t('sync')}
                </button>
              </div>

              {/* Shift Close */}
              <div className="flex flex-col items-center justify-between border-l pl-4" style={{ borderColor: 'var(--dd-border)' }}>
                <span className="mb-1 text-md font-semibold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  {isShiftClosedForDate ? t('shiftReopenAction') : t('shiftCloseAction')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleShiftToggle}
                    disabled={isShiftSubmitting}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 transition-all font-bold uppercase text-base disabled:opacity-50"
                    style={{
                      background: isShiftClosedForDate
                        ? 'linear-gradient(135deg, rgba(217, 119, 6, 0.14), rgba(245, 158, 11, 0.12))'
                        : 'linear-gradient(135deg, rgba(109, 40, 217, 0.14), rgba(14, 165, 233, 0.1))',
                      border: isShiftClosedForDate
                        ? '1px solid rgba(217, 119, 6, 0.2)'
                        : '1px solid rgba(109, 40, 217, 0.2)',
                      color: isShiftClosedForDate ? '#b45309' : '#6d28d9',
                    }}
                  >
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${isShiftSubmitting ? 'animate-pulse' : ''}`}
                      style={{ background: isShiftClosedForDate ? '#d97706' : '#6d28d9' }} />
                    {isShiftClosedForDate ? t('shiftReopenAction') : t('shiftCloseAction')}
                  </button>
                </div>
              </div>

              {/* Fullscreen Toggle */}
              {/* <div className="flex flex-col items-end justify-between ml-2 border-l pl-4" style={{ borderColor: 'var(--dd-border)' }}>
                <span className="mb-1 text-xs font-semibold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  Giao diện
                </span>
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 transition-all font-bold uppercase text-base"
                  style={{ background: isFullScreen ? 'var(--dd-bg-surface)' : 'var(--dd-sky)', color: isFullScreen ? 'var(--dd-text-primary)' : '#fff' }}
                  title={isFullScreen ? "Thu nhỏ" : "Toàn màn hình"}
                >
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  {isFullScreen ? "Thu Nhỏ" : "Mở Rộng"}
                </button>
              </div> */}
            </div>
          </div>

          {/* ═══ STAT CARDS ═══ */}
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            {statCards.map((card, i) => (
              <div
                key={i}
                className="dd-stat-card p-5 animate-fade-up hover:scale-[1.02] active:scale-[0.98] transition-all cursor-default"
                style={{
                  '--accent-color': card.accentColor,
                  animationDelay: `${i * 0.1}s`
                } as React.CSSProperties}
              >
                <span className="text-sm font-bold uppercase"
                  style={{ color: 'var(--dd-text-muted)' }}>
                  {card.label}
                </span>
                <div className="mt-3 text-6xl font-black"
                  style={{ color: card.accentColor }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ END-OF-DAY BANNER ═══ */}
        {!loading && orders.length > 0 && ordersPending.length === 0 && ordersAtStation.length === 0 && ordersInTransit.length === 0 && (
          <div
            className="mb-6 rounded-2xl border px-6 py-4"
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.06))",
              borderColor: "rgba(245, 158, 11, 0.25)",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <div className="text-base font-bold uppercase" style={{ color: "var(--dd-text-primary)" }}>
                    {t("endOfDayBannerTitle")}
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "var(--dd-text-muted)" }}>
                    {t("endOfDayBannerDescription")}
                  </div>
                </div>
              </div>
              <Link
                href={`${ADMIN.END_OF_DAY_VEHICLES}?mode=today`}
                className="dd-btn flex shrink-0 items-center gap-2 font-bold uppercase"
                style={{
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(217, 119, 6, 0.12))",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  color: "#b45309",
                }}
              >
                {t("endOfDayBannerAction")}
              </Link>
            </div>
          </div>
        )}

        {/* ═══ SYSTEM TELEMETRY ═══ */}
        <div className="mb-6 dd-card p-5 md:p-6">
          <StationStatusPanel stations={stations} orders={orders} deviceStationStatusMap={stationStatusMap} onStationUpdated={fetchAll} />
        </div>

        {/* ═══ COMMAND CORE GRID ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left: Asset Management (col-span-3) */}
          <div className="lg:col-span-3 space-y-6 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            {/* Ready Vehicles */}
            <div className="flex h-[400px] flex-col overflow-hidden dd-card">
              <div className="flex items-center justify-between px-4 py-3 text-base font-semibold uppercase"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <span>{t('readyVehiclesPanel')}</span>
                <span className="dd-chip dd-chip-emerald">{readyVehicles.length}</span>
              </div>
              <div className="overflow-y-auto p-0 flex-1">
                {readyVehicles.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <span className="text-sm font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('noReadyVehicles')}</span>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2 p-3">
                    {readyVehicles.map((v) => (
                      <li key={v.vehicle_id} className="flex items-center gap-3 p-3 transition-colors rounded-xl border shadow-sm cursor-default hover:shadow-md hover:scale-[1.01]"
                        style={{ background: 'var(--dd-bg-surface)', borderColor: 'var(--dd-border)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dd-emerald)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                          <Truck className="h-4 w-4 animate-drive-idle" style={{ color: 'var(--dd-emerald)' }} />
                        </div>
                        <span className="text-base font-bold" style={{ color: 'var(--dd-text-primary)' }}>{v.vehicle_license_plate}{v.vehicle_name ? ` | ${v.vehicle_name}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Canceled / Stopped */}
            <div className="flex h-[280px] flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3 text-base font-semibold"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <span>{t('stoppedMaintenance')}</span>
                <span className="dd-chip dd-chip-amber">{stoppedMaintenanceList.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {stoppedMaintenanceList.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <span className="text-sm font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('empty')}</span>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2 p-3">
                    {stoppedMaintenanceList.map((item) => (
                      <li key={item.id} className="flex items-center justify-between p-3 rounded-xl border shadow-sm cursor-default"
                        style={{ background: 'var(--dd-bg-surface)', borderColor: 'var(--dd-border)' }}>
                        <span className="text-base font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                          {item.label}
                        </span>
                        <span className={`dd-chip ${item.chipClass}`}>{item.statusLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Center: Command Core (col-span-6) */}
          <div className="lg:col-span-6 flex flex-col h-[704px] dd-card overflow-hidden animate-fade-up"
            style={{ boxShadow: '0 0 20px rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.2)', animationDelay: '0.4s' }}>

            {/* Core Header with Toggle */}
            <div className="flex items-center justify-between px-5 py-4 relative z-10"
              style={{ background: 'var(--dd-bg-header)', borderBottom: '1px solid var(--dd-border)' }}>
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ background: '#0ea5e9', boxShadow: '0 0 10px rgba(14, 165, 233, 0.8)' }} />
                <span className="text-lg font-black uppercase truncate" style={{ color: 'var(--dd-text-primary)' }} title="TRUNG TÂM ĐIỀU PHỐI">
                  TRUNG TÂM ĐIỀU PHỐI
                </span>
              </div>

              {/* Segmented Toggle HUD */}
              <div className="flex items-center rounded-lg p-1 backdrop-blur-md shrink-0"
                style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                <button
                  onClick={() => setDispatchMode('auto')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase transition-all rounded-md ${dispatchMode === 'auto'
                    ? 'bg-sky-500/20 text-sky-600 border border-sky-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-700'
                    }`}
                >
                  <span className="hidden sm:inline">AUTO</span>
                </button>
                <div className="w-[1px] h-4 mx-1 opacity-20" style={{ background: 'var(--dd-text-muted)' }} />
                <button
                  onClick={() => setDispatchMode('manual')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase transition-all rounded-md ${dispatchMode === 'manual'
                    ? 'bg-indigo-500/20 text-indigo-600 border border-indigo-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-700'
                    }`}
                >
                  <span className="hidden sm:inline">MANUAL</span>
                </button>
                <div className="w-[1px] h-4 mx-1 opacity-20" style={{ background: 'var(--dd-text-muted)' }} />
                <button
                  onClick={() => setShowMap(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase transition-all rounded-md text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-100"
                >
                  <MapIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">MAP</span>
                </button>
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
          <div className="lg:col-span-3 h-[704px] animate-fade-up" style={{ animationDelay: '0.6s' }}>
            <div className="flex h-full flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3 text-base font-semibold"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>{t('completedToday')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {ordersActive.length > 0 && (
                    <span className="dd-chip" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                      {ordersActive.length} {t('running')}
                    </span>
                  )}
                  <span className="dd-chip dd-chip-emerald">{ordersCompleted.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {ordersTodayPanel.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-md"
                        style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                        <CheckCircle2 className="h-7 w-7 text-emerald-400 opacity-50" />
                      </div>
                      <span className="mt-4 text-sm font-bold uppercase"
                        style={{ color: 'var(--dd-text-muted)' }}>
                        {t('noCompletedToday')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3 p-3">
                    {ordersTodayPanel.map((o) => {
                      const isCompleted = o.order_status === "completed";
                      const accentColor = isCompleted ? '#10b981' : '#0ea5e9';
                      const hoverBorder = isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(14, 165, 233, 0.4)';
                      return (
                        <li key={o.order_id} className="dd-surface p-4 transition-all relative overflow-hidden"
                          style={{ borderRadius: '12px', border: '1px solid var(--dd-border)' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = hoverBorder}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />

                          <div className="flex justify-between items-end pl-2">
                            <div className="flex items-center gap-3">
                              <Truck className="w-5 h-5" style={{ color: accentColor }} />
                              <span className="text-xl font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                                {o.vehicles?.vehicle_license_plate ? `${o.vehicles.vehicle_license_plate}${o.vehicles.vehicle_name ? ` | ${o.vehicles.vehicle_name}` : ''}` : `#${o.order_id}`}
                              </span>
                            </div>
                            {isCompleted ? (
                              <span className="dd-chip dd-chip-emerald">
                                {t('completed')}
                              </span>
                            ) : (
                              <span className="dd-chip" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                                {o.order_status === "collecting" ? t('collecting') : t('running')}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 pl-2 flex items-center justify-between">
                            <div className="text-xs font-bold uppercase"
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
                                  <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: accentColor }}>
                                    <Clock className="w-3 h-3" />
                                    <span>{hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}m` : `${mins}m`}</span>
                                  </div>
                                );
                              })()}
                              {o.order_end_datetime && (
                                <div className="text-xs font-semibold" style={{ color: 'var(--dd-text-muted)' }}>
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
                              <div className="mt-2 pl-2 flex items-center gap-4">
                                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#0ea5e9' }}>
                                  <Route className="w-3 h-3" />
                                  <span>{distanceKm} km</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#f59e0b' }}>
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
        <div className=" mt-8 flex flex-col justify-between gap-4 pt-4 md:flex-row md:items-baseline whitespace-nowrap"
          style={{ borderTop: '1px solid var(--dd-border)' }}>
          <div className="flex items-center gap-4 text-sm font-semibold uppercase"
            style={{ color: 'var(--dd-text-muted)' }}>
            <span className="dd-chip dd-chip-red flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full animate-ping" style={{ background: '#f87171' }} />
              {t('systemSignal')}
            </span>
            <span>{t('systemListening')}</span>
          </div>
          <p className="text-sm uppercase" style={{ color: 'var(--dd-text-muted)' }}>
            {t('connectionStable')} • {t('plantName')}
          </p>
        </div>
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
              <button
                type="button"
                onClick={() => setShowNoPendingModal(false)}
                className="dd-btn flex-1 py-3 text-sm font-bold uppercase"
                style={{
                  background: "var(--dd-bg-surface)",
                  border: "1px solid var(--dd-border)",
                  color: "var(--dd-text-muted)",
                }}
              >
                {t("endOfDayBannerDismiss")}
              </button>
              <button
                type="button"
                onClick={() => router.push(`${ADMIN.END_OF_DAY_VEHICLES}`)}
                className="dd-btn flex-1 py-3 text-sm font-bold uppercase"
                style={{
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15))",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  color: "#92400e",
                }}
              >
                {t("endOfDayBannerAction")}
              </button>
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
                <DialogTitle className="text-base font-bold uppercase flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-sky-500" />
                  {t('searchVehicle')}
                </DialogTitle>
              </DialogHeader>
              <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--dd-border)' }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder={t('searchVehicle')}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                    style={{ borderColor: 'var(--dd-border)' }}
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
                  <button
                    key={f.key}
                    onClick={() => setMapStatusFilter(f.key)}
                    className="px-2.5 py-1 text-xs font-bold rounded-full transition-all border"
                    style={{
                      background: mapStatusFilter === f.key ? f.bg : 'transparent',
                      color: mapStatusFilter === f.key ? f.color : 'var(--dd-text-muted)',
                      borderColor: mapStatusFilter === f.key ? f.color + '40' : 'transparent',
                    }}
                  >
                    {f.label}
                  </button>
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
                      <button
                        key={v.device_id}
                        onClick={() => setFocusVehicleId(v.device_id)}
                        className={`w-full text-left p-3 rounded-xl mb-1.5 border transition-all ${isActive
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
                        <div className="mt-0.5 pl-5 text-xs" style={{ color: 'var(--dd-text-muted)' }}>
                          {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)} km` : `${v.distance} m`}
                        </div>
                      </button>
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
