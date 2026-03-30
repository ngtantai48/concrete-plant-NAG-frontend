"use client";

import type { ReactNode } from "react";

interface DashboardCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent: "blue" | "emerald" | "amber" | "slate" | "cyan" | "violet";
  subtitle?: string;
  index?: number;
}

const accentMap = {
  blue: {
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.2)',
  },
  cyan: {
    color: '#22d3ee',
    glow: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.25)',
  },
  emerald: {
    color: '#34d399',
    glow: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.2)',
  },
  amber: {
    color: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.2)',
  },
  violet: {
    color: '#a78bfa',
    glow: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.2)',
  },
  slate: {
    color: '#94a3b8',
    glow: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.15)',
  },
};

export default function DashboardCard({ label, value, icon, accent, subtitle, index = 0 }: DashboardCardProps) {
  const colors = accentMap[accent];

  return (
    <div className="dd-stat-card animate-slide-up overflow-hidden"
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
        '--accent-color': colors.color,
      } as React.CSSProperties}
    >
      <div className="p-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest"
               style={{ color: 'var(--dd-text-muted)' }}>
              {label}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tight tabular-nums"
                 style={{ color: colors.color }}>
                {value}
              </p>
              {subtitle && (
                <span className="text-xs font-medium" style={{ color: colors.color, opacity: 0.7 }}>{subtitle}</span>
              )}
            </div>
          </div>

          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: colors.glow, border: `1px solid ${colors.border}` }}>
            <div style={{ color: colors.color }}>{icon}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
