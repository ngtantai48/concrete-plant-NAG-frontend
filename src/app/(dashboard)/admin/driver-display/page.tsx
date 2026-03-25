"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Maximize, Minimize, Clock, Factory, Truck, Ban, AlertTriangle } from "lucide-react";
import orderApi, { Order } from "@/services/order.service";
import stationApi, { Station } from "@/services/station.service";

export default function DriverDisplayPage() {
  const t = useTranslations("DriverDisplayPage");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Clock interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch data once on mount (will be replaced by Websocket later)
  const fetchData = useCallback(async () => {
    try {
      const [oRes, sRes] = await Promise.allSettled([
        orderApi.getAll(),
        stationApi.getAll()
      ]);
      
      if (oRes.status === "fulfilled") {
        const oData = oRes.value.data?.data || oRes.value.data || [];
        setOrders(Array.isArray(oData) ? oData : []);
      }
      
      if (sRes.status === "fulfilled") {
        const sData = sRes.value.data?.data || sRes.value.data || [];
        setStations(Array.isArray(sData) ? sData : []);
      }
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      if (containerRef.current) {
        await containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err.message);
        });
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Process data
  // Stations mapping
  const collectingOrders = useMemo(() => {
    return orders.filter((o) => o.order_status === "collecting");
  }, [orders]);

  const pendingOrders = useMemo(() => {
    return orders
      .filter((o) => o.order_status === "pending")
      // .sort((a, b) => a.order_number - b.order_number);
      .sort((a, b) => new Date(a.order_init_datetime).getTime() - new Date(b.order_init_datetime).getTime());
  }, [orders]);

  // Active stations independent of orders
  const activeStations = useMemo(() => {
    return stations
      .filter((s) => s.station_types?.station_type_name === "working_station")
      .sort((a, b) => a.station_name.localeCompare(b.station_name));
  }, [stations]);

  return (
    <div ref={containerRef} className="h-[calc(100vh-80px)] bg-slate-50 overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b-4 border-blue-600 px-8 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex flex-col">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight uppercase">
            {t("title")}
          </h1>
          <p className="text-xl md:text-2xl font-bold text-slate-500 mt-2 flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-500" />
            <span className="tabular-nums tracking-widest">
              {currentTime.toLocaleString("vi-VN", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors border-2 border-slate-200"
          >
            <span className="text-lg">{t("refresh")}</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
          >
            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            <span className="text-lg">
              {isFullscreen ? t("exitFullscreen") : t("fullscreen")}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-hidden h-full">
        {/* Left Column: ACTIVE COLLECTING */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="bg-blue-600 px-8 py-5 flex items-center justify-between shrink-0">
            <h2 className="text-3xl font-black text-white uppercase tracking-wider flex items-center gap-4">
              <Factory className="w-10 h-10 text-blue-200" />
              {t("collectingStatus")}
            </h2>
            <span className="bg-white text-blue-700 font-bold text-xl px-4 py-1.5 rounded-full">
              {activeStations.length} Trạm
            </span>
          </div>

          <div className="p-8 flex-1 overflow-y-auto space-y-6 bg-slate-50/50">
            {activeStations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Factory className="w-32 h-32 mb-6 text-slate-200" />
                <p className="text-3xl font-bold">{t("emptyStation")}</p>
              </div>
            ) : (
              activeStations.map((station) => {
                const currentOrder = collectingOrders.find(
                  (o) => o.stations?.station_id === station.station_id
                );

                return (
                  <div
                    key={station.station_id}
                    className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-4 bg-blue-600"></div>
                    <h3 className="text-3xl font-black text-slate-800 mb-6 mt-2">
                      {station.station_name}
                    </h3>

                    {(() => {
                      if (currentOrder || station.station_status === "collecting") {
                        return (
                          <div className="w-full bg-blue-50 border-4 border-blue-500 rounded-2xl p-8 flex flex-col items-center animate-pulse">
                            <span className="bg-blue-500 text-white text-base font-bold uppercase px-4 py-1 rounded-full mb-4">
                              {t("collectingAction")}
                            </span>
                            <div className="flex flex-col items-center">
                              <span className="text-6xl md:text-7xl font-black text-blue-700 tracking-tighter">
                                {currentOrder?.vehicles?.vehicle_license_plate || "N/A"}
                              </span>
                              <span className="text-2xl font-bold text-blue-600/80 mt-2 uppercase">
                                {currentOrder?.users?.user_full_name}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      if (station.station_status === "stopped") {
                        return (
                          <div className="w-full bg-amber-50 border-4 border-dashed border-amber-300 rounded-2xl p-8 flex flex-col items-center">
                            <Ban className="w-16 h-16 text-amber-500 mb-4" />
                            <span className="text-3xl md:text-4xl font-black text-amber-600 uppercase tracking-widest text-center">
                              {t("stationStopped")}
                            </span>
                          </div>
                        );
                      }

                      if (station.station_status === "incident") {
                        return (
                          <div className="w-full bg-red-50 border-4 border-dashed border-red-300 rounded-2xl p-8 flex flex-col items-center">
                            <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
                            <span className="text-3xl md:text-4xl font-black text-red-600 uppercase tracking-widest text-center">
                              {t("stationIncident")}
                            </span>
                          </div>
                        );
                      }

                      // Default to empty operating station
                      return (
                        <div className="w-full bg-emerald-50 border-4 border-dashed border-emerald-400 rounded-2xl p-8 flex flex-col items-center">
                          <Truck className="w-16 h-16 text-emerald-400 mb-4" />
                          <span className="text-3xl md:text-4xl font-black text-emerald-500 uppercase tracking-widest text-center">
                            {t("emptyStation")}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: PENDING QUEUE */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="bg-amber-500 px-8 py-5 flex items-center justify-between shrink-0">
            <h2 className="text-3xl font-black text-white uppercase tracking-wider flex items-center gap-4">
              <Truck className="w-10 h-10 text-amber-100" />
              {t("pendingQueue")}
            </h2>
            <span className="bg-white text-amber-600 font-bold text-xl px-4 py-1.5 rounded-full">
              {pendingOrders.length} {t("truck")}
            </span>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
            {/* Header row for list */}
            <div className="grid grid-cols-[100px_1fr_1fr] md:grid-cols-[100px_400px_1fr] bg-slate-100 border-b-2 border-slate-200 px-8 py-6 text-xl font-bold text-slate-500 uppercase tracking-widest sticky top-0 shrink-0">
              <div>{t("orderNumber")}</div>
              <div>{t("truck")}</div>
              <div>{t("destination")}</div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <p className="text-3xl font-bold">KHÔNG CÓ XE CHỜ</p>
                </div>
              ) : (
                pendingOrders.map((order, idx) => (
                  <div
                    key={order.order_id}
                    className="grid grid-cols-[100px_1fr_1fr] md:grid-cols-[100px_400px_1fr] items-center bg-white border-2 border-slate-200 rounded-2xl px-8 py-6 shadow-sm"
                  >
                    <div className="text-4xl font-black text-amber-500">
                      {/* #{order.order_number} - BE is handling this, using UI index for now */}
                      #{idx + 1}
                    </div>
                    <div>
                      <span className="text-4xl font-black text-slate-800 tracking-tight block">
                        {order.vehicles?.vehicle_license_plate || "N/A"}
                      </span>
                      <span className="text-xl font-bold text-slate-400 uppercase mt-1 block">
                        {order.users?.user_full_name}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="bg-blue-100 text-blue-700 text-2xl font-black px-6 py-3 rounded-xl border-2 border-blue-200">
                        ➡️ {order.stations?.station_name || "N/A"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
