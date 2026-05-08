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
    'Boi canh phien gan day. Dung de hieu cac tham chieu nhu "cac xe do", "don do", "bien so nao":',
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
    "Boi canh: Bo dinh tuyen tool cho he thong quan ly tram be-tong Nguyen Anh II.",
    `Hom nay la ${today}.`,
    memoryBlock(memory),
    "",
    "Danh sach tool:",
    catalog,
    "- none: chitchat, cau hoi khong can du lieu he thong, hoac da du du lieu trong boi canh phien.",
    "",
    "Quy tac uu tien:",
    "- Neu hoi xe nao san sang/ranh/trong theo ca, lich xe, ca chieu/ca sang: BAT BUOC dung getTodayOrders vi nguon dung la orders/lich chuyen. KHONG dung getVehicleStatus cho nhom cau hoi nay.",
    "- getVehicleStatus chi dung cho cau hoi trang thai cuoi ngay/GPS/bat thuong cua xe, khong dung de suy luan xe san sang theo ca.",
    "- Neu hoi san luong/bao cao/tong quan theo ngay: uu tien getProductionReport.",
    "",
    `Cau hoi: "${question.replace(/"/g, '\\"')}"`,
    "",
    'Khi cau hoi tham chieu ket qua truoc (vd "xe do", "chuyen do"), hay lay id/bien so/ngay tu boi canh phien de dien args.',
    'Tra ve DUY NHAT JSON mot dong dang {"tool":"...","args":{...}}.',
    'Neu khong can tool moi: {"tool":"none","args":{}}.',
    "KHONG giai thich, KHONG markdown, KHONG code block.",
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
          "Huong dan rieng cho cau hoi xe san sang theo ca:",
          "- Uu tien field afternoon_availability neu co.",
          "- Xe ban ca chieu la xe co order tu 12:00 tro di voi status init/pending/collecting/transporting/running.",
          "- Xe ung vien san sang la xe trong orders hom nay khong co order active ca chieu.",
          "- Neu khong co du lieu tat ca xe, noi ro ket luan chi dua tren orders hom nay.",
          "- BAT BUOC render table danh sach xe ung vien va gantt lich ca chieu neu co moc gio.",
        ].join("\n")
      : "";

  return [
    `Boi canh du lieu noi bo Nguyen Anh II (lay luc ${today}, tu tool ${toolResult.tool}):`,
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    memoryBlock(memory),
    "",
    orderScheduleHint,
    "",
    "Dua HOAN TOAN vao du lieu tren (ke ca boi canh phien neu co), tra loi cau hoi bang tieng Viet ngan gon, co so lieu cu the, dung **bold** cho cac so quan trong. Neu du lieu rong hay noi ro.",
    "CHART-FIRST: Neu du lieu tool khong rong, KHONG duoc tra markdown tron. Phai chen render block phu hop theo system prompt.",
    "Neu co so lieu tong quan hay trang thai: them kpi_grid/bar_chart/donut_chart. Neu co chuoi thoi gian: them line_chart/area_chart. Neu co lich/ca/order: them gantt/table.",
    "Toi thieu 1 render block cho cau tra loi co du lieu; nen co 2 render block neu co ca tong quan va chi tiet.",
    "",
    `Cau hoi: ${question}`,
  ].join("\n");
}

export function buildMemoryContextMessage(
  question: string,
  memory: readonly MemoryEntry[],
): string {
  const today = dayjs().format("YYYY-MM-DD");
  return [
    `Boi canh phien Nguyen Anh II (lay luc ${today}, du lieu cac tool da goi gan day):`,
    "```json",
    JSON.stringify(memory, null, 2),
    "```",
    "",
    "Dua HOAN TOAN vao du lieu tren, tra loi cau hoi bang tieng Viet ngan gon, co so lieu cu the, dung **bold** cho cac so quan trong. Neu du lieu tren khong du de tra loi, hay noi ro va de xuat cau hoi khac.",
    "CHART-FIRST: Neu du lieu phien co so lieu/danh sach/lich, KHONG duoc tra markdown tron. Phai chen render block phu hop theo system prompt.",
    "Toi thieu 1 render block cho cau tra loi co du lieu; nen co 2 render block neu co ca tong quan va chi tiet.",
    "",
    `Cau hoi: ${question}`,
  ].join("\n");
}

export type { ToolDefinition, ToolResult } from "./types";
