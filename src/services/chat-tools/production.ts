import { z } from "zod";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import type { ProductionReportResponse } from "@/types/report";
import type { ToolDefinition } from "./types";

const GROUP_BY = ["day", "week", "month"] as const;

const productionArgs = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
    .optional(),
  group_by: z.enum(GROUP_BY).optional(),
});

export const getProductionReportTool: ToolDefinition<z.infer<typeof productionArgs>> = {
  name: "getProductionReport",
  description:
    "Lấy báo cáo sản lượng (production) trong khoảng thời gian. Mặc định: 30 ngày gần nhất, gom theo ngày. Trả về tổng số chuyến, phân loại trạng thái, top xe/trạm/tài xế.",
  schema: productionArgs,
  parameters: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Ngày bắt đầu, YYYY-MM-DD. Mặc định 30 ngày trước.",
      },
      to: {
        type: "string",
        description: "Ngày kết thúc, YYYY-MM-DD. Mặc định hôm nay.",
      },
      group_by: {
        type: "string",
        description: "Cấp độ gom: day | week | month.",
        enum: GROUP_BY,
      },
    },
  },
  execute: async ({ from, to, group_by }) => {
    const today = dayjs();
    const params = {
      from: from ?? today.subtract(30, "day").format("YYYY-MM-DD"),
      to: to ?? today.format("YYYY-MM-DD"),
      group_by: group_by ?? "day",
    } as const;
    const res = await reportApi.getProduction(params);
    const payload = (res?.data ?? res) as ProductionReportResponse;
    return {
      from: payload?.from ?? params.from,
      to: payload?.to ?? params.to,
      group_by: payload?.group_by ?? params.group_by,
      summary: payload?.summary,
      series_count: payload?.series?.length ?? 0,
      top_vehicles: (payload?.top_vehicles ?? []).slice(0, 5),
      top_stations: (payload?.top_stations ?? []).slice(0, 5),
      top_drivers: (payload?.top_drivers ?? []).slice(0, 5),
    };
  },
};
