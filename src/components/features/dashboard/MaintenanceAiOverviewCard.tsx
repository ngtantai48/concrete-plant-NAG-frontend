"use client";

import dayjs from "dayjs";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { MaintenanceAiOverview } from "@/types/vehicle";

const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

export default function MaintenanceAiOverviewCard() {
  const t = useTranslations("MaintenanceAiOverview");
  const router = useRouter();
  const { hasActionAccess } = usePermissions();
  const canView = hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.VIEW);

  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<MaintenanceAiOverview | null>(null);
  const [loading, setLoading] = useState(false);

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

  if (!canView) return null;

  const vehicleLabel = (v: { vehicle_license_plate: string | null; vehicle_name?: string | null }) =>
    v.vehicle_license_plate || v.vehicle_name || "-";
  const goVehicle = (vehicleId: number) =>
    router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}?vehicle_id=${vehicleId}`);

  const renderEmpty = () => <p className="text-xs text-slate-400">{t("empty")}</p>;
  const sectionLabel = (label: string) => (
    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
  );

  return (
    <div className="dd-card mb-1.5 flex shrink-0 flex-col p-3" style={{ borderColor: "rgba(56, 138, 221, 0.25)" }}>
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-sky-600" />
        <span className="text-sm font-extrabold uppercase">{t("title")}</span>
        <span className="flex-1" />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[11px]"
        >
          <option value="7d">{t("period7")}</option>
          <option value="30d">{t("period30")}</option>
          <option value="90d">{t("period90")}</option>
        </select>
        <button type="button" onClick={() => void load(true)} aria-label={t("refresh")} disabled={loading}>
          <RefreshCw className={`size-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {data && (
        <p className="mb-2 text-[10px] text-slate-400">
          {t("updatedAt", { time: dayjs(data.generated_at).format("HH:mm DD/MM") })}
        </p>
      )}
      {data?.ai_commentary && (
        <p className="mb-2.5 text-xs leading-relaxed text-slate-600">{data.ai_commentary}</p>
      )}

      <div className="mb-2.5">
        {sectionLabel(t("repeatOffenders"))}
        {data?.sections.repeat_offenders.length
          ? data.sections.repeat_offenders.map((row) => (
              <button
                key={row.vehicle.vehicle_id}
                type="button"
                onClick={() => goVehicle(row.vehicle.vehicle_id)}
                className="flex w-full items-center justify-between py-0.5 text-xs hover:bg-slate-50"
              >
                <span className="font-semibold">{vehicleLabel(row.vehicle)}</span>
                <span className="text-red-700">
                  {t("ticketsAmount", {
                    count: row.count,
                    amount: `${Math.round(row.total_amount / 1_000_000)}tr`,
                  })}
                </span>
              </button>
            ))
          : renderEmpty()}
      </div>

      <div className="mb-2.5">
        {sectionLabel(t("stalePending"))}
        {data?.sections.stale_pending.length
          ? data.sections.stale_pending.map((row) => (
              <button
                key={row.vehicle_maintenance_id}
                type="button"
                onClick={() => router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}/${row.vehicle_maintenance_id}`)}
                className="flex w-full items-center justify-between py-0.5 text-xs hover:bg-slate-50"
              >
                <span className="font-semibold">{vehicleLabel(row.vehicle)}</span>
                <span className="text-amber-700">{t("waitingHours", { hours: row.waiting_hours })}</span>
              </button>
            ))
          : renderEmpty()}
      </div>

      <div>
        {sectionLabel(t("upcoming"))}
        {data?.sections.upcoming_maintenance.length
          ? data.sections.upcoming_maintenance.map((row) => (
              <button
                key={row.vehicle.vehicle_id}
                type="button"
                onClick={() => goVehicle(row.vehicle.vehicle_id)}
                className="flex w-full items-center justify-between py-0.5 text-xs hover:bg-slate-50"
              >
                <span className="font-semibold">{vehicleLabel(row.vehicle)}</span>
                <span className="text-slate-500">{t("remainingDays", { days: row.remaining })}</span>
              </button>
            ))
          : renderEmpty()}
      </div>
    </div>
  );
}
