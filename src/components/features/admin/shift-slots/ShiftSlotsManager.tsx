"use client";

import ActivityFlow from "@/components/features/admin/dashboard/ActivityFlow";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import orderApi from "@/services/order.service";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { Skeleton } from "antd";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const getTodayDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

export default function ShiftSlotsManager() {
  const t = useTranslations("ShiftSlotsPage");
  const tDashboard = useTranslations("DashboardPage");
  const locale = useLocale();

  const [stations, setStations] = useState<Station[]>([]);
  const [canceledOrders, setCanceledOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [locale]);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        stationApi.getAll(),
        orderApi.getByInitDate(operationDate),
      ]);

      if (results[0].status === "fulfilled") {
        const stationData = (
          results[0] as PromiseFulfilledResult<{ data: { data?: Station[] } | Station[] }>
        ).value.data;
        const arr = (stationData as { data?: Station[] })?.data || stationData || [];
        setStations(Array.isArray(arr) ? arr : []);
      }

      if (results[1].status === "fulfilled") {
        const orderData = (
          results[1] as PromiseFulfilledResult<{ data: { data?: Order[] } | Order[] }>
        ).value.data;
        const arr = (orderData as { data?: Order[] })?.data || orderData || [];
        const allOrders = Array.isArray(arr) ? arr : [];
        setCanceledOrders(allOrders.filter((o) => o.order_status === "canceled"));
      }
    } finally {
      setLoading(false);
    }
  }, [operationDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeUpdates(fetchAll);

  const [isSlotClosing, setIsSlotClosing] = useState(false);

  const handleShiftOpenSlot = useCallback(async () => {
    setIsSlotClosing(true);
    try {
      await orderApi.shiftOpen({ operation_date: operationDate });
      toast.success(t("shiftOpenSlotSuccess"));
      await fetchAll();
    } catch {
      toast.error(t("shiftOpenSlotFailed"));
    } finally {
      setIsSlotClosing(false);
    }
  }, [t, fetchAll, operationDate]);

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
              <h1
                className="text-4xl font-black uppercase md:text-6xl whitespace-nowrap"
                style={{ color: "var(--dd-text-primary)" }}
              >
                {t("title")}
              </h1>
              <p
                className="max-w-3xl text-base font-semibold uppercase md:text-lg"
                style={{ color: "var(--dd-text-muted)" }}
              >
                {t("subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-4 items-end">
              <div className="flex items-center gap-3">
                {canceledOrders.length > 0 && (
                  <span className="dd-chip dd-chip-amber text-sm px-3 py-1">
                    {t("canceledCount", { count: canceledOrders.length })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleShiftOpenSlot}
                  disabled={isSlotClosing}
                  className="dd-btn flex items-center gap-2 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(14, 165, 233, 0.12))",
                    border: "1px solid rgba(16, 185, 129, 0.22)",
                    color: "#047857",
                  }}
                >
                  <CheckCircle2 className={`h-4 w-4 ${isSlotClosing ? "animate-spin" : ""}`} />
                  {t("shiftOpenSlotAction")}
                </button>
              </div>
              <div
                className="text-base font-bold uppercase"
                style={{ color: "var(--dd-text-muted)" }}
              >
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
              <h2
                className="text-xl font-black uppercase"
                style={{ color: "var(--dd-text-primary)" }}
              >
                {t("boardTitle")}
              </h2>
              <p
                className="mt-1 text-sm font-bold uppercase"
                style={{ color: "var(--dd-text-muted)" }}
              >
                {t("boardHint")}
              </p>
            </div>

            <span className="dd-chip dd-chip-sky whitespace-nowrap">{t("lastUpdated")}</span>
          </div>

          <div className="flex-1 p-3 md:p-4">
            {canceledOrders.length === 0 ? (
              <div className="flex h-full items-center justify-center py-20">
                <span
                  className="text-sm font-bold uppercase"
                  style={{ color: "var(--dd-text-muted)" }}
                >
                  {t("noCanceledOrders")}
                </span>
              </div>
            ) : (
              <ActivityFlow
                stations={stations}
                vehicles={[]}
                orders={canceledOrders}
                dispatchMode="auto"
                layout="merged"
                orderStatusFilter={["canceled"]}
                onOrdersUpdated={fetchAll}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
