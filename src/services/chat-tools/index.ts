import dayjs from "dayjs";
import type { ToolDefinition, ToolResult } from "./types";
import { getTodayOrdersTool, getOrdersByStatusTool } from "./orders";
import { getVehicleStatusTool, getMaintenanceForecastTool } from "./vehicles";
import { getProductionReportTool } from "./production";
import type { MemoryEntry } from "../chat-memory";

const TOOLS: ReadonlyArray<ToolDefinition> = [
  getTodayOrdersTool as unknown as ToolDefinition,
  getOrdersByStatusTool as unknown as ToolDefinition,
  getVehicleStatusTool as unknown as ToolDefinition,
  getMaintenanceForecastTool as unknown as ToolDefinition,
  getProductionReportTool as unknown as ToolDefinition,
];

const TOOL_MAP = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t]));

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", tool: name, error: message };
  }
}

function memoryBlock(memory: readonly MemoryEntry[]): string {
  if (memory.length === 0) return "";
  const compact = memory.map((m) => ({ tool: m.tool, args: m.args, data: m.data }));
  return [
    "",
    'Bối cảnh phiên (kết quả tool đã gọi gần đây — DÙNG để hiểu các tham chiếu như "các xe đó", "đơn đó", "id mấy", "biển số nào"):',
    "```json",
    JSON.stringify(compact, null, 2),
    "```",
  ].join("\n");
}

export function buildRouterPrompt(
  question: string,
  memory: readonly MemoryEntry[] = []
): string {
  const today = dayjs().format("YYYY-MM-DD");
  const catalog = TOOLS.map((t) => {
    const params = JSON.stringify(t.parameters.properties ?? {});
    return `- ${t.name} ${params}: ${t.description}`;
  }).join("\n");

  return [
    "Bối cảnh: Bộ định tuyến tool cho hệ thống quản lý trạm bê-tông Nguyên Anh II.",
    `Hôm nay là ${today}.`,
    memoryBlock(memory),
    "",
    "Danh sách tool:",
    catalog,
    "- none: chitchat, câu hỏi không cần dữ liệu hệ thống, HOẶC câu hỏi đã có thể trả lời từ Bối cảnh phiên",
    "",
    `Câu hỏi: "${question.replace(/"/g, '\\"')}"`,
    "",
    'Khi câu hỏi tham chiếu kết quả trước (vd "xe đó", "chuyến đó"), hãy lấy id/biển số/ngày từ Bối cảnh phiên để điền args.',
    'Trả về DUY NHẤT JSON một dòng dạng {"tool":"...","args":{...}}.',
    'Nếu không cần tool mới (đã đủ dữ liệu trong Bối cảnh phiên hoặc chitchat): {"tool":"none","args":{}}.',
    "KHÔNG giải thích, KHÔNG markdown, KHÔNG code block.",
  ].join("\n");
}

export interface RouterDecision {
  tool: string;
  args: Record<string, unknown>;
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
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    if (!parsed || typeof parsed.tool !== "string") return null;
    return {
      tool: parsed.tool,
      args:
        parsed.args && typeof parsed.args === "object"
          ? (parsed.args as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

export function buildContextMessage(
  question: string,
  toolResult: ToolResult,
  memory: readonly MemoryEntry[] = []
): string {
  const today = dayjs().format("YYYY-MM-DD");
  const payload = toolResult.status === "ok" ? toolResult.data : { error: toolResult.error };
  return [
    `Bối cảnh dữ liệu nội bộ Nguyên Anh II (lấy lúc ${today}, từ tool ${toolResult.tool}):`,
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    memoryBlock(memory),
    "",
    "Dựa HOÀN TOÀN vào dữ liệu trên (kể cả Bối cảnh phiên nếu có), trả lời câu hỏi sau bằng tiếng Việt ngắn gọn, có số liệu cụ thể, dùng **bold** cho các số quan trọng. Nếu dữ liệu rỗng hãy nói rõ.",
    "",
    `Câu hỏi: ${question}`,
  ].join("\n");
}

export function buildMemoryContextMessage(
  question: string,
  memory: readonly MemoryEntry[]
): string {
  const today = dayjs().format("YYYY-MM-DD");
  return [
    `Bối cảnh phiên Nguyên Anh II (lấy lúc ${today}, dữ liệu các tool đã gọi gần đây):`,
    "```json",
    JSON.stringify(memory, null, 2),
    "```",
    "",
    "Dựa HOÀN TOÀN vào dữ liệu trên, trả lời câu hỏi sau bằng tiếng Việt ngắn gọn, có số liệu cụ thể, dùng **bold** cho các số quan trọng. Nếu dữ liệu trên không đủ để trả lời, hãy nói rõ và đề xuất câu hỏi khác.",
    "",
    `Câu hỏi: ${question}`,
  ].join("\n");
}

export type { ToolDefinition, ToolResult } from "./types";
