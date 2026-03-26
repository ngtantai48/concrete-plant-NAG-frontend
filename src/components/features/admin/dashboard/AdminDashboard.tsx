"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/services/station.service";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/services/vehicle.service";
import orderApi from "@/services/order.service";
import type { Order } from "@/services/order.service";
import { Skeleton, Tooltip, Tabs } from "antd";
import {
  MapPin,
  RefreshCw,
  Building2,
  Radar,
  Factory,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import dynamic from "next/dynamic";

import StationStatusPanel from "./StationStatusPanel";
import ActivityFlow from "./ActivityFlow";

const StationMap = dynamic(
  () => import("@/components/features/admin/dashboard/StationMap"),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }
);

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
        setStations(sRes.data?.data || sRes.data || []);
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
    await fetchAll();
  };

  const activeStations = useMemo(
    () => stations.filter((s) => s.station_types?.station_type_id === 1 && s.station_status === "operating"),
    [stations],
  );

  const geofenceStation = useMemo(
    () => stations.find((s) => s.station_gps) || stations[0] || null,
    [stations],
  );

  const { vehicles: vtrackingVehicles, inRangeCount, loading: nearbyLoading, lastUpdated, error: nearbyError, refetch: refetchVehicles } = useNearbyVehicles(
    geofenceStation?.station_gps || null,
    geofenceStation?.station_gps_geofencing || 500,
  );

  const { isConnected: socketConnected, lastSignal, lastSignalTime } = useRealtimeUpdates(fetchAll);

  const readyVehicles = useMemo(() => vehicles.filter(v => v.vehicle_status === "available"), [vehicles]);
  const canceledOrders = useMemo(() => orders.filter(o => o.order_status === "canceled"), [orders]);
  const outsideOrders = useMemo(
    () => orders.filter(o => o.order_status === "running" || o.order_status === "transporting"),
    [orders],
  );

  const ordersAtStation = useMemo(() => orders.filter(o => o.order_status === "collecting"), [orders]);
  const ordersPending = useMemo(() => orders.filter(o => o.order_status === "pending"), [orders]);
  const ordersInTransit = useMemo(() => orders.filter(o => o.order_status === "transporting" || o.order_status === "running"), [orders]);
  const ordersCompleted = useMemo(() => orders.filter(o => o.order_status === "completed"), [orders]);

  const [activeTab, setActiveTab] = useState("1");

  if (loading) {
    return (
      <div className="m-4 md:m-6 lg:m-8 max-w-[1600px] lg:mx-auto space-y-6">
        <Skeleton active paragraph={{ rows: 1 }} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans tracking-tight">
      <div className="p-4 md:p-8 max-w-[1800px] mx-auto">
        
        <div className="mb-8 rounded-[20px] bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,1),rgba(254,242,242,0.82))] p-6 shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                  {t("title")}
                </h1>
              </div>
              <p className="pl-6 text-sm uppercase tracking-[0.24em] text-slate-500">{t('systemTime')}: {clock}</p>
            </div>

            <div className="flex items-stretch gap-4">
              <div className="flex flex-col items-end justify-between">
                <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('network')}</span>
                <Tooltip title={socketConnected ? t('socketConnected') : t('socketDisconnected')}>
                  <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${
                    socketConnected
                      ? "bg-white text-slate-700"
                      : "bg-red-50 text-red-500"
                  }`}>
                    {socketConnected
                      ? <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      : <div className="h-2 w-2 rounded-full bg-red-500" />
                    }
                    <span className="text-sm font-semibold uppercase tracking-[0.16em]">
                      {socketConnected ? t('connected') : t('disconnected')}
                    </span>
                  </div>
                </Tooltip>
              </div>

              <div className="flex flex-col items-end justify-between">
                <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('data')}</span>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  className="h-auto gap-2 rounded-full bg-white px-5 py-2 font-semibold uppercase tracking-[0.14em] text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  {t('sync')}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,1))] p-5 shadow-[0_0_0_1px_rgba(51,65,85,0.16),0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('completed')}</span>
              <div className="mt-3 text-5xl font-black tracking-tighter text-slate-900">{ordersCompleted.length.toString().padStart(3, '0')}</div>
            </div>
            <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(254,242,242,0.96))] p-5 shadow-[0_0_0_1px_rgba(127,29,29,0.14),0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">{t('pending')}</span>
              <div className="mt-3 text-5xl font-black tracking-tighter text-amber-500">{ordersPending.length.toString().padStart(2, '0')}</div>
            </div>
            <div className="rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_rgba(51,65,85,0.16),0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('collecting')}</span>
              <div className="mt-3 text-5xl font-black tracking-tighter text-slate-900">{ordersAtStation.length.toString().padStart(2, '0')}</div>
            </div>
            <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,245,245,0.84))] p-5 shadow-[0_0_0_1px_rgba(127,29,29,0.14),0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">{t('inTransit')}</span>
              <div className="mt-3 text-5xl font-black tracking-tighter text-sky-600">{ordersInTransit.length.toString().padStart(2, '0')}</div>
            </div>
            <div className="rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_rgba(51,65,85,0.16),0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('activeStationsShort')}</span>
              <div className="mt-3 text-5xl font-black tracking-tighter text-slate-900">{activeStations.length}/{stations.filter(s => s.station_types?.station_type_id === 1).length}</div>
            </div>
          </div>
        </div>

        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          className="industrial-tabs"
          items={[
            {
              key: "1",
              label: <span className="font-bold tracking-widest uppercase text-sm">{t('controlDashboard')}</span>,
              children: (
                <div className="mt-6">
                  <div className="mb-6 overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(250,250,250,0.98))] p-5 shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_12px_28px_rgba(15,23,42,0.05)] md:p-6">
                    <div className="mb-5 flex flex-col gap-3 pb-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                          {t('dispatchStations')}
                        </h3>
                      </div>
                    </div>
                    <StationStatusPanel stations={stations} orders={orders} onStationUpdated={fetchAll} />
                  </div>

                  {/* Operational Layout Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Left: Vehicle Availability Lists */}
                     <div className="lg:col-span-3 space-y-6">
                        <div className="flex h-[400px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_10px_24px_rgba(15,23,42,0.04)]">
                          <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                            <span>{t('readyVehiclesPanel')}</span>
                            <span className="bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{readyVehicles.length}</span>
                          </div>
                         <div className="overflow-y-auto p-0 flex-1">
                           {readyVehicles.length === 0 ? (
                              <div className="p-4 text-sm font-medium text-slate-400">{t('noReadyVehicles')}</div>
                           ) : (
                             <ul className="divide-y divide-slate-100">
                               {readyVehicles.map((v) => (
                                  <li key={v.vehicle_id} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                                     <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-lg font-semibold text-slate-900">{v.vehicle_license_plate}</span>
                                  </li>
                               ))}
                             </ul>
                           )}
                         </div>
                       </div>

                        <div className="flex h-[280px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_10px_24px_rgba(15,23,42,0.04)]">
                          <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                            <span>{t('stoppedMaintenance')}</span>
                            <span className="bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{canceledOrders.length}</span>
                          </div>
                         <div className="flex-1 overflow-y-auto bg-white p-0">
                            {canceledOrders.length === 0 ? (
                               <div className="p-4 text-sm font-medium text-slate-400">{t('empty')}</div>
                            ) : (
                              <ul className="divide-y divide-slate-200">
                                {canceledOrders.map((o) => (
                                  <li key={o.order_id} className="flex items-center justify-between p-4">
                                    <span className="font-semibold text-slate-700">{o.vehicles?.vehicle_license_plate || `#${o.order_id}`}</span>
                                      <span className="rounded-lg bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">{t('canceled')}</span>
                                   </li>
                                ))}
                              </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Center: System Operations Flow */}
                     <div className="lg:col-span-6 flex flex-col h-full space-y-8 relative">
                       <div className="flex-1">
                           <ActivityFlow 
                              stations={stations} 
                             vehicles={vehicles} 
                             orders={orders}
                             onOrdersUpdated={fetchAll}
                          />
                      </div>
                      
                    </div>

                    {/* Right: En Route / Outside */}
                     <div className="lg:col-span-3 h-[704px]">
                        <div className="flex h-full flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_10px_24px_rgba(15,23,42,0.04)]">
                          <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                            <span>{t('outsideStation')}</span>
                            <span className="bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{outsideOrders.length}</span>
                          </div>
                         <div className="flex-1 overflow-y-auto">
                            {outsideOrders.length === 0 ? (
                              <div className="flex items-center justify-center h-full">
                                 <div className="rounded-2xl bg-slate-50 px-6 py-4">
                                   <p className="text-sm font-medium text-slate-400 text-center">{t('waitingSignal')}</p>
                                </div>
                              </div>
                            ) : (
                              <ul className="flex flex-col gap-3 p-3">
                                {outsideOrders.map((o) => (
                                    <li key={o.order_id} className="rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(250,250,250,0.96))] p-4 shadow-[0_0_0_1px_rgba(51,65,85,0.14),0_8px_18px_rgba(15,23,42,0.04)]">
                                     <div className="flex justify-between items-end">
                                       <span className="text-lg font-semibold text-slate-900">{o.vehicles?.vehicle_license_plate || `#${o.order_id}`}</span>
                                       <span className={`rounded-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${o.order_status === 'transporting' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-600'}`}>
                                         {o.order_status === 'transporting' ? t('transporting') : t('running')}
                                       </span>
                                     </div>
                                    <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{o.stations?.station_name || t('unassigned')}</div>
                                  </li>
                                ))}
                             </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "2",
              label: <span className="font-bold tracking-widest uppercase text-sm">{t('areaMap')}</span>,
              children: (
                 <div className="mt-6 h-[700px] overflow-hidden rounded-[20px] bg-white p-2 shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_12px_28px_rgba(15,23,42,0.05)]">
                   <StationMap
                    stationGps={geofenceStation?.station_gps || null}
                    radius={geofenceStation?.station_gps_geofencing || 500}
                    vehicles={vtrackingVehicles}
                  />
                </div>
              ),
            },
          ]}
        />
        
         <div className="mb-20 mt-8 flex flex-col justify-between gap-4 border-t border-slate-200 pt-4 md:flex-row md:items-baseline whitespace-nowrap">
            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-red-500">
                <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                {t('systemSignal')}
              </span>
              <span>{t('systemListening')}</span>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
               {t('connectionStable')} • {t('plantName')}
            </p>
        </div>
      </div>
    </div>
  );
};

