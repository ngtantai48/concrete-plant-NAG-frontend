"use client";

import { ChartFrame, DonutChart } from "@/components/charts";
import type { DonutChartBlock } from "@/components/renderer/types";

export function DonutChartBlockComponent({ data }: { data: DonutChartBlock }) {
  const title = data.title?.trim() || "Cơ cấu dữ liệu";

  return (
    <div data-testid="render-block-donut_chart">
      <ChartFrame subtitle={data.subtitle} title={title}>
        <DonutChart
          centerLabel={data.centerLabel}
          data={data.data}
          showLegend={data.showLegend ?? true}
        />
      </ChartFrame>
    </div>
  );
}
