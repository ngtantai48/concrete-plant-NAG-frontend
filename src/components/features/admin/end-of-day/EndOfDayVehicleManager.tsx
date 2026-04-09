"use client";

import ActivityFlow from "@/components/features/admin/dashboard/ActivityFlow";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { Skeleton } from "antd";
import { ArrowRightLeft, Factory, Radio, RefreshCw, Shuffle, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FLOW_STATION_TYPE_ID = 1;
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

export default function EndOfDayVehicleManager() {
  const tPage = useTranslations("EndOfDayPage");
  const tDashboard = useTranslations("DashboardPage");
  const locale = useLocale();

  const [stations, setStations] = useState<Station[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tomorrowOrders, setTomorrowOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isShiftToggling, setIsShiftToggling] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const operationDate = getTodayDate();
  const [clock, setClock] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
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
      if (clockRef.current) {
        clearInterval(clockRef.current);
      }
    };
  }, [locale]);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        stationApi.getAll(),
        orderApi.getAll({ order_status: "init" }),
        orderApi.getByInitDate(getTomorrowDate()),
      ]);

      if (results[0].status === "fulfilled") {
        const stationData = results[0].value.data?.data || results[0].value.data || [];
        setStations(Array.isArray(stationData) ? stationData : []);
      }

      if (results[1].status === "fulfilled") {
        const orderData = results[1].value.data?.data || results[1].value.data || [];
        setOrders(Array.isArray(orderData) ? orderData : []);
      }

      if (results[2].status === "fulfilled") {
        const tomorrowData = results[2].value.data?.data || results[2].value.data || [];
        setTomorrowOrders(Array.isArray(tomorrowData) ? tomorrowData : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  }, [fetchAll]);

  const isScheduleLocked = tomorrowOrders.some((o) => o.order_status === "pending");

  const handleShiftToggle = useCallback(async () => {
    setIsShiftToggling(true);
    const tomorrowDate = getTomorrowDate();
    try {
      if (isScheduleLocked) {
        await orderApi.shiftReopenInit({ operation_date: tomorrowDate });
        const [y, m, d] = tomorrowDate.split("-");
        toast.success(tPage("shiftReopenInitSuccess", { date: `${d}/${m}/${y}` }), { position: "top-right" });
      } else {
        await orderApi.shiftOpen({ operation_date: operationDate });
        const [y, m, d] = operationDate.split("-");
        toast.success(tPage("shiftOpenSuccess", { date: `${d}/${m}/${y}` }), { position: "top-right" });
      }
      await fetchAll();
    } catch {
      toast.error(isScheduleLocked ? tPage("shiftReopenInitFailed") : tPage("shiftOpenFailed"), { position: "top-right" });
    } finally {
      setIsShiftToggling(false);
    }
  }, [fetchAll, isScheduleLocked, operationDate, tPage]);

  const handleRebalance = useCallback(async () => {
    setIsRebalancing(true);
    try {
      await orderApi.shiftRebalance({ operation_date: operationDate });
      toast.success(tPage("rebalanceSuccess"), { position: "top-right" });
      await fetchAll();
    } catch {
      toast.error(tPage("rebalanceFailed"), { position: "top-right" });
    } finally {
      setIsRebalancing(false);
    }
  }, [fetchAll, operationDate, tPage]);

  const { isConnected } = useRealtimeUpdates(fetchAll);

  const managedOrders = useMemo(
    () => orders.filter((order) => {
      const vehicleStatus = order.vehicles?.vehicle_status;
      return vehicleStatus !== "maintenance" && vehicleStatus !== "incident";
    }),
    [orders],
  );

  const queuedOrders = useMemo(
    () => managedOrders.filter((order) => order.order_status === "init"),
    [managedOrders],
  );

  const activeAssignedOrders = useMemo(
    () => managedOrders.filter((order) => ["init"].includes(order.order_status)),
    [managedOrders],
  );

  const operatingStations = useMemo(
    () => stations.filter(
      (station) => (station.station_types?.station_type_id ?? station.station_type_id) === FLOW_STATION_TYPE_ID
        && station.station_status === "operating",
    ),
    [stations],
  );

  const statCards = useMemo(
    () => [
      {
        label: tPage("queuedVehicles"),
        value: queuedOrders.length,
        icon: <Truck className="h-5 w-5" />,
        accent: "#0ea5e9",
        surface: "rgba(14, 165, 233, 0.08)",
      },
      {
        label: tPage("operatingStations"),
        value: operatingStations.length,
        icon: <Factory className="h-5 w-5" />,
        accent: "#10b981",
        surface: "rgba(16, 185, 129, 0.08)",
      },
      {
        label: tPage("activeAssignedVehicles"),
        value: activeAssignedOrders.length,
        icon: <ArrowRightLeft className="h-5 w-5" />,
        accent: "#7c3aed",
        surface: "rgba(124, 58, 237, 0.08)",
      },
    ],
    [activeAssignedOrders.length, operatingStations.length, queuedOrders.length, tPage],
  );

  if (loading) {
    return (
      <div className="dashboard-light min-h-screen">
        <div className="mx-auto space-y-6 p-6 md:p-10">
          <div className="dd-header p-6 md:p-8">
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="dd-stat-card p-5">
                <Skeleton active paragraph={{ rows: 1 }} title={false} />
              </div>
            ))}
          </div>
          <div className="dd-card p-6">
            <Skeleton active paragraph={{ rows: 10 }} title={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-light min-h-screen bg-cover bg-center">
      <div className="mx-auto space-y-6 p-6 md:p-10">
        <div className="dd-header p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {/* <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(59, 130, 246, 0.18))",
                    border: "1px solid rgba(14, 165, 233, 0.16)",
                  }}
                >
                  <ArrowRightLeft className="h-6 w-6" style={{ color: "var(--dd-sky)" }} />
                </div> */}

                <div>
                  <h1
                    className="text-4xl font-black uppercase md:text-6xl"
                    style={{ color: "var(--dd-text-primary)" }}
                  >
                    {tPage("title")}
                  </h1>
                </div>
              </div>

              <p className="max-w-3xl text-base font-semibold uppercase md:text-lg" style={{ color: "var(--dd-text-muted)" }}>
                {tPage("subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-4 xl:items-end">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold uppercase ${isConnected ? "animate-flash-bg" : ""}`} style={{
                    borderColor: isConnected ? "rgba(16, 185, 129, 0.24)" : "rgba(239, 68, 68, 0.22)",
                    color: isConnected ? "#047857" : "#b91c1c",
                    background: isConnected ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                  }}
                >
                  <Radio className={`h-4 w-4 ${isConnected ? "animate-pulse" : ""}`} />
                  <span>{isConnected ? tDashboard("connected") : tDashboard("disconnected")}</span>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="dd-btn dd-btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {tDashboard("sync")}
                </button>

                <button
                  type="button"
                  onClick={handleRebalance}
                  disabled={isRebalancing}
                  className="dd-btn flex items-center gap-2 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(14, 165, 233, 0.12))",
                    border: "1px solid rgba(16, 185, 129, 0.22)",
                    color: "#047857",
                  }}
                >
                  <Shuffle className={`h-4 w-4 ${isRebalancing ? "animate-spin" : ""}`} />
                  {tPage("rebalanceAction")}
                </button>

                <button
                  type="button"
                  onClick={handleShiftToggle}
                  disabled={isShiftToggling}
                  className="dd-btn flex items-center gap-2 disabled:opacity-50"
                  style={{
                    background: isScheduleLocked
                      ? "linear-gradient(135deg, rgba(217, 119, 6, 0.14), rgba(245, 158, 11, 0.12))"
                      : "linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(14, 165, 233, 0.12))",
                    border: isScheduleLocked
                      ? "1px solid rgba(217, 119, 6, 0.2)"
                      : "1px solid rgba(124, 58, 237, 0.22)",
                    color: isScheduleLocked ? "#b45309" : "#6d28d9",
                  }}
                >
                  <ArrowRightLeft className={`h-4 w-4 ${isShiftToggling ? "animate-pulse" : ""}`} />
                  {isScheduleLocked ? tPage("shiftReopenInitAction") : tPage("shiftOpenAction")}
                </button>
              </div>

              <div className="text-base font-bold uppercase" style={{ color: "var(--dd-text-muted)" }}>
                {tDashboard("systemTime")}: {clock}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="dd-stat-card p-5"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.96), ${card.surface})`,
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-bold uppercase" style={{ color: "var(--dd-text-muted)" }}>
                    {card.label}
                  </div>
                  <div className="mt-3 text-6xl font-black" style={{ color: card.accent }}>
                    {String(card.value).padStart(2, "0")}
                  </div>
                </div>

                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: card.surface,
                    border: `1px solid ${card.surface.replace("0.08", "0.18")}`,
                    color: card.accent,
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="dd-card overflow-hidden">
          <div
            className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between"
            style={{ borderColor: "var(--dd-border)", background: "rgba(255,255,255,0.88)" }}
          >
            <div>
              <h2 className="text-xl font-black uppercase" style={{ color: "var(--dd-text-primary)" }}>
                {tPage("boardTitle")}
              </h2>
              <p className="mt-1 text-sm font-bold uppercase" style={{ color: "var(--dd-text-muted)" }}>
                {tPage("boardHint")}
              </p>
            </div>

            <span className="dd-chip dd-chip-sky whitespace-nowrap">
              {tPage("lastUpdated")}
            </span>
          </div>

          <div className="p-3 md:p-4">
            <ActivityFlow
              stations={stations}
              vehicles={[]}
              orders={managedOrders}
              dispatchMode="auto"
              layout="board"
              orderStatusFilter={["init"]}
              onOrdersUpdated={fetchAll}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
