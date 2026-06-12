"use client";

import { Tooltip } from "antd";
import { AlertTriangle, Check, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { VehicleMaintenanceAiInsight } from "@/types/vehicle";

/**
 * Badge AI rút gọn cho cột trong bảng phiếu bảo trì.
 * Chỉ render khi có insight; phiếu chưa phân tích trả "–".
 */
export default function MaintenanceAiBadge({
  insight,
}: {
  insight?: VehicleMaintenanceAiInsight | null;
}) {
  const t = useTranslations("MaintenanceAiInsight");

  if (!insight) return <span className="text-slate-300">–</span>;

  if (insight.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <RefreshCw className="size-3 animate-spin" />
        {t("analyzing")}
      </span>
    );
  }

  if (insight.status === "failed") {
    return (
      <Tooltip title={insight.error || t("failed")}>
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
          <AlertTriangle className="size-3" />
          {t("errorShort")}
        </Badge>
      </Tooltip>
    );
  }

  const tooltip = (
    <div className="max-w-xs space-y-1">
      {insight.summary ? <p className="text-xs">{insight.summary}</p> : null}
      {insight.flags?.length ? (
        <ul className="list-disc pl-4 text-[11px]">
          {insight.flags.map((flag, idx) => (
            <li key={idx}>{flag.detail}</li>
          ))}
        </ul>
      ) : null}
      {insight.confidence != null ? (
        <p className="text-[10px] opacity-70">
          {t("confidence", { percent: Math.round(insight.confidence * 100) })}
        </p>
      ) : null}
    </div>
  );

  if (insight.recommendation === "review_carefully") {
    return (
      <Tooltip title={tooltip}>
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="size-3" />
          {t("recommendReview")}
          {insight.flags?.length ? ` (${insight.flags.length})` : ""}
        </Badge>
      </Tooltip>
    );
  }

  if (insight.recommendation === "approve") {
    return (
      <Tooltip title={tooltip}>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
          <Check className="size-3" />
          {t("recommendApprove")}
        </Badge>
      </Tooltip>
    );
  }

  // status done nhưng không có khuyến nghị rõ ràng — hiện badge trung tính kèm tóm tắt.
  return (
    <Tooltip title={tooltip}>
      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
        <Sparkles className="size-3" />
        {t("title")}
      </Badge>
    </Tooltip>
  );
}
