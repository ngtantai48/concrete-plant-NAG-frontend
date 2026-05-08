"use client";

import { ChartFrame, Legend, LineChart } from "@/components/charts";
import type { AreaChartBlock } from "@/components/renderer/types";

export function AreaChartBlockComponent({ data }: { data: AreaChartBlock }) {
  return (
    <div data-testid="render-block-area_chart">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <LineChart annotations={data.annotations} area height={180} series={data.series} />
        <Legend series={data.series} />
        {data.stacked && (
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Stacked area view</p>
        )}
      </ChartFrame>
    </div>
  );
}

