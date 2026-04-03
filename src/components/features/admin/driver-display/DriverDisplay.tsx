"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSocket } from "@/context/socket-context";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { AlertTriangle, ArrowRight, Ban, Factory, SquareX, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface StationQueueGroup {
  station: Station;
  collectingOrder?: Order;
  pendingOrders: Order[];
}

interface MergedQueueItem {
  station: Station;
  order: Order;
  queueIndex: number;
}

const STATUS_COLORS: Record<string, string> = {
  collecting: "bg-blue-600",
  operating: "bg-[#6F6E73]",
  stopped: "bg-amber-500",
  incident: "bg-red-600",
};

const GRID_CARD_MIN_WIDTH_REM = 20;

function getQueueGridStyle(columnCount: number) {
  const safeColumnCount = Math.max(columnCount, 1);

  return {
    display: "grid",
    gridTemplateColumns: `repeat(${safeColumnCount}, minmax(${GRID_CARD_MIN_WIDTH_REM}rem, 1fr))`,
    gap: "1.5rem",
    minWidth: `${safeColumnCount * GRID_CARD_MIN_WIDTH_REM}rem`,
  };
}

export default function DriverDisplay() {
  const t = useTranslations("DriverDisplayPage");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  // const [isFullscreen, setIsFullscreen] = useState(false);
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
  // const toggleFullscreen = useCallback(async () => {
  //   if (!document.fullscreenElement) {
  //     await containerRef.current?.requestFullscreen().catch((err) => {
  //       console.error("Fullscreen error:", err.message);
  //     });
  //   } else {
  //     await document.exitFullscreen?.();
  //   }
  // }, []);

  // useEffect(() => {
  //   const handler = () => setIsFullscreen(!!document.fullscreenElement);
  //   document.addEventListener("fullscreenchange", handler);
  //   return () => document.removeEventListener("fullscreenchange", handler);
  // }, []);

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

  const stationQueueGroups = useMemo<StationQueueGroup[]>(() => {
    const collectingOrdersByStation = new Map<number, Order>();

    collectingOrders.forEach((order) => {
      const stationId = order.stations?.station_id;
      if (typeof stationId === "number" && !collectingOrdersByStation.has(stationId)) {
        collectingOrdersByStation.set(stationId, order);
      }
    });

    return activeStations.map((station) => ({
      station,
      collectingOrder: collectingOrdersByStation.get(station.station_id),
      pendingOrders: pendingOrders.filter((order) => order.stations?.station_id === station.station_id),
    }));
  }, [activeStations, collectingOrders, pendingOrders]);

  const mergedPendingQueue = useMemo<MergedQueueItem[]>(() => {
    const longestQueueLength = stationQueueGroups.reduce(
      (longest, group) => Math.max(longest, group.pendingOrders.length),
      0
    );
    const mergedQueue: MergedQueueItem[] = [];

    for (let queueIndex = 0; queueIndex < longestQueueLength; queueIndex += 1) {
      stationQueueGroups.forEach((group) => {
        const order = group.pendingOrders[queueIndex];
        if (order) {
          mergedQueue.push({
            station: group.station,
            order,
            queueIndex,
          });
        }
      });
    }

    return mergedQueue;
  }, [stationQueueGroups]);

  const queueGridStyle = useMemo(
    () => getQueueGridStyle(activeStations.length),
    [activeStations.length]
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-slate-50 overflow-hidden flex flex-col font-sans"
    >
      {/* ─── Header ─── */}
      <div className="bg-white border-b-4 border-blue-600 px-8 py-4 grid grid-cols-3 items-center shadow-sm shrink-0">
        {/* Left: Title + Socket Status */}
        <div className="flex">
          <h1 className="text-shadow-lg/20 me-10 text-6xl font-black text-slate-800 tracking-tight uppercase">{t("title")}</h1>
          {/* Socket Status Indicator */}
          <div
            className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 w-fit ${isConnected
              ? "bg-emerald-50 border-emerald-200 text-emerald-600"
              : "bg-red-50 border-red-200 text-red-600 animate-pulse"
              }`}
          >
            <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-2xl font-extrabold uppercase">
              {isConnected ? t("socketConnected") : t("socketDisconnected")}
            </span>
          </div>
        </div>

        {/* Center: Clock */}
        <div className="flex items-center justify-center gap-3">
          {/* <Clock size={75} className="text-blue-500" /> */}
          <div className="flex flex-col items-center">
            <span className="text-8xl font-black text-red-500 tracking-widest">
              {currentTime.toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* Right: Fullscreen Button */}
        {/* <div className="flex justify-end">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
          >
            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            <span className="text-lg">
              {isFullscreen ? t("exitFullscreen") : t("fullscreen")}
            </span>
          </button>
        </div> */}

        <div className="flex justify-end">
          <span className="text-shadow-lg/30 text-7xl font-bold text-slate-500 tracking-wide">
            {currentTime.toLocaleString("vi-VN", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* ─── Station Overview + Merged Queue ─── */}
      <div className="flex-1 p-6 overflow-hidden h-full">
        {activeStations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <Factory className="w-32 h-32 mb-6 text-slate-200" />
            <p className="text-3xl font-bold">{t("emptyStation")}</p>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-6">
            <div className="overflow-x-auto pb-1">
              <div style={queueGridStyle}>
                {stationQueueGroups.map((group) => (
                  <StationOverviewCard
                    key={group.station.station_id}
                    station={group.station}
                    collectingOrder={group.collectingOrder}
                    pendingCount={group.pendingOrders.length}
                    t={t}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-sm">
              <div className="text-shadow-lg/10 px-6 py-4 flex items-center justify-between shrink-0">
                <h3 className="text-3xl font-black text-slate-500 uppercase tracking-wider">
                  {t("pendingQueue")}
                </h3>
                <span className="text-xl bg-slate-200 text-slate-600 font-extrabold px-3 py-1 rounded-full">
                  {mergedPendingQueue.length} {t("truck")}
                </span>
              </div>

              <div className="px-6 shrink-0">
                <div className="border-t-2 border-slate-200" />
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-4 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {mergedPendingQueue.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-500">
                    <Truck className="w-24 h-24 mb-3" />
                    <p className="text-4xl font-bold uppercase">Không có xe chờ</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mergedPendingQueue.map(({ station, order, queueIndex }, displayIndex) => (
                      <PendingOrderCard
                        key={`${station.station_id}-${order.order_id}`}
                        order={order}
                        queueIndex={queueIndex}
                        displayIndex={displayIndex}
                        stationName={station.station_name}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StationOverviewCardProps {
  station: Station;
  collectingOrder?: Order;
  pendingCount: number;
  t: ReturnType<typeof useTranslations>;
}

function StationOverviewCard({ station, collectingOrder, pendingCount, t }: StationOverviewCardProps) {
  const headerBg = STATUS_COLORS[station.station_status] || "bg-slate-600";

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className={`${headerBg} px-6 py-5 flex items-center justify-between gap-4 shrink-0`}>
        <h2 className="text-shadow-lg/90 text-4xl font-black text-white uppercase tracking-wider text-center">
          {station.station_name}
        </h2>
        <span className="rounded-full bg-white/15 px-4 py-1 text-xl font-extrabold text-white whitespace-nowrap">
          {pendingCount} {t("truck")}
        </span>
      </div>

      <div className="p-4 shrink-0">
        <StationStatusCard
          station={station}
          collectingOrder={collectingOrder}
          t={t}
        />
      </div>
    </div>
  );
}

// ─── Sub-component: Station Status Card ─────────────────────
function StationStatusCard({ station, collectingOrder, t }: {
  station: Station;
  collectingOrder?: Order;
  t: ReturnType<typeof useTranslations>;
}) {
  if (collectingOrder || station.station_status === "collecting") {
    return (
      <div className="text-shadow-lg/100 w-full h-44 lg:h-52 bg-blue-100 border-4 border-blue-200 rounded-2xl p-4 gap-2 flex flex-col items-center justify-center animate-pulse shrink-0">
        <span className="bg-blue-700 text-white text-2xl lg:text-3xl font-bold uppercase px-3 py-1 rounded-full mb-2 text-center">
          {t("collectingAction")}
        </span>
        <span
          className="text-4xl lg:text-7xl font-bold text-blue-700 text-center leading-none"
          style={{ WebkitTextStrokeWidth: "5px", paintOrder: "stroke fill" }}
        >
          {collectingOrder?.vehicles?.vehicle_license_plate || "N/A"}
        </span>
      </div>
    );
  }

  if (station.station_status === "stopped") {
    return (
      <div className="text-shadow-lg/30 w-full h-44 lg:h-52 bg-amber-50 border-4 border-dashed border-amber-300 rounded-2xl p-6 flex flex-col items-center justify-center shrink-0">
        <Ban className="w-16 h-16 text-amber-500 mb-2" />
        <span className="text-4xl lg:text-5xl font-black text-amber-600 uppercase tracking-widest text-center">
          {t("stationStopped")}
        </span>
      </div>
    );
  }

  if (station.station_status === "incident") {
    return (
      <div className="text-shadow-lg/30 w-full h-44 lg:h-52 bg-red-50 border-4 border-dashed border-red-300 rounded-2xl p-6 flex flex-col items-center justify-center shrink-0">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-2" />
        <span className="text-4xl lg:text-5xl font-black text-red-600 uppercase tracking-widest text-center">
          {t("stationIncident")}
        </span>
      </div>
    );
  }

  return (
    <div className="text-shadow-lg/30 w-full h-44 lg:h-52 bg-[#6F6E73]/10 border-4 border-dashed border-[#6F6E73]/40 rounded-2xl p-5 flex flex-col items-center justify-center shrink-0">
      <SquareX className="w-16 h-16 text-[#6F6E73] mb-2" />
      <span className="text-4xl lg:text-5xl font-black text-[#6F6E73] uppercase tracking-widest text-center">
        {t("emptyStation")}
      </span>
    </div>
  );
}

function PendingOrderCard({ order, queueIndex, displayIndex, stationName, t }: {
  order: Order;
  queueIndex: number;
  displayIndex: number;
  stationName: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const isNext = queueIndex === 0;
  const isSecond = queueIndex === 1;
  const isThird = queueIndex === 2;

  let baseClass = "transition-all h-full";
  let cardClass = "border-2 border-slate-200 shadow-sm bg-white";
  let textClass = "text-slate-800";
  let detailClass = "text-slate-500";

  if (isNext) {
    cardClass = "border-4 border-emerald-500 shadow-lg shadow-emerald-100 bg-emerald-50";
    textClass = "text-emerald-700";
    detailClass = "text-emerald-700/80";
  } else if (isSecond) {
    cardClass = "border-4 border-[#F2CB05] shadow-lg shadow-[#F2CB05]/20 bg-[#F2CB05]/10";
    textClass = "text-[#a38803]";
    detailClass = "text-[#a38803]/80";
  } else if (isThird) {
    cardClass = "border-4 border-[#6CC5D9] shadow-lg shadow-[#6CC5D9]/20 bg-[#6CC5D9]/10";
    textClass = "text-[#2d879e]";
    detailClass = "text-[#2d879e]/80";
  }

  return (
    <Card className={baseClass + cardClass}>
      <CardContent className="flex h-full min-h-[220px] flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center justify-center gap-3 text-center lg:justify-start lg:text-left">
          <Badge
            variant={isNext ? "default" : "secondary"}
            className={`text-lg px-3 py-1 font-bold uppercase ${isNext ? "bg-emerald-700 hover:bg-emerald-700" : ""}`}
          >
            {t("orderNumber")} {displayIndex + 1}
          </Badge>
          <Badge
            variant="outline"
            className={`border-current bg-transparent px-3 py-1 text-base font-bold uppercase ${detailClass}`}
          >
            {isNext ? t("nextVehicle") : t("waitingList")}
          </Badge>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <span
            className={`text-shadow-lg/100 contrast-300 text-5xl xl:text-7xl 2xl:text-8xl font-bold tracking-tight text-center leading-none lg:text-left ${textClass}`}
            style={{ WebkitTextStrokeWidth: "5px", paintOrder: "stroke fill" }}
          >
            {order.vehicles?.vehicle_license_plate || "N/A"}
          </span>

          <div className={`flex items-center justify-center gap-3 text-center text-lg xl:text-xl font-black uppercase tracking-wide lg:justify-end ${detailClass}`}>
            <ArrowRight className={`h-5 w-5 ${textClass}`} />
            <span className={textClass}>{stationName}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
