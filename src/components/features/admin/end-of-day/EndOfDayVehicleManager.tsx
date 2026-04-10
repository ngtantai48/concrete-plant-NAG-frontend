"use client";

import ActivityFlow from "@/components/features/admin/dashboard/ActivityFlow";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { ADMIN } from "@/constants/route";
import { Skeleton } from "antd";
import { AlertTriangle, ArrowRightLeft, Factory, Radio, RefreshCw, Shuffle, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
const getYesterdayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  const today = new Date(now.getTime() - timezoneOffset);
  today.setDate(today.getDate() - 1);
  return today.toISOString().slice(0, 10);
};

export default function EndOfDayVehicleManager({ mode = "today" }: { mode?: "today" | "previous" }) {
  const tPage = useTranslations("EndOfDayPage");
  const tDashboard = useTranslations("DashboardPage");
  const locale = useLocale();
  const router = useRouter();
  const targetDate = mode === "today" ? getTodayDate() : getYesterdayDate();

  const [stations, setStations] = useState<Station[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [yesterdayOrders, setYesterdayOrders] = useState<Order[]>([]);
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
        orderApi.getAll(),
        orderApi.getByInitDate(getTodayDate()),
        orderApi.getByInitDate(getYesterdayDate()),
        orderApi.getByInitDate(getTomorrowDate()),
      ]);

      if (results[0].status === "fulfilled") {
        const stationData = (results[0] as PromiseFulfilledResult<{ data: { data?: Station[] } | Station[] }>).value.data;
        const arr = (stationData as { data?: Station[] })?.data || stationData || [];
        setStations(Array.isArray(arr) ? arr : []);
      }

      if (results[1].status === "fulfilled") {
        const orderData = (results[1] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>).value.data;
        const arr = (orderData as { data?: Order[] })?.data || orderData || [];
        setOrders(Array.isArray(arr) ? arr : []);
      }

      if (results[2].status === "fulfilled") {
        const todayData = (results[2] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>).value.data;
        const arr = (todayData as { data?: Order[] })?.data || todayData || [];
        setTodayOrders(Array.isArray(arr) ? arr : []);
      }

      if (results[3].status === "fulfilled") {
        const yesterdayData = (results[3] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>).value.data;
        const arr = (yesterdayData as { data?: Order[] })?.data || yesterdayData || [];
        setYesterdayOrders(Array.isArray(arr) ? arr : []);
      }

      if (results[4].status === "fulfilled") {
        const tmData = (results[4] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>).value.data;
        const arr = (tmData as { data?: Order[] })?.data || tmData || [];
        setTomorrowOrders(Array.isArray(arr) ? arr : []);
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

  const targetDateOrders = mode === "today" ? todayOrders : yesterdayOrders;
  const isScheduleLocked = targetDateOrders.some((o) => o.order_status === "pending");
  const isShiftClosed = targetDateOrders.some((o) => o.order_status === "canceled");
  const isTomorrowConfirmed = useMemo(
    () => tomorrowOrders.some((o) => o.order_status === "pending"),
    [tomorrowOrders],
  );

  const pendingAction = useMemo(() => {
    const hasTodayAnyOrder = todayOrders.length > 0;
    const hasYesterdayPending = yesterdayOrders.some((o) => o.order_status === "pending");
    const hasYesterdayCanceledOrInit = yesterdayOrders.some(
      (o) => o.order_status === "canceled" || o.order_status === "init"
    );

    if (!hasTodayAnyOrder) {
      if (hasYesterdayPending) return "forgotShiftClose" as const;
      if (hasYesterdayCanceledOrInit) return "forgotScheduleConfirm" as const;
    }
    return "none" as const;
  }, [todayOrders, yesterdayOrders]);

  useEffect(() => {
    if (mode === "previous" && pendingAction === "none" && !loading) {
      router.replace(`${ADMIN.END_OF_DAY_VEHICLES}?mode=today`);
    }
  }, [mode, pendingAction, loading, router]);

  const handleShiftToggle = useCallback(async () => {
    setIsShiftToggling(true);
    try {
      if (mode === "previous") {
        const prevDate = getYesterdayDate();
        const [y, m, d] = prevDate.split("-");
        const fmtDate = `${d}/${m}/${y}`;
        if (isScheduleLocked) {
          // Previous day has pending orders → forgot to close shift → close it
          await orderApi.shiftClose({ operation_date: prevDate });
          toast.success(tPage("shiftClosePreviousSuccess", { date: fmtDate }), { position: "top-right" });
        } else if (isShiftClosed) {
          // Previous day has canceled orders → closed shift but forgot schedule → open schedule
          await orderApi.shiftOpen({ operation_date: prevDate });
          toast.success(tPage("shiftOpenPreviousSuccess", { date: fmtDate }), { position: "top-right" });
        }
      } else {
        if (isTomorrowConfirmed) {
          const tomorrowDate = getTomorrowDate();
          const [y, m, d] = tomorrowDate.split("-");
          const fmtDate = `${d}/${m}/${y}`;
          await orderApi.shiftReopenInit({ operation_date: tomorrowDate });
          toast.success(tPage("undoScheduleSuccess", { date: fmtDate }), { position: "top-right" });
        } else {
          const todayDate = getTodayDate();
          const [y, m, d] = todayDate.split("-");
          const fmtDate = `${d}/${m}/${y}`;
          if (isScheduleLocked) {
            await orderApi.shiftReopenInit({ operation_date: todayDate });
            toast.success(tPage("shiftReopenTodaySuccess", { date: fmtDate }), { position: "top-right" });
          } else {
            await orderApi.shiftOpen({ operation_date: todayDate });
            toast.success(tPage("shiftOpenTodaySuccess", { date: fmtDate }), { position: "top-right" });
          }
        }
      }
      await fetchAll();
    } catch {
      if (mode === "previous") {
        toast.error(
          isScheduleLocked ? tPage("shiftClosePreviousFailed") : tPage("shiftOpenPreviousFailed"),
          { position: "top-right" },
        );
      } else {
        toast.error(
          isTomorrowConfirmed
            ? tPage("undoScheduleFailed")
            : isScheduleLocked
              ? tPage("shiftReopenTodayFailed")
              : tPage("shiftOpenTodayFailed"),
          { position: "top-right" },
        );
      }
    } finally {
      setIsShiftToggling(false);
    }
  }, [fetchAll, isScheduleLocked, isShiftClosed, isTomorrowConfirmed, mode, tPage]);

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
    <div className="dashboard-light">
      <div className="mx-auto space-y-2 p-6 md:p-10">
        <div className="dd-header p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between w-full">
            <div className="space-y-4 shrink-0">
              <div className="flex items-center gap-3">
                {/* <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{
                    background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(59, 130, 246, 0.18))",
                    border: "1px solid rgba(14, 165, 233, 0.16)",
                  }}
                >
                  <ArrowRightLeft className="h-6 w-6" style={{ color: "var(--dd-sky)" }} />
                </div> */}

                <div>
                  <h1
                    className="text-4xl font-black uppercase md:text-6xl whitespace-nowrap"
                    style={{ color: "var(--dd-text-primary)" }}
                  >
                    {tPage("title")}
                  </h1>
                </div>
              </div>

              <p className="max-w-3xl text-base font-semibold uppercase md:text-lg" style={{ color: "var(--dd-text-muted)" }}>
                {mode === "today" ? tPage("subtitleToday") : mode === "previous" ? tPage("subtitlePrevious") : tPage("subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-4 items-end">
              <div className="flex flex-wrap items-center justify-end gap-3">
                {/* <div
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
                </button> */}

                <div className="flex items-center gap-3">
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
                  <div
                    className="flex items-center rounded-lg p-1"
                    style={{ background: "var(--dd-bg-surface)", border: "1px solid var(--dd-border)" }}
                  >
                    <button
                      type="button"
                      onClick={() => router.replace(`${ADMIN.END_OF_DAY_VEHICLES}?mode=today`)}
                      className={`px-4 py-2 text-sm font-bold uppercase transition-all rounded-md ${mode === "today"
                        ? "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                        : "text-slate-500 border border-transparent hover:text-slate-700"
                        }`}
                    >
                      {tPage("modeToday")}
                    </button>
                    <div className="mx-1 h-4 w-[1px] opacity-20" style={{ background: "var(--dd-text-muted)" }} />
                    <button
                      type="button"
                      onClick={() => pendingAction !== "none" && router.replace(`${ADMIN.END_OF_DAY_VEHICLES}?mode=previous`)}
                      disabled={pendingAction === "none"}
                      className={`px-4 py-2 text-sm font-bold uppercase transition-all rounded-md ${mode === "previous"
                        ? "bg-sky-500/20 text-sky-600 border border-sky-500/30"
                        : "text-slate-500 border border-transparent hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-500 disabled:cursor-not-allowed"
                        }`}
                    >
                      {tPage("modePrevious")}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleShiftToggle}
                    disabled={isShiftToggling || (mode === "previous" && !isScheduleLocked && !isShiftClosed)}
                    className="dd-btn flex items-center gap-2 disabled:opacity-50"
                    style={{
                      background: (mode === "today" && isTomorrowConfirmed) || isScheduleLocked
                        ? "linear-gradient(135deg, rgba(217, 119, 6, 0.14), rgba(245, 158, 11, 0.12))"
                        : "linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(14, 165, 233, 0.12))",
                      border: (mode === "today" && isTomorrowConfirmed) || isScheduleLocked
                        ? "1px solid rgba(217, 119, 6, 0.2)"
                        : "1px solid rgba(124, 58, 237, 0.22)",
                      color: (mode === "today" && isTomorrowConfirmed) || isScheduleLocked ? "#b45309" : "#6d28d9",
                    }}
                  >
                    <ArrowRightLeft className={`h-4 w-4 ${isShiftToggling ? "animate-pulse" : ""}`} />
                    {mode === "previous"
                      ? (isScheduleLocked ? tPage("shiftClosePreviousAction") : isShiftClosed ? tPage("shiftOpenPreviousAction") : tPage("shiftOpenAction"))
                      : (isTomorrowConfirmed ? tPage("undoScheduleAction") : isScheduleLocked ? tPage("shiftReopenTodayAction") : tPage("shiftOpenTodayAction"))
                    }
                  </button>
                </div>
              </div>

              <div className="text-base font-bold uppercase" style={{ color: "var(--dd-text-muted)" }}>
                {tDashboard("systemTime")}: {clock}
              </div>
            </div>
          </div>
        </div>

        {pendingAction !== "none" && (
          <div
            className="flex items-center gap-4 rounded-lg border p-4"
            style={{
              background:
                pendingAction === "forgotShiftClose"
                  ? "linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(245, 158, 11, 0.06))"
                  : "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(124, 58, 237, 0.06))",
              borderColor:
                pendingAction === "forgotShiftClose"
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(245, 158, 11, 0.2)",
            }}
          >
            <AlertTriangle
              className="h-6 w-6 shrink-0"
              style={{
                color: pendingAction === "forgotShiftClose" ? "#ef4444" : "#d97706",
              }}
            />
            <div className="flex-1">
              <p
                className="text-sm font-bold uppercase"
                style={{
                  color: pendingAction === "forgotShiftClose" ? "#b91c1c" : "#b45309",
                }}
              >
                {tPage(
                  pendingAction === "forgotShiftClose"
                    ? "alertForgotShiftCloseTitle"
                    : "alertForgotScheduleConfirmTitle",
                )}
              </p>
              <p className="mt-1 text-xs font-medium" style={{ color: "var(--dd-text-muted)" }}>
                {tPage(
                  pendingAction === "forgotShiftClose"
                    ? "alertForgotShiftCloseDescription"
                    : "alertForgotScheduleConfirmDescription",
                )}
              </p>
            </div>
            {mode === "today" && (
              <button
                type="button"
                onClick={() => router.replace(`${ADMIN.END_OF_DAY_VEHICLES}?mode=previous`)}
                className="dd-btn flex items-center gap-2 whitespace-nowrap"
                style={{
                  background:
                    pendingAction === "forgotShiftClose"
                      ? "linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.08))"
                      : "linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.08))",
                  border: `1px solid ${
                    pendingAction === "forgotShiftClose"
                      ? "rgba(239, 68, 68, 0.22)"
                      : "rgba(245, 158, 11, 0.22)"
                  }`,
                  color: pendingAction === "forgotShiftClose" ? "#dc2626" : "#d97706",
                }}
              >
                {tPage("alertGoToPrevious")}
              </button>
            )}
            {mode === "previous" && (
              <button
                type="button"
                onClick={handleShiftToggle}
                disabled={isShiftToggling}
                className="dd-btn flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                style={{
                  background:
                    pendingAction === "forgotShiftClose"
                      ? "linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.08))"
                      : "linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.08))",
                  border: `1px solid ${
                    pendingAction === "forgotShiftClose"
                      ? "rgba(239, 68, 68, 0.22)"
                      : "rgba(245, 158, 11, 0.22)"
                  }`,
                  color: pendingAction === "forgotShiftClose" ? "#dc2626" : "#d97706",
                }}
              >
                <ArrowRightLeft className={`h-4 w-4 ${isShiftToggling ? "animate-pulse" : ""}`} />
                {pendingAction === "forgotShiftClose"
                  ? tPage("shiftClosePreviousAction")
                  : tPage("shiftOpenPreviousAction")}
              </button>
            )}
          </div>
        )}

        {/* <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
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
        </div> */}

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
              orderStatusFilter={mode === "previous" ? ["pending", "canceled"] : ["init"]}
              onOrdersUpdated={fetchAll}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
