"use client";

import type { ReactNode } from "react";

interface DashboardCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent: "blue" | "emerald" | "amber" | "slate";
  subtitle?: string;
  index?: number;
}

const accentMap = {
  blue: {
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    bar: "bg-blue-500",
    subtitleColor: "text-blue-600",
  },
  emerald: {
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    bar: "bg-emerald-500",
    subtitleColor: "text-emerald-600",
  },
  amber: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    bar: "bg-amber-500",
    subtitleColor: "text-amber-600",
  },
  slate: {
    iconBg: "bg-slate-200",
    iconColor: "text-slate-600",
    bar: "bg-slate-500",
    subtitleColor: "text-slate-600",
  },
};

export default function DashboardCard({
  label,
  value,
  icon,
  accent,
  subtitle,
  index = 0,
}: DashboardCardProps) {
  const colors = accentMap[accent];

  return (
    <div
      className="relative bg-white rounded-xl border border-slate-200 overflow-hidden group hover:border-slate-300 animate-slide-up"
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
        transition: "border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
      }}
    >
      <div className={`absolute top-0 left-0 w-full h-[3px] ${colors.bar}`} />

      <div className="p-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {label}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {value}
              </p>
              {subtitle && (
                <span className={`text-xs font-medium ${colors.subtitleColor}`}>
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          <div
            className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center shrink-0`}
          >
            <div className={colors.iconColor}>{icon}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
