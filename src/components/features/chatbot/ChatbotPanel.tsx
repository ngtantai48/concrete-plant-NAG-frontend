"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, ArrowUp, RotateCcw } from "lucide-react";
import chatApi from "@/services/chat.service";
import type { ChatMessage as ApiChatMessage } from "@/types/chat";
import dayjs from "dayjs";
import { ReasoningTree } from "@/components/renderer/ReasoningTree";
import { StreamView } from "@/components/renderer/StreamView";
import { toolNames, type ReasoningStep, type ToolName } from "@/components/renderer/types";

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  time: string;
  loading?: boolean;
  status?: string;
  toolSteps?: string[];
}

const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const SUGGESTED = [
  "Hôm nay có bao nhiêu chuyến?",
  "Xe nào cần bảo trì gấp?",
  "Sản lượng tháng này?",
  "Xe nào chạy nhiều nhất?",
  "Tỷ lệ hoàn thành hôm nay?",
];

const WELCOME_TEXT =
  "Xin chào! Tôi là trợ lý AI của hệ thống.\nTôi có thể giúp bạn tra cứu sản lượng, bảo trì, và trạng thái vận hành.";

function toApiMessages(history: Message[]): ApiChatMessage[] {
  return history
    .filter((m) => !m.loading && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === "bot" ? "assistant" : "user",
      content: m.text,
    }));
}

function toReasoningSteps(steps: string[], isActive?: boolean): ReasoningStep[] {
  const now = new Date().toISOString();

  return steps.map((step, index) => ({
    event: "reasoning_step",
    id: `popup-step-${index}-${step}`,
    tool: extractToolName(step),
    status: isActive && index === steps.length - 1 ? "running" : "done",
    startedAt: now,
    input: { status: step },
    resultSummary: isActive && index === steps.length - 1 ? undefined : step,
  }));
}

function extractToolName(step: string): ToolName {
  const match = step.match(/(?:gọi|calling)\s+([a-zA-Z0-9_]+)/i)?.[1];
  return toolNames.find((toolName) => toolName === match) ?? "production_query";
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span
        className="rounded-full animate-bounce"
        style={{
          width: 6,
          height: 6,
          background: "rgba(60,60,67,0.55)",
          animationDelay: "0ms",
        }}
      />
      <span
        className="rounded-full animate-bounce"
        style={{
          width: 6,
          height: 6,
          background: "rgba(60,60,67,0.55)",
          animationDelay: "150ms",
        }}
      />
      <span
        className="rounded-full animate-bounce"
        style={{
          width: 6,
          height: 6,
          background: "rgba(60,60,67,0.55)",
          animationDelay: "300ms",
        }}
      />
    </div>
  );
}

function createChatSessionId() {
  return `chatbot-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export default function ChatbotPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "bot", text: WELCOME_TEXT, time: dayjs().format("HH:mm") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(createChatSessionId());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 280);
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        text: trimmed,
        time: dayjs().format("HH:mm"),
      };
      const botId = `b-${Date.now()}`;
      const botMsg: Message = { id: botId, role: "bot", text: "", time: "", loading: true };

      const nextHistory = [...messages, userMsg];
      setMessages([...nextHistory, botMsg]);
      setInput("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      const apiMessages: ApiChatMessage[] = [
        ...toApiMessages(nextHistory),
        { role: "user", content: trimmed },
      ];

      let accumulated = "";

      const appendStep = (status: string) =>
        setMessages((m) =>
          m.map((msg) => {
            if (msg.id !== botId) return msg;
            const last = msg.toolSteps?.[msg.toolSteps.length - 1];
            const nextSteps = last === status ? msg.toolSteps! : [...(msg.toolSteps ?? []), status];
            return { ...msg, status, toolSteps: nextSteps, loading: !accumulated };
          })
        );

      await chatApi.runWithTools(
        apiMessages,
        {
          signal: controller.signal,
          onStatus: appendStep,
          onContent: (chunk) => {
            accumulated += chunk;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === botId
                  ? { ...msg, text: accumulated, status: undefined, loading: false }
                  : msg
              )
            );
          },
          onToolStart: (name) => appendStep(`Đang gọi ${name}`),
          onIteration: (iteration) => appendStep(`Vòng xử lý ${iteration}`),
          onDone: () => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === botId
                  ? {
                      ...msg,
                      text: accumulated || "(Không có phản hồi)",
                      time: dayjs().format("HH:mm"),
                      loading: false,
                      status: undefined,
                    }
                  : msg
              )
            );
            setLoading(false);
          },
          onError: (err) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === botId
                  ? {
                      ...msg,
                      text: `⚠️ Đã xảy ra lỗi: ${err.message}`,
                      time: dayjs().format("HH:mm"),
                      loading: false,
                      status: undefined,
                    }
                  : msg
              )
            );
            setLoading(false);
          },
        },
        { maxIterations: 4, sessionId: sessionIdRef.current }
      );
    },
    [messages, loading]
  );

  const reset = () => {
    abortRef.current?.abort();
    setLoading(false);
    const previousSessionId = sessionIdRef.current;
    sessionIdRef.current = createChatSessionId();
    void chatApi.clearMemory(undefined, previousSessionId);
    setMessages([{ id: "0", role: "bot", text: WELCOME_TEXT, time: dayjs().format("HH:mm") }]);
  };

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3"
      style={{ fontFamily: APPLE_FONT }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
              width: 380,
              height: 560,
              borderRadius: 22,
              boxShadow: "0 30px 60px -10px rgba(0,0,0,0.18), 0 8px 16px -4px rgba(0,0,0,0.06)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.86)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                padding: "13px 14px",
                borderBottom: "0.5px solid rgba(60,60,67,0.18)",
                flexShrink: 0,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      background: "linear-gradient(135deg, #4DA1FF 0%, #0A7BFF 100%)",
                      boxShadow: "0 4px 10px -2px rgba(10,123,255,0.4)",
                    }}
                  >
                    <MessageCircle size={17} className="text-white" strokeWidth={2.2} />
                  </div>
                  <div className="leading-tight">
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#1C1C1E",
                        letterSpacing: -0.2,
                      }}
                    >
                      Trợ lý AI
                    </div>
                    <div style={{ fontSize: 11.5, color: "#8E8E93", marginTop: 1 }}>
                      Nguyên Anh II
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={reset}
                    className="flex items-center justify-center transition-colors"
                    style={{ width: 30, height: 30, borderRadius: 10 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    title="Cuộc trò chuyện mới"
                  >
                    <RotateCcw size={14} style={{ color: "#8E8E93" }} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center transition-colors"
                    style={{ width: 30, height: 30, borderRadius: 10 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <X size={15} style={{ color: "#8E8E93" }} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ background: "#F5F5F7" }}>
              <div className="space-y-1">
                {messages.map((msg, idx) => {
                  const prev = messages[idx - 1];
                  const isFirstOfGroup = !prev || prev.role !== msg.role;
                  const isUser = msg.role === "user";

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      style={{ marginTop: isFirstOfGroup ? 10 : 2 }}
                    >
                      <div style={{ maxWidth: isUser ? "80%" : "92%" }}>
                        {msg.role === "bot" &&
                        msg.toolSteps &&
                        msg.toolSteps.length > 0 &&
                        !msg.text ? (
                          <div
                            style={{
                              background: "#E9E9EB",
                              padding: "8px 12px",
                              borderRadius: 18,
                              borderTopLeftRadius: 6,
                            }}
                          >
                            <ReasoningTree steps={toReasoningSteps(msg.toolSteps, msg.loading)} />
                          </div>
                        ) : msg.loading && !msg.text ? (
                          <div
                            style={{
                              background: "#E9E9EB",
                              padding: "10px 14px",
                              borderRadius: 18,
                              borderTopLeftRadius: 6,
                            }}
                          >
                            <TypingDots />
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "7px 13px",
                              borderRadius: 18,
                              fontSize: 14.5,
                              letterSpacing: -0.1,
                              ...(isUser
                                ? {
                                    background: "linear-gradient(180deg, #2C99FF 0%, #007AFF 100%)",
                                    color: "#FFFFFF",
                                    borderBottomRightRadius: 6,
                                  }
                                : {
                                    background: "#E9E9EB",
                                    color: "#000000",
                                    borderTopLeftRadius: 6,
                                  }),
                            }}
                          >
                            {isUser ? (
                              <span style={{ lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                                {msg.text}
                              </span>
                            ) : (
                              <StreamView text={msg.text} streaming={Boolean(msg.loading)} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={bottomRef} />
            </div>

            <div
              className="px-3 py-2 overflow-x-auto flex gap-2"
              style={{
                scrollbarWidth: "none",
                background: "#FFFFFF",
                borderTop: "0.5px solid rgba(60,60,67,0.18)",
                flexShrink: 0,
              }}
            >
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="shrink-0 transition-all disabled:opacity-50"
                  style={{
                    fontSize: 12.5,
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: "#F2F2F7",
                    color: "#007AFF",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    letterSpacing: -0.1,
                  }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.background = "#E5E5EA")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F2F2F7")}
                >
                  {s}
                </button>
              ))}
            </div>

            <div
              className="px-3 pb-3 pt-2 flex items-center"
              style={{ background: "#FFFFFF", flexShrink: 0 }}
            >
              <div
                className="flex items-center w-full"
                style={{
                  background: "#F2F2F7",
                  borderRadius: 999,
                  paddingLeft: 14,
                  paddingRight: 4,
                  height: 36,
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Nhập tin nhắn"
                  className="flex-1 bg-transparent outline-none border-0"
                  style={{
                    fontSize: 14.5,
                    color: "#1C1C1E",
                    letterSpacing: -0.1,
                  }}
                />
                <button
                  onClick={() => send(input)}
                  disabled={!canSend}
                  className="flex items-center justify-center transition-all"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: canSend
                      ? "linear-gradient(180deg, #2C99FF 0%, #007AFF 100%)"
                      : "#C7C7CC",
                    flexShrink: 0,
                    opacity: canSend ? 1 : 0.7,
                  }}
                >
                  <ArrowUp size={15} className="text-white" strokeWidth={2.6} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "linear-gradient(135deg, #4DA1FF 0%, #0A7BFF 100%)",
          boxShadow: "0 12px 28px -6px rgba(10,123,255,0.45), 0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X size={22} className="text-white" strokeWidth={2.4} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MessageCircle size={22} className="text-white" strokeWidth={2.2} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
