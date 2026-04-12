"use client";

import ActivityFlow from "@/components/features/admin/dashboard/ActivityFlow";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { Skeleton } from "antd";
import { CheckCircle2, Save, Shuffle } from "lucide-react";
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
  const [tomorrowOrders, setTomorrowOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
        orderApi.getByInitDate(getTomorrowDate()),
      ]);

      if (results[0].status === "fulfilled") {
        const stationData = (results[0] as PromiseFulfilledResult<{ data: { data?: Station[] } | Station[] }>).value.data;
        const arr = (stationData as { data?: Station[] })?.data || stationData || [];
        setStations(Array.isArray(arr) ? arr : []);
      }

      if (results[1].status === "fulfilled") {
        const tmData = (results[1] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>).value.data;
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

  const isTomorrowConfirmed = useMemo(
    () => tomorrowOrders.some((o) => o.order_status === "pending"),
    [tomorrowOrders],
  );

  const pendingTomorrowOrders = useMemo(
    () => tomorrowOrders.filter((o) => {
      const vehicleStatus = o.vehicles?.vehicle_status;
      return o.order_status === "pending" && vehicleStatus !== "maintenance" && vehicleStatus !== "incident";
    }),
    [tomorrowOrders],
  );

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

  useRealtimeUpdates(fetchAll);

  const operatingStations = useMemo(
    () => stations.filter(
      (station) => (station.station_types?.station_type_id ?? station.station_type_id) === FLOW_STATION_TYPE_ID
        && station.station_status === "operating",
    ),
    [stations],
  );

  if (loading) {
    return (
      <div className="dashboard-light min-h-screen">
        <div className="mx-auto space-y-6 p-6 md:p-10">
          <div className="dd-header p-6 md:p-8">
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
          <div className="dd-card p-6">
            <Skeleton active paragraph={{ rows: 10 }} title={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-light flex min-h-[calc(100vh-64px)] flex-col">
      <div className="mx-auto flex w-full flex-1 flex-col gap-2 p-6 md:p-10">
        <div className="dd-header shrink-0 p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between w-full">
            <div className="space-y-4 shrink-0">
              <div className="flex items-center gap-3">
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
                {tPage("subtitleToday")}
              </p>
            </div>

            <div className="flex flex-col gap-4 items-end">
              <div className="flex flex-wrap items-center justify-end gap-3">
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

                  {/* <button
                    type="button"
                    className="dd-btn flex items-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(59, 130, 246, 0.12))",
                      border: "1px solid rgba(14, 165, 233, 0.22)",
                      color: "#0369a1",
                    }}
                  >
                    <Save className="h-4 w-4" />
                    {tPage("saveAction")}
                  </button> */}

                  {isTomorrowConfirmed && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-4 py-2"
                      style={{
                        background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                        color: "#047857",
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-bold uppercase">
                        {tDashboard("tomorrowScheduleReadyTitle")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-base font-bold uppercase" style={{ color: "var(--dd-text-muted)" }}>
                {tDashboard("systemTime")}: {clock}
              </div>
            </div>
          </div>
        </div>

        <div className="dd-card flex flex-1 flex-col overflow-hidden">
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

          <div className="flex-1 p-3 md:p-4">
            <ActivityFlow
              stations={stations}
              vehicles={[]}
              orders={pendingTomorrowOrders}
              dispatchMode="auto"
              layout="board"
              orderStatusFilter={["pending"]}
              onOrdersUpdated={fetchAll}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
