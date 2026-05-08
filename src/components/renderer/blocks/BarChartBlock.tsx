"use client";

import { BarChart, ChartFrame } from "@/components/charts";
import type { BarChartBlock } from "@/components/renderer/types";

export function BarChartBlockComponent({ data }: { data: BarChartBlock }) {
  return (
    <div data-testid="render-block-bar_chart">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <BarChart
          data={data.data}
          height={180}
          orientation={data.orientation}
          target={data.target}
          unit={data.unit}
        />
        {data.target !== undefined && (
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Mục tiêu:{" "}
            <strong className="font-mono text-zinc-700 dark:text-zinc-300">
              {data.target.toLocaleString("vi-VN")}
              {data.unit ?? ""}
            </strong>
          </p>
        )}
      </ChartFrame>
    </div>
  );
}

