"use client";

import {
  Activity,
  ArrowUp,
  AtSign,
  Check,
  Copy,
  Download,
  Expand,
  FileText,
  Folder,
  History,
  Layers,
  Mic,
  Paperclip,
  PanelLeft,
  PanelRight,
  Pin,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Share2,
  Slash,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cn } from "@/lib/utils";
import chatApi from "@/services/chat.service";
import type { ToolResult } from "@/services/chat-tools/types";
import type { ChatMessage as ApiChatMessage } from "@/types/chat";
import { RenderBlock } from "./RenderBlock";
import { ReasoningTree } from "./ReasoningTree";
import { StreamView } from "./StreamView";
import { parseStream } from "./parseStream";
import { isRecord } from "./tokens";
import {
  renderBlockDataSchema,
  type ReasoningStep,
  type RenderBlockData,
  type ToolName,
} from "./types";

type TurnStatus = "streaming" | "done" | "error";

type UserTurn = {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
};

type AssistantTurn = {
  id: string;
  role: "assistant";
  text: string;
  createdAt: string;
  reasoning: ReasoningStep[];
  status: TurnStatus;
  totalMs?: number;
};

type Turn = UserTurn | AssistantTurn;

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  turns: Turn[];
};

type PinnedBlock = {
  conversationId: string;
  blockId: string;
  data: RenderBlockData;
  createdAt: string;
};

type RendererStore = {
  conversations: Conversation[];
  currentConversationId: string;
  pinnedBlocks: PinnedBlock[];
  studioOpen: boolean;
  appendTurn: (conversationId: string, turn: Turn) => void;
  createConversation: () => string;
  selectConversation: (conversationId: string) => void;
  setConversationTitle: (conversationId: string, title: string) => void;
  toggleStudio: () => void;
  updateAssistantTurn: (conversationId: string, turnId: string, patch: Partial<AssistantTurn>) => void;
  replaceConversationPins: (conversationId: string, blocks: PinnedBlock[]) => void;
};

const suggestedPrompts = [
  "Cho tôi tổng quan sản lượng và đội xe hôm nay",
  "Xe nào sẵn sàng ca chiều?",
  "Lịch bảo trì tuần này",
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: uid("conv"),
    title: "Cuộc trò chuyện mới",
    createdAt: now,
    lastMessageAt: now,
    turns: [],
  };
}

const initialConversation = createBlankConversation();

const useRendererStore = create<RendererStore>()(
  persist(
    (set) => ({
      conversations: [initialConversation],
      currentConversationId: initialConversation.id,
      pinnedBlocks: [],
      studioOpen: true,
      appendTurn: (conversationId, turn) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, turns: [...conversation.turns, turn], lastMessageAt: turn.createdAt }
              : conversation,
          ),
        })),
      createConversation: () => {
        const conversation = createBlankConversation();
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentConversationId: conversation.id,
        }));
        return conversation.id;
      },
      selectConversation: (conversationId) => set({ currentConversationId: conversationId }),
      setConversationTitle: (conversationId, title) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, title } : conversation,
          ),
        })),
      toggleStudio: () => set((state) => ({ studioOpen: !state.studioOpen })),
      updateAssistantTurn: (conversationId, turnId, patch) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  turns: conversation.turns.map((turn) =>
                    turn.id === turnId && turn.role === "assistant" ? { ...turn, ...patch } : turn,
                  ),
                  lastMessageAt: new Date().toISOString(),
                }
              : conversation,
          ),
        })),
      replaceConversationPins: (conversationId, blocks) =>
        set((state) => ({
          pinnedBlocks: [
            ...state.pinnedBlocks.filter((block) => block.conversationId !== conversationId),
            ...blocks,
          ],
        })),
    }),
    {
      name: "nag-ai-renderer-live-v2",
      version: 2,
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        pinnedBlocks: state.pinnedBlocks,
        studioOpen: state.studioOpen,
      }),
    },
  ),
);

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 60_000) return "vừa xong";
  if (diffMs < 86_400_000) {
    return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  if (diffMs < 172_800_000) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(new Date(value));
}

function toApiMessages(turns: Turn[], nextUserText: string): ApiChatMessage[] {
  const messages = turns
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn): ApiChatMessage => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    }));
  return [...messages, { role: "user", content: nextUserText }];
}

function mapPopupToolToRendererTool(name: string): ToolName {
  if (name === "getTodayOrders" || name === "getOrdersByStatus") return "driver_schedule";
  if (name === "getVehicleStatus") return "vehicle_search";
  if (name === "getMaintenanceForecast") return "maintenance_log";
  if (name === "dispatch_action") return "dispatch_action";
  if (name.toLowerCase().includes("vehicle")) return "vehicle_search";
  if (name.toLowerCase().includes("maintenance")) return "maintenance_log";
  return "production_query";
}

function summarizeToolResult(result: ToolResult): string {
  if (result.status === "error") return result.error ?? "Tool returned an error";
  if (typeof result.text === "string" && result.text.trim()) return result.text.trim().slice(0, 180);
  if (result.data && typeof result.data === "object") return "Đã lấy dữ liệu nội bộ Nguyên Anh";
  return "Tool completed";
}

function extractPinnedBlocks(conversation: Conversation): PinnedBlock[] {
  const blocks = new Map<string, PinnedBlock>();
  for (const turn of conversation.turns) {
    if (turn.role !== "assistant") continue;
    for (const chunk of parseStream(turn.text)) {
      if (chunk.kind !== "block") continue;
      const parsed = renderBlockDataSchema.safeParse(chunk.data);
      if (!parsed.success) continue;
      blocks.set(parsed.data.id, {
        blockId: parsed.data.id,
        conversationId: conversation.id,
        createdAt: turn.createdAt,
        data: parsed.data,
      });
    }
  }
  return [...blocks.values()];
}

function LogoMark({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        "grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#4DA1FF_0%,#0A66E0_60%,#6A41E5_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.30)]",
        dark && "shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]",
      )}
    >
      <Sparkles className="text-white" size={17} strokeWidth={2.4} />
    </div>
  );
}

function Avatar({ initials = "NA", sizeClass = "size-8" }: { initials?: string; sizeClass?: string }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#FFC93C,#FF8A3C)] text-xs font-extrabold text-white",
        sizeClass,
      )}
    >
      {initials}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-black/10 bg-black/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300">
      {children}
    </span>
  );
}

function ShellButton({
  children,
  label,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "relative grid size-9 place-items-center rounded-[10px] text-[#8E96A8] transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-[#7CB6FF]/50",
        active && "bg-[rgba(0,122,255,0.18)] text-[#7CB6FF]",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
      {active && <span className="absolute -left-0.5 top-2 bottom-2 w-[3px] rounded-full bg-[#7CB6FF]" />}
    </button>
  );
}

function HistoryRail({
  conversations,
  currentConversationId,
  onNew,
  onSelect,
}: {
  conversations: Conversation[];
  currentConversationId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const panel = (
    <div
      className="relative z-30 hidden h-full w-[248px] shrink-0 flex-col overflow-hidden border-r border-black/[0.07] bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 md:flex"
    >
      <div className="border-b border-black/[0.07] bg-zinc-50 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
          <History size={13} />
          Lịch sử hội thoại
        </div>
        <label className="relative block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" size={13} />
          <input
            aria-label="Tìm trong lịch sử"
            className="h-8 w-full rounded-lg border border-black/10 bg-white pl-8 pr-2 text-[12px] outline-none transition focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-zinc-900"
            placeholder="Tìm trong lịch sử..."
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.map((conversation) => {
          const active = conversation.id === currentConversationId;
          return (
            <button
              className={cn(
                "mb-1 flex w-full items-start gap-2 rounded-lg border p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                active
                  ? "border-black/10 bg-[rgba(0,122,255,0.06)] dark:border-white/10 dark:bg-[rgba(0,122,255,0.16)]"
                  : "border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.06]",
              )}
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              type="button"
            >
              <div className={cn("grid size-6 shrink-0 place-items-center rounded-md", active ? "bg-[rgba(0,122,255,0.12)] text-[#0A66E0]" : "bg-zinc-100 text-zinc-500 dark:bg-white/10")}>
                <Activity size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[12.5px] font-semibold leading-4 text-zinc-900 dark:text-zinc-100">
                  {conversation.title}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-zinc-400">
                  {relativeTime(conversation.lastMessageAt)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        className="flex items-center gap-2 border-t border-black/[0.07] bg-zinc-50 px-3.5 py-2.5 text-left text-[11.5px] font-semibold text-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/[0.04] dark:text-[#6DB4FF]"
        onClick={onNew}
        type="button"
      >
        <Plus size={13} />
        Cuộc trò chuyện mới
        <span className="ml-auto"><Kbd>⌘N</Kbd></span>
      </button>
    </div>
  );

  return (
    <div className="relative z-40 flex h-full shrink-0">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-black/[0.07] bg-white py-3 dark:border-white/10 dark:bg-zinc-950">
        <LogoMark />
        <button
          aria-label="Cuộc trò chuyện mới"
          className="my-2 grid size-9 place-items-center rounded-[10px] bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[#7CB6FF]/50"
          onClick={onNew}
          type="button"
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
        <ShellButton label="Tìm">
          <Search size={17} />
        </ShellButton>
        <ShellButton active label="Lịch sử">
          <History size={17} />
        </ShellButton>
        <ShellButton label="Đã ghim">
          <Star size={17} />
        </ShellButton>
        <ShellButton label="Bộ sưu tập">
          <Folder size={17} />
        </ShellButton>
        <ShellButton label="Nguồn dữ liệu">
          <Layers size={17} />
        </ShellButton>
        <ShellButton label="Ghi chú">
          <FileText size={17} />
        </ShellButton>
        <div className="flex-1" />
        <ShellButton label="Cài đặt">
          <Settings size={17} />
        </ShellButton>
        <Avatar sizeClass="size-8" />
      </nav>
      {panel}
    </div>
  );
}

function TopBar({
  conversation,
  studioOpen,
  sourceCount,
  onTitleChange,
  onToggleStudio,
}: {
  conversation: Conversation;
  studioOpen: boolean;
  sourceCount: number;
  onTitleChange: (title: string) => void;
  onToggleStudio: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-black/[0.07] bg-white px-4 dark:border-white/10 dark:bg-zinc-950">
      <input
        aria-label="Tên cuộc trò chuyện"
        className="min-w-[220px] max-w-[420px] flex-1 rounded-md bg-transparent text-[13px] font-bold text-zinc-950 outline-none transition focus:bg-zinc-50 focus:px-2 focus:ring-2 focus:ring-[#007AFF]/30 dark:text-zinc-50 dark:focus:bg-white/10"
        defaultValue={conversation.title}
        key={conversation.id}
        onBlur={(event) => onTitleChange(event.currentTarget.value.trim() || "Cuộc trò chuyện mới")}
      />
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(52,199,89,0.12)] px-2 py-1 text-[10.5px] font-bold text-[#1F8E47] dark:text-[#63DB82]">
        <span className="size-1.5 animate-pulse rounded-full bg-[#34C759]" />
        Live
      </span>
      <span className="hidden rounded-full bg-[rgba(0,122,255,0.10)] px-2 py-1 text-[10.5px] font-bold text-[#0A66E0] dark:text-[#6DB4FF] sm:inline-flex">
        {conversation.turns.length} lượt · {sourceCount} nguồn
      </span>
      <div className="ml-auto hidden rounded-lg bg-zinc-100 p-1 dark:bg-white/10 md:flex">
        {["Đối thoại", "Trục thời gian", "Báo cáo"].map((tab, index) => (
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
              index === 0 ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-500",
            )}
            key={tab}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      <button
        aria-label="Chia sẻ"
        className="hidden items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-zinc-600 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10 lg:inline-flex"
        type="button"
      >
        <Share2 size={13} /> Chia sẻ
      </button>
      <button
        aria-label="Báo cáo"
        className="hidden items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-zinc-600 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10 lg:inline-flex"
        type="button"
      >
        <Download size={13} /> Báo cáo
      </button>
      <button
        aria-label={studioOpen ? "Ẩn Studio" : "Hiện Studio"}
        className="grid size-8 place-items-center rounded-lg border border-black/10 text-zinc-500 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
        onClick={onToggleStudio}
        type="button"
      >
        {studioOpen ? <PanelRight size={15} /> : <PanelLeft size={15} />}
      </button>
      <Avatar sizeClass="size-7" />
    </header>
  );
}

function AssistantToolbar({ onPinAll }: { onPinAll: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <button aria-label="Đánh giá tốt" className="toolbar-btn" type="button">
        <ThumbsUp size={13} />
      </button>
      <button aria-label="Đánh giá chưa tốt" className="toolbar-btn" type="button">
        <ThumbsDown size={13} />
      </button>
      <button aria-label="Copy câu trả lời" className="toolbar-btn" type="button">
        <Copy size={13} /> Copy
      </button>
      <button aria-label="Hỏi lại" className="toolbar-btn" type="button">
        <RefreshCcw size={13} /> Hỏi lại
      </button>
      <button aria-label="Pin tất cả vào Studio" className="toolbar-btn ml-auto" onClick={onPinAll} type="button">
        <Pin size={13} /> Pin tất cả vào Studio
      </button>
    </div>
  );
}

function ChatColumn({
  conversation,
  isBusy,
  onSend,
  onPinAll,
}: {
  conversation: Conversation;
  isBusy: boolean;
  onSend: (text: string) => Promise<void>;
  onPinAll: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const onFollowup = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (detail?.text) {
        setInput(detail.text);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("render:followup", onFollowup);
    return () => window.removeEventListener("render:followup", onFollowup);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottomRef.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [conversation.turns]);

  const submit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    await onSend(trimmed);
  }, [input, isBusy, onSend]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-black/[0.07] bg-[#F7F7F8] dark:border-white/10 dark:bg-zinc-900 lg:w-[620px]">
      <div
        className="flex-1 overflow-y-auto px-4 py-5"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
        }}
        ref={scrollRef}
      >
        <div className="mx-auto flex w-full max-w-[620px] flex-col gap-5">
          {conversation.turns.length === 0 && (
            <div className="mt-16 rounded-xl border border-dashed border-black/10 bg-white px-5 py-6 text-center dark:border-white/10 dark:bg-zinc-950">
              <LogoMark />
              <h1 className="mt-4 text-lg font-extrabold text-zinc-950 dark:text-zinc-50">
                Trợ lý điều hành đội xe bê tông
              </h1>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0A66E0] transition hover:bg-[rgba(0,122,255,0.06)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-zinc-900 dark:text-[#6DB4FF]"
                    key={prompt}
                    onClick={() => onSend(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {conversation.turns.map((turn) =>
            turn.role === "user" ? (
              <div className="flex justify-end" key={turn.id}>
                <div className="flex max-w-[78%] items-start gap-2">
                  <div className="rounded-2xl rounded-br-md bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] px-3.5 py-2.5 text-[14px] leading-6 text-white shadow-[0_1px_2px_rgba(0,122,255,0.20)]">
                    {turn.text}
                  </div>
                  <Avatar sizeClass="size-7" />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3" key={turn.id}>
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#4DA1FF,#0A66E0)]">
                  <Sparkles className="text-white" size={14} strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="font-bold text-zinc-700 dark:text-zinc-200">Trợ lý AI</span>
                    <span>·</span>
                    <span>chat.svnagentic.site</span>
                    <span>·</span>
                    {turn.status === "streaming" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0A66E0] dark:text-[#6DB4FF]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#007AFF]" />
                        Đang stream
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1F8E47] dark:text-[#63DB82]">
                        <Check size={11} />
                        {turn.status === "error" ? "Có lỗi" : "Đã trả lời"}
                        {turn.totalMs ? ` · ${(turn.totalMs / 1000).toFixed(1)}s` : ""}
                      </span>
                    )}
                  </div>
                  <ReasoningTree steps={turn.reasoning} totalMs={turn.totalMs} />
                  <div className={turn.reasoning.length > 0 ? "mt-3" : ""}>
                    <StreamView text={turn.text} streaming={turn.status === "streaming"} />
                  </div>
                  {turn.status !== "streaming" && <AssistantToolbar onPinAll={onPinAll} />}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-[620px] rounded-2xl border border-black/10 bg-white p-2.5 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-zinc-950">
          <textarea
            aria-label="Nhập tin nhắn"
            className="max-h-36 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-[14px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            data-testid="chat-input"
            disabled={isBusy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Hỏi tiếp về sản lượng, xe, tài xế... gõ / để gọi lệnh"
            ref={textareaRef}
            rows={2}
            value={input}
          />
          <div className="flex items-center gap-1.5">
            <button aria-label="Đính kèm" className="composer-tool" type="button">
              <Paperclip size={14} />
            </button>
            <button aria-label="Slash command" className="composer-tool" type="button">
              <Slash size={14} />
            </button>
            <button aria-label="Mention" className="composer-tool" type="button">
              <AtSign size={14} />
            </button>
            <button aria-label="Voice" className="composer-tool" type="button">
              <Mic size={14} />
            </button>
            <span className="ml-1 inline-flex items-center gap-1 rounded-lg bg-[rgba(0,122,255,0.08)] px-2 py-1.5 text-[11.5px] font-bold text-[#0A66E0] dark:text-[#6DB4FF]">
              <Sparkles size={12} /> gpt-4o · Cân bằng
            </span>
            <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-zinc-400 sm:flex">
              <Kbd>Enter</Kbd> gửi
            </span>
            <button
              aria-label="Gửi"
              className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] text-white shadow-[0_2px_6px_rgba(0,122,255,0.32)] transition disabled:cursor-not-allowed disabled:grayscale focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
              data-testid="send-button"
              disabled={!input.trim() || isBusy}
              onClick={() => void submit()}
              type="button"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function StudioCanvas({
  blocks,
  currentConversationId,
  onFocus,
  onToggle,
}: {
  blocks: PinnedBlock[];
  currentConversationId: string;
  onFocus: (block: PinnedBlock) => void;
  onToggle: () => void;
}) {
  const currentBlocks = blocks.filter((block) => block.conversationId === currentConversationId);

  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[48vh] min-w-0 flex-col overflow-hidden rounded-t-2xl border-t border-black/10 bg-[#F7F7F8] shadow-2xl dark:border-white/10 dark:bg-zinc-950 lg:static lg:max-h-none lg:flex-1 lg:rounded-none lg:border-t-0 lg:shadow-none">
      <header className="flex items-center gap-2 border-b border-black/[0.07] px-3.5 py-3 dark:border-white/10">
        <div className="grid size-7 place-items-center rounded-lg bg-[rgba(175,82,222,0.10)] text-[#7B33B0] dark:text-[#D996F0]">
          <Layers size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">Studio</h2>
          <p className="text-[10.5px] text-zinc-400">{currentBlocks.length} khối · cuộc này</p>
        </div>
        <button aria-label="Mở canvas đầy đủ" className="icon-soft" type="button">
          <Expand size={14} />
        </button>
        <button aria-label="Đóng Studio" className="icon-soft lg:hidden" onClick={onToggle} type="button">
          <X size={14} />
        </button>
      </header>
      <div className="flex gap-1 border-b border-black/[0.07] px-3 py-2 dark:border-white/10">
        {["Mới", "Đã ghim", "Tất cả"].map((tab, index) => (
          <button
            className={cn(
              "rounded-md px-2.5 py-1 text-[11.5px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
              index === 0 ? "bg-zinc-100 text-zinc-950 dark:bg-white/10 dark:text-zinc-50" : "text-zinc-500",
            )}
            key={tab}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {currentBlocks.length === 0 && (
          <div className="grid h-full min-h-[360px] place-items-center rounded-xl border border-dashed border-black/10 bg-white p-6 text-center text-[12px] text-zinc-400 dark:border-white/10 dark:bg-zinc-900">
            Render blocks sẽ tự pin tại đây khi AI stream xong JSON.
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {currentBlocks.map((block) => (
            <article
              className={cn(
                "min-w-0 rounded-xl border border-black/10 bg-white p-3 text-left transition hover:border-[#007AFF] hover:shadow-[0_0_0_2px_rgba(0,122,255,0.10)] dark:border-white/10 dark:bg-zinc-900",
                (block.data.type === "kpi_grid" || block.data.type === "gantt" || block.data.type === "table") &&
                  "xl:col-span-2",
              )}
              key={block.blockId}
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                <div className="grid size-[18px] place-items-center rounded bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                  <Layers size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-bold text-zinc-900 dark:text-zinc-100">
                    {block.data.title ?? block.data.id}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400">{block.data.type}</div>
                </div>
                <Pin className="text-[#0A66E0] dark:text-[#6DB4FF]" size={12} />
                <button
                  aria-label="Mở khối trong canvas đầy đủ"
                  className="icon-soft"
                  onClick={() => onFocus(block)}
                  type="button"
                >
                  <Expand size={12} />
                </button>
              </div>
              <div className="mt-2">
                <RenderBlock data={block.data} />
              </div>
            </article>
          ))}
        </div>
      </div>
      <footer className="flex items-center gap-1.5 border-t border-black/[0.07] bg-zinc-50 px-3.5 py-2 text-[11px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.04]">
        <Activity size={12} />
        Click để mở canvas đầy đủ
        <span className="ml-auto"><Kbd>⌘\</Kbd></span>
      </footer>
    </aside>
  );
}

function FocusOverlay({ block, onClose }: { block: PinnedBlock | null; onClose: () => void }) {
  if (!block) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-zinc-950/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <div className="mb-3 flex items-center gap-3 text-white">
          <div>
            <div className="text-sm font-bold">{block.data.title ?? block.data.id}</div>
            <div className="font-mono text-[11px] text-white/60">{block.data.type}</div>
          </div>
          <button
            aria-label="Đóng focus mode"
            className="ml-auto grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto rounded-xl bg-[#F7F7F8] p-5 dark:bg-zinc-900"
          onClick={(event) => event.stopPropagation()}
        >
          <RenderBlock data={block.data} />
        </div>
      </div>
    </div>
  );
}

function ActionLog({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-1">
      {items.slice(0, 3).map((item, index) => (
        <div className="rounded-full bg-zinc-950 px-3 py-1.5 font-mono text-[11px] text-white shadow-lg" key={`${item}-${index}`}>
          {item}
        </div>
      ))}
    </div>
  );
}

export function RendererShell() {
  const conversations = useRendererStore((state) => state.conversations);
  const currentConversationId = useRendererStore((state) => state.currentConversationId);
  const pinnedBlocks = useRendererStore((state) => state.pinnedBlocks);
  const studioOpen = useRendererStore((state) => state.studioOpen);
  const appendTurn = useRendererStore((state) => state.appendTurn);
  const createConversation = useRendererStore((state) => state.createConversation);
  const selectConversation = useRendererStore((state) => state.selectConversation);
  const setConversationTitle = useRendererStore((state) => state.setConversationTitle);
  const toggleStudio = useRendererStore((state) => state.toggleStudio);
  const updateAssistantTurn = useRendererStore((state) => state.updateAssistantTurn);
  const replaceConversationPins = useRendererStore((state) => state.replaceConversationPins);
  const [focusedBlock, setFocusedBlock] = useState<PinnedBlock | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const currentConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === currentConversationId) ??
      conversations[0],
    [conversations, currentConversationId],
  );

  const currentPins = useMemo(
    () => (currentConversation ? extractPinnedBlocks(currentConversation) : []),
    [currentConversation],
  );

  useEffect(() => {
    if (!currentConversation) return;
    replaceConversationPins(currentConversation.id, currentPins);
  }, [currentConversation, currentPins, replaceConversationPins]);

  const isBusy = currentConversation?.turns.some((turn) => turn.role === "assistant" && turn.status === "streaming") ?? false;

  const sendMessage = useCallback(
    async (text: string) => {
      const conversation = currentConversation;
      if (!conversation || isBusy) return;

      const userTurn: UserTurn = {
        id: uid("user"),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      };
      const assistantTurn: AssistantTurn = {
        id: uid("assistant"),
        role: "assistant",
        text: "",
        reasoning: [],
        status: "streaming",
        createdAt: new Date().toISOString(),
      };
      const requestMessages = toApiMessages(conversation.turns, text);

      appendTurn(conversation.id, userTurn);
      appendTurn(conversation.id, assistantTurn);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      let reasoning: ReasoningStep[] = [];

      const mergeReasoningStep = (step: ReasoningStep) => {
        reasoning = [
          ...reasoning.filter((existing) => existing.id !== step.id),
          step,
        ].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
        updateAssistantTurn(conversation.id, assistantTurn.id, { reasoning });
      };

      const appendAssistantText = (delta: string) => {
        accumulated += delta;
        updateAssistantTurn(conversation.id, assistantTurn.id, { text: accumulated });
      };

      try {
        const startedAtMs = performance.now();
        const toolRuns = new Map<
          string,
          { id: string; input: unknown; startedAt: string; startedAtMs: number; tool: ToolName }
        >();
        let statusCount = 0;
        let streamError: Error | null = null;

        await chatApi.runWithTools(
          requestMessages,
          {
            signal: controller.signal,
            onStatus: (status) => {
              const trimmed = status.trim();
              if (!trimmed) return;
              statusCount += 1;
              mergeReasoningStep({
                event: "reasoning_step",
                id: `status-${assistantTurn.id}-${statusCount}`,
                tool: "production_query",
                status: "done",
                startedAt: new Date().toISOString(),
                durationMs: 0,
                input: { status: trimmed },
                resultSummary: trimmed,
              });
            },
            onToolStart: (name, args) => {
              const tool = mapPopupToolToRendererTool(name);
              const id = uid(`tool-${tool}`);
              const startedAt = new Date().toISOString();
              const input = { tool: name, args };
              toolRuns.set(name, {
                id,
                input,
                startedAt,
                startedAtMs: performance.now(),
                tool,
              });
              mergeReasoningStep({
                event: "reasoning_step",
                id,
                tool,
                status: "running",
                startedAt,
                input,
              });
            },
            onToolEnd: (result) => {
              const existing = toolRuns.get(result.tool);
              const tool = existing?.tool ?? mapPopupToolToRendererTool(result.tool);
              const startedAt = existing?.startedAt ?? new Date().toISOString();
              const startedAtMs = existing?.startedAtMs ?? performance.now();
              mergeReasoningStep({
                event: "reasoning_step",
                id: existing?.id ?? uid(`tool-${tool}`),
                tool,
                status: result.status === "ok" ? "done" : "error",
                startedAt,
                durationMs: Math.max(1, Math.round(performance.now() - startedAtMs)),
                input: existing?.input ?? { tool: result.tool },
                resultSummary: summarizeToolResult(result),
                error: result.status === "error" ? result.error : undefined,
              });
            },
            onContent: appendAssistantText,
            onError: (error) => {
              streamError = error;
            },
          },
          { maxIterations: 4, injectSystemPrompt: true },
        );

        updateAssistantTurn(conversation.id, assistantTurn.id, {
          totalMs: Math.round(performance.now() - startedAtMs),
        });

        if (streamError) throw streamError;

        updateAssistantTurn(conversation.id, assistantTurn.id, {
          status: "done",
          text: accumulated || "(Không có phản hồi)",
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Không rõ lỗi";
        updateAssistantTurn(conversation.id, assistantTurn.id, {
          status: "error",
          text: accumulated || `⚠️ Đã xảy ra lỗi: ${message}`,
        });
      }
    },
    [appendTurn, currentConversation, isBusy, updateAssistantTurn],
  );

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ intent?: string; payload?: unknown; id?: string }>).detail;
      if (!detail?.intent) return;
      if (process.env.NODE_ENV === "development") {
        console.log("[render:action]", detail);
      }
      setActionLog((items) => [`action:${detail.intent}`, ...items].slice(0, 6));

      if (detail.intent === "cancel" || detail.intent === "open_dispatch") return;
      const payload = isRecord(detail.payload) ? detail.payload : {};
      void fetch("/api/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            ...payload,
            kind: detail.intent,
            reason: `User approved ${detail.id ?? "action_proposal"}`,
          },
        }),
      })
        .then((response) => response.json())
        .then((json: unknown) => {
          if (process.env.NODE_ENV === "development") {
            console.log("[dispatch_action]", json);
          }
        })
        .catch((error: unknown) => {
          if (process.env.NODE_ENV === "development") {
            console.error("[dispatch_action:error]", error);
          }
        });
    };
    window.addEventListener("render:action", onAction);
    return () => window.removeEventListener("render:action", onAction);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        createConversation();
      }
      if (event.key === "\\") {
        event.preventDefault();
        toggleStudio();
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const index = conversations.findIndex((conversation) => conversation.id === currentConversationId);
        const nextIndex = event.key === "[" ? Math.max(index - 1, 0) : Math.min(index + 1, conversations.length - 1);
        const next = conversations[nextIndex];
        if (next) selectConversation(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conversations, createConversation, currentConversationId, selectConversation, toggleStudio]);

  if (!currentConversation) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F7F7F8] text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
      <TopBar
        conversation={currentConversation}
        onTitleChange={(title) => setConversationTitle(currentConversation.id, title)}
        onToggleStudio={toggleStudio}
        sourceCount={currentPins.length}
        studioOpen={studioOpen}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <HistoryRail
          conversations={conversations}
          currentConversationId={currentConversation.id}
          onNew={() => createConversation()}
          onSelect={selectConversation}
        />
        <ChatColumn
          conversation={currentConversation}
          isBusy={isBusy}
          onPinAll={() => {
            replaceConversationPins(currentConversation.id, currentPins);
            setActionLog((items) => ["pinned:all", ...items].slice(0, 6));
          }}
          onSend={sendMessage}
        />
        {studioOpen && (
          <StudioCanvas
            blocks={pinnedBlocks}
            currentConversationId={currentConversation.id}
            onFocus={setFocusedBlock}
            onToggle={toggleStudio}
          />
        )}
      </div>
      <FocusOverlay block={focusedBlock} onClose={() => setFocusedBlock(null)} />
      <ActionLog items={actionLog} />
    </div>
  );
}
