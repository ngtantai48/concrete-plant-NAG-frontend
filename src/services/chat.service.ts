import type { ChatCompletionRequest, ChatMessage, ChatStreamEvent } from "@/types/chat";
import {
  buildContextMessage,
  buildMemoryContextMessage,
  buildRouterPrompt,
  dispatchTool,
  hasTool,
  parseRouterDecision,
} from "./chat-tools";
import type { ToolResult } from "./chat-tools/types";
import { getMemorySnapshot, hasMemory, rememberToolCall } from "./chat-memory";

const STREAM_ENDPOINT = "/api/chat/stream";
const COMPLETE_ENDPOINT = "/api/chat/complete";

export interface ChatStreamHandlers {
  onStatus?: (status: string) => void;
  onReasoning?: (chunk: string) => void;
  onContent?: (chunk: string) => void;
  onEvent?: (event: ChatStreamEvent) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
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
}

const defaultRequest: Partial<ChatCompletionRequest> = {
  stream: true,
  thinking: true,
  temperature: 0.7,
  max_tokens: 2048,
};

const routerRequest: Partial<ChatCompletionRequest> = {
  stream: false,
  thinking: false,
  temperature: 0,
  max_tokens: 256,
};

interface CompletionsResponse {
  choices?: Array<{ message?: { content?: string }; text?: string }>;
}

const chatApi = {
  sendStream: async (
    request: ChatCompletionRequest,
    handlers: ChatStreamHandlers = {}
  ): Promise<void> => {
    const { onStatus, onReasoning, onContent, onEvent, onDone, onError, signal } = handlers;

    const payload: ChatCompletionRequest = { ...defaultRequest, ...request };

    try {
      const res = await fetch(STREAM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Chat stream failed (${res.status}): ${errBody}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;

          const dataStr = dataLines.join("\n");
          if (dataStr === "[DONE]") {
            onDone?.();
            return;
          }

          let parsed: ChatStreamEvent;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            onContent?.(dataStr);
            continue;
          }

          onEvent?.(parsed);
          if (typeof parsed.status === "string") onStatus?.(parsed.status);
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
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  },

  sendComplete: async (
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<string> => {
    const payload: ChatCompletionRequest = { ...routerRequest, ...request, stream: false };
    const res = await fetch(COMPLETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Chat complete failed (${res.status}): ${errBody}`);
    }

    const json = (await res.json()) as CompletionsResponse;
    const text = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
    return typeof text === "string" ? text : "";
  },

  runWithTools: async (
    initialMessages: ChatMessage[],
    handlers: RunWithToolsHandlers = {},
    _options: RunWithToolsOptions = {}
  ): Promise<void> => {
    void _options;
    const history: ChatMessage[] = [...initialMessages];

    try {
      const lastUserIndex = (() => {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === "user") return i;
        }
        return -1;
      })();

      if (lastUserIndex < 0) {
        handlers.onDone?.();
        return;
      }

      const question = history[lastUserIndex].content;
      handlers.onIteration?.(1);
      handlers.onStatus?.("Đang phân tích yêu cầu");

      let decisionRaw = "";
      try {
        decisionRaw = await chatApi.sendComplete(
          {
            messages: [
              { role: "user", content: buildRouterPrompt(question, getMemorySnapshot()) },
            ],
          },
          handlers.signal
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        handlers.onStatus?.("⚠️ Không định tuyến được tool, trả lời trực tiếp.");
      }

      if (handlers.signal?.aborted) return;

      const decision = parseRouterDecision(decisionRaw);
      const wantsTool =
        decision && decision.tool !== "none" && decision.tool !== "" && hasTool(decision.tool);

      const messagesForStream: ChatMessage[] = [...history];

      if (wantsTool && decision) {
        handlers.onStatus?.(`Đang gọi ${decision.tool}`);
        handlers.onToolStart?.(decision.tool, decision.args);

        const result = await dispatchTool(decision.tool, decision.args);
        handlers.onToolEnd?.(result);

        if (handlers.signal?.aborted) return;

        handlers.onStatus?.(
          result.status === "ok"
            ? `Đã lấy dữ liệu (${result.tool})`
            : `${result.tool} lỗi: ${result.error ?? "không rõ"}`
        );

        if (result.status === "ok") {
          rememberToolCall({ tool: result.tool, args: decision.args, data: result.data });
        }

        messagesForStream[lastUserIndex] = {
          role: "user",
          content: buildContextMessage(question, result, getMemorySnapshot()),
        };

        handlers.onStatus?.("Đang soạn câu trả lời");
      } else if (hasMemory()) {
        handlers.onStatus?.("Dùng dữ liệu phiên trước");
        messagesForStream[lastUserIndex] = {
          role: "user",
          content: buildMemoryContextMessage(question, getMemorySnapshot()),
        };
        handlers.onStatus?.("Đang soạn câu trả lời");
      }

      let streamError: Error | null = null;
      await chatApi.sendStream(
        { messages: messagesForStream },
        {
          signal: handlers.signal,
          onStatus: (status) => handlers.onStatus?.(status),
          onContent: (chunk) => handlers.onContent?.(chunk),
          onError: (err) => {
            streamError = err;
          },
        }
      );

      if (streamError) {
        handlers.onError?.(streamError);
        return;
      }

      handlers.onDone?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  },
};

export default chatApi;
