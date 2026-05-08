"use client";

import { Pin, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { colorToHex, renderPalette } from "@/components/renderer/tokens";

export type ChartPoint = { x: string | number; y: number };
export type ChartSeries = {
  name: string;
  color?: string;
  dashed?: boolean;
  data: ChartPoint[];
};

export function ChartFrame({
  title,
  subtitle,
  children,
  className,
  actionLabel = "Pin block",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actionLabel?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-zinc-950",
        className,
      )}
    >
      {(title || subtitle) && (
        <header className="flex items-start gap-3 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="truncate text-[13px] font-bold leading-5 text-zinc-950 dark:text-zinc-50">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11.5px] leading-4 text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={actionLabel}
              className="grid size-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              type="button"
            >
              <Pin size={13} />
            </button>
            <button
              aria-label="More chart actions"
              className="grid size-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              type="button"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </header>
      )}
      <div className="px-3.5 pb-3.5">{children}</div>
    </section>
  );
}

function safeMax(values: number[], fallback = 1) {
  if (values.length === 0) return fallback;
  const max = Math.max(...values);
  return Number.isFinite(max) && max > 0 ? max : fallback;
}

export function BarChart({
  data,
  height = 180,
  unit,
  target,
  orientation = "vertical",
}: {
  data: Array<{ label: string; value: number; color?: string; highlight?: boolean }>;
  height?: number;
  unit?: string;
  target?: number;
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    const max = safeMax([...data.map((item) => item.value), target ?? 0]) * 1.12;
    return (
      <div className="space-y-2 py-1" style={{ minHeight: height }}>
        {data.map((item) => {
          const width = `${Math.max((item.value / max) * 100, 2)}%`;
          const color = colorToHex(item.color ?? (item.highlight ? "blue" : "neutral"));
          return (
            <div key={item.label} className="grid grid-cols-[88px_1fr_54px] items-center gap-2">
              <div className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{item.label}</div>
              <div className="h-6 rounded-md bg-zinc-100 dark:bg-white/8">
                <div className="h-full rounded-md" style={{ width, backgroundColor: color }} />
              </div>
              <div className="text-right font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                {item.value.toLocaleString("vi-VN")}
                {unit}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const values = data.map((item) => item.value);
  const max = safeMax([...values, target ?? 0]) * 1.15;
  const width = 420;
  const pad = { left: 36, right: 10, top: 10, bottom: 24 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const barSlot = innerW / Math.max(data.length, 1);
  const ticks = [0, 1, 2, 3, 4];
  const targetY = target ? pad.top + innerH - (target / max) * innerH : null;

  return (
    <svg
      aria-label="Bar chart"
      className="block w-full overflow-visible"
      height={height}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {ticks.map((tick) => {
        const y = pad.top + (innerH / 4) * tick;
        const value = max - (max / 4) * tick;
        return (
          <g key={tick}>
            <line
              stroke="currentColor"
              strokeDasharray={tick === 4 ? undefined : "2 4"}
              strokeOpacity={0.11}
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
            />
            <text
              fill="currentColor"
              fontSize="9"
              opacity="0.52"
              textAnchor="end"
              x={pad.left - 7}
              y={y + 3}
            >
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {targetY !== null && (
        <line
          stroke={renderPalette.amber}
          strokeDasharray="4 4"
          strokeWidth="1.5"
          x1={pad.left}
          x2={width - pad.right}
          y1={targetY}
          y2={targetY}
        />
      )}
      {data.map((item, index) => {
        const barH = (item.value / max) * innerH;
        const barW = Math.min(24, barSlot * 0.58);
        const x = pad.left + barSlot * index + barSlot / 2 - barW / 2;
        const y = pad.top + innerH - barH;
        return (
          <g key={item.label}>
            <rect
              fill={colorToHex(item.color ?? "blue")}
              fillOpacity={item.highlight ? 1 : 0.86}
              height={barH}
              rx="3"
              width={barW}
              x={x}
              y={y}
            />
            <text
              fill="currentColor"
              fontSize="9.5"
              opacity="0.7"
              textAnchor="middle"
              x={pad.left + barSlot * index + barSlot / 2}
              y={height - 7}
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  series,
  height = 180,
  area = false,
  annotations,
}: {
  series: ChartSeries[];
  height?: number;
  area?: boolean;
  annotations?: Array<{ x: string | number; label: string; color?: string }>;
}) {
  const normalized = series.filter((item) => item.data.length > 0);
  if (normalized.length === 0) {
    return <div className="grid h-40 place-items-center text-sm text-zinc-500">Không có dữ liệu</div>;
  }

  const width = 420;
  const pad = { left: 36, right: 14, top: 10, bottom: 24 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const allY = normalized.flatMap((item) => item.data.map((point) => point.y));
  const max = safeMax(allY) * 1.14;
  const min = Math.min(0, ...allY);
  const span = max - min || 1;
  const xLabels = normalized[0]?.data.map((point) => point.x) ?? [];
  const xCount = Math.max(xLabels.length - 1, 1);
  const px = (index: number) => pad.left + (index / xCount) * innerW;
  const py = (value: number) => pad.top + innerH - ((value - min) / span) * innerH;

  return (
    <svg
      aria-label="Line chart"
      className="block w-full overflow-visible"
      height={height}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = pad.top + (innerH / 4) * tick;
        const value = max - (span / 4) * tick;
        return (
          <g key={tick}>
            <line
              stroke="currentColor"
              strokeDasharray={tick === 4 ? undefined : "2 4"}
              strokeOpacity={0.11}
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
            />
            <text
              fill="currentColor"
              fontSize="9"
              opacity="0.52"
              textAnchor="end"
              x={pad.left - 7}
              y={y + 3}
            >
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {xLabels.map((label, index) => (
        <text
          fill="currentColor"
          fontSize="9.5"
          key={`${label}-${index}`}
          opacity="0.7"
          textAnchor="middle"
          x={px(index)}
          y={height - 7}
        >
          {label}
        </text>
      ))}
      {normalized.map((item) => {
        const color = colorToHex(item.color ?? "blue");
        const points = item.data.map((point, index) => `${px(index)},${py(point.y)}`).join(" ");
        const areaPoints = `${pad.left},${pad.top + innerH} ${points} ${px(item.data.length - 1)},${pad.top + innerH}`;
        return (
          <g key={item.name}>
            {area && <polygon fill={color} fillOpacity="0.12" points={areaPoints} />}
            <polyline
              fill="none"
              points={points}
              stroke={color}
              strokeDasharray={item.dashed ? "5 5" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            {item.data.map((point, index) => (
              <circle
                cx={px(index)}
                cy={py(point.y)}
                fill="white"
                key={`${item.name}-${point.x}-${index}`}
                r="2.8"
                stroke={color}
                strokeWidth="1.7"
              />
            ))}
          </g>
        );
      })}
      {annotations?.map((annotation) => {
        const xIndex = xLabels.findIndex((label) => String(label) === String(annotation.x));
        if (xIndex < 0) return null;
        const x = px(xIndex);
        return (
          <g key={`${annotation.x}-${annotation.label}`}>
            <line
              stroke={colorToHex(annotation.color ?? "amber")}
              strokeDasharray="3 3"
              strokeWidth="1"
              x1={x}
              x2={x}
              y1={pad.top}
              y2={pad.top + innerH}
            />
            <text
              fill={colorToHex(annotation.color ?? "amber")}
              fontSize="9.5"
              fontWeight="600"
              textAnchor="middle"
              x={x}
              y={pad.top + 8}
            >
              {annotation.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-zinc-600 dark:text-zinc-400">
      {series.map((item) => (
        <span className="inline-flex items-center gap-1.5" key={item.name}>
          <span
            className="h-[3px] w-3 rounded-full"
            style={{ backgroundColor: colorToHex(item.color ?? "blue") }}
          />
          {item.name}
        </span>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  size = 132,
  thickness = 20,
  centerLabel,
  showLegend = true,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  showLegend?: boolean;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <svg
        aria-label="Donut chart"
        className="shrink-0"
        height={size}
        role="img"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth={thickness}
        />
        {data.map((item, index) => {
          const length = total > 0 ? (item.value / total) * circumference : 0;
          const offset = data
            .slice(0, index)
            .reduce((sum, previous) => sum + (total > 0 ? (previous.value / total) * circumference : 0), 0);
          const dasharray = `${length} ${circumference - length}`;
          const dashoffset = -offset;
          return (
            <circle
              cx={center}
              cy={center}
              fill="none"
              key={item.label}
              r={radius}
              stroke={colorToHex(item.color ?? "blue")}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
              strokeWidth={thickness}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
        })}
        <text
          fill="currentColor"
          fontSize="14"
          fontWeight="800"
          textAnchor="middle"
          x={center}
          y={center - 2}
        >
          {centerLabel ?? total}
        </text>
        <text
          fill="currentColor"
          fontSize="9.5"
          opacity="0.52"
          textAnchor="middle"
          x={center}
          y={center + 14}
        >
          TỔNG
        </text>
      </svg>
      {showLegend && (
        <div className="min-w-0 flex-1 space-y-1.5">
          {data.map((item) => (
            <div className="grid grid-cols-[12px_1fr_auto_38px] items-center gap-2 text-[12px]" key={item.label}>
              <span
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: colorToHex(item.color ?? "blue") }}
              />
              <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{item.label}</span>
              <span className="font-mono font-semibold text-zinc-600 dark:text-zinc-300">{item.value}</span>
              <span className="text-right font-mono text-[10.5px] text-zinc-400">
                {total > 0 ? `${((item.value / total) * 100).toFixed(0)}%` : "0%"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  data,
  color,
  width = 62,
  height = 22,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data
    .map((value, index) => `${(index / (data.length - 1)) * width},${height - ((value - min) / span) * height}`)
    .join(" ");
  return (
    <svg aria-hidden="true" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function GanttChart({
  rows,
  hours,
  nowHour,
}: {
  rows: Array<{
    label: string;
    sub?: string;
    blocks: Array<{ start: number; end: number; label: string; tone?: string; tripId?: string }>;
  }>;
  hours: number[];
  nowHour?: number;
}) {
  const startHour = hours[0] ?? 6;
  const endHour = hours[hours.length - 1] ?? 18;
  const total = Math.max(endHour - startHour, 1);
  const pct = (hour: number) => ((hour - startHour) / total) * 100;

  return (
    <div className="min-w-[620px] text-[11.5px]">
      <div className="relative mb-1 ml-[132px] h-4">
        {hours.map((hour) => (
          <span
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-zinc-400"
            key={hour}
            style={{ left: `${pct(hour)}%` }}
          >
            {hour}h
          </span>
        ))}
      </div>
      <div>
        {rows.map((row, index) => (
          <div
            className={cn(
              "flex items-center py-1",
              index > 0 && "border-t border-black/[0.07] dark:border-white/[0.08]",
            )}
            key={row.label}
          >
            <div className="w-[132px] shrink-0 pr-3">
              <div className="truncate font-mono text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                {row.label}
              </div>
              {row.sub && <div className="truncate text-[10.5px] text-zinc-400">{row.sub}</div>}
            </div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-zinc-100 dark:bg-white/[0.07]">
              {hours.slice(1, -1).map((hour) => (
                <span
                  className="absolute bottom-0 top-0 w-px bg-black/[0.06] dark:bg-white/[0.08]"
                  key={hour}
                  style={{ left: `${pct(hour)}%` }}
                />
              ))}
              {nowHour !== undefined && (
                <span
                  className="absolute -bottom-0.5 -top-0.5 z-20 w-[1.5px] bg-[#FF453A]"
                  style={{ left: `${pct(nowHour)}%` }}
                >
                  <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-[#FF453A]" />
                </span>
              )}
              {row.blocks.map((block) => {
                const left = Math.max(pct(block.start), 0);
                const width = Math.max(pct(block.end) - pct(block.start), 2);
                return (
                  <button
                    aria-label={block.tripId ? `Mở chuyến ${block.tripId}` : block.label}
                    className="absolute bottom-[3px] top-[3px] flex items-center overflow-hidden rounded-md px-2 text-left text-[10.5px] font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45"
                    key={`${block.start}-${block.end}-${block.label}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: `linear-gradient(180deg, ${colorToHex(block.tone ?? "blue")}, ${colorToHex(block.tone ?? "blue")}dd)`,
                    }}
                    type="button"
                  >
                    <span className="truncate">{block.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
