import type { z } from "zod";

export interface ToolParameters {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  schema: z.ZodType<TArgs>;
  parameters: ToolParameters;
  execute: (args: TArgs) => Promise<unknown>;
  format?: (data: unknown) => string;
}

export type ToolResult =
  | {
      status: "ok";
      tool: string;
      data: unknown;
      text?: string;
    }
  | {
      status: "error";
      tool: string;
      error: string;
    };
