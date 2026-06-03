"use client";

import { useTranslations } from "next-intl";
import type { WorkAttendanceStatus } from "@/types/work-arrangement";
import { STATUS_META, STATUS_ORDER } from "./shared";

type StatusSegmentedProps = {
  value: WorkAttendanceStatus;
  disabled?: boolean;
  onChange: (status: WorkAttendanceStatus) => void;
  className?: string;
};

export default function StatusSegmented({
  value,
  disabled,
  onChange,
  className,
}: StatusSegmentedProps) {
  const t = useTranslations("WorkAttendancePage");

  return (
    <div
      role="radiogroup"
      className={`inline-flex w-full items-stretch gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${
        className ?? ""
      }`}
    >
      {STATUS_ORDER.map((option) => {
        const active = value === option.key;
        const meta = STATUS_META[option.key];

        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active ? `bg-white shadow-sm ${meta.text}` : "text-slate-500 hover:text-slate-700",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            ].join(" ")}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? meta.dot : "bg-slate-300"}`}
            />
            <span className="truncate">{t(option.tkey)}</span>
          </button>
        );
      })}
    </div>
  );
}
