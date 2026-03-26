"use client";

import { useSocket } from "@/context/socket-context";
import orderApi, { Order } from "@/services/order.service";
import stationApi, { Station } from "@/services/station.service";
import { AlertTriangle, Ban, ChevronDown, ChevronUp, Clock, Factory, Maximize, Minimize, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function DriverDisplay() {
  const t = useTranslations("DriverDisplayPage");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const { isConnected, onSocketEvent } = useSocket();

  // Clock — updates every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Core data fetcher — shared by initial load and socket events
  const fetchData = useCallback(async () => {
    try {
      const [oRes, sRes] = await Promise.allSettled([
        orderApi.getAll(),
        stationApi.getAll(),
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

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to socket events → refetch data on any event
  useEffect(() => {
    const unsubscribe = onSocketEvent((eventName) => {
      console.log(`[DriverDisplay] Nhận event "${eventName}", cập nhật dữ liệu...`);
      fetchData();
    });
    return unsubscribe;
  }, [onSocketEvent, fetchData]);

  // Fullscreen toggle — operates on the container element
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err.message);
      });
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Derived data ──────────────────────────────────────────
  const collectingOrders = useMemo(
    () => orders.filter((o) => o.order_status === "collecting"),
    [orders]
  );

  const pendingOrders = useMemo(
    () =>
      orders
        .filter((o) => o.order_status === "pending")
        .sort((a, b) => a.order_number - b.order_number),
    [orders]
  );

  const activeStations = useMemo(
    () =>
      stations
        .filter((s) => s.station_types?.station_type_name === "working_station")
        .sort((a, b) => a.station_name.localeCompare(b.station_name)),
    [stations]
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-80px)] bg-slate-50 overflow-hidden flex flex-col font-sans"
    >
      {/* ─── Header ─── */}
      <div className="bg-white border-b-4 border-blue-600 px-8 py-4 grid grid-cols-3 items-center shadow-sm shrink-0">
        {/* Left: Title + Socket Status */}
        <div className="flex flex-col">
          <h1 className="text-6xl font-black text-slate-800 tracking-tight uppercase">
            {t("title")}
          </h1>
          {/* Socket Status Indicator */}
          <div
            className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 w-fit ${isConnected
              ? "bg-emerald-50 border-emerald-200 text-emerald-600"
              : "bg-red-50 border-red-200 text-red-600 animate-pulse"
              }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span className="text-sm font-bold uppercase tracking-wider">
              {isConnected ? t("socketConnected") : t("socketDisconnected")}
            </span>
          </div>
        </div>

        {/* Center: Clock */}
        <div className="flex items-center justify-center gap-3">
          <Clock size={65} className="text-blue-500" />
          <div className="flex flex-col items-center">
            <span className="text-4xl font-bold text-slate-500 tracking-wide">
              {currentTime.toLocaleString("vi-VN", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
            <span className="text-5xl font-black text-red-500 tabular-nums tracking-widest">
              {currentTime.toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* Right: Fullscreen Button */}
        <div className="flex justify-end">
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

      {/* ─── 3-Column Station Grid ─── */}
      <div
        className="flex-1 p-6 overflow-hidden h-full"
        style={{
          display: "grid",
          gridTemplateColumns:
            activeStations.length > 0
              ? `repeat(${activeStations.length}, 1fr)`
              : "1fr",
          gap: "1.5rem",
        }}
      >
        {activeStations.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-slate-400 col-span-full">
            <Factory className="w-32 h-32 mb-6 text-slate-200" />
            <p className="text-3xl font-bold">{t("emptyStation")}</p>
          </div>
        ) : (
          activeStations.map((station) => (
            <StationColumn
              key={station.station_id}
              station={station}
              collectingOrder={collectingOrders.find(
                (o) => o.stations?.station_id === station.station_id
              )}
              pendingOrders={pendingOrders.filter(
                (o) => o.stations?.station_id === station.station_id
              )}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: Station Column ──────────────────────────
const STATUS_COLORS: Record<string, string> = {
  collecting: "bg-blue-600",
  operating: "bg-emerald-600",
  stopped: "bg-amber-500",
  incident: "bg-red-600",
};

interface StationColumnProps {
  station: Station;
  collectingOrder?: Order;
  pendingOrders: Order[];
  t: ReturnType<typeof useTranslations>;
}

function StationColumn({ station, collectingOrder, pendingOrders, t }: StationColumnProps) {
  const headerBg = STATUS_COLORS[station.station_status] || "bg-slate-600";
  const [expanded, setExpanded] = useState(false);
  const VISIBLE_LIMIT = 3;
  const hasMore = pendingOrders.length > VISIBLE_LIMIT;
  const visibleOrders = expanded ? pendingOrders : pendingOrders.slice(0, VISIBLE_LIMIT);
  const hiddenCount = pendingOrders.length - VISIBLE_LIMIT;

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* Station Header */}
      <div className={`${headerBg} px-6 py-5 flex flex-col items-center shrink-0`}>
        <h2 className="text-5xl font-black text-white uppercase tracking-wider text-center">
          {station.station_name}
        </h2>
      </div>

      {/* Station Status Card */}
      <div className="p-4 shrink-0">
        <StationStatusCard
          station={station}
          collectingOrder={collectingOrder}
          t={t}
        />
      </div>

      {/* Divider + Queue Title */}
      <div className="px-4">
        <div className="border-t-2 border-slate-200" />
      </div>
      <div className="px-6 py-3 flex items-center justify-between shrink-0">
        <h3 className="text-2xl font-black text-slate-500 uppercase tracking-wider">
          {t("pendingQueue")}
        </h3>
        <span className="text-xl bg-slate-200 text-slate-600 font-extrabold px-3 py-1 rounded-full">
          {pendingOrders.length} {t("truck")}
        </span>
      </div>

      {/* Pending Vehicles List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-300">
            <Truck className="w-12 h-12 mb-3" />
            <p className="text-xl font-bold uppercase">Không có xe chờ</p>
          </div>
        ) : (
          <>
            {visibleOrders.map((order, idx) => (
              <PendingOrderRow key={order.order_id} order={order} index={idx} t={t} />
            ))}
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors font-bold text-lg uppercase"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-6 h-6" />
                    Thu gọn
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-6 h-6" />
                    Xem thêm {hiddenCount} xe
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: Station Status Card ─────────────────────
function StationStatusCard({
  station,
  collectingOrder,
  t,
}: {
  station: Station;
  collectingOrder?: Order;
  t: ReturnType<typeof useTranslations>;
}) {
  if (collectingOrder || station.station_status === "collecting") {
    return (
      <div className="w-full bg-blue-50 border-4 border-blue-500 rounded-2xl p-6 flex flex-col items-center animate-pulse">
        <span className="bg-blue-500 text-white text-sm font-bold uppercase px-3 py-1 rounded-full mb-3">
          {t("collectingAction")}
        </span>
        <span className="text-5xl lg:text-6xl font-black text-blue-700 tracking-tighter text-center">
          {collectingOrder?.vehicles?.vehicle_license_plate || "N/A"}
        </span>
        <span className="text-xl font-bold text-blue-600/80 mt-1 uppercase">
          {collectingOrder?.users?.user_full_name}
        </span>
      </div>
    );
  }

  if (station.station_status === "stopped") {
    return (
      <div className="w-full bg-amber-50 border-4 border-dashed border-amber-300 rounded-2xl p-6 flex flex-col items-center">
        <Ban className="w-12 h-12 text-amber-500 mb-2" />
        <span className="text-2xl font-black text-amber-600 uppercase tracking-widest text-center">
          {t("stationStopped")}
        </span>
      </div>
    );
  }

  if (station.station_status === "incident") {
    return (
      <div className="w-full bg-red-50 border-4 border-dashed border-red-300 rounded-2xl p-6 flex flex-col items-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-2" />
        <span className="text-2xl font-black text-red-600 uppercase tracking-widest text-center">
          {t("stationIncident")}
        </span>
      </div>
    );
  }

  // Operating / empty
  return (
    <div className="w-full bg-emerald-50 border-4 border-dashed border-emerald-400 rounded-2xl p-6 flex flex-col items-center">
      <Truck className="w-12 h-12 text-emerald-400 mb-2" />
      <span className="text-2xl font-black text-emerald-500 uppercase tracking-widest text-center">
        {t("emptyStation")}
      </span>
    </div>
  );
}

// ─── Sub-component: Pending Order Row ───────────────────────
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function PendingOrderRow({
  order,
  index,
  t,
}: {
  order: Order;
  index: number;
  t: ReturnType<typeof useTranslations>;
}) {
  const isNext = index === 0;

  return (
    <Card
      className={`transition-all ${isNext
        ? "border-4 border-emerald-500 shadow-lg shadow-emerald-100 bg-emerald-50"
        : "border-2 border-slate-200 shadow-sm bg-white"
        }`}
    >
      <CardContent className="flex flex-col items-center justify-center p-5 gap-2">
        {/* Top row: Order Number + Next Badge */}
        <div className="flex items-center gap-3">
          {/* <Badge
            variant={isNext ? "default" : "secondary"}
            className={`text-3xl px-3 py-1 ${isNext ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
          >
            #{index + 1}
          </Badge> */}
          {isNext && (
            <Badge className="text-3xl px-3 py-1 bg-emerald-500 hover:bg-emerald-500 animate-pulse">
              {t("nextVehicle")}
            </Badge>
          )}
          {/* {!isNext && (
            <Badge variant="outline" className="text-xl px-3 py-1 text-slate-500">
              {t("waitingList")}
            </Badge>
          )} */}
        </div>

        {/* License Plate — centered, very large */}
        <span
          className={`text-5xl lg:text-8xl font-bold tracking-tight text-center leading-tight ${isNext ? "text-emerald-700" : "text-slate-800"}`}
        >
          {order.vehicles?.vehicle_license_plate || "N/A"}
        </span>

        {/* Debug: order_id */}
        <span
          className={`italic text-base font-semibold tracking-tight ${isNext ? "text-emerald-600/60" : "text-slate-400"}`}
        >
          order_id: {order.order_id}
        </span>
      </CardContent>
    </Card>
  );
}

