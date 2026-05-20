"use client";

import { ChartFrame, GanttChart } from "@/components/charts";
import type { GanttBlock } from "@/components/renderer/types";

export function GanttBlockComponent({ data }: { data: GanttBlock }) {
  return (
    <div data-testid="render-block-gantt">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <div className="overflow-x-auto pb-1">
          <GanttChart hours={data.hours} nowHour={data.nowHour} rows={data.rows} />
        </div>
      </ChartFrame>
    </div>
  );
}

