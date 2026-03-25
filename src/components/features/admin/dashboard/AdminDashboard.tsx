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
import { useTranslations } from "next-intl";
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

  const [stations, setStations] = useState<Station[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);



  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString("vi-VN", {
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
  }, []);

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
  const inactiveVehicles = useMemo(() => vehicles.filter(v => v.vehicle_status !== "available"), [vehicles]);
  const outsideVehicles = useMemo(() => vehicles.filter(v => v.vehicle_status === "running" || v.vehicle_status === "transporting"), [vehicles]);

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
        
        {/* Header - Industrial Control Panel Style */}
        <div className="flex flex-col md:flex-row md:items-end justify-between border-b-4 border-slate-900 pb-6 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-4 w-4 bg-yellow-400 border border-slate-900" />
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                {t("title")}
              </h1>
            </div>
            <p className="text-slate-500 font-mono text-sm uppercase tracking-widest pl-7">GIỜ HỆ THỐNG: {clock}</p>
          </div>
          
          <div className="flex items-stretch gap-4">
            <div className="flex flex-col items-end justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">MẠNG</span>
              <Tooltip title={socketConnected ? "Socket realtime connected" : "Socket disconnected"}>
                <div className={`flex items-center gap-2 px-4 py-2 border-2 ${
                  socketConnected
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-red-500 bg-red-50 text-red-700"
                }`}>
                  {socketConnected
                    ? <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    : <div className="h-2 w-2 rounded-full bg-red-500" />
                  }
                  <span className="font-mono text-sm font-bold uppercase">
                    {socketConnected ? "KẾT NỐI" : "MẤT KẾT NỐI"}
                  </span>
                </div>
              </Tooltip>
            </div>
            
            <div className="flex flex-col items-end justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">DỮ LIỆU</span>
              <Button
                variant="outline"
                onClick={handleRefresh}
                className="rounded-none border-2 border-slate-900 hover:bg-slate-900 hover:text-white transition-colors gap-2 h-auto py-2 font-bold uppercase"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                ĐỒNG BỘ
              </Button>
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
              label: <span className="font-bold tracking-widest uppercase text-sm">BÀN ĐIỀU KHIỂN</span>,
              children: (
                <div className="mt-6">
                  {/* Master Data Metrics Row */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="border-2 border-slate-900 bg-white p-4 flex flex-col justify-between group hover:bg-yellow-400 transition-colors">
                      <span className="font-mono text-xs uppercase font-bold text-slate-500 group-hover:text-amber-900">HOÀN THÀNH</span>
                      <div className="text-5xl font-black tracking-tighter mt-2">{ordersCompleted.length.toString().padStart(3, '0')}</div>
                    </div>
                    <div className="border-2 border-slate-900 bg-white p-4 flex flex-col justify-between">
                      <span className="font-mono text-xs uppercase font-bold text-slate-500">ĐANG CHỜ</span>
                      <div className="text-5xl font-black tracking-tighter mt-2 text-amber-500">{ordersPending.length.toString().padStart(2, '0')}</div>
                    </div>
                    <div className="border-2 border-slate-900 bg-white p-4 flex flex-col justify-between">
                      <span className="font-mono text-xs uppercase font-bold text-slate-500">ĐANG NHẬN</span>
                      <div className="text-5xl font-black tracking-tighter mt-2 text-cyan-600">{ordersAtStation.length.toString().padStart(2, '0')}</div>
                    </div>
                    <div className="border-2 border-slate-900 bg-white p-4 flex flex-col justify-between">
                      <span className="font-mono text-xs uppercase font-bold text-slate-500">VẬN CHUYỂN</span>
                      <div className="text-5xl font-black tracking-tighter mt-2 text-blue-600">{ordersInTransit.length.toString().padStart(2, '0')}</div>
                    </div>
                    <div className="border-2 border-slate-900 bg-white p-4 flex flex-col justify-between">
                      <span className="font-mono text-xs uppercase font-bold text-slate-500">TRẠM HĐ</span>
                      <div className="text-5xl font-black tracking-tighter mt-2">{activeStations.length}/{stations.filter(s => s.station_types?.station_type_id === 1).length}</div>
                    </div>
                  </div>

                  {/* Operational Layout Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Left: Vehicle Availability Lists */}
                    <div className="lg:col-span-3 space-y-6">
                      <div className="border-2 border-slate-900 bg-white flex flex-col h-[400px]">
                        <div className="bg-slate-900 text-white px-4 py-2 font-bold uppercase text-sm tracking-widest flex justify-between items-center">
                          <span>XE SẴN SÀNG</span>
                          <span className="bg-emerald-500 text-black px-2 py-0.5 text-xs">{readyVehicles.length}</span>
                        </div>
                        <div className="overflow-y-auto p-0 flex-1">
                          {readyVehicles.length === 0 ? (
                            <div className="p-4 text-slate-400 font-mono text-sm uppercase">KHÔNG CÓ XE SẴN SÀNG</div>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {readyVehicles.map((v) => (
                                <li key={v.vehicle_id} className="p-3 hover:bg-slate-50 flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span className="font-mono font-bold text-slate-800 text-lg">{v.vehicle_license_plate}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      <div className="border-2 border-slate-900 bg-white flex flex-col h-[280px]">
                        <div className="bg-slate-200 text-slate-900 border-b-2 border-slate-900 px-4 py-2 font-bold uppercase text-sm tracking-widest flex justify-between items-center">
                          <span>DỪNG / BẢO TRÌ</span>
                          <span className="bg-red-500 text-white px-2 py-0.5 text-xs">{inactiveVehicles.length}</span>
                        </div>
                        <div className="overflow-y-auto p-0 flex-1 bg-slate-50">
                          {inactiveVehicles.length === 0 ? (
                            <div className="p-4 text-slate-400 font-mono text-sm uppercase">TRỐNG</div>
                          ) : (
                            <ul className="divide-y divide-slate-200">
                              {inactiveVehicles.map((v) => (
                                <li key={v.vehicle_id} className="p-3 flex items-center justify-between">
                                  <span className="font-mono font-bold text-slate-600 opacity-70">{v.vehicle_license_plate}</span>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border border-slate-300 px-1">CHỜ</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Center: System Operations Flow */}
                    <div className="lg:col-span-6 flex flex-col h-full space-y-8 relative">
                      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                           style={{ backgroundImage: 'linear-gradient(slate-900 1px, transparent 1px), linear-gradient(90deg, slate-900 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                      
                      <div className="flex-1">
                         <ActivityFlow 
                            stations={stations} 
                            vehicles={vehicles} 
                            orders={orders}
                         />
                      </div>
                      
                      <div className="pt-4 border-t-2 border-dashed border-slate-300">
                         <div className="mb-4 flex items-center gap-2">
                           <div className="w-2 h-2 bg-slate-900" />
                           <h3 className="font-bold uppercase tracking-widest text-sm">CỤM TRẠM ĐIỀU PHỐI</h3>
                         </div>
                         <StationStatusPanel stations={stations} orders={orders} onStationUpdated={fetchAll} />
                      </div>
                    </div>

                    {/* Right: En Route / Outside */}
                    <div className="lg:col-span-3 h-[704px]">
                      <div className="border-2 border-slate-900 bg-white flex flex-col h-full border-r-8">
                        <div className="bg-amber-400 border-b-2 border-slate-900 px-4 py-2 font-black uppercase text-sm tracking-widest text-black flex justify-between items-center">
                          <span>LƯU THÔNG / NGOÀI TRẠM</span>
                          <span className="bg-slate-900 text-white px-2 py-0.5 text-xs">{ordersInTransit.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          {ordersInTransit.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                              <div className="border border-dashed border-slate-300 px-6 py-4 bg-white/50">
                                <p className="font-mono text-sm tracking-widest text-slate-400 uppercase text-center">- ĐANG CHỜ TÍN HIỆU -</p>
                              </div>
                            </div>
                          ) : (
                            <ul className="flex flex-col gap-2 p-2">
                              {ordersInTransit.map((o) => (
                                <li key={o.order_id} className="bg-white border-2 border-slate-900 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                  <div className="flex justify-between items-end">
                                    <span className="font-mono font-black text-lg">{o.vehicles?.vehicle_license_plate || `#${o.order_id}`}</span>
                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${o.order_status === 'transporting' ? 'text-indigo-600' : 'text-amber-600'}`}>
                                      {o.order_status === 'transporting' ? 'VẬN CHUYỂN' : 'ĐANG CHẠY'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 mt-1 uppercase">{o.stations?.station_name || '---'}</div>
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
              label: <span className="font-bold tracking-widest uppercase text-sm">BẢN ĐỒ KHU VỰC</span>,
              children: (
                <div className="bg-white p-2 border-2 border-slate-900 mt-6 h-[700px]">
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
        
        {/* Brutalist Footer */}
        <div className="mt-8 border-t-4 border-slate-900 pt-4 flex flex-col md:flex-row justify-between items-baseline gap-4 mb-20 whitespace-nowrap">
           <div className="flex gap-4 font-mono text-xs font-bold text-slate-500 uppercase tracking-widest items-center">
             <span className="bg-yellow-400 text-black px-2 py-0.5 pointer-events-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-black rounded-full animate-ping" />
               TÍN HIỆU HỆ THỐNG
             </span>
             <span>ĐANG LIÊN TỤC LẮNG NGHE DATA TỪ THIẾT BỊ...</span>
           </div>
           <p className="font-mono text-xs uppercase tracking-widest text-slate-400">
              KẾT NỐI ỔN ĐỊNH • TRẠM BÊ TÔNG NAG
           </p>
        </div>
      </div>
    </div>
  );
};

