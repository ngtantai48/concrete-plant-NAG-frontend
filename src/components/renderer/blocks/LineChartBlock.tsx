"use client";

import { ChartFrame, Legend, LineChart } from "@/components/charts";
import type { LineChartBlock } from "@/components/renderer/types";

export function LineChartBlockComponent({ data }: { data: LineChartBlock }) {
  return (
    <div data-testid="render-block-line_chart">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <LineChart annotations={data.annotations} area={data.area} height={180} series={data.series} />
        <Legend series={data.series} />
      </ChartFrame>
    </div>
  );
}

