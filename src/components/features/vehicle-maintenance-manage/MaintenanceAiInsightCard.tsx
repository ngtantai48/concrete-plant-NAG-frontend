"use client";

import dayjs from "dayjs";
import { ArrowRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { VehicleMaintenance } from "@/types/vehicle";

const TYPE_LABELS: Record<string, string> = {
  maintenance: "Bảo dưỡng",
  repair: "Sửa chữa",
  inspection: "Kiểm tra",
  other: "Khác",
};
const RANK_LABELS: Record<number, string> = { 1: "Thấp", 2: "Trung bình", 3: "Cao", 4: "Rất nghiêm trọng" };

export default function MaintenanceAiInsightCard({
  maintenance,
  onChanged,
}: {
  maintenance: VehicleMaintenance;
  onChanged: () => void;
}) {
  const t = useTranslations("MaintenanceAiInsight");
  const { hasActionAccess } = usePermissions();
  const [busy, setBusy] = useState(false);

  const insight = maintenance.ai_insight;
  const status = maintenance.vehicle_maintenance_status || "";
  const canModerateStep =
    (status === "submitted" &&
      hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.DISPATCH_REVIEW)) ||
    (status === "reviewing" &&
      hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.PRODUCTION_APPROVE));

  if (!insight && !["submitted", "reviewing"].includes(status)) return null;

  const hasDiff =
    insight?.status === "done" &&
    ((insight.suggested_type != null && insight.suggested_type !== maintenance.vehicle_maintenance_type) ||
      (insight.suggested_rank != null && insight.suggested_rank !== maintenance.vehicle_maintenance_rank));

  const handleApply = async () => {
    setBusy(true);
    try {
      await vehicleMaintenanceApi.applyAiInsight(maintenance.vehicle_maintenance_id);
      toast.success(t("applySuccess"));
      onChanged();
    } catch {
      toast.error(t("applyFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      await vehicleMaintenanceApi.regenerateAiInsight(maintenance.vehicle_maintenance_id);
      onChanged();
    } catch (error: unknown) {
      const code = String(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ""
      );
      if (code.includes("PENDING")) toast.info(t("regeneratePending"));
      else if (code.includes("RATE_LIMITED")) toast.info(t("regenerateLimited"));
      else toast.error(t("regenerateFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-slate-900">{t("title")}</h3>
        {insight?.confidence != null && (
          <span className="text-[11px] text-slate-400">
            {t("confidence", { percent: Math.round(insight.confidence * 100) })}
            {insight.generated_at ? ` · ${dayjs(insight.generated_at).format("HH:mm DD/MM")}` : ""}
          </span>
        )}
        <span className="flex-1" />
        {canModerateStep && (
          <button
            type="button"
            disabled={busy || insight?.status === "pending"}
            onClick={() => void handleRegenerate()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="size-3" />
            {t("regenerate")}
          </button>
        )}
      </div>

      {!insight || insight.status === "pending" ? (
        <>
          {insight?.summary && (
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{insight.summary}</p>
          )}
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="size-3.5 animate-spin" />
            {insight?.summary ? t("updating") : t("analyzing")}
          </p>
        </>
      ) : insight.status === "failed" ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-red-500">
          {t("failed")}
          {canModerateStep && (
            <button
              type="button"
              disabled={busy}
              className="underline disabled:opacity-50"
              onClick={() => void handleRegenerate()}
            >
              {t("retry")}
            </button>
          )}
        </p>
      ) : (
        <>
          {insight.summary && (
            <p className="mt-3 text-[13px] leading-relaxed text-slate-700">{insight.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {insight.flags.map((flag, idx) => (
              <span
                key={idx}
                className={`rounded-full px-2.5 py-0.5 text-[11px] ${flag.code === "cost_anomaly" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
              >
                {flag.detail}
              </span>
            ))}
          </div>

          {hasDiff && canModerateStep && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="text-[11px] text-slate-400">{t("currentLabel")}</p>
                <p className="text-xs text-slate-600">
                  {TYPE_LABELS[maintenance.vehicle_maintenance_type || ""] || maintenance.vehicle_maintenance_type}
                  {" · "}
                  {RANK_LABELS[maintenance.vehicle_maintenance_rank || 1]}
                </p>
              </div>
              <ArrowRight className="size-4 text-slate-300" />
              <div>
                <p className="text-[11px] text-slate-400">{t("suggestedLabel")}</p>
                <p className="text-xs font-medium text-sky-700">
                  {TYPE_LABELS[insight.suggested_type ?? maintenance.vehicle_maintenance_type ?? ""] ||
                    (insight.suggested_type ?? maintenance.vehicle_maintenance_type)}
                  {" · "}
                  {RANK_LABELS[insight.suggested_rank ?? maintenance.vehicle_maintenance_rank ?? 1]}
                </p>
              </div>
              <span className="flex-1" />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApply()}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
              >
                <Check className="size-3.5" />
                {t("applyButton")}
              </button>
            </div>
          )}

          {insight.applied_at && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Check className="size-3.5 text-emerald-600" />
              {t("appliedAt", { time: dayjs(insight.applied_at).format("HH:mm DD/MM") })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
