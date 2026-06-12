"use client";

import dayjs from "dayjs";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { MaintenanceAiOverview } from "@/types/vehicle";

const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

export default function MaintenanceAiOverviewCard({ className }: { className?: string }) {
  const t = useTranslations("MaintenanceAiOverview");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasActionAccess } = usePermissions();
  const canView = hasActionAccess(
    SIDEBAR.VEHICLE_MAINTENANCES,
    PERMISSIONS.VEHICLE_MAINTENANCES.VIEW
  );

  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<MaintenanceAiOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedVehicleId = Number(searchParams.get("vehicle_id")) || null;

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const res = await vehicleMaintenanceApi.getAiOverview({ period, force });
        setData(res.data);
      } catch {
        toast.error(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [period, t]
  );

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const isEmpty =
    !!data &&
    data.sections.repeat_offenders.length === 0 &&
    data.sections.stale_pending.length === 0 &&
    data.sections.upcoming_maintenance.length === 0;

  // Không có gì đáng chú ý thì ẩn hẳn card — dashboard không cần nhiễu
  if (!canView || !data || isEmpty) return null;

  const vehicleLabel = (v: {
    vehicle_license_plate: string | null;
    vehicle_name?: string | null;
  }) => v.vehicle_license_plate || v.vehicle_name || "-";
  const isVehicleActive = (vehicleId: number) => selectedVehicleId === vehicleId;
  const goVehicle = (vehicleId: number) =>
    router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}?vehicle_id=${vehicleId}`);

  const formatAmountShort = (amount: number) =>
    amount >= 1_000_000 ? `${Math.round(amount / 1_000_000)}tr` : `${Math.round(amount / 1_000)}k`;

  const renderEmpty = () => <p className="text-sm font-medium text-slate-400">{t("empty")}</p>;
  const sectionLabel = (label: string) => (
    <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-sky-100 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]",
        className
      )}
    >
      <div className="flex flex-col gap-4 p-4 lg:p-5 xl:flex-row">
        <div className="min-w-0 xl:w-[36%] 2xl:w-[32%]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-base font-extrabold uppercase tracking-tight text-slate-950">
                {t("title")}
              </h2>
              {data && (
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  {t("updatedAt", { time: dayjs(data.generated_at).format("HH:mm DD/MM") })}
                </p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 shadow-sm"
              >
                <option value="7d">{t("period7")}</option>
                <option value="30d">{t("period30")}</option>
                <option value="90d">{t("period90")}</option>
              </select>
              <button
                type="button"
                onClick={() => void load(true)}
                aria-label={t("refresh")}
                disabled={loading}
                className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-sky-600"
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          {data?.ai_commentary && (
            <p className="m-0 text-sm leading-6 text-slate-600">{data.ai_commentary}</p>
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
          <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            {sectionLabel(t("repeatOffenders"))}
            <div className="mt-2 space-y-1.5">
              {data?.sections.repeat_offenders.length
                ? data.sections.repeat_offenders.map((row) => (
                    <button
                      key={row.vehicle.vehicle_id}
                      type="button"
                      onClick={() => goVehicle(row.vehicle.vehicle_id)}
                      aria-pressed={isVehicleActive(row.vehicle.vehicle_id)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all",
                        isVehicleActive(row.vehicle.vehicle_id)
                          ? "border-sky-300 bg-white shadow-[0_0_0_3px_rgba(14,165,233,0.14)]"
                          : "border-transparent hover:border-slate-200 hover:bg-white"
                      )}
                    >
                      <span className="truncate text-sm font-bold text-slate-950">
                        {vehicleLabel(row.vehicle)}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap text-sm font-semibold",
                          isVehicleActive(row.vehicle.vehicle_id) ? "text-sky-700" : "text-red-600"
                        )}
                      >
                        {t("ticketsAmount", {
                          count: row.count,
                          amount: formatAmountShort(row.total_amount),
                        })}
                      </span>
                    </button>
                  ))
                : renderEmpty()}
            </div>
          </section>

          <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            {sectionLabel(t("stalePending"))}
            <div className="mt-2 space-y-1.5">
              {data?.sections.stale_pending.length
                ? data.sections.stale_pending.map((row) => (
                    <button
                      key={row.vehicle_maintenance_id}
                      type="button"
                      onClick={() =>
                        router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}/${row.vehicle_maintenance_id}`)
                      }
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white"
                    >
                      <span className="truncate text-sm font-bold text-slate-950">
                        {vehicleLabel(row.vehicle)}
                      </span>
                      <span className="whitespace-nowrap text-sm font-semibold text-amber-700">
                        {t("waitingHours", { hours: row.waiting_hours })}
                      </span>
                    </button>
                  ))
                : renderEmpty()}
            </div>
          </section>

          <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            {sectionLabel(t("upcoming"))}
            <div className="mt-2 space-y-1.5">
              {data?.sections.upcoming_maintenance.length
                ? data.sections.upcoming_maintenance.map((row) => (
                    <button
                      key={row.vehicle.vehicle_id}
                      type="button"
                      onClick={() => goVehicle(row.vehicle.vehicle_id)}
                      aria-pressed={isVehicleActive(row.vehicle.vehicle_id)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all",
                        isVehicleActive(row.vehicle.vehicle_id)
                          ? "border-sky-300 bg-white shadow-[0_0_0_3px_rgba(14,165,233,0.14)]"
                          : "border-transparent hover:border-slate-200 hover:bg-white"
                      )}
                    >
                      <span className="truncate text-sm font-bold text-slate-950">
                        {vehicleLabel(row.vehicle)}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap text-sm font-semibold",
                          isVehicleActive(row.vehicle.vehicle_id) ? "text-sky-700" : "text-slate-500"
                        )}
                      >
                        {row.basis === "km"
                          ? t("remainingKm", { km: row.remaining })
                          : t("remainingDays", { days: row.remaining })}
                      </span>
                    </button>
                  ))
                : renderEmpty()}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
