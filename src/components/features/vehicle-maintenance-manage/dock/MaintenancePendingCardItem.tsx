"use client";

import dayjs from "dayjs";
import { ArrowRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PendingMaintenanceCard, VehicleMaintenanceWorkflowAction } from "@/types/vehicle";
import RejectReasonPopover from "./RejectReasonPopover";

const FLAG_CLASS: Record<string, string> = {
  cost_anomaly: "bg-red-50 text-red-700",
  repeat_issue: "bg-amber-50 text-amber-700",
  missing_invoice: "bg-amber-50 text-amber-700",
  long_duration: "bg-amber-50 text-amber-700",
  other: "bg-slate-100 text-slate-600",
};

export default function MaintenancePendingCardItem({
  card,
  isMine,
  processing,
  onAction,
  onDetail,
}: {
  card: PendingMaintenanceCard;
  isMine: boolean;
  processing: boolean;
  onAction: (action: VehicleMaintenanceWorkflowAction, reason?: string) => void;
  onDetail: () => void;
}) {
  const t = useTranslations("MaintenanceDock");
  const insight = card.ai_insight;
  const approveAction = card.workflow_available_actions.find((a) => a.endsWith("_approve"));
  const rejectAction = card.workflow_available_actions.find((a) => a.endsWith("_reject"));
  const isDispatchStep = card.vehicle_maintenance_status === "submitted";
  const waitingHours = Math.max(dayjs().diff(dayjs(card.submitted_at), "hour"), 0);

  return (
    <div
      className={`w-full rounded-xl border bg-white p-3 shadow-sm ${processing ? "pointer-events-none opacity-60" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-slate-900">
          {card.vehicle.vehicle_license_plate || `#${card.vehicle.vehicle_id}`}
          {card.vehicle.vehicle_name ? ` · ${card.vehicle.vehicle_name}` : ""}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${isDispatchStep ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}
        >
          {isDispatchStep ? t("stepDispatch") : t("stepProduction")}
        </span>
      </div>

      {insight?.status === "done" && insight.summary ? (
        <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-slate-600">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-sky-600" />
          <span>{insight.summary}</span>
        </p>
      ) : insight?.status === "failed" ? (
        <p className="mt-2 text-xs text-red-500">{t("analysisFailed")}</p>
      ) : !insight || insight.status === "pending" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <RefreshCw className="size-3.5 animate-spin" />
          {t("analyzing")}
        </p>
      ) : null}

      {insight?.status === "done" && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {insight.suggested_type && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">
              {t("aiPrefix")}: {insight.suggested_type} · rank {insight.suggested_rank ?? "-"}
            </span>
          )}
          {insight.flags.map((flag, idx) => (
            <span key={idx} className={`rounded-full px-2 py-0.5 text-[11px] ${FLAG_CLASS[flag.code] ?? "bg-slate-100 text-slate-600"}`}>
              {flag.detail}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        {approveAction && (
          <button
            type="button"
            disabled={processing}
            onClick={() => onAction(approveAction)}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="size-3.5" />
            {t("approve")}
          </button>
        )}
        {rejectAction && (
          <RejectReasonPopover
            suggestedReason={insight?.suggested_reject_reason ?? null}
            disabled={processing}
            onConfirm={(reason) => onAction(rejectAction, reason)}
          />
        )}
        <button
          type="button"
          onClick={onDetail}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {t("detail")}
          <ArrowRight className="size-3.5" />
        </button>
        <span className="ml-auto text-[11px] text-slate-400">{t("waitingShort", { hours: waitingHours })}</span>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
        <span>
          {card.created_by_user.user_full_name || `#${card.created_by_user.user_id}`}
          {isMine ? ` · ${t("yourTicket")}` : ""}
        </span>
        <span className="font-medium text-slate-500">
          {card.total_amount != null ? `${card.total_amount.toLocaleString("vi-VN")} ₫` : ""}
        </span>
      </div>
    </div>
  );
}
