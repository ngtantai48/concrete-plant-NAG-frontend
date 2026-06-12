"use client";

import dayjs from "dayjs";
import { ArrowRight, Check, EyeOff, RefreshCw, Sparkles } from "lucide-react";
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

const RANK_BADGE_CLASS: Record<number, string> = {
  1: "bg-emerald-50 text-emerald-700",
  2: "bg-amber-50 text-amber-700",
  3: "bg-orange-50 text-orange-700",
  4: "bg-red-100 text-red-700",
};

export default function MaintenancePendingCardItem({
  card,
  isMine,
  processing,
  onAction,
  onDetail,
  onSkip,
}: {
  card: PendingMaintenanceCard;
  isMine: boolean;
  processing: boolean;
  onAction: (action: VehicleMaintenanceWorkflowAction, reason?: string) => void;
  onDetail: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("MaintenanceDock");

  const insight = card.ai_insight;
  const approveAction = card.workflow_available_actions.find((a) => a.endsWith("_approve"));
  const rejectAction = card.workflow_available_actions.find((a) => a.endsWith("_reject"));
  const isDispatchStep = card.vehicle_maintenance_status === "submitted";
  const waitingHours = Math.max(dayjs().diff(dayjs(card.submitted_at), "hour"), 0);

  const typeLabel: Record<string, string> = {
    maintenance: t("typeMaintenance"),
    repair: t("typeRepair"),
    inspection: t("typeInspection"),
    other: t("typeOther"),
  };
  const rankLabel: Record<number, string> = {
    1: t("rank1"),
    2: t("rank2"),
    3: t("rank3"),
    4: t("rank4"),
  };
  const ticketType = typeLabel[card.vehicle_maintenance_type] ?? card.vehicle_maintenance_type;
  const ticketRank = card.vehicle_maintenance_rank;

  // AI suggestion chip: only show when it differs from current classification.
  const aiType = insight?.suggested_type ? (typeLabel[insight.suggested_type] ?? insight.suggested_type) : null;
  const aiRank = insight?.suggested_rank ?? null;
  const showAiSuggestion =
    insight?.status === "done" &&
    ((insight.suggested_type != null && insight.suggested_type !== card.vehicle_maintenance_type) ||
      (insight.suggested_rank != null && insight.suggested_rank !== ticketRank));

  // AI block: only show spinner when status is explicitly "pending"; hide block entirely when insight is null.
  const showAiSpinner = insight?.status === "pending";
  const showAiFailed = insight?.status === "failed";
  const showAiDone = insight?.status === "done";
  const showAiBlock = showAiSpinner || showAiFailed || showAiDone;

  return (
    <div
      className={`relative w-full rounded-xl border bg-white p-3 shadow-sm ${processing ? "pointer-events-none opacity-60" : "border-slate-200"}`}
    >
      {/* ── Header: plate + cost (right) + rank badge (top-right accent) ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-900">
            {card.vehicle.vehicle_license_plate || `#${card.vehicle.vehicle_id}`}
            {card.vehicle.vehicle_name ? ` · ${card.vehicle.vehicle_name}` : ""}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {card.created_by_user.user_full_name || `#${card.created_by_user.user_id}`}
            {isMine ? ` · ${t("yourTicket")}` : ""} · {t("waitingShort", { hours: waitingHours })}
            {" · "}
            <span className={`${isDispatchStep ? "text-amber-600" : "text-sky-600"}`}>
              {isDispatchStep ? t("stepDispatch") : t("stepProduction")}
            </span>
          </p>
        </div>
        {/* Rank badge — most decision-critical signal, prime position */}
        <span
          aria-label={`${t("severity")}: ${rankLabel[ticketRank] ?? ticketRank}`}
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${RANK_BADGE_CLASS[ticketRank] ?? "bg-slate-100 text-slate-600"}`}
        >
          {rankLabel[ticketRank] ?? ticketRank}
        </span>
      </div>

      {/* ── Instant overview: type · cost (always available, no AI needed) ── */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          {ticketType}
        </span>
        {card.total_amount != null && (
          <span className="text-[13px] font-semibold tabular-nums text-slate-900">
            {card.total_amount.toLocaleString("vi-VN")}
            <span className="ml-0.5 text-[11px] font-normal text-slate-400">₫</span>
          </span>
        )}
      </div>

      {/* ── AI block: loads after overview, hidden when insight is null ── */}
      {showAiBlock && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {showAiDone ? (
            <>
              {insight!.summary && (
                <p className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
                  <span>{insight!.summary}</span>
                </p>
              )}
              {(showAiSuggestion || insight!.flags.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {showAiSuggestion && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">
                      {t("aiPrefix")}: {aiType}
                      {aiRank != null ? ` · ${rankLabel[aiRank] ?? aiRank}` : ""}
                    </span>
                  )}
                  {insight!.flags.map((flag, idx) => (
                    <span
                      key={idx}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${FLAG_CLASS[flag.code] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {flag.detail}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : showAiFailed ? (
            <p className="text-xs text-slate-400">{t("analysisFailed")}</p>
          ) : (
            /* showAiSpinner — only when status === "pending" */
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <RefreshCw className="size-3.5 animate-spin" />
              {t("analyzing")}
            </p>
          )}
        </div>
      )}

      {/* ── Actions: Duyệt · Từ chối · Chi tiết + nút Bỏ qua (ẩn tạm thời) ── */}
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

        {/* Bỏ qua: ẩn tạm thời phiên này, không đổi trạng thái phiếu */}
        <button
          type="button"
          onClick={onSkip}
          aria-label={t("skipHideHint")}
          title={t("skipHideHint")}
          className="ml-auto inline-flex items-center justify-center rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <EyeOff className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
