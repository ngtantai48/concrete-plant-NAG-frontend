import dayjs from "dayjs";

import type { ToolDefinition, ToolResult } from "./types";
import { getTodayOrdersTool, getOrdersByStatusTool } from "./orders";
import { getVehicleStatusTool, getMaintenanceForecastTool } from "./vehicles";
import { getProductionReportTool } from "./production";
import { ORDER_STATUS_BUSINESS_RULES } from "./order-status";
import type { MemoryEntry } from "../chat-memory";

const TOOLS: ReadonlyArray<ToolDefinition> = [
  getTodayOrdersTool as unknown as ToolDefinition,
  getOrdersByStatusTool as unknown as ToolDefinition,
  getVehicleStatusTool as unknown as ToolDefinition,
  getMaintenanceForecastTool as unknown as ToolDefinition,
  getProductionReportTool as unknown as ToolDefinition,
];

const TOOL_MAP = new Map<string, ToolDefinition>(TOOLS.map((tool) => [tool.name, tool]));

export function listTools(): ReadonlyArray<ToolDefinition> {
  return TOOLS;
}

export function hasTool(name: string): boolean {
  return TOOL_MAP.has(name);
}

export async function dispatchTool(name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    return { status: "error", tool: name, error: `Unknown tool: ${name}` };
  }

  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      status: "error",
      tool: name,
      error: `Invalid arguments: ${parsed.error.message}`,
    };
  }

  try {
    const data = await tool.execute(parsed.data);
    return {
      status: "ok",
      tool: name,
      data,
      text: tool.format ? tool.format(data) : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", tool: name, error: message };
  }
}

function memoryBlock(memory: readonly MemoryEntry[]): string {
  if (memory.length === 0) return "";
  const compact = memory.map((item) => ({
    tool: item.tool,
    args: item.args,
    data: item.data,
  }));
  return [
    "",
    'Bối cảnh phiên gần đây. Dùng để hiểu các tham chiếu như "các xe đó", "đơn đó", "biển số nào":',
    "```json",
    JSON.stringify(compact, null, 2),
    "```",
  ].join("\n");
}

export function buildRouterPrompt(
  question: string,
  memory: readonly MemoryEntry[] = [],
): string {
  const today = dayjs().format("YYYY-MM-DD");
  const catalog = TOOLS.map((tool) => {
    const params = JSON.stringify(tool.parameters.properties ?? {});
    return `- ${tool.name} ${params}: ${tool.description}`;
  }).join("\n");

  return [
    "Bối cảnh: Bộ định tuyến tool cho hệ thống quản lý trạm bê tông Nguyên Anh II.",
    `Hôm nay là ${today}.`,
    memoryBlock(memory),
    "",
    "Danh sách tool:",
    catalog,
    "- none: chitchat, câu hỏi không cần dữ liệu hệ thống, hoặc đã đủ dữ liệu trong bối cảnh phiên.",
    "",
    "Quy tắc ưu tiên:",
    "- Nếu hỏi xe nào sẵn sàng/rảnh/trống theo ca, lịch xe, ca chiều/ca sáng: BẮT BUỘC dùng getTodayOrders vì nguồn đúng là orders/lịch chuyến. KHÔNG dùng getVehicleStatus cho nhóm câu hỏi này.",
    "- getVehicleStatus chỉ dùng cho câu hỏi trạng thái cuối ngày/GPS/bất thường của xe, không dùng để suy luận xe sẵn sàng theo ca.",
    "- Nếu hỏi sản lượng/báo cáo/tổng quan theo ngày: ưu tiên getProductionReport.",
    "- Scope trạm cố định là NGUYÊN ANH/NGUYÊN ANH II. Không chọn tool hay lập luận chỉ để phân tích phân bổ theo trạm.",
    `- ${ORDER_STATUS_BUSINESS_RULES}`,
    "",
    `Câu hỏi: "${question.replace(/"/g, '\\"')}"`,
    "",
    'Khi câu hỏi tham chiếu kết quả trước (ví dụ "xe đó", "chuyến đó"), hãy lấy id/biển số/ngày từ bối cảnh phiên để điền args.',
    'Trả về DUY NHẤT JSON một dòng dạng {"tool":"...","args":{...}}.',
    'Nếu không cần tool mới: {"tool":"none","args":{}}.',
    "KHÔNG giải thích, KHÔNG markdown, KHÔNG code block.",
  ].join("\n");
}

export interface RouterDecision {
  tool: string;
  args: Record<string, unknown>;
}

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function routeByDeterministicRule(question: string): RouterDecision | null {
  const normalized = normalizeQuestion(question);
  const today = dayjs().format("YYYY-MM-DD");
  const mentionsVehicle = /\bxe\b|vehicle|truck/.test(normalized);
  const mentionsProduction =
    normalized.includes("san luong") ||
    normalized.includes("tong quan") ||
    normalized.includes("bao cao") ||
    normalized.includes("don hang");
  const mentionsToday =
    normalized.includes("hom nay") ||
    normalized.includes("ngay nay") ||
    normalized.includes(today);
  const mentionsSchedule =
    normalized.includes("ca chieu") ||
    normalized.includes("ca sang") ||
    normalized.includes("chieu nay") ||
    normalized.includes("lich") ||
    normalized.includes("sap xe");
  const asksAvailability =
    normalized.includes("san sang") ||
    normalized.includes("ranh") ||
    normalized.includes("trong") ||
    normalized.includes("con xe") ||
    normalized.includes("xe nao");

  if (mentionsVehicle && mentionsSchedule && asksAvailability) {
    return { tool: "getTodayOrders", args: { date: today } };
  }

  if (mentionsToday && mentionsProduction && mentionsVehicle) {
    return { tool: "getProductionReport", args: { from: today, to: today, group_by: "day" } };
  }

  return null;
}

export function parseRouterDecision(raw: string): RouterDecision | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || !("tool" in parsed)) return null;
    const decision = parsed as { tool?: unknown; args?: unknown };
    if (typeof decision.tool !== "string") return null;
    return {
      tool: decision.tool,
      args:
        decision.args && typeof decision.args === "object"
          ? (decision.args as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

export function buildContextMessage(
  question: string,
  toolResult: ToolResult,
  memory: readonly MemoryEntry[] = [],
): string {
  const today = dayjs().format("YYYY-MM-DD");
  const payload = toolResult.status === "ok" ? toolResult.data : { error: toolResult.error };
  const orderScheduleHint =
    toolResult.tool === "getTodayOrders"
      ? [
          "Hướng dẫn riêng cho câu hỏi xe sẵn sàng theo ca:",
          "- Ưu tiên field afternoon_availability nếu có.",
          "- Xe bận ca chiều là xe có order từ 12:00 trở đi với status init/pending/collecting/transporting/running.",
          `- ${ORDER_STATUS_BUSINESS_RULES}`,
          "- Xe ứng viên sẵn sàng là xe trong orders hôm nay không có order chưa hoàn thành trong ca chiều.",
          "- Nếu không có dữ liệu tất cả xe, nói rõ kết luận chỉ dựa trên orders hôm nay.",
          "- BẮT BUỘC render table danh sách xe ứng viên và gantt lịch ca chiều nếu có mốc giờ.",
        ].join("\n")
      : "";

  return [
    `Bối cảnh dữ liệu nội bộ Nguyên Anh II (lấy lúc ${today}, từ tool ${toolResult.tool}):`,
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    memoryBlock(memory),
    "",
    orderScheduleHint,
    "",
    "Dựa HOÀN TOÀN vào dữ liệu trên (kể cả bối cảnh phiên nếu có), trả lời câu hỏi bằng tiếng Việt có dấu, ngắn gọn, có số liệu cụ thể, dùng **bold** cho các số quan trọng. Nếu dữ liệu rỗng hãy nói rõ.",
    "CHART-FIRST: Nếu dữ liệu tool không rỗng, KHÔNG được trả markdown trơn. Phải chèn render block phù hợp theo system prompt.",
    "Nếu dữ liệu có các field time_coverage, hourly_activity hoặc orders kèm init_at/start_at/end_at, đó là dữ liệu thời gian của chuyến. Dùng trực tiếp các field này để trả lời câu hỏi theo giờ hoặc vẽ line_chart/gantt/table; chỉ nói thiếu dữ liệu thời gian khi các field đó rỗng hoặc null.",
    "Nếu có số liệu tổng quan hay trạng thái: thêm kpi_grid/bar_chart/donut_chart. Nếu có chuỗi thời gian: thêm line_chart/area_chart. Nếu có lịch/ca/order: thêm gantt/table.",
    "Không tạo chart/table/followup phân tích theo trạm; trạm NGUYÊN ANH là scope cố định, không phải chiều so sánh.",
    ORDER_STATUS_BUSINESS_RULES,
    "Tối thiểu 1 render block cho câu trả lời có dữ liệu; nên có 2 render block nếu có cả tổng quan và chi tiết.",
    "",
    `Câu hỏi: ${question}`,
  ].join("\n");
}

export function buildMemoryContextMessage(
  question: string,
  memory: readonly MemoryEntry[],
): string {
  const today = dayjs().format("YYYY-MM-DD");
  return [
    `Bối cảnh phiên Nguyên Anh II (lấy lúc ${today}, dữ liệu các tool đã gọi gần đây):`,
    "```json",
    JSON.stringify(memory, null, 2),
    "```",
    "",
    "Dựa HOÀN TOÀN vào dữ liệu trên, trả lời câu hỏi bằng tiếng Việt có dấu, ngắn gọn, có số liệu cụ thể, dùng **bold** cho các số quan trọng. Nếu dữ liệu trên không đủ để trả lời, hãy nói rõ và đề xuất câu hỏi khác.",
    "CHART-FIRST: Nếu dữ liệu phiên có số liệu/danh sách/lịch, KHÔNG được trả markdown trơn. Phải chèn render block phù hợp theo system prompt.",
    "Nếu dữ liệu phiên có time_coverage, hourly_activity hoặc orders kèm init_at/start_at/end_at, coi đó là dữ liệu thời gian của chuyến và dùng trực tiếp; không kết luận thiếu lịch trình khi các field này có dữ liệu.",
    "Không tạo chart/table/followup phân tích theo trạm; trạm NGUYÊN ANH là scope cố định, không phải chiều so sánh.",
    "Tối thiểu 1 render block cho câu trả lời có dữ liệu; nên có 2 render block nếu có cả tổng quan và chi tiết.",
    "",
    `Câu hỏi: ${question}`,
  ].join("\n");
}

export type { ToolDefinition, ToolResult } from "./types";
