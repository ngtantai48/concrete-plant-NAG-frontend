"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function RejectReasonPopover({
  suggestedReason,
  disabled,
  onConfirm,
}: {
  suggestedReason: string | null;
  disabled?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations("MaintenanceDock");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const templates = [t("reasonCost"), t("reasonDocs"), t("reasonWrongItem")];

  const handleConfirm = () => {
    if (!reason.trim()) return;
    setOpen(false);
    onConfirm(reason.trim());
    setReason("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          <X className="size-3.5" />
          {t("reject")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[160] w-80 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">{t("rejectTitle")}</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestedReason && (
            <button
              type="button"
              onClick={() => setReason(suggestedReason)}
              className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700 hover:bg-sky-100"
            >
              <Sparkles className="size-3" />
              {suggestedReason}
            </button>
          )}
          {templates.map((tpl) => (
            <button
              key={tpl}
              type="button"
              onClick={() => setReason(tpl)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              {tpl}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("rejectPlaceholder")}
          rows={2}
          className="mb-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!reason.trim()}
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={handleConfirm}
          >
            {t("rejectConfirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
