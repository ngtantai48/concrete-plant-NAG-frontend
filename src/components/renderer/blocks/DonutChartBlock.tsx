"use client";

import { ChartFrame, DonutChart } from "@/components/charts";
import type { DonutChartBlock } from "@/components/renderer/types";

export function DonutChartBlockComponent({ data }: { data: DonutChartBlock }) {
  return (
    <div data-testid="render-block-donut_chart">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <DonutChart
          centerLabel={data.centerLabel}
          data={data.data}
          showLegend={data.showLegend ?? true}
        />
      </ChartFrame>
    </div>
  );
}

