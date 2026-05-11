export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  thinking?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatStreamEvent {
  status?: string;
  reasoning?: string;
  content?: string;
  text?: string;
  delta?: string;
  done?: boolean;
}
