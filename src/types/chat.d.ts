export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
  stream?: boolean;
  chat_mode?: string;
  use_document?: boolean;
  document_id?: string | string[];
  thinking?: boolean;
}

export interface ChatStreamEvent {
  status?: string;
  reasoning?: string;
  content?: string;
  text?: string;
  delta?: string;
  done?: boolean;
  [key: string]: unknown;
}
