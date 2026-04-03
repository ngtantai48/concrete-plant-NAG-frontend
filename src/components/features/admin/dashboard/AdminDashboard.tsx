"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/types/station";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/types/vehicle";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import { Skeleton, Tooltip } from "antd";
import { RefreshCw, Activity, Map as MapIcon, Maximize2, Minimize2, Truck, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import dynamic from "next/dynamic";

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
      const res = await orderApi.getAll();
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
        orderApi.getAll()
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
  const { stationStatusMap } = useDeviceHeartbeat();

  const readyVehicles = useMemo(() => vehicles.filter(v => v.vehicle_status === "available"), [vehicles]);

  const stoppedMaintenanceList = useMemo(() => {
    const list: { id: string; label: string; statusLabel: string; chipClass: string }[] = [];

    vehicles.forEach(v => {
      if (v.vehicle_status === "incident" || v.vehicle_status === "maintenance") {
        const isIncident = v.vehicle_status === "incident";
        list.push({
          id: `veh-${v.vehicle_id}`,
          label: v.vehicle_license_plate,
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
  const outsideOrders = useMemo(
    () => orders.filter(o => o.order_status === "running" || o.order_status === "transporting"),
    [orders],
  );

  const ordersAtStation = useMemo(() => orders.filter(o => o.order_status === "collecting"), [orders]);
  const ordersPending = useMemo(() => orders.filter(o => o.order_status === "pending"), [orders]);
  const ordersInTransit = useMemo(() => orders.filter(o => o.order_status === "transporting" || o.order_status === "running"), [orders]);
  const ordersCompleted = useMemo(() => orders.filter(o => o.order_status === "completed"), [orders]);

  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('auto');
  const [showMap, setShowMap] = useState(true);

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

            <div className="flex items-stretch gap-4">
              {/* Network Status */}
              <div className="flex flex-col items-end justify-between">
                <span className="mb-1 text-xs font-semibold uppercase"
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
              <div className="flex flex-col items-end justify-between">
                <span className="mb-1 text-xs font-semibold uppercase"
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

              {/* Fullscreen Toggle */}
              <div className="flex flex-col items-end justify-between ml-2 border-l pl-4" style={{ borderColor: 'var(--dd-border)' }}>
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
              </div>
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
                        <span className="text-base font-bold" style={{ color: 'var(--dd-text-primary)' }}>{v.vehicle_license_plate}</span>
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
                  onClick={() => setShowMap((previous) => !previous)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase transition-all rounded-md ${showMap
                    ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-700'
                    }`}
                >
                  <MapIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">MAP</span>
                </button>
              </div>
            </div>

            {/* Core Display Area */}
            <div className="flex-1 overflow-hidden relative bg-transparent p-2">
              <div className="flex h-full flex-col gap-2">
                {showMap && (
                  <div className="h-[230px] w-full rounded-xl overflow-hidden shrink-0"
                    style={{ border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <StationMap
                      stationLongitude={geofenceStation?.station_gps_longitude ?? null}
                      stationLatitude={geofenceStation?.station_gps_latitude ?? null}
                      radius={geofenceStation?.station_gps_geofencing || 500}
                      vehicles={vtrackingVehicles}
                    />
                  </div>
                )}

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

          {/* Right: Live Execution (col-span-3) */}
          <div className="lg:col-span-3 h-[704px] animate-fade-up" style={{ animationDelay: '0.6s' }}>
            <div className="flex h-full flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(56, 189, 248, 0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3 text-base font-semibold"
                style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                <span>{t('outsideStation')}</span>
                <span className="dd-chip dd-chip-sky">{outsideOrders.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {outsideOrders.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center justify-center relative w-full h-full">
                      {/* Radar Animated Rings */}
                      <div className="absolute w-24 h-24 rounded-full border border-sky-400 animate-radar" />
                      <div className="absolute w-32 h-32 rounded-full border border-sky-400 animate-radar" style={{ animationDelay: '1s' }} />

                      <div className="h-14 w-14 z-10 rounded-full flex items-center justify-center backdrop-blur-md"
                        style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                        <Activity className="h-7 w-7 text-sky-500 animate-pulse" />
                      </div>
                      <span className="mt-5 text-sm font-bold uppercase animate-pulse"
                        style={{ color: 'var(--dd-sky)' }}>
                        Đang quét dữ liệu...
                      </span>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3 p-3">
                    {outsideOrders.map((o) => (
                      <li key={o.order_id} className="dd-surface p-4 transition-all relative overflow-hidden"
                        style={{ borderRadius: '12px', border: '1px solid var(--dd-border)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                        {/* Scanline accent on the left */}
                        <div className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ background: o.order_status === 'transporting' ? '#0ea5e9' : '#f59e0b' }} />

                        <div className="flex justify-between items-end pl-2">
                          <div className="flex items-center gap-3">
                            <Truck className={`w-5 h-5 ${o.order_status === 'transporting' ? 'text-sky-500 animate-drive-run' : 'text-amber-500 animate-drive-idle'}`} />
                            <span className="text-xl font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                              {o.vehicles?.vehicle_license_plate || `#${o.order_id}`}
                            </span>
                          </div>
                          <span className={`dd-chip ${o.order_status === 'transporting' ? 'dd-chip-sky' : 'dd-chip-amber'}`}>
                            {o.order_status === 'transporting' ? t('transporting') : t('running')}
                          </span>
                        </div>
                        <div className="mt-3 pl-2 flex items-center justify-between">
                          <div className="text-xs font-bold uppercase"
                            style={{ color: 'var(--dd-text-muted)' }}>
                            TRẠM: {o.stations?.station_name || t('unassigned')}
                          </div>
                          {/* Simulated mini ETA/Dist marker */}
                          <div className="flex items-center gap-1 opacity-50">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <div className="w-1 h-1 rounded-full bg-slate-500" />
                            <div className="w-0.5 h-0.5 rounded-full bg-slate-600" />
                          </div>
                        </div>
                      </li>
                    ))}
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
    </div>
  );
};
