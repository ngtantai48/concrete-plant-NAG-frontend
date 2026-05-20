export type ChatRole = "system" | "user" | "assistant";

export interface ChatTextBlock {
  type: "text";
  text: string;
}

export interface ChatImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export type ChatContentBlock = ChatTextBlock | ChatImageBlock;

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentBlock[];
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  thinking?: boolean;
  temperature?: number;
  max_tokens?: number;
  chat_mode?: string;
  use_document?: boolean;
  document_id?: string | string[];
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

export interface ChatStreamEvent {
  type?:
    | "status"
    | "reasoning"
    | "text"
    | "tool_start"
    | "tool_end"
    | "iteration"
    | "done"
    | "error";
  status?: string;
  reasoning?: string;
  content?: string;
  text?: string;
  delta?: string;
  done?: boolean;
  tool?: string;
  args?: Record<string, unknown>;
  result?: ToolResult | unknown;
  iteration?: number;
  error?: string;
}
