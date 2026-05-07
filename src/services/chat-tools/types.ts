import type { ZodType } from "zod";

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: ZodType<TArgs>;
  parameters: ToolParameterSchema;
  execute: (args: TArgs) => Promise<TResult>;
  format?: (result: TResult) => string;
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, ToolParameterField>;
  required?: string[];
}

export interface ToolParameterField {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  enum?: readonly string[];
  items?: { type: string };
  default?: unknown;
}

export type ToolStatus = "ok" | "error";

export interface ToolResult {
  status: ToolStatus;
  tool: string;
  data?: unknown;
  text?: string;
  error?: string;
}

export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
}
