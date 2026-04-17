"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/types/station";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/types/vehicle";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import { RefreshCw, Map as MapIcon, Maximize2, Minimize2, Truck, Radio, CheckCircle2, Clock, Route, MapPin, Search, Calendar as CalendarIcon, Timer, ArrowRight, Ellipsis, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogHeader, DialogTitle as DlgTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";




import StationStatusPanel from "./StationStatusPanel";
import ActivityFlow, { type DispatchMode } from "./ActivityFlow";
import VehicleStatusChange from "./VehicleStatusChange";

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
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();

  const [geofenceStation, setGeofenceStation] = useState<Station | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const operationDate = selectedDate;
  const isPastDate = selectedDate < getTodayDate();
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




  const fetchAll = useCallback(async () => {
    try {
      const apiCalls = [
        stationApi.getAll(),
        vehicleApi.getAll({ limit: 100 }),
        orderApi.getByInitDate(selectedDate),
        orderApi.getByStatus('pending'),
      ] as any[];

      const results = await Promise.allSettled(apiCalls);

      if (results[0].status === 'fulfilled') {
        const sRes = results[0].value;
        const fetchedStations = sRes.data?.data || sRes.data || [];
        setStations(fetchedStations);
        setGeofenceStation(fetchedStations.find((s: Station) => s.station_gps_longitude != null && s.station_gps_latitude != null) || fetchedStations[0] || null);
      } else {
        console.warn('[fetchAll] stations failed:', results[0].reason);
      }
      if (results[1].status === 'fulfilled') {
        const vRes = results[1].value;
        setVehicles(vRes.data?.data || vRes.data || []);
      } else {
        console.warn('[fetchAll] vehicles failed:', results[1].reason);
      }
      if (results[2].status === 'fulfilled') {
        const oRes = results[2].value;
        setOrders(oRes.data?.data || oRes.data || []);
      } else {
        console.warn('[fetchAll] ordersByDate failed:', results[2].reason);
      }
      if (results[3]?.status === 'fulfilled') {
        const pRes = results[3].value;
        const list = pRes.data?.data || pRes.data || [];
        setPendingOrders(list);
        console.log('[fetchAll] pending count:', Array.isArray(list) ? list.length : 'n/a');
      } else {
        console.warn('[fetchAll] pending failed:', results[3]?.reason);
      }
    } catch (err) {
      console.error('[fetchAll] unexpected:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  const inYardVehicles = useMemo(() => vtrackingVehicles.filter(v => v.inRange && v.vehicle_name?.toUpperCase().startsWith('X')), [vtrackingVehicles]);

  const stoppedMaintenanceList = useMemo(() => {
    const list: { id: string; label: string; statusLabel: string; chipClass: string }[] = [];

    vehicles.forEach(v => {
      if (v.vehicle_status === "incident" || v.vehicle_status === "maintenance" || v.vehicle_status === "other") {
        const isIncident = v.vehicle_status === "incident";
        const isOther = v.vehicle_status === "other";
        list.push({
          id: `veh-${v.vehicle_id}`,
          label: v.vehicle_license_plate ? `${v.vehicle_license_plate}${v.vehicle_name ? ` | ${v.vehicle_name}` : ''}` : '',
          statusLabel: isIncident ? (t('incident') || 'Sự cố') : isOther ? 'Việc khác' : (tVehiclePage('maintenanceOption') || 'Bảo dưỡng'),
          chipClass: isIncident ? 'dd-chip-red' : isOther ? 'dd-chip-slate' : 'dd-chip-amber'
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
    return pendingOrders.filter(o => {
      const vStatus = o.vehicles?.vehicle_status?.toLowerCase();
      const isShiftClosed = o.shift_closing?.shift_status === 1;
      return !isShiftClosed && vStatus !== 'maintenance' && vStatus !== 'incident';
    });
  }, [pendingOrders]);

  const ordersAtStation = useMemo(() => orders.filter(o => o.order_status === "collecting"), [orders]);
  const ordersPending = useMemo(() => {
    return pendingOrders.filter(o => o.vehicles?.vehicle_status === "available");
  }, [pendingOrders]);
  const ordersInTransit = useMemo(() => orders.filter(o => o.order_status === "transporting" || o.order_status === "running"), [orders]);
  const ordersCompleted = useMemo(() => {
    return orders.filter(o => o.order_status === "completed");
  }, [orders]);



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

  const hasUnclosedShift = useMemo(() => {
    return pendingOrders.some((o) => o.shift_closing?.shift_status === 0);
  }, [pendingOrders]);

  const [isShiftClosing, setIsShiftClosing] = useState(false);
  const [isShiftCloseDialogOpen, setIsShiftCloseDialogOpen] = useState(false);

  const handleShiftClose = useCallback(async () => {
    setIsShiftCloseDialogOpen(false);
    setIsShiftClosing(true);
    try {
      await orderApi.shiftClose({ operation_date: selectedDate });
      toast.success(t('shiftCloseSuccess', { date: selectedDate }));
      fetchAll();
    } catch {
      toast.error(t('shiftCloseFailed'));
    } finally {
      setIsShiftClosing(false);
    }
  }, [selectedDate, t, fetchAll]);

  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('auto');
  const [showMap, setShowMap] = useState(false);

  const [mapSearch, setMapSearch] = useState('');
  const [focusVehicleId, setFocusVehicleId] = useState<string | null>(null);
  const [mapStatusFilter, setMapStatusFilter] = useState<'all' | 'run' | 'park' | 'offline'>('all');
  const [selectedVehicleTrips, setSelectedVehicleTrips] = useState<{ vehicle: Vehicle; orders: Order[] } | null>(null);

  const vehicleTripMap = useMemo(() => {
    const map = new Map<number, Order[]>();
    orders.filter(o => ["completed", "running", "transporting"].includes(o.order_status)).forEach(o => {
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

      // Get latest update time for vehicle A
      const aLatestTime = aTrips.length > 0
        ? Math.max(0, ...aTrips.map(o => o.updated_at ? new Date(o.updated_at).getTime() : 0))
        : 0;

      // Get latest update time for vehicle B
      const bLatestTime = bTrips.length > 0
        ? Math.max(0, ...bTrips.map(o => o.updated_at ? new Date(o.updated_at).getTime() : 0))
        : 0;

      // Sort by latest time descending
      if (bLatestTime !== aLatestTime) return bLatestTime - aLatestTime;

      // Fallback to license plate
      return a.vehicle_license_plate.localeCompare(b.vehicle_license_plate);
    });
  }, [vehicles, vehicleTripMap]);

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
      accentColor: '#22c55e',
      glowColor: 'rgba(34, 197, 94, 0.12)',
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
      <div className={`p-2 lg:p-4 mx-auto bg-transparent w-full flex-1 flex flex-col min-h-0`}>

        {/* ═══ HEADER ═══ */}
        <div className="dd-header mb-2 p-3 shrink-0">
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
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-sm font-bold uppercase cursor-default ${isLedConnected
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
                  <div key={lastSignalTime?.toISOString() || 'offline'} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-sm font-bold uppercase cursor-default ${socketConnected
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

              {/* Date Picker */}
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 w-[150px] px-2 text-sm font-bold justify-start text-left border-slate-200 bg-white/80 transition-all shadow-none hover:bg-white hover:border-sky-400 focus-visible:ring-1 focus-visible:ring-sky-500",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 text-sky-500" />
                    {selectedDate ? format(new Date(selectedDate), "dd/MM/yyyy") : <span>Chọn ngày</span>}
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

              {/* Shift Close Button */}
              <div className="border-l border-slate-200 pl-2 flex items-center gap-1.5">
                {!isPastDate && hasUnclosedShift && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setIsShiftCloseDialogOpen(true)}
                          disabled={isShiftClosing}
                          className="uppercase"
                        >
                          {isShiftClosing ? <RefreshCw className="animate-spin" /> : <ShieldCheck />}
                          {t('shiftCloseAction')}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent >
                        <p>{t('shiftCloseAction')} {format(new Date(selectedDate), "dd/MM/yyyy")}</p>
                      </TooltipContent>
                    </Tooltip>

                    <AlertDialog open={isShiftCloseDialogOpen} onOpenChange={setIsShiftCloseDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('confirmShiftCloseTitle')}</AlertDialogTitle>
                          {/* <AlertDialogDescription>
                            {t.rich('confirmShiftCloseDescription', { 
                              date: format(new Date(selectedDate), "dd/MM/yyyy"),
                              strong: (chunks) => <strong>{chunks}</strong>
                            })}
                          </AlertDialogDescription> */}
                          <AlertDialogDescription>{t('confirmShiftCloseDescription')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleShiftClose}
                            disabled={isShiftClosing}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            {t('shiftCloseAction')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>

              {/* Sync Button */}
              {/* <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-7 px-2.5 text-xs font-bold uppercase gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                {t('sync')}
              </Button> */}
            </div>
          </div>

          {/* ═══ STAT CARDS ═══ */}
          {/* {!isPastDate && (
            <div className="mt-1 grid grid-cols-2 gap-1.5 md:grid-cols-5 shrink-0">
              {statCards.map((card, i) => (
                <Card
                  key={i}
                  className="dd-stat-card py-0 animate-fade-up hover:scale-[1.02] active:scale-[0.98] transition-all cursor-default"
                  style={{
                    '--accent-color': card.accentColor,
                    animationDelay: `${i * 0.1}s`
                  } as React.CSSProperties}
                >
                  <CardContent className="p-1.5 lg:px-2.5 lg:py-1 flex items-center justify-between gap-2 h-full">
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
          )} */}
        </div>


        {!isPastDate && !loading && !hasUnclosedShift && (
          <div
            className="mb-1 shrink-0 rounded-lg border px-3 py-1 cursor-pointer hover:bg-slate-50 transition-colors"
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.06))",
              borderColor: "rgba(245, 158, 11, 0.25)",
            }}
            onClick={() => router.push('/admin/shift-slots')}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-bold uppercase" style={{ color: "var(--dd-text-primary)" }}>
                {t("forgotShiftSlotsBannerTitle")} — <span style={{ color: "var(--dd-text-muted)" }}>{t("forgotShiftSlotsBannerDescription")}</span>
              </span>
            </div>
          </div>
        )}

        {/* ═══ COMMAND CORE GRID ═══ */}
        <div className={`flex ${isPastDate ? '' : 'gap-4'} flex-1 min-h-0 overflow-hidden`}>

          {/* Left: Stations + Vehicles + Dispatch Center (70%) */}
          {!isPastDate && (
            <div className="flex flex-col gap-1.5 h-full min-h-0 animate-fade-up" style={{ flex: '7 1 0%', animationDelay: '0.2s' }}>

              {/* ═══ SYSTEM TELEMETRY ═══ */}
              <div className="shrink-0">
                <StationStatusPanel stations={stations} orders={orders} deviceStationStatusMap={stationStatusMap} onStationUpdated={fetchAll} />
              </div>

              {/* Vehicles + Dispatch side by side */}
              <div className="flex gap-2 flex-1 min-h-0">

                {/* Vehicles Column: Xe trong bãi + Dừng/Bảo trì stacked vertically */}
                <div className="flex flex-col gap-1.5 shrink-0 min-h-0" style={{ width: '320px' }}>
                  {/* Ready Vehicles */}
                  <div className="flex flex-col overflow-hidden dd-card min-h-0" style={{ flex: '7 1 0%' }}>
                    <div className="flex items-center justify-between px-3 py-1.5 text-sm font-extrabold uppercase"
                      style={{ borderBottom: '1px solid var(--dd-border)' }}>
                      <span>{t('readyVehiclesPanel')}</span>
                      <span className="text-sm font-extrabold">{inYardVehicles.length} {t('vehicleCount')}</span>
                    </div>
                    <div className="overflow-y-auto p-0 flex-1">
                      {inYardVehicles.length === 0 ? (
                        <div className="flex h-full items-center justify-center p-3">
                          <span className="text-xs font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('noReadyVehicles')}</span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-1 px-2 py-2">
                          {inYardVehicles.map((v) => (
                            <li key={v.device_id} className="justify-between flex items-center gap-2 px-3 py-2 transition-colors rounded-md border shadow-sm cursor-default hover:shadow-md"
                              style={{ background: 'var(--dd-bg-surface)', borderColor: 'var(--dd-border)' }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dd-emerald)'}
                              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                                  <Truck className="h-2.5 w-2.5 animate-drive-idle" style={{ color: 'var(--dd-emerald)' }} />
                                </div>
                                <span className="font-bold text-sm truncate" style={{ color: 'var(--dd-text-primary)' }}>{v.license_plate}{v.vehicle_name ? ` | ${v.vehicle_name}` : ''}</span>
                              </div>
                              <div className="text-sm me-2 shrink-0">
                                <span className="font-semibold" style={{ color: 'var(--dd-text-muted)' }}>
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
                  <div className="flex flex-col overflow-hidden dd-card min-h-0" style={{ flex: '3 1 0%', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                    <div className="flex items-center justify-between px-3 py-1.5 text-sm font-extrabold uppercase"
                      style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                      <span>{t('stoppedMaintenance')}</span>
                      <span className="text-sm font-extrabold">{stoppedMaintenanceList.length} {t('vehicleCount')}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                      {stoppedMaintenanceList.length === 0 ? (
                        <div className="flex h-full items-center justify-center p-2">
                          <span className="text-xs font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>{t('empty')}</span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-1 px-2 py-2">
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

                {/* Dispatch Center */}
                <div className="flex flex-1 flex-col h-full min-h-0 dd-card overflow-hidden"
                  style={{ boxShadow: '0 0 20px rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.2)' }}>

                  {/* Core Header with Toggle */}
                  <div className="flex items-center justify-between p-2 relative z-10"
                    style={{ background: 'var(--dd-bg-header)', borderBottom: '1px solid var(--dd-border)' }}>
                    <div className="flex items-center gap-2 ms-4">
                      <div className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#0ea5e9', boxShadow: '0 0 10px rgba(14, 165, 233, 0.8)' }} />
                      <span className="text-base font-extrabold uppercase" title="Thứ tự lốt xe">Thứ tự lốt xe</span>
                    </div>

                    {/* Segmented Toggle HUD */}
                    <div className="flex items-center rounded-md p-0.5 backdrop-blur-md shrink-0"
                      style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
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
          {!isPastDate && (
            <div className="flex flex-col h-full min-h-0 animate-fade-up" style={{ flex: '3 1 0%', animationDelay: '0.6s' }}>
              <div className="flex h-full flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div className="flex items-center justify-between px-3 py-2 text-sm font-extrabold uppercase"
                  style={{ borderBottom: '1px solid var(--dd-border)' }}>
                  <div className="flex items-center gap-1.5">
                    <span>{t('completedToday')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ordersCompleted.length > 0 && (
                      <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                        {ordersCompleted.length} {t('completed')}
                      </span>
                    )}
                    <span className="text-sm font-extrabold">{vehicles.length} {t('vehicleCount')}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sortedVehiclesWithTrips.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-md"
                          style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                          <Truck className="h-6 w-6 text-emerald-400 opacity-50" />
                        </div>
                        <span className="mt-3 text-xs font-bold uppercase"
                          style={{ color: 'var(--dd-text-muted)' }}>
                          {t('noCompletedToday')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5 p-2">
                      {sortedVehiclesWithTrips.map((v) => {
                        const trips = vehicleTripMap.get(v.vehicle_id) || [];
                        const hasTrips = trips.length > 0;
                        const hasActive = trips.some(o => o.order_status === 'running' || o.order_status === 'transporting');
                        const accentColor = hasActive ? '#0ea5e9' : (hasTrips ? '#10b981' : '#94a3b8');
                        const hoverBorder = hasActive ? 'rgba(14, 165, 233, 0.4)' : (hasTrips ? 'rgba(16, 185, 129, 0.4)' : 'rgba(148, 163, 184, 0.3)');
                        const chipClass = hasActive ? 'dd-chip-sky' : 'dd-chip-emerald';

                        const totalDistanceKm = trips.reduce((sum, o) => {
                          if (o.order_multi) return sum + (o.order_multi.distance_end - o.order_multi.distance_start);
                          return sum;
                        }, 0);
                        const totalStops = trips.reduce((sum, o) => {
                          if (o.order_multi) return sum + (o.order_multi.nStop_end - o.order_multi.nStop_start);
                          return sum;
                        }, 0);
                        const totalStopSecs = trips.reduce((sum, o) => {
                          if (o.order_multi && o.order_multi.stop_duration_seconds) return sum + o.order_multi.stop_duration_seconds;
                          return sum;
                        }, 0);
                        const totalTimeMs = trips.reduce((sum, o) => {
                          if (o.order_start_datetime && o.order_end_datetime) {
                            return sum + (new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime());
                          }
                          return sum;
                        }, 0);
                        const totalMixMs = trips.reduce((sum, o) => {
                          const mixInVal = o.order_multi?.checkin_time_station || o.checkin_time_station;
                          const mixOutVal = o.order_multi?.checkout_time_station || o.checkout_time_station;
                          if (mixInVal && mixOutVal) {
                            const diff = new Date(mixOutVal).getTime() - new Date(mixInVal).getTime();
                            if (diff > 0) return sum + diff;
                          }
                          return sum;
                        }, 0);
                        const totalMins = Math.floor(totalTimeMs / 60000);
                        const hours = Math.floor(totalMins / 60);
                        const mins = totalMins % 60;
                        const totalStopMins = Math.floor(totalStopSecs / 60);
                        const stopHours = Math.floor(totalStopMins / 60);
                        const stopMinsRemain = totalStopMins % 60;
                        const stopDurationStr = stopHours > 0 ? `${stopHours} giờ ${stopMinsRemain} phút` : `${totalStopMins} phút`;

                        const totalMixMins = Math.floor(totalMixMs / 60000);
                        const mixTotalHours = Math.floor(totalMixMins / 60);
                        const mixTotalMinsRemain = totalMixMins % 60;
                        const mixTotalDurationStr = mixTotalHours > 0 ? `${mixTotalHours} giờ ${mixTotalMinsRemain} phút` : `${totalMixMins} phút`;
                        return (
                          <li key={v.vehicle_id}
                            className="dd-surface px-2 py-1.5 transition-all relative overflow-hidden cursor-pointer"
                            style={{ borderRadius: '6px', border: '1px solid var(--dd-border)' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = hoverBorder}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}
                            onClick={() => setSelectedVehicleTrips({ vehicle: v, orders: trips })}>
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
                            <div className="flex justify-between items-center pl-2">
                              <div className="flex items-center gap-1.5">
                                {/* <Truck className="w-3.5 h-3.5" style={{ color: accentColor }} /> */}
                                <span className="text-sm font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                                  {v.vehicle_license_plate}{v.vehicle_name ? ` | ${v.vehicle_name}` : ''}
                                </span>
                              </div>
                              {hasTrips ? (
                                <span className={`dd-chip ${chipClass} text-[10px] px-1.5 py-0.5`}>
                                  {hasActive ? 'Đang di chuyển' : t('tripCount', { count: trips.length })}
                                </span>
                              ) : (
                                <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">
                                  {t('noTrips')}
                                </span>
                              )}
                            </div>
                            {hasTrips && (
                              <div className="mt-1 pl-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {totalDistanceKm > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#0ea5e9' }}>
                                    <Route className="w-3 h-3" />
                                    <span>{totalDistanceKm.toFixed(1)} km</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#ec4899' }}>
                                  <MapPin className="w-3 h-3" />
                                  {Number.isNaN(totalStops) ? (
                                    <>
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Loading...</span>
                                    </>
                                  ) : (
                                    <span>{totalStops} {t('stops')}{totalStopSecs > 0 ? ` ( ${stopDurationStr} )` : ''}</span>
                                  )}
                                </div>
                                {totalMins > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
                                    <Clock className="w-3 h-3" />
                                    <span>{hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`}</span>
                                  </div>
                                )}
                                {totalMixMs > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#8b5cf6' }}>
                                    <Timer className="w-3 h-3" />
                                    <span>Trộn: {mixTotalDurationStr}</span>
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

          {/* Past date: full-width Today's Trips by Vehicle */}
          {isPastDate && (
            <div className="flex-1 h-full min-h-0 animate-fade-up" style={{ animationDelay: '0.6s' }}>
              <div className="flex h-full flex-col overflow-hidden dd-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase"
                  style={{ background: 'var(--dd-bg-header)', color: 'var(--dd-text-primary)', borderBottom: '1px solid var(--dd-border)' }}>
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t('completedToday')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ordersCompleted.length > 0 && (
                      <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                        {ordersCompleted.length} {t('completed')}
                      </span>
                    )}
                    <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">{vehicles.length} xe</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sortedVehiclesWithTrips.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-md"
                          style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                          <Truck className="h-6 w-6 text-emerald-400 opacity-50" />
                        </div>
                        <span className="mt-3 text-xs font-bold uppercase"
                          style={{ color: 'var(--dd-text-muted)' }}>
                          {t('noCompletedToday')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5 p-2">
                      {sortedVehiclesWithTrips.map((v) => {
                        const trips = vehicleTripMap.get(v.vehicle_id) || [];
                        const hasTrips = trips.length > 0;
                        const accentColor = hasTrips ? '#10b981' : '#94a3b8';
                        const hoverBorder = hasTrips ? 'rgba(16, 185, 129, 0.4)' : 'rgba(148, 163, 184, 0.3)';
                        const totalDistanceKm = trips.reduce((sum, o) => {
                          if (o.order_multi) return sum + (o.order_multi.distance_end - o.order_multi.distance_start);
                          return sum;
                        }, 0);
                        const totalStops = trips.reduce((sum, o) => {
                          if (o.order_multi) return sum + (o.order_multi.nStop_end - o.order_multi.nStop_start);
                          return sum;
                        }, 0);
                        const totalStopSecs = trips.reduce((sum, o) => {
                          if (o.order_multi && o.order_multi.stop_duration_seconds) return sum + o.order_multi.stop_duration_seconds;
                          return sum;
                        }, 0);
                        const totalTimeMs = trips.reduce((sum, o) => {
                          if (o.order_start_datetime && o.order_end_datetime) {
                            return sum + (new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime());
                          }
                          return sum;
                        }, 0);
                        const totalMixMs = trips.reduce((sum, o) => {
                          const mixInVal = o.order_multi?.checkin_time_station || o.checkin_time_station;
                          const mixOutVal = o.order_multi?.checkout_time_station || o.checkout_time_station;
                          if (mixInVal && mixOutVal) {
                            const diff = new Date(mixOutVal).getTime() - new Date(mixInVal).getTime();
                            if (diff > 0) return sum + diff;
                          }
                          return sum;
                        }, 0);
                        const totalMins = Math.floor(totalTimeMs / 60000);
                        const hours = Math.floor(totalMins / 60);
                        const mins = totalMins % 60;
                        const totalStopMins = Math.floor(totalStopSecs / 60);
                        const stopHours = Math.floor(totalStopMins / 60);
                        const stopMinsRemain = totalStopMins % 60;
                        const stopDurationStr = stopHours > 0 ? `${stopHours} giờ ${stopMinsRemain} phút` : `${totalStopMins} phút`;

                        const totalMixMins = Math.floor(totalMixMs / 60000);
                        const mixTotalHours = Math.floor(totalMixMins / 60);
                        const mixTotalMinsRemain = totalMixMins % 60;
                        const mixTotalDurationStr = mixTotalHours > 0 ? `${mixTotalHours} giờ ${mixTotalMinsRemain} phút` : `${totalMixMins} phút`;
                        return (
                          <li key={v.vehicle_id}
                            className="dd-surface px-2 py-1.5 transition-all relative overflow-hidden cursor-pointer"
                            style={{ borderRadius: '6px', border: '1px solid var(--dd-border)' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = hoverBorder}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dd-border)'}
                            onClick={() => setSelectedVehicleTrips({ vehicle: v, orders: trips })}>
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
                            <div className="flex justify-between items-center pl-2">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                <span className="text-xs font-bold" style={{ color: 'var(--dd-text-primary)' }}>
                                  {v.vehicle_license_plate}{v.vehicle_name ? ` | ${v.vehicle_name}` : ''}
                                </span>
                              </div>
                              {hasTrips ? (
                                <span className="dd-chip dd-chip-emerald text-[10px] px-1.5 py-0.5">
                                  {t('tripCount', { count: trips.length })}
                                </span>
                              ) : (
                                <span className="dd-chip dd-chip-slate text-[10px] px-1.5 py-0.5">
                                  {t('noTrips')}
                                </span>
                              )}
                            </div>
                            {hasTrips && (
                              <div className="mt-1.5 pl-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {totalDistanceKm > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#0ea5e9' }}>
                                    <Route className="w-3 h-3" />
                                    <span>{totalDistanceKm.toFixed(1)} km</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#ec4899' }}>
                                  <MapPin className="w-3 h-3" />
                                  {Number.isNaN(totalStops) ? (
                                    <>
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Loading...</span>
                                    </>
                                  ) : (
                                    <span>{totalStops} {t('stops')}{totalStopSecs > 0 ? ` ( ${stopDurationStr} )` : ''}</span>
                                  )}
                                </div>
                                {totalMins > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#f59e0b' }}>
                                    <Clock className="w-3 h-3" />
                                    <span>{hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`}</span>
                                  </div>
                                )}
                                {totalMixMs > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#8b5cf6' }}>
                                    <Timer className="w-3 h-3" />
                                    <span>Trộn: {mixTotalDurationStr}</span>
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
      <Dialog open={!!selectedVehicleTrips} onOpenChange={(open) => { if (!open) setSelectedVehicleTrips(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] p-0 gap-0 overflow-hidden" showCloseButton={false}>
          {selectedVehicleTrips && (() => {
            const { vehicle, orders: tripOrders } = selectedVehicleTrips;
            const totalDistanceKm = tripOrders.reduce((sum, o) => {
              if (o.order_multi) return sum + (o.order_multi.distance_end - o.order_multi.distance_start);
              return sum;
            }, 0);
            const totalStops = tripOrders.reduce((sum, o) => {
              if (o.order_multi) return sum + (o.order_multi.nStop_end - o.order_multi.nStop_start);
              return sum;
            }, 0);
            const totalStopSecs = tripOrders.reduce((sum, o) => {
              if (o.order_multi && o.order_multi.stop_duration_seconds) return sum + o.order_multi.stop_duration_seconds;
              return sum;
            }, 0);
            const totalTimeMs = tripOrders.reduce((sum, o) => {
              if (o.order_start_datetime && o.order_end_datetime) {
                return sum + (new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime());
              }
              return sum;
            }, 0);
            const totalMixMs = tripOrders.reduce((sum, o) => {
              const mixInVal = o.order_multi?.checkin_time_station || o.checkin_time_station;
              const mixOutVal = o.order_multi?.checkout_time_station || o.checkout_time_station;
              if (mixInVal && mixOutVal) {
                const diff = new Date(mixOutVal).getTime() - new Date(mixInVal).getTime();
                if (diff > 0) return sum + diff;
              }
              return sum;
            }, 0);
            const totalMins = Math.floor(totalTimeMs / 60000);
            const totalHours = Math.floor(totalMins / 60);
            const totalRemainMins = totalMins % 60;
            const totalStopMins = Math.floor(totalStopSecs / 60);
            const stopHours = Math.floor(totalStopMins / 60);
            const stopMinsRemain = totalStopMins % 60;
            const stopDurationStr = stopHours > 0 ? `${stopHours} giờ ${stopMinsRemain} phút` : `${totalStopMins} phút`;
            const totalMixMins = Math.floor(totalMixMs / 60000);
            const mixTotalHours = Math.floor(totalMixMins / 60);
            const mixTotalMinsRemain = totalMixMins % 60;
            const mixTotalDurationStr = mixTotalHours > 0 ? `${mixTotalHours} giờ ${mixTotalMinsRemain} phút` : `${totalMixMins} phút`;
            return (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="bg-slate-300 px-4 py-3 shrink-0 border-b-1">
                  <div className="flex items-center justify-between">
                    <DlgTitle className="flex items-center gap-2 text-base font-bold uppercase">
                      {t('tripDetail')} — {vehicle.vehicle_license_plate}{vehicle.vehicle_name ? ` | ${vehicle.vehicle_name}` : ''}
                    </DlgTitle>
                    <div className="flex items-center gap-10 ms-2">
                      <VehicleStatusChange
                        vehicleId={vehicle.vehicle_id}
                        currentStatus={vehicle.vehicle_status}
                        vehiclePlate={vehicle.vehicle_license_plate}
                        onStatusChanged={fetchAll}
                      />
                      <Button size="sm" variant="destructive" onClick={() => setSelectedVehicleTrips(null)}><X /></Button>
                    </div>

                  </div>
                </div>

                {/* Trip List */}
                <div className="flex-1 overflow-y-auto p-5">
                  {tripOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10">
                      <div className="h-14 w-14 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--dd-bg-surface)', border: '2px dashed var(--dd-border)' }}>
                        <Truck className="h-6 w-6 opacity-30" style={{ color: 'var(--dd-text-muted)' }} />
                      </div>
                      <span className="mt-3 text-sm font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>
                        {t('noTrips')}
                      </span>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {tripOrders.map((o, idx) => {
                        const distanceKm = o.order_multi ? (o.order_multi.distance_end - o.order_multi.distance_start) : 0;
                        const stops = o.order_multi ? (o.order_multi.nStop_end - o.order_multi.nStop_start) : 0;
                        const stopSecs = (o.order_multi && o.order_multi.stop_duration_seconds) ? o.order_multi.stop_duration_seconds : 0;
                        const diffMs = o.order_start_datetime && o.order_end_datetime
                          ? new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime()
                          : 0;
                        const diffMins = Math.floor(diffMs / 60000);
                        const h = Math.floor(diffMins / 60);
                        const m = diffMins % 60;
                        const stopMins = Math.floor(stopSecs / 60);
                        const stopH = Math.floor(stopMins / 60);
                        const stopM = stopMins % 60;
                        const stopDurationStr = stopH > 0 ? `${stopH} giờ ${stopM} phút` : `${stopMins} phút`;

                        const mixInVal = o.order_multi?.checkin_time_station || o.checkin_time_station;
                        const mixOutVal = o.order_multi?.checkout_time_station || o.checkout_time_station;
                        const mixIn = mixInVal ? new Date(mixInVal).getTime() : 0;
                        const mixOut = mixOutVal ? new Date(mixOutVal).getTime() : 0;
                        const mixMs = mixIn > 0 && mixOut > 0 ? mixOut - mixIn : 0;
                        const mixMinsTotal = Math.floor(mixMs / 60000);
                        const mixH = Math.floor(mixMinsTotal / 60);
                        const mixM = mixMinsTotal % 60;
                        const mixDurationStr = mixH > 0 ? `${mixH} giờ ${mixM} phút` : `${mixMinsTotal} phút`;
                        const isTripActive = o.order_status === 'running' || o.order_status === 'transporting';

                        return (
                          <Card key={o.order_id} className="relative overflow-hidden border shadow-sm">
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${isTripActive ? 'bg-sky-500' : 'bg-emerald-500'}`} />
                            <CardContent>
                              <div className="px-2 space-y-2">
                                {/* Trip number + Station */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`text-sm font-black rounded-full px-2.5 py-0.5 ${isTripActive
                                        ? 'bg-sky-500/10 text-sky-600 border-sky-500/30'
                                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                        }`}
                                    >
                                      {tripOrders.length - idx}
                                    </Badge>
                                    <span className="text-sm font-bold uppercase text-slate-900">
                                      {o.stations?.station_name || t('unassigned')}
                                    </span>
                                  </div>
                                  <Badge variant="secondary"
                                    className={`${isTripActive ? 'bg-sky-100 text-sky-600 hover:bg-sky-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'} text-sm px-2 py-0.5 font-semibold border-transparent shadow-none`}
                                  >
                                    {isTripActive ? 'Đang di chuyển' : t('completed')}
                                  </Badge>
                                </div>
                                {/* Time row */}
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={14} className="text-sky-500" />
                                    <span className="font-semibold text-slate-700">
                                      {o.order_start_datetime
                                        ? new Date(o.order_start_datetime).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                                        : <Ellipsis size={20} />}
                                    </span>
                                    <ArrowRight size={14} />
                                    <span className="font-semibold text-slate-700">
                                      {o.order_end_datetime
                                        ? new Date(o.order_end_datetime).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                                        : <Ellipsis size={20} />}
                                    </span>
                                  </div>
                                  {diffMins > 0 && (
                                    <span className="font-bold text-amber-500">
                                      {h > 0 ? `${h} giờ ${m} phút` : `${m} phút`}
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
                                      <span>{stops} {t('stops')}{stopSecs > 0 ? ` (${stopDurationStr})` : ''}</span>
                                    )}
                                  </div>
                                  {mixMs > 0 && (
                                    <div className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-violet-500">
                                      <Timer size={14} />
                                      <span>Trộn: {mixDurationStr}</span>
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
                  <div className="shrink-0 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t-1">
                    <span className="text-base font-bold uppercase">
                      {t('tripSummary')}
                    </span>
                    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-x-4 gap-y-2">
                      {/* {tripOrders.filter(o => o.order_status === 'running' || o.order_status === 'transporting').length > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#0ea5e9' }}>
                          <Truck size={16} />
                          <span>{tripOrders.filter(o => o.order_status === 'running' || o.order_status === 'transporting').length} Đang di chuyển</span>
                        </div>
                      )} */}
                      <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#10b981' }}>
                        <CheckCircle2 size={16} />
                        <span>{tripOrders.filter(o => o.order_status === 'completed').length} {t('completed')}</span>
                      </div>
                      {totalDistanceKm > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#0ea5e9' }}>
                          <Route size={16} />
                          <span>{totalDistanceKm.toFixed(1)} km</span>
                        </div>
                      )}
                      {totalMins > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#f59e0b' }}>
                          <Clock size={16} />
                          <span>{totalHours > 0 ? `${totalHours} giờ ${totalRemainMins} phút` : `${totalRemainMins} phút`}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#ec4899' }}>
                        <MapPin size={16} />
                        {Number.isNaN(totalStops) ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <span>{totalStops} {t('stops')}{totalStopSecs > 0 ? ` (${stopDurationStr})` : ''}</span>
                        )}
                      </div>
                      {totalMixMs > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: '#8b5cf6' }}>
                          <Timer size={16} />
                          <span>Trộn: {mixTotalDurationStr}</span>
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

      {/* ═══ MAP DIALOG ═══ */}
      <Dialog open={showMap} onOpenChange={(open) => { if (!open) { setShowMap(false); setMapSearch(''); setFocusVehicleId(null); setMapStatusFilter('all'); } }}>
        <DialogContent className="max-w-7xl sm:max-w-7xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden" showCloseButton={false}>
          <div className="flex h-full overflow-hidden">
            {/* Left: Vehicle Search */}
            <div className="w-[300px] shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--dd-border)' }}>
              <DialogHeader className="p-4 shrink-0" style={{ borderBottom: '1px solid var(--dd-border)' }}>
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
