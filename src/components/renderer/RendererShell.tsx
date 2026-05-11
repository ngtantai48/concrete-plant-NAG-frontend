"use client";

import {
  Activity,
  ArrowUp,
  AtSign,
  BarChart3,
  Clipboard,
  Copy,
  Download,
  Edit3,
  FileText,
  Gauge,
  Loader2,
  Mic,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  RefreshCcw,
  Search,
  Share2,
  Slash,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cn } from "@/lib/utils";
import chatApi from "@/services/chat.service";
import type { ToolResult } from "@/services/chat-tools/types";
import type { ChatMessage as ApiChatMessage } from "@/types/chat";

import { ReasoningTree } from "./ReasoningTree";
import { RenderBlock } from "./RenderBlock";
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
type FeedbackVote = "up" | "down";
type HistoryFilter = "all" | "pinned" | "vehicles";
type InspectorTab = "tools" | "charts" | "actions";
type WorkContext = "fleet" | "production" | "maintenance";

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
  regenerated?: boolean;
};

type Turn = UserTurn | AssistantTurn;

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  pinned?: boolean;
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
  feedback: Record<string, FeedbackVote>;
  inspectorOpen: boolean;
  activeContext: WorkContext;
  appendTurn: (conversationId: string, turn: Turn) => void;
  createConversation: () => string;
  deleteConversation: (conversationId: string) => void;
  replaceConversationPins: (conversationId: string, blocks: PinnedBlock[]) => void;
  selectConversation: (conversationId: string) => void;
  setConversationTitle: (conversationId: string, title: string) => void;
  setFeedback: (turnId: string, vote: FeedbackVote) => void;
  setActiveContext: (context: WorkContext) => void;
  toggleConversationPin: (conversationId: string) => void;
  toggleInspector: () => void;
  updateAssistantTurn: (conversationId: string, turnId: string, patch: Partial<AssistantTurn>) => void;
};

const slashCommands = [
  { cmd: "/tong-quan", hint: "Tổng quan sản lượng và đội xe hôm nay", example: "Cho tôi tổng quan sản lượng và đội xe hôm nay" },
  { cmd: "/xe-ca-chieu", hint: "Xe sẵn sàng ca chiều", example: "Xe nào sẵn sàng ca chiều?" },
  { cmd: "/bao-tri", hint: "Lịch bảo trì", example: "Lịch bảo trì tuần này có xe nào rủi ro?" },
  { cmd: "/don-dang-di-chuyen", hint: "Đơn đang di chuyển", example: "Liệt kê đơn đang di chuyển và xe phụ trách" },
];

const suggestedPrompts = [
  "Cho tôi tổng quan sản lượng và đội xe hôm nay",
  "Xe nào sẵn sàng ca chiều?",
  "Lọc top xe theo quãng đường",
];

const contextOptions: Record<WorkContext, { label: string; instruction: string }> = {
  fleet: {
    label: "Đội xe",
    instruction:
      "Ngữ cảnh đang chọn: Đội xe. Ưu tiên orders/lịch xe/trạng thái xe; nếu hỏi xe sẵn sàng theo ca thì dùng dữ liệu đơn hàng và lịch chuyến, không suy luận từ trạng thái cuối ngày. Ngữ nghĩa trạng thái trong ngày: pending/init = Đang đợi; running/transporting = Đang di chuyển; completed = Hoàn thành.",
  },
  production: {
    label: "Sản lượng",
    instruction:
      "Ngữ cảnh đang chọn: Sản lượng. Ưu tiên báo cáo sản lượng, đơn hàng và top xe; mặc định render kpi_grid, donut_chart, bar_chart và table nếu có dữ liệu. Khi nói trạng thái trong ngày: pending/init là Đang đợi, running/transporting là Đang di chuyển, completed là Hoàn thành. Source tập trung vào vehicle; tài xế chỉ là metadata tượng trưng, không phân tích hoặc vẽ chart theo tài xế. Scope trạm cố định là NGUYÊN ANH, không phân tích hoặc vẽ chart theo trạm.",
  },
  maintenance: {
    label: "Bảo trì",
    instruction:
      "Ngữ cảnh đang chọn: Bảo trì. Ưu tiên dữ liệu bảo trì, xe rủi ro, hạn bảo dưỡng và cảnh báo; render table/alert/action_proposal khi cần người dùng duyệt xử lý.",
  },
};

const inspectorChartTypes = new Set<RenderBlockData["type"]>([
  "kpi_grid",
  "line_chart",
  "bar_chart",
  "donut_chart",
  "area_chart",
  "gantt",
  "map_view",
]);

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
      feedback: {},
      inspectorOpen: true,
      activeContext: "fleet",
      pinnedBlocks: [],
      appendTurn: (conversationId, turn) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  turns: [...conversation.turns, turn],
                  lastMessageAt: turn.createdAt,
                }
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
      deleteConversation: (conversationId) =>
        set((state) => {
          const remaining = state.conversations.filter((conversation) => conversation.id !== conversationId);
          const conversations = remaining.length > 0 ? remaining : [createBlankConversation()];
          const currentStillExists = conversations.some((conversation) => conversation.id === state.currentConversationId);
          return {
            conversations,
            currentConversationId: currentStillExists ? state.currentConversationId : conversations[0].id,
            pinnedBlocks: state.pinnedBlocks.filter((block) => block.conversationId !== conversationId),
          };
        }),
      replaceConversationPins: (conversationId, blocks) =>
        set((state) => ({
          pinnedBlocks: [
            ...state.pinnedBlocks.filter((block) => block.conversationId !== conversationId),
            ...blocks,
          ],
        })),
      selectConversation: (conversationId) => set({ currentConversationId: conversationId }),
      setConversationTitle: (conversationId, title) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, title } : conversation,
          ),
        })),
      setFeedback: (turnId, vote) =>
        set((state) => {
          if (state.feedback[turnId] === vote) {
            const next = { ...state.feedback };
            delete next[turnId];
            return { feedback: next };
          }
          return { feedback: { ...state.feedback, [turnId]: vote } };
        }),
      setActiveContext: (context) => set({ activeContext: context }),
      toggleConversationPin: (conversationId) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, pinned: !conversation.pinned } : conversation,
          ),
        })),
      toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
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
    }),
    {
      name: "nag-ai-renderer-fullpage-v3",
      version: 3,
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        feedback: state.feedback,
        inspectorOpen: state.inspectorOpen,
        activeContext: state.activeContext,
        pinnedBlocks: state.pinnedBlocks,
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

function summarizeToolResult(result: ToolResult): string {
  if (result.status === "error") return result.error ?? "Tool returned an error";
  if (typeof result.text === "string" && result.text.trim()) return result.text.trim().slice(0, 180);
  if (result.data && typeof result.data === "object") return "Đã lấy dữ liệu nội bộ Nguyên Anh";
  return "Tool completed";
}

function getReasoningStepLabel(step: ReasoningStep) {
  const summary = step.resultSummary?.trim();
  if (summary) return summary;
  if (step.status === "running") return "Đang xử lý";
  if (step.status === "error") return "Có lỗi khi xử lý";
  return "Đã hoàn tất";
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

function withContextInstruction(text: string, context: WorkContext): string {
  return `${contextOptions[context].instruction}\n\nCâu hỏi người dùng: ${text}`;
}

function toApiMessages(turns: Turn[], nextUserText: string, context: WorkContext): ApiChatMessage[] {
  const messages = turns
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn): ApiChatMessage => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    }));
  return [...messages, { role: "user", content: withContextInstruction(nextUserText, context) }];
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

function conversationHasVehicleContext(conversation: Conversation) {
  const text = conversation.turns.map((turn) => turn.text).join(" ").toLowerCase();
  return /xe|biển|vehicle|truck/.test(text);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function copyText(value: string) {
  return navigator.clipboard?.writeText(value).catch(() => undefined);
}

function buildShareUrl(conversationId: string, turnId?: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("share", "1");
  url.searchParams.set("conversation", conversationId);
  if (turnId) url.hash = turnId;
  return url.toString();
}

function LogoMark({
  imageClass = "size-6",
  sizeClass = "size-8",
}: {
  imageClass?: string;
  sizeClass?: string;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] border border-[#EE2D2D]/15 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_20px_-16px_rgba(238,45,45,0.85)]",
        sizeClass,
      )}
    >
      <Image
        alt=""
        aria-hidden
        className={cn("object-contain", imageClass)}
        height={48}
        src="/icons/nguyen-anh-ai-48.png"
        width={48}
      />
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

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-black/10 bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300">
      {children}
    </span>
  );
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-[12px] font-semibold text-white shadow-2xl">
      {message}
    </div>
  );
}

function FilterChip({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
        active
          ? "bg-[rgba(0,122,255,0.10)] text-[#0A66E0] dark:text-[#6DB4FF]"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/15",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </button>
  );
}

function HistorySidebar({
  conversations,
  currentConversationId,
  onNew,
  onSelect,
  readOnly,
}: {
  conversations: Conversation[];
  currentConversationId: string;
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  readOnly: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "pinned" && !conversation.pinned) return false;
      if (filter === "vehicles" && !conversationHasVehicleContext(conversation)) return false;
      if (!query) return true;
      return conversation.title.toLowerCase().includes(query);
    });
  }, [conversations, filter, search]);

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden border-r border-black/[0.07] bg-white dark:border-white/10 dark:bg-zinc-950 md:flex">
      <div className="flex shrink-0 flex-col gap-2 border-b border-black/[0.07] p-3 dark:border-white/10">
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-[9px] bg-[#007AFF] text-[13px] font-bold text-white shadow-[0_8px_18px_-12px_rgba(0,122,255,0.9)] transition hover:bg-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#7CB6FF]/70 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={readOnly}
          onClick={onNew}
          type="button"
        >
          <Plus size={14} strokeWidth={2.4} />
          Cuộc trò chuyện mới
        </button>
        <label className="relative block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" size={13} />
          <input
            aria-label="Tìm cuộc trò chuyện"
            className="h-8 w-full rounded-lg border border-black/10 bg-zinc-50 pl-8 pr-8 text-[12px] outline-none transition focus:bg-white focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/[0.06] dark:focus:bg-zinc-900"
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Tìm cuộc trò chuyện..."
            value={search}
          />
          {search && (
            <button
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-black/5"
              onClick={() => setSearch("")}
              type="button"
            >
              <X size={12} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} count={conversations.length} label="Tất cả" onClick={() => setFilter("all")} />
          <FilterChip
            active={filter === "pinned"}
            count={conversations.filter((conversation) => conversation.pinned).length}
            label="Đã ghim"
            onClick={() => setFilter("pinned")}
          />
          <FilterChip
            active={filter === "vehicles"}
            count={conversations.filter(conversationHasVehicleContext).length}
            label="Có xe"
            onClick={() => setFilter("vehicles")}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.map((conversation) => {
          const active = conversation.id === currentConversationId;
          return (
            <button
              className={cn(
                "mb-1 w-full rounded-lg border-l-[3px] px-2.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                active
                  ? "border-l-[#007AFF] bg-[rgba(0,122,255,0.09)]"
                  : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.06]",
              )}
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                {conversation.pinned && <Star className="fill-[#FF9F0A] text-[#FF9F0A]" size={12} />}
                <span className="line-clamp-1 flex-1 text-[12.5px] font-bold text-zinc-950 dark:text-zinc-50">
                  {conversation.title}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">{relativeTime(conversation.lastMessageAt)}</span>
              </div>
              <div className="mt-1 line-clamp-1 text-[11px] text-zinc-400">
                {conversation.turns.length} lượt · {conversationHasVehicleContext(conversation) ? "đội xe" : "vận hành"}
              </div>
            </button>
          );
        })}
      </div>
      <div className="border-t border-black/[0.07] px-3 py-2 text-[11px] text-zinc-400 dark:border-white/10">
        <span className="font-semibold text-[#0A66E0] dark:text-[#6DB4FF]">⌘N</span> tạo nhanh
      </div>
    </aside>
  );
}

function ContextChip({
  active,
  children,
  disabled = false,
  icon,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 disabled:cursor-default disabled:opacity-60 sm:inline-flex",
        active
          ? "border-[rgba(0,122,255,0.25)] bg-[rgba(0,122,255,0.10)] text-[#0A66E0] dark:text-[#6DB4FF]"
          : "border-black/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function TopBar({
  activeContext,
  inspectorOpen,
  onContextChange,
  onQuickAction,
  onToggleInspector,
  readOnly,
  shareUrl,
}: {
  activeContext: WorkContext;
  inspectorOpen: boolean;
  onContextChange: (context: WorkContext) => void;
  onQuickAction: (message: string) => void;
  onToggleInspector: () => void;
  readOnly: boolean;
  shareUrl: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-black/[0.07] bg-white px-4 dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">Không gian AI NAG</div>
          <div className="text-[10.5px] text-zinc-400">Điều hành bê tông · công cụ trực tiếp</div>
        </div>
      </div>
      <div className="ml-2 flex gap-1.5">
        <ContextChip
          active={activeContext === "fleet"}
          disabled={readOnly}
          icon={<Truck size={13} />}
          onClick={() => onContextChange("fleet")}
        >
          Đội xe
        </ContextChip>
        <ContextChip
          active={activeContext === "production"}
          disabled={readOnly}
          icon={<BarChart3 size={13} />}
          onClick={() => onContextChange("production")}
        >
          Sản lượng
        </ContextChip>
        <ContextChip
          active={activeContext === "maintenance"}
          disabled={readOnly}
          icon={<Wrench size={13} />}
          onClick={() => onContextChange("maintenance")}
        >
          Bảo trì
        </ContextChip>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {readOnly && (
          <span className="hidden rounded-full border border-black/10 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-bold text-zinc-500 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300 sm:inline-flex">
            Chỉ xem
          </span>
        )}
        <button
          className="hidden h-8 items-center gap-1.5 rounded-lg border border-black/10 px-2.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10 lg:flex"
          onClick={() => {
            void copyText(shareUrl);
            onQuickAction("Đã sao chép link chỉ xem");
          }}
          type="button"
        >
          <Share2 size={13} /> Chia sẻ
        </button>
        <button
          className="hidden h-8 items-center gap-1.5 rounded-lg border border-black/10 px-2.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10 lg:flex"
          disabled={readOnly}
          onClick={() => {
            void fetch("/api/reports", { method: "POST" }).catch(() => undefined);
            onQuickAction("Đang chuẩn bị báo cáo");
          }}
          type="button"
        >
          <Download size={13} /> Lưu báo cáo
        </button>
        <button
          aria-label={inspectorOpen ? "Ẩn bảng ngữ cảnh" : "Hiện bảng ngữ cảnh"}
          className="grid size-8 place-items-center rounded-lg border border-black/10 text-zinc-500 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          onClick={onToggleInspector}
          type="button"
        >
          <Minimize2 size={14} />
        </button>
        <Avatar sizeClass="size-7" />
      </div>
    </header>
  );
}

function ConversationHeader({
  conversation,
  onDelete,
  onRename,
  onTogglePin,
  readOnly,
}: {
  conversation: Conversation;
  onDelete: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);

  useEffect(() => {
    setDraft(conversation.title);
    setEditing(false);
  }, [conversation.id, conversation.title]);

  const save = () => {
    const next = draft.trim() || "Cuộc trò chuyện mới";
    onRename(next);
    setEditing(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[800px] items-center gap-2 border-b border-black/[0.06] px-1 pb-3 dark:border-white/10">
      {editing ? (
        <input
          autoFocus
          className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 text-[17px] font-extrabold text-zinc-950 outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") setEditing(false);
          }}
          value={draft}
        />
      ) : (
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-extrabold text-zinc-950 dark:text-zinc-50">{conversation.title}</h1>
          <p className="mt-1 text-[11px] text-zinc-400">
            {conversation.turns.filter((turn) => turn.role === "user").length} lượt hỏi · {relativeTime(conversation.lastMessageAt)}
          </p>
        </div>
      )}
      <button
        aria-label={conversation.pinned ? "Bỏ ghim" : "Ghim"}
        className={cn("icon-soft", conversation.pinned && "text-[#FF9F0A]")}
        disabled={readOnly}
        onClick={onTogglePin}
        type="button"
      >
        {conversation.pinned ? <Star className="fill-[#FF9F0A]" size={14} /> : <Pin size={14} />}
      </button>
      <button aria-label="Đổi tên" className="icon-soft" disabled={readOnly} onClick={() => setEditing(true)} type="button">
        <Edit3 size={14} />
      </button>
      <button
        aria-label="Xóa cuộc trò chuyện"
        className="icon-soft"
        disabled={readOnly}
        onClick={() => {
          if (window.confirm("Xóa cuộc trò chuyện này?")) onDelete();
        }}
        type="button"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function SlashMenu({ onPick, query }: { onPick: (text: string) => void; query: string }) {
  const filtered = slashCommands.filter((command) => {
    const normalized = query.toLowerCase();
    return !normalized || command.cmd.includes(normalized) || command.hint.toLowerCase().includes(normalized);
  });
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950">
      {filtered.map((command) => (
        <button
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:hover:bg-white/10"
          key={command.cmd}
          onClick={() => onPick(command.example)}
          type="button"
        >
          <Slash className="mt-0.5 text-[#0A66E0]" size={14} />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[12px] font-bold text-zinc-950 dark:text-zinc-50">{command.cmd}</span>
            <span className="block text-[11.5px] text-zinc-500">{command.hint}</span>
            <span className="mt-0.5 block truncate font-mono text-[10.5px] text-zinc-400">{command.example}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function AssistantToolbar({
  feedback,
  onCopy,
  onFeedback,
  onPinAll,
  onRegenerate,
  onShare,
}: {
  feedback?: FeedbackVote;
  onCopy: () => void;
  onFeedback: (vote: FeedbackVote) => void;
  onPinAll: () => void;
  onRegenerate: () => void;
  onShare: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <button
        aria-label="Hữu ích"
        className={cn("toolbar-btn", feedback === "up" && "border-[#34C759]/40 bg-[#34C759]/10 text-[#1F8E47]")}
        onClick={() => onFeedback("up")}
        type="button"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        aria-label="Chưa đúng"
        className={cn("toolbar-btn", feedback === "down" && "border-[#FF3B30]/40 bg-[#FF3B30]/10 text-[#C92A2A]")}
        onClick={() => onFeedback("down")}
        type="button"
      >
        <ThumbsDown size={13} />
      </button>
      <button aria-label="Sao chép câu trả lời" className="toolbar-btn" onClick={onCopy} type="button">
        <Copy size={13} /> Sao chép
      </button>
      <button aria-label="Trả lời lại" className="toolbar-btn" onClick={onRegenerate} type="button">
        <RefreshCcw size={13} /> Trả lời lại
      </button>
      <button aria-label="Chia sẻ tin nhắn" className="toolbar-btn" onClick={onShare} type="button">
        <Share2 size={13} /> Chia sẻ
      </button>
      <button aria-label="Ghim tất cả" className="toolbar-btn ml-auto" onClick={onPinAll} type="button">
        <Pin size={13} /> Ghim tất cả
      </button>
    </div>
  );
}

function ChatColumn({
  conversation,
  feedback,
  isBusy,
  onDelete,
  onFeedback,
  onPinAll,
  onRegenerate,
  onRename,
  onSend,
  onToast,
  onTogglePin,
  readOnly,
}: {
  conversation: Conversation;
  feedback: Record<string, FeedbackVote>;
  isBusy: boolean;
  onDelete: () => void;
  onFeedback: (turnId: string, vote: FeedbackVote) => void;
  onPinAll: () => void;
  onRegenerate: (turnId: string) => void;
  onRename: (title: string) => void;
  onSend: (text: string) => Promise<void>;
  onToast: (message: string) => void;
  onTogglePin: () => void;
  readOnly: boolean;
}) {
  const [input, setInput] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  const submit = useCallback(
    async (textOverride?: string) => {
      const trimmed = (textOverride ?? input).trim();
      if (!trimmed || isBusy || readOnly) return;
      setInput("");
      setSlashOpen(false);
      await onSend(trimmed);
    },
    [input, isBusy, onSend, readOnly],
  );

  useEffect(() => {
    const onFollowup = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (!detail?.text || readOnly) return;
      setInput(detail.text);
      void submit(detail.text);
    };
    window.addEventListener("render:followup", onFollowup);
    return () => window.removeEventListener("render:followup", onFollowup);
  }, [readOnly, submit]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottomRef.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [conversation.turns]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#F7F7F8] dark:bg-zinc-900">
      <div className="shrink-0 px-5 pt-5">
        <ConversationHeader
          conversation={conversation}
          onDelete={onDelete}
          onRename={onRename}
          onTogglePin={onTogglePin}
          readOnly={readOnly}
        />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
        }}
        ref={scrollRef}
      >
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-3">
          {conversation.turns.length === 0 && (
            <div className="grid min-h-[48vh] place-items-center text-center">
              <div>
                <LogoMark imageClass="size-7" sizeClass="mx-auto size-10" />
                <h2 className="mt-4 text-lg font-extrabold text-zinc-950 dark:text-zinc-50">
                  Trợ lý điều hành đội xe bê tông
                </h2>
                <p className="mt-2 text-[13px] text-zinc-500">Hỏi nhanh về sản lượng, orders, xe và bảo trì.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0A66E0] transition hover:bg-[rgba(0,122,255,0.06)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-[#6DB4FF]"
                      disabled={readOnly}
                      key={prompt}
                      onClick={() => void submit(prompt)}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {conversation.turns.map((turn) =>
            turn.role === "user" ? (
              <div className="flex justify-end" key={turn.id}>
                <div className="max-w-[78%] rounded-[18px] rounded-br-md bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] px-3.5 py-2 text-[14px] leading-6 text-white shadow-[0_10px_30px_-22px_rgba(0,122,255,0.95)]">
                  {turn.text}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5" id={turn.id} key={turn.id}>
                <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#EE2D2D]/15 bg-white shadow-sm">
                    <Image
                      alt=""
                      aria-hidden
                      className="size-5 object-contain"
                      height={48}
                      src="/icons/nguyen-anh-ai-48.png"
                      width={48}
                    />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="font-bold text-zinc-700 dark:text-zinc-200">Trợ lý AI</span>
                    <span>·</span>
                    <span>Model nội bộ</span>
                    <span>·</span>
                    <span>{turn.status === "streaming" ? "Đang stream" : turn.status === "error" ? "Lỗi" : "Đã trả lời"}</span>
                    {turn.totalMs && <span>· {(turn.totalMs / 1000).toFixed(1)}s</span>}
                    {turn.regenerated && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">Lượt trả lời lại</span>}
                  </div>
                  {turn.reasoning.length > 0 && (
                    <div className="mb-2">
                      <ReasoningTree steps={turn.reasoning} totalMs={turn.totalMs} />
                    </div>
                  )}
                  <div className={cn("rounded-[14px] bg-transparent", readOnly && "pointer-events-none select-text")}>
                    <StreamView text={turn.text} streaming={turn.status === "streaming"} />
                  </div>
                  {turn.status !== "streaming" && !readOnly && (
                    <AssistantToolbar
                      feedback={feedback[turn.id]}
                      onCopy={() => {
                        void copyText(turn.text);
                        onToast("Đã sao chép câu trả lời");
                      }}
                      onFeedback={(vote) => onFeedback(turn.id, vote)}
                      onPinAll={onPinAll}
                      onRegenerate={() => onRegenerate(turn.id)}
                      onShare={() => {
                        void copyText(buildShareUrl(conversation.id, turn.id));
                        onToast("Đã sao chép link tới tin nhắn");
                      }}
                    />
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-4 pt-2">
        <div className="mx-auto w-full max-w-[800px]">
          {readOnly && (
            <div className="mb-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-center text-[12px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
              Link chia sẻ đang ở chế độ chỉ xem. Không thể gửi tin, ghim, sửa hoặc thực hiện hành động.
            </div>
          )}
          <div className="relative">
            {slashOpen && !readOnly && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30">
                <SlashMenu
                  onPick={(example) => {
                    setInput(`${example} `);
                    setSlashOpen(false);
                    textareaRef.current?.focus();
                  }}
                  query={input.startsWith("/") ? input.slice(1) : ""}
                />
              </div>
            )}
            <div className="rounded-2xl border border-black/10 bg-white p-2.5 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-zinc-950">
              <textarea
                aria-label="Nhập tin nhắn"
                className="max-h-36 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-[14px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                data-testid="chat-input"
                disabled={isBusy || readOnly}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setInput(next);
                  setSlashOpen(next.startsWith("/"));
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={readOnly ? "Chế độ chỉ xem" : "Hỏi tiếp về sản lượng, xe, orders... gõ / để gọi lệnh"}
                ref={textareaRef}
                rows={2}
                value={input}
              />
              <div className="flex items-center gap-1.5">
                <button aria-label="Đính kèm" className="composer-tool" disabled={readOnly} onClick={() => onToast("Đính kèm đang chờ cấu hình")} type="button">
                  <Paperclip size={14} />
                </button>
                <button aria-label="Lệnh nhanh" className="composer-tool" disabled={readOnly} onClick={() => setSlashOpen((open) => !open)} type="button">
                  <Slash size={14} />
                </button>
                <button aria-label="Gắn thẻ" className="composer-tool" disabled={readOnly} onClick={() => setInput((value) => `${value}@`)} type="button">
                  <AtSign size={14} />
                </button>
                <button aria-label="Nhập giọng nói" className="composer-tool" disabled={readOnly} onClick={() => onToast("Nhập giọng nói đang chờ cấu hình")} type="button">
                  <Mic size={14} />
                </button>
                <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-zinc-400 sm:flex">
                  <Kbd>⌘↵</Kbd> gửi
                </span>
                <button
                  aria-label="Gửi"
                  className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] text-white shadow-[0_2px_6px_rgba(0,122,255,0.32)] transition disabled:cursor-not-allowed disabled:grayscale focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  data-testid="send-button"
                  disabled={!input.trim() || isBusy || readOnly}
                  onClick={() => void submit()}
                  type="button"
                >
                  {isBusy ? <Loader2 className="animate-spin" size={15} /> : <ArrowUp size={15} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Inspector({
  blocks,
  onQuickAction,
  readOnly,
  reasoning,
}: {
  blocks: PinnedBlock[];
  onQuickAction: (message: string) => void;
  readOnly: boolean;
  reasoning: ReasoningStep[];
}) {
  const [tab, setTab] = useState<InspectorTab>("tools");
  const chartBlocks = blocks.filter((block) => inspectorChartTypes.has(block.data.type));
  const tabs: Array<{ key: InspectorTab; label: string; icon: ReactNode }> = [
    { key: "tools", label: "Công cụ", icon: <Activity size={13} /> },
    { key: "charts", label: "Biểu đồ", icon: <BarChart3 size={13} /> },
    { key: "actions", label: "Hành động", icon: <Gauge size={13} /> },
  ];

  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[52vh] min-w-0 flex-col overflow-hidden rounded-t-2xl border-t border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 lg:static lg:max-h-none lg:w-[340px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none">
      <header className="shrink-0 border-b border-black/[0.07] px-3.5 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <LogoMark imageClass="size-5" sizeClass="size-7 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">Bảng ngữ cảnh</h2>
            <p className="text-[10.5px] text-zinc-400">Công cụ, biểu đồ, hành động cho câu trả lời</p>
          </div>
          <MoreHorizontal className="text-zinc-400" size={16} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-white/10">
          {tabs.map((item) => (
            <button
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                tab === item.key ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-500",
              )}
              key={item.key}
              onClick={() => setTab(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {tab === "tools" && (
          <div>
            {reasoning.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/10 bg-zinc-50 p-4 text-center text-[12px] text-zinc-400 dark:border-white/10 dark:bg-white/[0.04]">
                Lượt gọi công cụ sẽ xuất hiện ở đây khi AI bắt đầu phân tích.
              </div>
            )}
            {reasoning.length > 0 && (
              <div className="relative space-y-2 pl-2">
                {reasoning.length > 1 && (
                  <span className="absolute left-[17px] top-4 bottom-4 w-px bg-[rgba(0,122,255,0.22)] dark:bg-[rgba(109,180,255,0.24)]" />
                )}
                {reasoning.map((step) => {
                  const label = getReasoningStepLabel(step);
                  const fallbackDetail = stringifyCell(isRecord(step.input) ? step.input.status : "");
                  return (
                    <button
                      className="group relative flex w-full items-start gap-2 rounded-xl p-0 text-left transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35"
                      disabled={readOnly}
                      key={step.id}
                      onClick={() => onQuickAction(label)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "z-10 mt-2 grid size-5 shrink-0 place-items-center rounded-full border-2 bg-white dark:bg-zinc-950",
                          step.status === "done"
                            ? "border-[#34C759] text-[#1F8E47]"
                            : step.status === "error"
                              ? "border-[#FF3B30] text-[#C8281D]"
                              : "border-[#007AFF] text-[#0A66E0]",
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            step.status === "done"
                              ? "bg-[#34C759]"
                              : step.status === "error"
                                ? "bg-[#FF3B30]"
                                : "animate-pulse bg-[#007AFF]",
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1 rounded-xl border border-black/10 bg-zinc-50 p-2.5 transition group-hover:border-[#007AFF]/40 group-hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:group-hover:bg-white/[0.08]">
                        <span className="line-clamp-2 block text-[11.5px] font-bold leading-4 text-zinc-800 dark:text-zinc-100">{label}</span>
                        {!step.resultSummary && fallbackDetail && (
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-500">{fallbackDetail}</span>
                        )}
                        {step.durationMs !== undefined && <span className="mt-1 block font-mono text-[10px] text-zinc-400">{step.durationMs}ms</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "charts" && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[12px] font-extrabold text-zinc-900 dark:text-zinc-100">Biểu đồ đã render</span>
              <span className="rounded-full bg-[rgba(0,122,255,0.10)] px-2 py-0.5 text-[10px] font-bold text-[#0A66E0]">{chartBlocks.length}</span>
            </div>
            <div className="space-y-3">
              {chartBlocks.length === 0 && (
                <div className="rounded-xl border border-dashed border-black/10 bg-zinc-50 p-4 text-center text-[12px] text-zinc-400 dark:border-white/10 dark:bg-white/[0.04]">
                  Biểu đồ sẽ xuất hiện ở đây sau khi AI render.
                </div>
              )}
              {chartBlocks.map((block) => (
                <section
                  aria-label={block.data.title ?? block.data.type}
                  className={cn(
                    "min-w-0 rounded-xl focus-within:ring-2 focus-within:ring-[#007AFF]/35",
                    readOnly && "pointer-events-none select-text",
                  )}
                  key={block.blockId}
                >
                  <RenderBlock data={block.data} />
                </section>
              ))}
            </div>
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-2">
            {[
              { icon: <FileText size={14} />, label: "Tạo báo cáo ca hiện tại", message: "Đang chuẩn bị báo cáo ca" },
              { icon: <BarChart3 size={14} />, label: "Mở biểu đồ tương tác", message: "Đang mở canvas biểu đồ" },
              { icon: <Clipboard size={14} />, label: "Sao chép tóm tắt vận hành", message: "Đã sao chép tóm tắt" },
              { icon: <Wrench size={14} />, label: "Kiểm tra bảo trì xe ghim", message: "Đang kiểm tra bảo trì" },
            ].map((action) => (
              <button
                className="flex w-full items-center gap-2 rounded-xl border border-black/10 bg-zinc-50 p-2.5 text-left text-[12px] font-bold text-zinc-800 transition hover:border-[#007AFF]/40 hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]"
                disabled={readOnly}
                key={action.label}
                onClick={() => onQuickAction(action.message)}
                type="button"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-white text-[#0A66E0] dark:bg-zinc-950 dark:text-[#6DB4FF]">
                  {action.icon}
                </span>
                {action.label}
              </button>
            ))}
            {blocks.length > 0 && (
              <div className="pt-3">
                <div className="mb-2 text-[11px] font-extrabold uppercase text-zinc-400">Render blocks</div>
                <div className="flex flex-wrap gap-1.5">
                  {blocks.map((block) => (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-[10.5px] text-zinc-500 dark:bg-white/10" key={block.blockId}>
                      {block.data.type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export function RendererShell() {
  const searchParams = useSearchParams();
  const conversations = useRendererStore((state) => state.conversations);
  const currentConversationId = useRendererStore((state) => state.currentConversationId);
  const feedback = useRendererStore((state) => state.feedback);
  const inspectorOpen = useRendererStore((state) => state.inspectorOpen);
  const activeContext = useRendererStore((state) => state.activeContext);
  const pinnedBlocks = useRendererStore((state) => state.pinnedBlocks);
  const appendTurn = useRendererStore((state) => state.appendTurn);
  const createConversation = useRendererStore((state) => state.createConversation);
  const deleteConversation = useRendererStore((state) => state.deleteConversation);
  const replaceConversationPins = useRendererStore((state) => state.replaceConversationPins);
  const selectConversation = useRendererStore((state) => state.selectConversation);
  const setConversationTitle = useRendererStore((state) => state.setConversationTitle);
  const setFeedback = useRendererStore((state) => state.setFeedback);
  const setActiveContext = useRendererStore((state) => state.setActiveContext);
  const toggleConversationPin = useRendererStore((state) => state.toggleConversationPin);
  const toggleInspector = useRendererStore((state) => state.toggleInspector);
  const updateAssistantTurn = useRendererStore((state) => state.updateAssistantTurn);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readOnly =
    searchParams.get("share") === "1" ||
    searchParams.get("readonly") === "1" ||
    searchParams.get("view") === "share";
  const sharedConversationId = searchParams.get("conversation");

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const currentConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === currentConversationId) ??
      conversations[0],
    [conversations, currentConversationId],
  );

  useEffect(() => {
    if (!sharedConversationId || sharedConversationId === currentConversationId) return;
    if (conversations.some((conversation) => conversation.id === sharedConversationId)) {
      selectConversation(sharedConversationId);
    }
  }, [conversations, currentConversationId, selectConversation, sharedConversationId]);

  const currentPins = useMemo(
    () => (currentConversation ? extractPinnedBlocks(currentConversation) : []),
    [currentConversation],
  );

  const shareUrl = useMemo(
    () => (currentConversation ? buildShareUrl(currentConversation.id) : ""),
    [currentConversation],
  );

  const latestReasoning = useMemo(() => {
    const turns = currentConversation?.turns ?? [];
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn.role === "assistant" && turn.reasoning.length > 0) return turn.reasoning;
    }
    return [];
  }, [currentConversation]);

  useEffect(() => {
    if (!currentConversation || readOnly) return;
    replaceConversationPins(currentConversation.id, currentPins);
  }, [currentConversation, currentPins, readOnly, replaceConversationPins]);

  const isBusy = currentConversation?.turns.some((turn) => turn.role === "assistant" && turn.status === "streaming") ?? false;

  const sendMessage = useCallback(
    async (text: string, regenerated = false) => {
      const conversation = currentConversation;
      if (!conversation || isBusy || readOnly) return;

      const now = new Date().toISOString();
      const userTurn: UserTurn = {
        id: uid("user"),
        role: "user",
        text,
        createdAt: now,
      };
      const assistantTurn: AssistantTurn = {
        id: uid("assistant"),
        role: "assistant",
        text: "",
        reasoning: [],
        status: "streaming",
        createdAt: new Date().toISOString(),
        regenerated,
      };
      const requestMessages = toApiMessages(conversation.turns, text, activeContext);

      if (conversation.turns.length === 0 && conversation.title === "Cuộc trò chuyện mới") {
        setConversationTitle(conversation.id, text.slice(0, 72));
      }

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
          {
            injectSystemPrompt: true,
            maxIterations: 4,
          },
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
          text: accumulated || `Đã xảy ra lỗi: ${message}`,
        });
      }
    },
    [activeContext, appendTurn, currentConversation, isBusy, readOnly, setConversationTitle, updateAssistantTurn],
  );

  const regenerateTurn = useCallback(
    (assistantTurnId: string) => {
      if (readOnly) return;
      const turns = currentConversation?.turns ?? [];
      const index = turns.findIndex((turn) => turn.id === assistantTurnId);
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const turn = turns[cursor];
        if (turn.role === "user") {
          showToast("Đang trả lời lại");
          void sendMessage(turn.text, true);
          return;
        }
      }
    },
    [currentConversation, readOnly, sendMessage, showToast],
  );

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ intent?: string; payload?: unknown; id?: string }>).detail;
      if (!detail?.intent) return;
      if (readOnly) {
        showToast("Link chia sẻ chỉ được xem");
        return;
      }
      showToast(`Action: ${detail.intent}`);

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
      }).catch(() => undefined);
    };
    window.addEventListener("render:action", onAction);
    return () => window.removeEventListener("render:action", onAction);
  }, [readOnly, showToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (readOnly) return;
        createConversation();
      }
      if (event.key === "\\") {
        event.preventDefault();
        toggleInspector();
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
  }, [conversations, createConversation, currentConversationId, readOnly, selectConversation, toggleInspector]);

  if (!currentConversation) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-[#F7F7F8] text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
      <TopBar
        activeContext={activeContext}
        inspectorOpen={inspectorOpen}
        onContextChange={(context) => {
          if (readOnly) return;
          setActiveContext(context);
          showToast(`Đã chuyển hướng: ${contextOptions[context].label}`);
        }}
        onQuickAction={showToast}
        onToggleInspector={toggleInspector}
        readOnly={readOnly}
        shareUrl={shareUrl}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!readOnly && (
          <HistorySidebar
            conversations={conversations}
            currentConversationId={currentConversation.id}
            onNew={() => createConversation()}
            onSelect={selectConversation}
            readOnly={false}
          />
        )}
        <ChatColumn
          conversation={currentConversation}
          feedback={feedback}
          isBusy={isBusy}
          onDelete={() => {
            if (readOnly) return;
            deleteConversation(currentConversation.id);
            showToast("Đã xóa cuộc trò chuyện");
          }}
          onFeedback={(turnId, vote) => {
            if (readOnly) return;
            setFeedback(turnId, vote);
          }}
          onPinAll={() => {
            if (readOnly) return;
            replaceConversationPins(currentConversation.id, currentPins);
            showToast("Đã ghim các khối render");
          }}
          onRegenerate={regenerateTurn}
          onRename={(title) => {
            if (readOnly) return;
            setConversationTitle(currentConversation.id, title);
            showToast("Đã đổi tên cuộc trò chuyện");
          }}
          onSend={sendMessage}
          onToast={showToast}
          onTogglePin={() => {
            if (readOnly) return;
            toggleConversationPin(currentConversation.id);
            showToast(currentConversation.pinned ? "Đã bỏ ghim cuộc trò chuyện" : "Đã ghim cuộc trò chuyện");
          }}
          readOnly={readOnly}
        />
        {inspectorOpen && (
          <Inspector
            blocks={pinnedBlocks.filter((block) => block.conversationId === currentConversation.id)}
            onQuickAction={showToast}
            readOnly={readOnly}
            reasoning={latestReasoning}
          />
        )}
      </div>
      <Toast message={toast} />
    </div>
  );
}
