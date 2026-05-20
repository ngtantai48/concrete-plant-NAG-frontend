"use client";

import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts";
import { RenderIcon } from "@/components/renderer/icons";
import { colorToHex, toneMeta } from "@/components/renderer/tokens";
import type { KpiGridBlock } from "@/components/renderer/types";

const columnClasses: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function KpiGridBlockComponent({ data }: { data: KpiGridBlock }) {
  const columns = data.columns ?? 4;
  return (
    <section
      className={cn("grid grid-cols-2 gap-2.5", columnClasses[columns])}
      data-testid="render-block-kpi_grid"
    >
      {data.items.map((item) => {
        const meta = toneMeta(item.tone);
        return (
          <article
            className={cn(
              "relative min-h-[116px] overflow-hidden rounded-lg border p-3",
              meta.soft,
              meta.border,
            )}
            key={item.label}
          >
            <div className="flex items-center gap-1.5">
              {item.icon && <RenderIcon className={meta.text} name={item.icon} size={13} />}
              <div className="min-w-0 truncate text-[10.5px] font-bold uppercase tracking-[0.04em] text-zinc-500 dark:text-zinc-400">
                {item.label}
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
              <div className={cn("text-[clamp(1.35rem,5vw,1.55rem)] font-extrabold leading-none", meta.text)}>
                {item.value}
              </div>
              {item.unit && <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{item.unit}</div>}
            </div>
            {(item.delta !== undefined || item.deltaLabel) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                {item.delta !== undefined && (
                  <span
                    className={cn(
                      "font-mono font-bold",
                      item.delta >= 0
                        ? "text-[#1F8E47] dark:text-[#63DB82]"
                        : "text-[#C8281D] dark:text-[#FF7C73]",
                    )}
                  >
                    {item.delta >= 0 ? "▲" : "▼"} {Math.abs(item.delta)}%
                  </span>
                )}
                {item.deltaLabel && <span>{item.deltaLabel}</span>}
              </div>
            )}
            {item.sparkline && (
              <div className="pointer-events-none absolute bottom-2 right-2 opacity-40">
                <Sparkline color={colorToHex(item.tone)} data={item.sparkline} />
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
