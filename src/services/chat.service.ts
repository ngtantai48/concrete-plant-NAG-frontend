import { getStore, getValidAccessToken } from "@/lib/http";
import type { ChatCompletionRequest, ChatMessage, ChatStreamEvent, ToolResult } from "@/types/chat";

const STREAM_ENDPOINT = "/api/chat/stream";
const COMPLETE_ENDPOINT = "/api/chat/complete";
const AGENT_STREAM_ENDPOINT = "/api/chat/agent/stream";
const MEMORY_ENDPOINT = "/api/chat/nag/memory";
const AI_GENERATION_MAX_TOKENS = 32_768;

export interface ChatStreamHandlers {
  onStatus?: (status: string) => void;
  onReasoning?: (chunk: string) => void;
  onContent?: (chunk: string) => void;
  onEvent?: (event: ChatStreamEvent) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

export interface ChatStreamOptions {
  sessionId?: string;
}

export interface ChatCompleteOptions {
  sessionId?: string;
  signal?: AbortSignal;
}

export interface RunWithToolsHandlers {
  onStatus?: (status: string) => void;
  onContent?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (result: ToolResult) => void;
  onIteration?: (n: number) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

export interface RunWithToolsOptions {
  maxIterations?: number;
  injectSystemPrompt?: boolean;
  model?: string;
  sessionId?: string;
}

const defaultRequest: Partial<ChatCompletionRequest> = {
  stream: true,
  thinking: true,
  temperature: 0.7,
  max_tokens: AI_GENERATION_MAX_TOKENS,
};

const routerRequest: Partial<ChatCompletionRequest> = {
  stream: false,
  thinking: false,
  temperature: 0,
  max_tokens: 256,
};

function encodeHeaderJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nagUserHeaders(): HeadersInit {
  const user = getStore()?.getState().auth.user;
  if (!user) return {};

  return {
    "X-NAG-User-Id": String(user.id),
    "X-NAG-Role": user.role,
    "X-NAG-Role-Id": String(user.role_id),
    "X-NAG-Permissions": encodeHeaderJson(user.permissions),
    "X-NAG-User-Context": encodeHeaderJson({
      user_id: user.id,
      role: user.role,
      role_id: user.role_id,
      user_full_name: user.fullName,
      permissions: user.permissions,
    }),
  };
}

function chatSessionHeaders(sessionId?: string): HeadersInit {
  const trimmed = sessionId?.trim();
  return trimmed ? { "X-Chat-Session-Id": trimmed } : {};
}

interface CompletionsResponse {
  choices?: Array<{ message?: { content?: string }; text?: string }>;
}

const chatApi = {
  sendStream: async (
    request: ChatCompletionRequest,
    handlers: ChatStreamHandlers = {},
    options: ChatStreamOptions = {}
  ): Promise<void> => {
    const { onStatus, onReasoning, onContent, onEvent, onDone, onError, signal } = handlers;
    const payload: ChatCompletionRequest = { ...defaultRequest, ...request };

    try {
      const token = await getValidAccessToken();
      const response = await fetch(STREAM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...nagUserHeaders(),
          ...chatSessionHeaders(options.sessionId),
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Chat stream failed (${response.status}): ${errorBody}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;

          const dataString = dataLines.join("\n");
          if (dataString === "[DONE]") {
            onDone?.();
            return;
          }

          let parsed: ChatStreamEvent;
          try {
            parsed = JSON.parse(dataString) as ChatStreamEvent;
          } catch {
            onContent?.(dataString);
            continue;
          }

          onEvent?.(parsed);
          if (typeof parsed.status === "string" && parsed.status.trim()) {
            onStatus?.(parsed.status);
          }
          if (typeof parsed.reasoning === "string") onReasoning?.(parsed.reasoning);
          const contentChunk = parsed.content ?? parsed.text ?? parsed.delta;
          if (typeof contentChunk === "string") onContent?.(contentChunk);
          if (parsed.done === true) {
            onDone?.();
            return;
          }
        }
      }

      onDone?.();
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  },

  sendComplete: async (
    request: ChatCompletionRequest,
    options: ChatCompleteOptions | AbortSignal = {}
  ): Promise<string> => {
    const normalized: ChatCompleteOptions =
      options instanceof AbortSignal ? { signal: options } : options;
    const payload: ChatCompletionRequest = { ...routerRequest, ...request, stream: false };
    const token = await getValidAccessToken();
    const response = await fetch(COMPLETE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...nagUserHeaders(),
        ...chatSessionHeaders(normalized.sessionId),
      },
      body: JSON.stringify(payload),
      signal: normalized.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Chat complete failed (${response.status}): ${errorBody}`);
    }

    const json = (await response.json()) as CompletionsResponse;
    const text = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
    return typeof text === "string" ? text : "";
  },

  runWithTools: async (
    initialMessages: ChatMessage[],
    handlers: RunWithToolsHandlers = {},
    options: RunWithToolsOptions = {}
  ): Promise<void> => {
    try {
      const token = await getValidAccessToken();
      const response = await fetch(AGENT_STREAM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...nagUserHeaders(),
          ...chatSessionHeaders(options.sessionId),
        },
        body: JSON.stringify({
          messages: initialMessages,
          injectSystemPrompt: options.injectSystemPrompt,
          model: options.model,
          maxIterations: options.maxIterations,
        }),
        signal: handlers.signal,
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Agent stream failed (${response.status}): ${errorBody}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const dataLines: string[] = [];

          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;

          const dataString = dataLines.join("\n");
          if (dataString === "[DONE]") {
            handlers.onDone?.();
            return;
          }

          let parsed: ChatStreamEvent;
          try {
            parsed = JSON.parse(dataString) as ChatStreamEvent;
          } catch {
            handlers.onContent?.(dataString);
            continue;
          }

          if (parsed.type === "iteration" && typeof parsed.iteration === "number") {
            handlers.onIteration?.(parsed.iteration);
          }
          if (parsed.type === "tool_start" && typeof parsed.tool === "string") {
            handlers.onToolStart?.(parsed.tool, parsed.args ?? {});
          }
          if (parsed.type === "tool_end" && parsed.result) {
            handlers.onToolEnd?.(parsed.result as ToolResult);
          }
          if (typeof parsed.status === "string" && parsed.status.trim()) {
            handlers.onStatus?.(parsed.status);
          }
          if (typeof parsed.reasoning === "string") {
            handlers.onStatus?.(parsed.reasoning);
          }
          const contentChunk = parsed.content ?? parsed.text ?? parsed.delta;
          if (typeof contentChunk === "string") handlers.onContent?.(contentChunk);
          if (typeof parsed.error === "string") {
            handlers.onError?.(new Error(parsed.error));
            return;
          }
          if (parsed.done === true) {
            handlers.onDone?.();
            return;
          }
        }
      }

      handlers.onDone?.();
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  },

  clearMemory: async (signal?: AbortSignal, sessionId?: string): Promise<void> => {
    const token = await getValidAccessToken();
    const response = await fetch(MEMORY_ENDPOINT, {
      method: "DELETE",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...nagUserHeaders(),
        ...chatSessionHeaders(sessionId),
      },
      signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Clear memory failed (${response.status})`);
    }
  },

  sendAction: async (
    payload: Record<string, unknown>,
    signal?: AbortSignal,
    sessionId?: string
  ): Promise<void> => {
    const token = await getValidAccessToken();
    const response = await fetch("/api/chat/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...nagUserHeaders(),
        ...chatSessionHeaders(sessionId),
      },
      body: JSON.stringify({ payload }),
      signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Dispatch action failed (${response.status})`);
    }
  },
};

export default chatApi;
