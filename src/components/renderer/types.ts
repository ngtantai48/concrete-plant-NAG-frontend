import { z } from "zod";

export const toolNames = [
  "production_query",
  "vehicle_search",
  "driver_schedule",
  "weather_lookup",
  "maintenance_log",
  "site_lookup",
  "dispatch_action",
] as const;

export type ToolName = (typeof toolNames)[number];

export const renderTones = [
  "blue",
  "green",
  "amber",
  "red",
  "purple",
  "neutral",
  "good",
  "warn",
  "bad",
  "info",
] as const;

export type RenderTone = (typeof renderTones)[number];

const baseBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  source: z.array(z.enum(toolNames)).optional(),
  pinned: z.boolean().optional(),
});

const unknownRecordSchema = z.record(z.string(), z.unknown());
const toneSchema = z.enum(renderTones);

export const kpiGridBlockSchema = baseBlockSchema.extend({
  type: z.literal("kpi_grid"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      unit: z.string().optional(),
      tone: toneSchema.optional(),
      delta: z.number().optional(),
      deltaLabel: z.string().optional(),
      icon: z.string().optional(),
      sparkline: z.array(z.number()).optional(),
    })
  ),
});

const chartPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
});

const seriesSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  dashed: z.boolean().optional(),
  data: z.array(chartPointSchema),
});

export const lineChartBlockSchema = baseBlockSchema.extend({
  type: z.literal("line_chart"),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  series: z.array(seriesSchema),
  area: z.boolean().optional(),
  annotations: z
    .array(
      z.object({
        x: z.union([z.string(), z.number()]),
        label: z.string(),
        color: z.string().optional(),
      })
    )
    .optional(),
});

export const barChartBlockSchema = baseBlockSchema.extend({
  type: z.literal("bar_chart"),
  orientation: z.enum(["vertical", "horizontal"]).optional(),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
      highlight: z.boolean().optional(),
    })
  ),
  unit: z.string().optional(),
  target: z.number().optional(),
});

export const donutChartBlockSchema = baseBlockSchema.extend({
  type: z.literal("donut_chart"),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
    })
  ),
  centerLabel: z.string().optional(),
  showLegend: z.boolean().optional(),
});

export const areaChartBlockSchema = baseBlockSchema.extend({
  type: z.literal("area_chart"),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  series: z.array(seriesSchema),
  stacked: z.boolean().optional(),
  annotations: z
    .array(
      z.object({
        x: z.union([z.string(), z.number()]),
        label: z.string(),
        color: z.string().optional(),
      })
    )
    .optional(),
});

export const ganttBlockSchema = baseBlockSchema.extend({
  type: z.literal("gantt"),
  hours: z.array(z.number()),
  nowHour: z.number().optional(),
  rows: z.array(
    z.object({
      label: z.string(),
      sub: z.string().optional(),
      blocks: z.array(
        z.object({
          start: z.number(),
          end: z.number(),
          label: z.string(),
          tone: z.enum(["blue", "green", "amber", "red", "purple"]).optional(),
          tripId: z.string().optional(),
        })
      ),
    })
  ),
});

export const timelineBlockSchema = baseBlockSchema.extend({
  type: z.literal("timeline"),
  events: z.array(
    z.object({
      time: z.string(),
      title: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      tone: z.string().optional(),
    })
  ),
});

export const tableBlockSchema = baseBlockSchema.extend({
  type: z.literal("table"),
  columns: z.array(
    z.object({
      key: z.string(),
      header: z.string(),
      align: z.enum(["left", "right", "center"]).optional(),
      width: z.string().optional(),
      format: z.enum(["number", "currency", "percent", "date", "datetime", "badge"]).optional(),
    })
  ),
  rows: z.array(unknownRecordSchema),
  highlightRowWhere: z
    .object({
      key: z.string(),
      op: z.enum([">", "<", "=", "!="]),
      value: z.unknown(),
    })
    .optional(),
  pageSize: z.number().int().positive().optional(),
});

export const mapViewBlockSchema = baseBlockSchema.extend({
  type: z.literal("map_view"),
  center: z.object({ lat: z.number(), lng: z.number() }),
  zoom: z.number().optional(),
  markers: z.array(
    z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
      kind: z.enum(["vehicle", "station", "site", "alert"]),
      label: z.string().optional(),
      tone: z.string().optional(),
    })
  ),
  routes: z
    .array(
      z.object({
        id: z.string(),
        points: z.array(z.tuple([z.number(), z.number()])),
        color: z.string().optional(),
      })
    )
    .optional(),
});

const localAssetSchema = {
  url: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  dataUrl: z.string().min(1).optional(),
  base64: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
};

export const imageBlockSchema = baseBlockSchema.extend({
  type: z.literal("image"),
  ...localAssetSchema,
  alt: z.string().optional(),
  caption: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const fileBlockSchema = baseBlockSchema.extend({
  type: z.literal("file"),
  ...localAssetSchema,
  description: z.string().optional(),
});

export const alertBlockSchema = baseBlockSchema.extend({
  type: z.literal("alert"),
  level: z.enum(["info", "warn", "bad"]),
  title: z.string(),
  items: z.array(z.string()).optional(),
  body: z.string().optional(),
  action: z
    .object({
      label: z.string(),
      intent: z.string(),
      payload: z.unknown().optional(),
    })
    .optional(),
});

export const actionProposalBlockSchema = baseBlockSchema.extend({
  type: z.literal("action_proposal"),
  intent: z.enum(["reassign_vehicle", "swap_driver", "delay_trip", "send_alert"]),
  summary: z.string(),
  details: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  payload: z.unknown(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
});

export const markdownBlockSchema = baseBlockSchema.extend({
  type: z.literal("markdown"),
  body: z.string(),
});

export const sourceChipsBlockSchema = baseBlockSchema.extend({
  type: z.literal("source_chips"),
  items: z.array(
    z.object({
      id: z.number(),
      tool: z.string(),
      label: z.string().optional(),
      count: z.number().optional(),
    })
  ),
});

export const followupsBlockSchema = baseBlockSchema.extend({
  type: z.literal("followups"),
  items: z.array(z.string()),
});

export const renderBlockDataSchema = z.discriminatedUnion("type", [
  kpiGridBlockSchema,
  lineChartBlockSchema,
  barChartBlockSchema,
  donutChartBlockSchema,
  areaChartBlockSchema,
  ganttBlockSchema,
  timelineBlockSchema,
  tableBlockSchema,
  mapViewBlockSchema,
  imageBlockSchema,
  fileBlockSchema,
  alertBlockSchema,
  actionProposalBlockSchema,
  markdownBlockSchema,
  sourceChipsBlockSchema,
  followupsBlockSchema,
]);

export type KpiGridBlock = z.infer<typeof kpiGridBlockSchema>;
export type LineChartBlock = z.infer<typeof lineChartBlockSchema>;
export type BarChartBlock = z.infer<typeof barChartBlockSchema>;
export type DonutChartBlock = z.infer<typeof donutChartBlockSchema>;
export type AreaChartBlock = z.infer<typeof areaChartBlockSchema>;
export type GanttBlock = z.infer<typeof ganttBlockSchema>;
export type TimelineBlock = z.infer<typeof timelineBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type MapViewBlock = z.infer<typeof mapViewBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type FileBlock = z.infer<typeof fileBlockSchema>;
export type AlertBlock = z.infer<typeof alertBlockSchema>;
export type ActionProposalBlock = z.infer<typeof actionProposalBlockSchema>;
export type MarkdownBlock = z.infer<typeof markdownBlockSchema>;
export type SourceChipsBlock = z.infer<typeof sourceChipsBlockSchema>;
export type FollowupsBlock = z.infer<typeof followupsBlockSchema>;

export type RenderBlockData =
  | KpiGridBlock
  | LineChartBlock
  | BarChartBlock
  | DonutChartBlock
  | AreaChartBlock
  | GanttBlock
  | TimelineBlock
  | TableBlock
  | MapViewBlock
  | ImageBlock
  | FileBlock
  | AlertBlock
  | ActionProposalBlock
  | MarkdownBlock
  | SourceChipsBlock
  | FollowupsBlock;

export type StreamChunk =
  | { kind: "md"; body: string }
  | { kind: "block"; data: unknown }
  | { kind: "block-loading" };

export type ReasoningStepStatus = "running" | "done" | "error";

export type ReasoningStep = {
  event?: "reasoning_step";
  id: string;
  parent?: string;
  tool: ToolName;
  status: ReasoningStepStatus;
  startedAt: string;
  durationMs?: number;
  input?: unknown;
  resultSummary?: string;
  error?: string;
};

export type ClientChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSseEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; step: ReasoningStep }
  | { type: "reasoning_complete"; totalMs: number; stepCount: number }
  | { type: "done" }
  | { type: "error"; error: string };
