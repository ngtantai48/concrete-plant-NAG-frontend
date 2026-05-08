"use client";

import { ActionProposalBlockComponent } from "./blocks/ActionProposalBlock";
import { AlertBlockComponent } from "./blocks/AlertBlock";
import { AreaChartBlockComponent } from "./blocks/AreaChartBlock";
import { BarChartBlockComponent } from "./blocks/BarChartBlock";
import { DonutChartBlockComponent } from "./blocks/DonutChartBlock";
import { FollowupsBlockComponent } from "./blocks/FollowupsBlock";
import { GanttBlockComponent } from "./blocks/GanttBlock";
import { KpiGridBlockComponent } from "./blocks/KpiGridBlock";
import { LineChartBlockComponent } from "./blocks/LineChartBlock";
import { MapViewBlockComponent } from "./blocks/MapViewBlock";
import { MarkdownBlockComponent } from "./blocks/MarkdownBlock";
import { SourceChipsBlockComponent } from "./blocks/SourceChipsBlock";
import { TableBlockComponent } from "./blocks/TableBlock";
import { TimelineBlockComponent } from "./blocks/TimelineBlock";
import { UnknownBlock } from "./blocks/UnknownBlock";
import { renderBlockDataSchema } from "./types";

export function RenderBlock({ data }: { data: unknown }) {
  const parsed = renderBlockDataSchema.safeParse(data);
  if (!parsed.success) return <UnknownBlock data={data} error={parsed.error} />;

  switch (parsed.data.type) {
    case "kpi_grid":
      return <KpiGridBlockComponent data={parsed.data} />;
    case "line_chart":
      return <LineChartBlockComponent data={parsed.data} />;
    case "bar_chart":
      return <BarChartBlockComponent data={parsed.data} />;
    case "donut_chart":
      return <DonutChartBlockComponent data={parsed.data} />;
    case "area_chart":
      return <AreaChartBlockComponent data={parsed.data} />;
    case "gantt":
      return <GanttBlockComponent data={parsed.data} />;
    case "timeline":
      return <TimelineBlockComponent data={parsed.data} />;
    case "table":
      return <TableBlockComponent data={parsed.data} />;
    case "map_view":
      return <MapViewBlockComponent data={parsed.data} />;
    case "alert":
      return <AlertBlockComponent data={parsed.data} />;
    case "action_proposal":
      return <ActionProposalBlockComponent data={parsed.data} />;
    case "markdown":
      return <MarkdownBlockComponent data={parsed.data} />;
    case "source_chips":
      return <SourceChipsBlockComponent data={parsed.data} />;
    case "followups":
      return <FollowupsBlockComponent data={parsed.data} />;
    default:
      return <UnknownBlock data={parsed.data} />;
  }
}

