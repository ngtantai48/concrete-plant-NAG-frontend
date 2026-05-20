"use client";

import {
  Activity,
  ArrowUp,
  BarChart3,
  Copy,
  Download,
  Edit3,
  Eraser,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Search,
  Share2,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cn } from "@/lib/utils";
import chatApi from "@/services/chat.service";
import reportApi from "@/services/report.service";
import speechApi from "@/services/speech.service";
import type {
  ChatContentBlock,
  ChatMessage as ApiChatMessage,
  ToolResult,
} from "@/types/chat";
import type { AiGeneratedReport, AiReportBlock, CreateAiReportPayload } from "@/types/report";

import { ReasoningTree } from "./ReasoningTree";
import { RenderBlock } from "./RenderBlock";
import { StreamView } from "./StreamView";
import { assetHref, formatBytes } from "./blocks/asset-url";
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

type UserTurnAttachment = {
  kind: "image" | "file";
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type UserTurn = {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
  attachments?: UserTurnAttachment[];
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
  savedReports: AiGeneratedReport[];
  feedback: Record<string, FeedbackVote>;
  inspectorOpen: boolean;
  activeContext: WorkContext;
  appendTurn: (conversationId: string, turn: Turn) => void;
  createConversation: () => string;
  deleteConversation: (conversationId: string) => void;
  replaceConversationPins: (conversationId: string, blocks: PinnedBlock[]) => void;
  addConversationPins: (conversationId: string, blocks: PinnedBlock[]) => void;
  saveReport: (report: AiGeneratedReport) => void;
  selectConversation: (conversationId: string) => void;
  setConversationTitle: (conversationId: string, title: string) => void;
  setFeedback: (turnId: string, vote: FeedbackVote) => void;
  setActiveContext: (context: WorkContext) => void;
  toggleConversationPin: (conversationId: string) => void;
  toggleInspector: () => void;
  updateAssistantTurn: (
    conversationId: string,
    turnId: string,
    patch: Partial<AssistantTurn>
  ) => void;
};

type ComposerAttachment = {
  id: string;
  kind: "image" | "file";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  textContent?: string;
  base64?: string;
};

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_SIZE_WARN_BYTES = 2 * 1024 * 1024;
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TEXT_MAX_CHARS = 4000;
const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "csv",
  "md",
  "markdown",
  "json",
  "log",
  "tsv",
  "yaml",
  "yml",
  "xml",
  "ini",
  "env",
]);

function isTextLikeMime(mime: string, filename: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/x-yaml"
  )
    return true;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return TEXT_FILE_EXTENSIONS.has(ext);
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsBase64Stripped(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader: unexpected non-string result"));
        return;
      }
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function buildContentBlocks(
  text: string,
  attachments: ComposerAttachment[]
): string | ChatContentBlock[] {
  const imageAttachments = attachments.filter(
    (item): item is ComposerAttachment & { base64: string } =>
      item.kind === "image" && Boolean(item.base64)
  );
  const textAttachments = attachments.filter(
    (item) => item.kind === "file" && item.textContent
  );

  const blocks: ChatContentBlock[] = [];
  const textParts: string[] = [];

  for (const attachment of textAttachments) {
    const truncated = (attachment.textContent ?? "").length > ATTACHMENT_TEXT_MAX_CHARS;
    const body = (attachment.textContent ?? "").slice(0, ATTACHMENT_TEXT_MAX_CHARS);
    const trailer = truncated ? "\n... (đã cắt bớt)" : "";
    textParts.push(
      `> [Tệp đính kèm] ${attachment.filename} · ${attachment.mimeType || "unknown"} · ${formatAttachmentSize(attachment.sizeBytes)}\n\`\`\`\n${body}${trailer}\n\`\`\``
    );
  }

  if (text.trim()) textParts.push(text.trim());

  const combinedText = textParts.join("\n\n").trim();

  if (imageAttachments.length === 0) {
    return combinedText;
  }

  if (combinedText) {
    blocks.push({ type: "text", text: combinedText });
  }

  for (const image of imageAttachments) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mimeType || "image/jpeg",
        data: image.base64,
      },
    });
  }

  return blocks;
}

const suggestedPrompts = [
  "Cho tôi tổng quan sản lượng và đội xe hôm nay",
  "Xe nào sẵn sàng ca chiều?",
  "Lọc top xe theo quãng đường",
];

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
      savedReports: [],
      appendTurn: (conversationId, turn) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  turns: [...conversation.turns, turn],
                  lastMessageAt: turn.createdAt,
                }
              : conversation
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
          const remaining = state.conversations.filter(
            (conversation) => conversation.id !== conversationId
          );
          const conversations = remaining.length > 0 ? remaining : [createBlankConversation()];
          const currentStillExists = conversations.some(
            (conversation) => conversation.id === state.currentConversationId
          );
          return {
            conversations,
            currentConversationId: currentStillExists
              ? state.currentConversationId
              : conversations[0].id,
            pinnedBlocks: state.pinnedBlocks.filter(
              (block) => block.conversationId !== conversationId
            ),
          };
        }),
      replaceConversationPins: (conversationId, blocks) =>
        set((state) => ({
          pinnedBlocks: [
            ...state.pinnedBlocks.filter((block) => block.conversationId !== conversationId),
            ...blocks,
          ],
        })),
      addConversationPins: (conversationId, blocks) =>
        set((state) => {
          const existing = state.pinnedBlocks;
          const merged = [...existing];
          for (const incoming of blocks) {
            const dupIndex = merged.findIndex(
              (item) =>
                item.conversationId === conversationId && item.blockId === incoming.blockId
            );
            if (dupIndex >= 0) merged[dupIndex] = incoming;
            else merged.push(incoming);
          }
          return { pinnedBlocks: merged };
        }),
      saveReport: (report) =>
        set((state) => ({
          savedReports: [
            report,
            ...state.savedReports.filter((item) => item.id !== report.id),
          ].slice(0, 20),
        })),
      selectConversation: (conversationId) => set({ currentConversationId: conversationId }),
      setConversationTitle: (conversationId, title) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, title } : conversation
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
            conversation.id === conversationId
              ? { ...conversation, pinned: !conversation.pinned }
              : conversation
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
                    turn.id === turnId && turn.role === "assistant" ? { ...turn, ...patch } : turn
                  ),
                  lastMessageAt: new Date().toISOString(),
                }
              : conversation
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
        savedReports: state.savedReports,
      }),
    }
  )
);

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 60_000) return "vừa xong";
  if (diffMs < 86_400_000) {
    return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(
      new Date(value)
    );
  }
  if (diffMs < 172_800_000) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(new Date(value));
}

function summarizeToolResult(result: ToolResult): string {
  if (result.status === "error") return result.error ?? "Tool returned an error";
  if (result.tool === "executeCode") {
    const data = isRecord(result.data) ? result.data : {};
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "";
    const artifacts = isRecord(data.artifacts) ? data.artifacts : {};
    const totalRows = typeof artifacts.totalRows === "number" ? artifacts.totalRows : undefined;
    if (title && totalRows) return `Đã tạo ${title} · ${totalRows} artifact`;
    if (title) return `Đã tạo ${title}`;
    return "Đã tạo biểu đồ / artifact";
  }
  if (typeof result.text === "string" && result.text.trim())
    return result.text.trim().slice(0, 180);
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
  if (name === "executeCode") return "executeCode";
  if (name === "getTodayOrders" || name === "getOrdersByStatus") return "driver_schedule";
  if (name === "getVehicleStatus") return "vehicle_search";
  if (name === "getMaintenanceForecast") return "maintenance_log";
  if (name === "dispatch_action") return "dispatch_action";
  if (name.toLowerCase().includes("vehicle")) return "vehicle_search";
  if (name.toLowerCase().includes("maintenance")) return "maintenance_log";
  return "production_query";
}

function compactToolArgsForReasoning(name: string, args: Record<string, unknown>) {
  if (name !== "executeCode") return args;
  return {
    intent: args.intent,
    title: args.title,
  };
}

// Backend đã quản lý short/long-term memory qua X-Chat-Session-Id.
// Frontend chỉ cần gửi lại bối cảnh gần nhất để giảm token: 3 lượt user + 3 lượt assistant
// gần nhất (6 turns). Bộ nhớ xa hơn backend tự inject từ session bucket.
const RECENT_HISTORY_TURN_LIMIT = 6;

function toApiMessages(
  turns: Turn[],
  nextUserContent: string | ChatContentBlock[]
): ApiChatMessage[] {
  const nonEmptyTurns = turns.filter((turn) => turn.text.trim().length > 0);
  const recentTurns = nonEmptyTurns.slice(-RECENT_HISTORY_TURN_LIMIT);
  const messages = recentTurns.map(
    (turn): ApiChatMessage => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    })
  );
  return [...messages, { role: "user", content: nextUserContent }];
}

function extractBlocksFromTurn(
  conversationId: string,
  turn: AssistantTurn
): PinnedBlock[] {
  const blocks = new Map<string, PinnedBlock>();
  for (const chunk of parseStream(turn.text)) {
    if (chunk.kind !== "block") continue;
    const parsed = renderBlockDataSchema.safeParse(chunk.data);
    if (!parsed.success) continue;
    blocks.set(parsed.data.id, {
      blockId: parsed.data.id,
      conversationId,
      createdAt: turn.createdAt,
      data: parsed.data,
    });
  }
  return [...blocks.values()];
}

function extractPinnedBlocks(conversation: Conversation): PinnedBlock[] {
  const blocks = new Map<string, PinnedBlock>();
  for (const turn of conversation.turns) {
    if (turn.role !== "assistant") continue;
    for (const block of extractBlocksFromTurn(conversation.id, turn)) {
      blocks.set(block.blockId, block);
    }
  }
  return [...blocks.values()];
}

function conversationHasVehicleContext(conversation: Conversation) {
  const text = conversation.turns
    .map((turn) => turn.text)
    .join(" ")
    .toLowerCase();
  return /xe|biển|vehicle|truck/.test(text);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

function copyText(value: string) {
  return navigator.clipboard?.writeText(value).catch(() => undefined);
}

function downloadBase64File(filename: string, base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildShareUrl(conversationId: string, turnId?: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("share", "1");
  url.searchParams.set("conversation", conversationId);
  if (turnId) url.hash = turnId;
  return url.toString();
}

function getRenderBlockTitle(data: RenderBlockData) {
  return "title" in data && typeof data.title === "string" ? data.title : undefined;
}

function summarizePinnedConversation(conversation: Conversation, blocks: PinnedBlock[]) {
  const title = conversation.title.trim() || "Cuộc trò chuyện đã ghim";
  const blockCount = blocks.length;
  const chartCount = blocks.filter((block) => inspectorChartTypes.has(block.data.type)).length;
  const tableCount = blocks.filter((block) => block.data.type === "table").length;

  return {
    title,
    meta: [
      blockCount ? `${blockCount} khối` : undefined,
      chartCount ? `${chartCount} biểu đồ` : undefined,
      tableCount ? `${tableCount} bảng` : undefined,
      relativeTime(conversation.lastMessageAt),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function buildReportPayload(
  conversation: Conversation,
  blocks: PinnedBlock[],
  activeContext: WorkContext,
  shareUrl: string
): CreateAiReportPayload {
  return {
    conversationId: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    activeContext,
    shareUrl,
    turns: conversation.turns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      text: turn.text,
      createdAt: turn.createdAt,
      status: turn.role === "assistant" ? turn.status : undefined,
      totalMs: turn.role === "assistant" ? turn.totalMs : undefined,
    })),
    blocks: blocks.map(
      (block): AiReportBlock => ({
        id: block.blockId,
        type: block.data.type,
        title: getRenderBlockTitle(block.data),
        createdAt: block.createdAt,
        data: block.data,
      })
    ),
  };
}

type InspectorAttachment = {
  id: string;
  kind: "report" | "file" | "image";
  title: string;
  filename: string;
  href: string;
  meta: string;
  createdAt: string;
};

function joinAttachmentMeta(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function buildBlockAttachment(block: PinnedBlock): InspectorAttachment | null {
  const { data } = block;
  if (data.type !== "file" && data.type !== "image") return null;

  const fallbackName =
    data.type === "image" ? `ai-image-${block.blockId}.png` : `ai-file-${block.blockId}`;
  const filename = data.filename ?? fallbackName;
  const title = data.title ?? filename;
  const kindLabel = data.type === "image" ? "Ảnh do AI tạo" : "Tệp do AI tạo";
  const href = assetHref(data, { download: true });

  if (!href) return null;

  return {
    id: block.blockId,
    kind: data.type,
    title,
    filename,
    href,
    meta: joinAttachmentMeta([
      kindLabel,
      data.mimeType,
      formatBytes(data.sizeBytes),
      relativeTime(block.createdAt),
    ]),
    createdAt: block.createdAt,
  };
}

function buildReportAttachment(report: AiGeneratedReport): InspectorAttachment | null {
  const href = assetHref(
    { base64: report.pdfBase64, mimeType: report.mimeType },
    { download: true }
  );
  if (!href) return null;

  return {
    id: report.id,
    kind: "report",
    title: report.title || "Báo cáo vận hành",
    filename: report.filename,
    href,
    meta: joinAttachmentMeta([
      "Báo cáo PDF",
      formatBytes(report.sizeBytes),
      report.blockCount ? `${report.blockCount} khối` : undefined,
      relativeTime(report.createdAt),
    ]),
    createdAt: report.createdAt,
  };
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
        sizeClass
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

function Avatar({
  initials = "NA",
  sizeClass = "size-8",
}: {
  initials?: string;
  sizeClass?: string;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#FFC93C,#FF8A3C)] text-xs font-extrabold text-white",
        sizeClass
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

function ShortcutsDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;
  const rows: Array<{ keys: string[]; label: string }> = [
    { keys: ["⌘", "↵"], label: "Gửi tin nhắn" },
    { keys: ["↵"], label: "Gửi tin nhắn (không có Shift)" },
    { keys: ["⌘", "N"], label: "Mở cuộc trò chuyện mới" },
    { keys: ["⌘", "\\"], label: "Ẩn / hiện bảng ngữ cảnh" },
    { keys: ["⌘", "["], label: "Cuộc trò chuyện trước" },
    { keys: ["⌘", "]"], label: "Cuộc trò chuyện sau" },
    { keys: ["Esc"], label: "Đóng menu / hộp thoại" },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Keyboard className="text-[#0A66E0]" size={16} />
            <h3 className="text-[14px] font-extrabold text-zinc-950 dark:text-zinc-50">
              Phím tắt
            </h3>
          </div>
          <button
            aria-label="Đóng"
            className="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </header>
        <ul className="divide-y divide-black/[0.05] px-4 py-2 dark:divide-white/10">
          {rows.map((row) => (
            <li className="flex items-center justify-between gap-3 py-2.5" key={row.label}>
              <span className="text-[12.5px] text-zinc-700 dark:text-zinc-200">{row.label}</span>
              <span className="flex items-center gap-1">
                {row.keys.map((key, index) => (
                  <Kbd key={`${row.label}-${index}-${key}`}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/15"
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
  collapsed,
  conversations,
  currentConversationId,
  onNew,
  onDelete,
  onToggleCollapse,
  pinnedBlocks,
  onSelect,
  readOnly,
}: {
  collapsed: boolean;
  conversations: Conversation[];
  currentConversationId: string;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
  onToggleCollapse: () => void;
  pinnedBlocks: PinnedBlock[];
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

  const pinnedConversationGroups = useMemo(() => {
    const byConversation = new Map<string, PinnedBlock[]>();
    pinnedBlocks.forEach((block) => {
      byConversation.set(block.conversationId, [
        ...(byConversation.get(block.conversationId) ?? []),
        block,
      ]);
    });

    return [...byConversation.entries()]
      .map(([conversationId, blocks]) => {
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) return null;
        return { blocks, conversation, summary: summarizePinnedConversation(conversation, blocks) };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (left, right) =>
          new Date(right.conversation.lastMessageAt).getTime() -
          new Date(left.conversation.lastMessageAt).getTime()
      );
  }, [conversations, pinnedBlocks]);

  if (collapsed) {
    return (
      <aside className="hidden w-[64px] shrink-0 flex-col overflow-hidden border-r border-black/[0.07] bg-white dark:border-white/10 dark:bg-zinc-950 md:flex">
        <div className="flex shrink-0 flex-col items-center gap-2 border-b border-black/[0.07] p-2 dark:border-white/10">
          <button
            aria-label="Mở lịch sử trò chuyện"
            className="grid size-10 place-items-center rounded-md border border-black/10 text-zinc-500 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
            onClick={onToggleCollapse}
            title="Mở lịch sử"
            type="button"
          >
            <PanelLeftOpen size={16} />
          </button>
          <button
            aria-label="Cuộc trò chuyện mới"
            className="grid size-10 place-items-center rounded-md bg-[#007AFF] text-white shadow-[0_8px_18px_-12px_rgba(0,122,255,0.9)] transition hover:bg-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#7CB6FF]/70 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={readOnly}
            onClick={onNew}
            title="Cuộc trò chuyện mới"
            type="button"
          >
            <Plus size={17} strokeWidth={2.4} />
          </button>
          <button
            aria-label="Tìm cuộc trò chuyện"
            className="grid size-10 place-items-center rounded-md border border-black/10 text-zinc-500 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
            onClick={onToggleCollapse}
            title="Tìm cuộc trò chuyện"
            type="button"
          >
            <Search size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {filtered.slice(0, 18).map((conversation) => {
            const active = conversation.id === currentConversationId;
            return (
              <button
                aria-label={conversation.title}
                className={cn(
                  "relative grid size-10 place-items-center rounded-md text-[12px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                  active
                    ? "bg-[rgba(0,122,255,0.12)] text-[#0A66E0] dark:text-[#6DB4FF]"
                    : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.08]"
                )}
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                title={conversation.title}
                type="button"
              >
                {conversation.title.trim().charAt(0).toUpperCase() || "C"}
                {conversation.pinned && (
                  <Star className="absolute right-1 top-1 fill-[#FF9F0A] text-[#FF9F0A]" size={9} />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden border-r border-black/[0.07] bg-white dark:border-white/10 dark:bg-zinc-950 md:flex">
      <div className="flex shrink-0 flex-col gap-2 border-b border-black/[0.07] p-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#007AFF] text-[13px] font-bold text-white shadow-[0_8px_18px_-12px_rgba(0,122,255,0.9)] transition hover:bg-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#7CB6FF]/70 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={readOnly}
            onClick={onNew}
            type="button"
          >
            <Plus size={14} strokeWidth={2.4} />
            Cuộc trò chuyện mới
          </button>
          <button
            aria-label="Thu gọn lịch sử trò chuyện"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-zinc-500 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
            onClick={onToggleCollapse}
            title="Thu gọn"
            type="button"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
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
          <FilterChip
            active={filter === "all"}
            count={conversations.length}
            label="Tất cả"
            onClick={() => setFilter("all")}
          />
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
        {pinnedConversationGroups.length > 0 && (
          <section className="mb-2 rounded-lg border border-black/[0.06] bg-zinc-50 p-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">
              <Pin size={11} />
              Cuộc trò chuyện đã ghim
            </div>
            <div className="space-y-1">
              {pinnedConversationGroups.slice(0, 5).map(({ conversation, summary }) => (
                <button
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                    conversation.id === currentConversationId
                      ? "bg-white text-[#0A66E0] shadow-sm dark:bg-zinc-950 dark:text-[#6DB4FF]"
                      : "text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-950"
                  )}
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  type="button"
                >
                  <span className="line-clamp-1 text-[11.5px] font-bold">{summary.title}</span>
                  <span className="mt-0.5 block text-[10px] text-zinc-400">{summary.meta}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {filtered.map((conversation) => {
          const active = conversation.id === currentConversationId;
          return (
            <div
              className={cn(
                "group relative mb-1 rounded-lg border-l-[3px] transition",
                active
                  ? "border-l-[#007AFF] bg-[rgba(0,122,255,0.09)]"
                  : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
              )}
              key={conversation.id}
            >
              <button
                className="w-full rounded-lg px-2.5 py-2 pr-8 text-left focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35"
                onClick={() => onSelect(conversation.id)}
                type="button"
              >
                <div className="flex items-center gap-1.5">
                  {conversation.pinned && (
                    <Star className="fill-[#FF9F0A] text-[#FF9F0A]" size={12} />
                  )}
                  <span className="line-clamp-1 flex-1 text-[12.5px] font-bold text-zinc-950 dark:text-zinc-50">
                    {conversation.title}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {relativeTime(conversation.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-1 line-clamp-1 text-[11px] text-zinc-400">
                  {conversation.turns.length} lượt ·{" "}
                  {conversationHasVehicleContext(conversation) ? "đội xe" : "vận hành"}
                </div>
              </button>
              {!readOnly && (
                <button
                  aria-label="Xóa cuộc trò chuyện"
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  onClick={() => {
                    if (window.confirm("Xóa cuộc trò chuyện này?")) onDelete(conversation.id);
                  }}
                  type="button"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function TopBar({
  inspectorOpen,
  onQuickAction,
  onSaveReport,
  onToggleInspector,
  readOnly,
  reportSaving,
  shareUrl,
}: {
  inspectorOpen: boolean;
  onQuickAction: (message: string) => void;
  onSaveReport: () => void;
  onToggleInspector: () => void;
  readOnly: boolean;
  reportSaving: boolean;
  shareUrl: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-black/[0.07] bg-white px-4 dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">
            Không gian AI NAG
          </div>
          <div className="text-[10.5px] text-zinc-400">Điều hành bê tông · công cụ trực tiếp</div>
        </div>
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
          disabled={readOnly || reportSaving}
          onClick={onSaveReport}
          type="button"
        >
          {reportSaving ? <Loader2 className="animate-spin" size={13} /> : <Download size={13} />}
          {reportSaving ? "Đang tạo" : "Lưu báo cáo"}
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
          <h1 className="truncate text-[17px] font-extrabold text-zinc-950 dark:text-zinc-50">
            {conversation.title}
          </h1>
          <p className="mt-1 text-[11px] text-zinc-400">
            {conversation.turns.filter((turn) => turn.role === "user").length} lượt hỏi ·{" "}
            {relativeTime(conversation.lastMessageAt)}
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
      <button
        aria-label="Đổi tên"
        className="icon-soft"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        type="button"
      >
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

async function convertBlobToWav16k(audioBlob: Blob): Promise<Blob> {
  const AudioCtor: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) throw new Error("Trình duyệt không hỗ trợ Web Audio API");

  const audioContext = new AudioCtor({ sampleRate: 16000 });
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = audioBuffer.getChannelData(0);
    const numSamples = samples.length;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

type SpeechRecordingState = "idle" | "recording" | "processing";

function useSpeechRecording({
  onFinalText,
  onError,
}: {
  onFinalText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<SpeechRecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(navigator.mediaDevices) && typeof window.MediaRecorder !== "undefined";
  }, []);

  const cleanup = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribeBlob = useCallback(
    async (audioBlob: Blob) => {
      setState("processing");
      try {
        const wav = await convertBlobToWav16k(audioBlob);
        const file = new File([wav], "recording.wav", { type: "audio/wav" });
        const result = await speechApi.transcribe(file);
        const text = result.text?.trim() ?? "";
        if (text) onFinalText(text);
        else onError("Không nhận diện được nội dung giọng nói");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Lỗi xử lý âm thanh";
        onError(message);
      } finally {
        setState("idle");
      }
    },
    [onError, onFinalText]
  );

  const start = useCallback(async () => {
    if (!supported) {
      onError("Trình duyệt không hỗ trợ ghi âm");
      return;
    }
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType = mimeCandidates.find((candidate) =>
        typeof MediaRecorder.isTypeSupported === "function"
          ? MediaRecorder.isTypeSupported(candidate)
          : false
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          onError("Không ghi được âm thanh, hãy thử lại");
          setState("idle");
          return;
        }
        void transcribeBlob(blob);
      };
      recorder.onerror = () => {
        cleanup();
        setState("idle");
        onError("Lỗi MediaRecorder khi ghi âm");
      };

      recorder.start();
      setState("recording");
    } catch (error) {
      const message =
        error instanceof Error && error.name === "NotAllowedError"
          ? "Vui lòng cấp quyền micro cho trình duyệt"
          : error instanceof Error
            ? error.message
            : "Không thể truy cập microphone";
      cleanup();
      setState("idle");
      onError(message);
    }
  }, [cleanup, onError, supported, transcribeBlob]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  return {
    state,
    recording: state === "recording",
    processing: state === "processing",
    start,
    stop,
    supported,
  };
}

function AssistantToolbar({
  feedback,
  onCopy,
  onFeedback,
  onPinAll,
  onShare,
}: {
  feedback?: FeedbackVote;
  onCopy: () => void;
  onFeedback: (vote: FeedbackVote) => void;
  onPinAll: () => void;
  onShare: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <button
        aria-label="Hữu ích"
        className={cn(
          "toolbar-btn",
          feedback === "up" && "border-[#34C759]/40 bg-[#34C759]/10 text-[#1F8E47]"
        )}
        onClick={() => onFeedback("up")}
        type="button"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        aria-label="Chưa đúng"
        className={cn(
          "toolbar-btn",
          feedback === "down" && "border-[#FF3B30]/40 bg-[#FF3B30]/10 text-[#C92A2A]"
        )}
        onClick={() => onFeedback("down")}
        type="button"
      >
        <ThumbsDown size={13} />
      </button>
      <button
        aria-label="Sao chép câu trả lời"
        className="toolbar-btn"
        onClick={onCopy}
        type="button"
      >
        <Copy size={13} /> Sao chép
      </button>
      <button aria-label="Chia sẻ tin nhắn" className="toolbar-btn" onClick={onShare} type="button">
        <Share2 size={13} /> Chia sẻ
      </button>
      <button
        aria-label="Ghim khung này"
        className="toolbar-btn ml-auto"
        onClick={onPinAll}
        title="Ghim các biểu đồ/bảng trong câu trả lời này vào Inspector"
        type="button"
      >
        <Pin size={13} /> Ghim khung này
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
  onPinTurn,
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
  onPinTurn: (turn: AssistantTurn) => void;
  onRename: (title: string) => void;
  onSend: (text: string, attachments?: ComposerAttachment[]) => Promise<void>;
  onToast: (message: string) => void;
  onTogglePin: () => void;
  readOnly: boolean;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    return () => {
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const handleFilesPicked = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const existingImageCount = attachments.filter((item) => item.kind === "image").length;
      let imageBudget = MAX_IMAGE_COUNT - existingImageCount;
      const accepted: ComposerAttachment[] = [];
      const rejections: string[] = [];
      const warnings: string[] = [];

      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
          if (!ALLOWED_IMAGE_MIME.has(file.type)) {
            rejections.push(`${file.name}: chỉ chấp nhận JPG/PNG/WEBP`);
            continue;
          }
          if (file.size > MAX_IMAGE_BYTES) {
            rejections.push(
              `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)}MB vượt 5MB`
            );
            continue;
          }
          if (imageBudget <= 0) {
            rejections.push(`${file.name}: tối đa ${MAX_IMAGE_COUNT} ảnh/tin nhắn`);
            continue;
          }
          try {
            const base64 = await readFileAsBase64Stripped(file);
            accepted.push({
              id: uid("att"),
              kind: "image",
              filename: file.name || "image.jpg",
              mimeType: file.type,
              sizeBytes: file.size,
              previewUrl: URL.createObjectURL(file),
              base64,
            });
            imageBudget -= 1;
            if (file.size > IMAGE_SIZE_WARN_BYTES) {
              warnings.push(
                `${file.name} ${(file.size / 1024 / 1024).toFixed(1)}MB — AI có thể xử lý chậm`
              );
            }
          } catch {
            rejections.push(`${file.name}: không đọc được`);
          }
          continue;
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
          rejections.push(`${file.name}: > 5MB`);
          continue;
        }
        if (isTextLikeMime(file.type, file.name)) {
          try {
            const text = await file.text();
            accepted.push({
              id: uid("att"),
              kind: "file",
              filename: file.name,
              mimeType: file.type || "text/plain",
              sizeBytes: file.size,
              textContent: text,
            });
          } catch {
            rejections.push(`${file.name}: không đọc được`);
          }
          continue;
        }
        accepted.push({
          id: uid("att"),
          kind: "file",
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
      }

      if (accepted.length > 0) {
        setAttachments((current) => [...current, ...accepted]);
        onToast(
          accepted.length === 1
            ? `Đã đính kèm ${accepted[0].filename}`
            : `Đã đính kèm ${accepted.length} tệp`
        );
      }
      if (warnings.length > 0) {
        onToast(warnings[0]);
      }
      if (rejections.length > 0) {
        onToast(`Bỏ qua: ${rejections.join(", ")}`);
      }
    },
    [attachments, onToast]
  );

  const submit = useCallback(
    async (textOverride?: string) => {
      const trimmed = (textOverride ?? input).trim();
      if ((!trimmed && attachments.length === 0) || isBusy || readOnly) return;
      setInput("");
      const submitted = attachments;
      const toRevoke = submitted.filter((item) => item.previewUrl);
      setAttachments([]);
      window.setTimeout(() => {
        toRevoke.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
      }, 0);
      await onSend(trimmed, submitted);
    },
    [attachments, input, isBusy, onSend, readOnly]
  );

  const voice = useSpeechRecording({
    onFinalText: (text) => {
      setInput((current) => {
        const next = current.trim();
        return next.length === 0 ? text : `${next} ${text}`;
      });
      onToast("Đã nhận diện giọng nói");
    },
    onError: (message) => {
      onToast(message);
    },
  });

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
      <div className="hidden">
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
        <div
          className="mx-auto flex w-full max-w-[1040px] flex-col gap-7"
          style={{ fontFamily: "var(--font-chat-sans)" }}
        >
          {conversation.turns.length === 0 && (
            <div className="grid min-h-[48vh] place-items-center text-center">
              <div>
                <LogoMark imageClass="size-7" sizeClass="mx-auto size-10" />
                <h2 className="mt-4 text-lg font-extrabold text-zinc-950 dark:text-zinc-50">
                  Trợ lý điều hành đội xe bê tông
                </h2>
                <p className="mt-2 text-[13px] text-zinc-500">
                  Hỏi nhanh về sản lượng, orders, xe và bảo trì.
                </p>
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
              <div className="group flex justify-end" key={turn.id}>
                <div className="flex max-w-[78%] flex-col items-end gap-2">
                  {turn.text && (
                    <div className="rounded-3xl bg-zinc-100 px-5 py-3 text-[15px] leading-[1.6] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                      <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                    </div>
                  )}
                  {turn.attachments && turn.attachments.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {turn.attachments.map((attachment, index) => (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          key={`${turn.id}-att-${index}`}
                        >
                          {attachment.kind === "image" ? (
                            <ImageIcon size={12} />
                          ) : (
                            <FileText size={12} />
                          )}
                          <span className="max-w-[140px] truncate">{attachment.filename}</span>
                          <span
                            className="text-[10px] text-zinc-400"
                            style={{ fontFamily: "var(--font-chat-mono)" }}
                          >
                            {formatAttachmentSize(attachment.sizeBytes)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="group flex items-start gap-3.5" id={turn.id} key={turn.id}>
                <div className="grid size-8 shrink-0 place-items-center rounded-full border border-[#EE2D2D]/15 bg-white shadow-sm">
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
                  <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-400">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                      Trợ lý AI
                    </span>
                    <span>·</span>
                    <span>Model nội bộ</span>
                    <span>·</span>
                    <span>
                      {turn.status === "streaming"
                        ? "Đang stream"
                        : turn.status === "error"
                          ? "Lỗi"
                          : "Đã trả lời"}
                    </span>
                    {turn.totalMs && (
                      <span
                        className="text-[11px] text-zinc-400"
                        style={{ fontFamily: "var(--font-chat-mono)" }}
                      >
                        · {(turn.totalMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {turn.reasoning.length > 0 && (
                    <div className="mb-3">
                      <ReasoningTree steps={turn.reasoning} totalMs={turn.totalMs} />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-[14px] bg-transparent",
                      readOnly && "pointer-events-none select-text"
                    )}
                  >
                    <StreamView text={turn.text} streaming={turn.status === "streaming"} />
                  </div>
                  {turn.status !== "streaming" && !readOnly && (
                    <div className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      <AssistantToolbar
                        feedback={feedback[turn.id]}
                        onCopy={() => {
                          void copyText(turn.text);
                          onToast("Đã sao chép câu trả lời");
                        }}
                        onFeedback={(vote) => onFeedback(turn.id, vote)}
                        onPinAll={() => onPinTurn(turn)}
                        onShare={() => {
                          void copyText(buildShareUrl(conversation.id, turn.id));
                          onToast("Đã sao chép link tới tin nhắn");
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-4 pt-2">
        <div className="mx-auto w-full max-w-[1040px]">
          {readOnly && (
            <div className="mb-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-center text-[12px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
              Link chia sẻ đang ở chế độ chỉ xem. Không thể gửi tin, ghim, sửa hoặc thực hiện hành
              động.
            </div>
          )}
          <div className="relative">
            <input
              accept="image/jpeg,image/jpg,image/png,image/webp,.txt,.csv,.md,.markdown,.json,.log,.tsv,.yaml,.yml,.xml"
              aria-hidden="true"
              className="hidden"
              multiple
              onChange={(event) => {
                void handleFilesPicked(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />
            <div className="rounded-2xl border border-black/10 bg-white p-2.5 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-zinc-950">
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attachments.map((attachment) => (
                    <div
                      className="group flex items-center gap-2 rounded-lg border border-black/10 bg-zinc-50 py-1 pl-1.5 pr-1 text-[11px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
                      key={attachment.id}
                    >
                      {attachment.kind === "image" && attachment.previewUrl ? (
                        <span className="relative size-7 overflow-hidden rounded-md bg-zinc-200 dark:bg-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={attachment.filename}
                            className="size-full object-cover"
                            src={attachment.previewUrl}
                          />
                        </span>
                      ) : (
                        <span className="grid size-7 place-items-center rounded-md bg-white text-[#0A66E0] dark:bg-zinc-950 dark:text-[#6DB4FF]">
                          {attachment.kind === "image" ? (
                            <ImageIcon size={13} />
                          ) : (
                            <FileText size={13} />
                          )}
                        </span>
                      )}
                      <span className="flex max-w-[150px] flex-col leading-tight">
                        <span className="truncate font-semibold">{attachment.filename}</span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {formatAttachmentSize(attachment.sizeBytes)}
                          {attachment.kind === "file" && attachment.textContent
                            ? " · text"
                            : ""}
                        </span>
                      </span>
                      <button
                        aria-label={`Bỏ ${attachment.filename}`}
                        className="grid size-5 place-items-center rounded-md text-zinc-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 dark:hover:bg-red-500/10"
                        onClick={() => removeAttachment(attachment.id)}
                        type="button"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                aria-label="Nhập tin nhắn"
                className="max-h-36 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                style={{ fontFamily: "var(--font-chat-sans)" }}
                data-testid="chat-input"
                disabled={isBusy || readOnly}
                onChange={(event) => {
                  setInput(event.currentTarget.value);
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
                placeholder={
                  readOnly
                    ? "Chế độ chỉ xem"
                    : voice.recording
                      ? "Đang ghi âm... bấm Mic để dừng"
                      : voice.processing
                        ? "Đang nhận diện giọng nói..."
                        : "Hỏi về sản lượng, xe, orders..."
                }
                ref={textareaRef}
                rows={2}
                value={input}
              />
              <div className="flex items-center gap-1.5">
                <button
                  aria-label="Đính kèm tệp hoặc ảnh"
                  className="composer-tool"
                  disabled={readOnly}
                  onClick={() => fileInputRef.current?.click()}
                  title="Đính kèm ảnh hoặc tệp (≤ 5MB)"
                  type="button"
                >
                  <Paperclip size={14} />
                </button>
                <button
                  aria-label={
                    voice.processing
                      ? "Đang xử lý giọng nói"
                      : voice.recording
                        ? "Dừng ghi âm"
                        : "Ghi âm và nhận diện giọng nói"
                  }
                  className={cn(
                    "composer-tool",
                    voice.recording && "bg-[#FF3B30]/15 text-[#C8281D] animate-pulse",
                    voice.processing && "bg-[#0A66E0]/15 text-[#0A66E0]"
                  )}
                  disabled={readOnly || voice.processing}
                  onClick={() => {
                    if (!voice.supported) {
                      onToast("Trình duyệt chưa hỗ trợ ghi âm");
                      return;
                    }
                    if (voice.recording) voice.stop();
                    else if (!voice.processing) void voice.start();
                  }}
                  title={
                    voice.supported
                      ? voice.processing
                        ? "Đang nhận diện..."
                        : voice.recording
                          ? "Dừng ghi âm"
                          : "Ghi âm (Savina STT, tiếng Việt)"
                      : "Trình duyệt không hỗ trợ ghi âm"
                  }
                  type="button"
                >
                  {voice.processing ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : voice.recording ? (
                    <MicOff size={14} />
                  ) : (
                    <Mic size={14} />
                  )}
                </button>
                <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-zinc-400 sm:flex">
                  <Kbd>⌘↵</Kbd> gửi
                </span>
                <button
                  aria-label="Gửi"
                  className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] text-white shadow-[0_2px_6px_rgba(0,122,255,0.32)] transition disabled:cursor-not-allowed disabled:grayscale focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  data-testid="send-button"
                  disabled={(!input.trim() && attachments.length === 0) || isBusy || readOnly}
                  onClick={() => void submit()}
                  type="button"
                >
                  {isBusy ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <ArrowUp size={15} strokeWidth={2.5} />
                  )}
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
  conversation,
  onClearMemory,
  onClose,
  onCopyConversation,
  onQuickAction,
  onSaveReport,
  onShowShortcuts,
  readOnly,
  reasoning,
  reportSaving,
  savedReports,
}: {
  blocks: PinnedBlock[];
  conversation: Conversation;
  onClearMemory: () => void;
  onClose: () => void;
  onCopyConversation: () => void;
  onQuickAction: (message: string) => void;
  onSaveReport: () => void;
  onShowShortcuts: () => void;
  readOnly: boolean;
  reasoning: ReasoningStep[];
  reportSaving: boolean;
  savedReports: AiGeneratedReport[];
}) {
  const [tab, setTab] = useState<InspectorTab>("tools");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const turnCount = conversation.turns.length;
  const chartBlocks = blocks.filter((block) => inspectorChartTypes.has(block.data.type));
  const attachments = useMemo(
    () =>
      [...savedReports.map(buildReportAttachment), ...blocks.map(buildBlockAttachment)]
        .filter((item): item is InspectorAttachment => item !== null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [blocks, savedReports]
  );
  const tabs: Array<{ key: InspectorTab; label: string; icon: ReactNode }> = [
    { key: "tools", label: "Công cụ", icon: <Activity size={13} /> },
    { key: "charts", label: "Biểu đồ", icon: <BarChart3 size={13} /> },
    { key: "actions", label: "Đính kèm", icon: <Paperclip size={13} /> },
  ];

  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[52vh] min-w-0 flex-col overflow-hidden rounded-t-2xl border-t border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 lg:static lg:max-h-none lg:w-[340px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none">
      <header className="shrink-0 border-b border-black/[0.07] px-3.5 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <LogoMark imageClass="size-5" sizeClass="size-7 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">
              Bảng ngữ cảnh
            </h2>
            <p className="text-[10.5px] text-zinc-400">
              Công cụ, biểu đồ, tệp đính kèm cho câu trả lời
            </p>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Tùy chọn bảng ngữ cảnh"
              className="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                role="menu"
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-white/10"
                  disabled={readOnly || reportSaving || turnCount === 0}
                  onClick={() => {
                    setMenuOpen(false);
                    onSaveReport();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <FileText className="text-[#0A66E0]" size={13} />
                  {reportSaving ? "Đang tạo PDF" : "Tạo báo cáo PDF"}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-white/10"
                  disabled={turnCount === 0}
                  onClick={() => {
                    setMenuOpen(false);
                    onCopyConversation();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Copy className="text-zinc-500" size={13} />
                  Sao chép toàn bộ cuộc trò chuyện
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-white/10"
                  disabled={readOnly}
                  onClick={() => {
                    setMenuOpen(false);
                    onClearMemory();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Eraser className="text-[#C8281D]" size={13} />
                  Xóa bộ nhớ phiên
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowShortcuts();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Keyboard className="text-zinc-500" size={13} />
                  Phím tắt
                </button>
                <div className="border-t border-black/[0.06] dark:border-white/10" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onClose();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Square className="text-zinc-500" size={13} />
                  Đóng bảng ngữ cảnh
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-white/10">
          {tabs.map((item) => (
            <button
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35",
                tab === item.key
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-500"
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
                  const fallbackDetail = stringifyCell(
                    isRecord(step.input) ? step.input.status : ""
                  );
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
                              : "border-[#007AFF] text-[#0A66E0]"
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            step.status === "done"
                              ? "bg-[#34C759]"
                              : step.status === "error"
                                ? "bg-[#FF3B30]"
                                : "animate-pulse bg-[#007AFF]"
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1 rounded-xl border border-black/10 bg-zinc-50 p-2.5 transition group-hover:border-[#007AFF]/40 group-hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:group-hover:bg-white/[0.08]">
                        <span className="line-clamp-2 block text-[11.5px] font-bold leading-4 text-zinc-800 dark:text-zinc-100">
                          {label}
                        </span>
                        {!step.resultSummary && fallbackDetail && (
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-500">
                            {fallbackDetail}
                          </span>
                        )}
                        {step.durationMs !== undefined && (
                          <span className="mt-1 block font-mono text-[10px] text-zinc-400">
                            {step.durationMs}ms
                          </span>
                        )}
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
              <span className="text-[12px] font-extrabold text-zinc-900 dark:text-zinc-100">
                Biểu đồ đã render
              </span>
              <span className="rounded-full bg-[rgba(0,122,255,0.10)] px-2 py-0.5 text-[10px] font-bold text-[#0A66E0]">
                {chartBlocks.length}
              </span>
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
                    readOnly && "pointer-events-none select-text"
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
          <div className="space-y-3">
            {!readOnly && (
              <button
                className="flex w-full items-center gap-2 rounded-md border border-[rgba(0,122,255,0.22)] bg-[rgba(0,122,255,0.06)] p-2.5 text-left text-[12px] font-bold text-[#0A66E0] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[rgba(109,180,255,0.25)] dark:bg-[rgba(0,122,255,0.12)] dark:text-[#6DB4FF]"
                disabled={reportSaving}
                onClick={onSaveReport}
                type="button"
              >
                <span className="grid size-7 place-items-center rounded-md bg-white dark:bg-zinc-950">
                  {reportSaving ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {reportSaving ? "Đang tạo báo cáo PDF" : "Tạo báo cáo PDF"}
                </span>
                <Download size={14} />
              </button>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[12px] font-extrabold text-zinc-900 dark:text-zinc-100">
                  Tệp đính kèm
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-white/10">
                  {attachments.length}
                </span>
              </div>

              {attachments.length === 0 && (
                <div className="rounded-md border border-dashed border-black/10 bg-zinc-50 p-4 text-center text-[12px] text-zinc-400 dark:border-white/10 dark:bg-white/[0.04]">
                  Chưa có tệp đính kèm. Khi AI xuất ảnh, PDF hoặc bạn tạo báo cáo, file sẽ nằm ở
                  đây.
                </div>
              )}

              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <article
                    className="flex items-center gap-2 rounded-md border border-black/10 bg-zinc-50 p-2.5 dark:border-white/10 dark:bg-white/[0.04]"
                    key={attachment.id}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white text-[#0A66E0] dark:bg-zinc-950 dark:text-[#6DB4FF]">
                      {attachment.kind === "image" ? (
                        <Paperclip size={14} />
                      ) : (
                        <FileText size={14} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 block text-[12px] font-bold text-zinc-800 dark:text-zinc-100">
                        {attachment.title}
                      </span>
                      <span className="line-clamp-1 block text-[10.5px] text-zinc-400">
                        {attachment.filename}
                        {attachment.meta ? ` · ${attachment.meta}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <a
                        aria-label={`Mở ${attachment.filename}`}
                        className="grid size-8 place-items-center rounded-md border border-black/10 bg-white text-zinc-500 transition hover:text-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-[#6DB4FF]"
                        href={attachment.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={13} />
                      </a>
                      {!readOnly && (
                        <a
                          aria-label={`Tải ${attachment.filename}`}
                          className="grid size-8 place-items-center rounded-md border border-black/10 bg-white text-zinc-500 transition hover:text-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-[#6DB4FF]"
                          download={attachment.filename}
                          href={attachment.href}
                        >
                          <Download size={13} />
                        </a>
                      )}
                    </span>
                  </article>
                ))}
              </div>
            </div>
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
  const savedReports = useRendererStore((state) => state.savedReports);
  const appendTurn = useRendererStore((state) => state.appendTurn);
  const createConversation = useRendererStore((state) => state.createConversation);
  const deleteConversation = useRendererStore((state) => state.deleteConversation);
  const addConversationPins = useRendererStore((state) => state.addConversationPins);
  const saveReport = useRendererStore((state) => state.saveReport);
  const selectConversation = useRendererStore((state) => state.selectConversation);
  const setConversationTitle = useRendererStore((state) => state.setConversationTitle);
  const setFeedback = useRendererStore((state) => state.setFeedback);
  const toggleConversationPin = useRendererStore((state) => state.toggleConversationPin);
  const toggleInspector = useRendererStore((state) => state.toggleInspector);
  const updateAssistantTurn = useRendererStore((state) => state.updateAssistantTurn);
  const [toast, setToast] = useState<string | null>(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
    [conversations, currentConversationId]
  );

  useEffect(() => {
    if (!sharedConversationId || sharedConversationId === currentConversationId) return;
    if (conversations.some((conversation) => conversation.id === sharedConversationId)) {
      selectConversation(sharedConversationId);
    }
  }, [conversations, currentConversationId, selectConversation, sharedConversationId]);

  const currentPins = useMemo(
    () => (currentConversation ? extractPinnedBlocks(currentConversation) : []),
    [currentConversation]
  );

  const shareUrl = useMemo(
    () => (currentConversation ? buildShareUrl(currentConversation.id) : ""),
    [currentConversation]
  );

  const latestReasoning = useMemo(() => {
    const turns = currentConversation?.turns ?? [];
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn.role === "assistant" && turn.reasoning.length > 0) return turn.reasoning;
    }
    return [];
  }, [currentConversation]);

  const isBusy =
    currentConversation?.turns.some(
      (turn) => turn.role === "assistant" && turn.status === "streaming"
    ) ?? false;

  const saveCurrentReport = useCallback(async () => {
    if (readOnly) {
      showToast("Link chia sẻ chỉ được xem");
      return;
    }
    if (!currentConversation || reportSaving) return;
    if (currentConversation.turns.length === 0 && currentPins.length === 0) {
      showToast("Chưa có nội dung để tạo báo cáo");
      return;
    }

    setReportSaving(true);
    showToast("Đang tạo báo cáo");
    try {
      const report = await reportApi.createAiReport(
        buildReportPayload(currentConversation, currentPins, activeContext, shareUrl)
      );
      const storedReport: AiGeneratedReport = {
        blockCount: report.blockCount,
        conversationId: report.conversationId,
        createdAt: report.createdAt,
        filename: report.filename,
        format: report.format,
        id: report.id,
        markdown: report.markdown,
        mimeType: report.mimeType,
        pdfBase64: report.pdfBase64,
        sizeBytes: report.sizeBytes,
        title: report.title,
        turnCount: report.turnCount,
      };
      saveReport(storedReport);
      downloadBase64File(report.filename, report.pdfBase64, report.mimeType);
      showToast(`Đã tạo báo cáo: ${report.filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể tạo báo cáo";
      showToast(message);
    } finally {
      setReportSaving(false);
    }
  }, [
    activeContext,
    currentConversation,
    currentPins,
    readOnly,
    reportSaving,
    saveReport,
    shareUrl,
    showToast,
  ]);

  const sendMessage = useCallback(
    async (text: string, attachments: ComposerAttachment[] = []) => {
      const conversation = currentConversation;
      if (!conversation || isBusy || readOnly) return;

      const now = new Date().toISOString();
      const attachmentLabels = attachments.map((attachment) => ({
        kind: attachment.kind,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }));
      const userTurn: UserTurn = {
        id: uid("user"),
        role: "user",
        text,
        createdAt: now,
        ...(attachmentLabels.length > 0 ? { attachments: attachmentLabels } : {}),
      };
      const assistantTurn: AssistantTurn = {
        id: uid("assistant"),
        role: "assistant",
        text: "",
        reasoning: [],
        status: "streaming",
        createdAt: new Date().toISOString(),
      };
      const nextContent = buildContentBlocks(text, attachments);
      const requestMessages = toApiMessages(conversation.turns, nextContent);

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
        reasoning = [...reasoning.filter((existing) => existing.id !== step.id), step].sort(
          (left, right) => left.startedAt.localeCompare(right.startedAt)
        );
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
          Array<{
            id: string;
            input: unknown;
            startedAt: string;
            startedAtMs: number;
            tool: ToolName;
          }>
        >();
        let streamError: Error | null = null;

        await chatApi.runWithTools(
          requestMessages,
          {
            signal: controller.signal,
            onToolStart: (name, args) => {
              const tool = mapPopupToolToRendererTool(name);
              const id = uid(`tool-${tool}`);
              const startedAt = new Date().toISOString();
              const input = { tool: name, args: compactToolArgsForReasoning(name, args) };
              const runs = toolRuns.get(name) ?? [];
              runs.push({
                id,
                input,
                startedAt,
                startedAtMs: performance.now(),
                tool,
              });
              toolRuns.set(name, runs);
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
              const runs = toolRuns.get(result.tool) ?? [];
              const existing = runs.shift();
              if (runs.length > 0) {
                toolRuns.set(result.tool, runs);
              } else {
                toolRuns.delete(result.tool);
              }
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
            sessionId: conversation.id,
          }
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
    [appendTurn, currentConversation, isBusy, readOnly, setConversationTitle, updateAssistantTurn]
  );

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ intent?: string; payload?: unknown; id?: string }>)
        .detail;
      if (!detail?.intent) return;
      if (readOnly) {
        showToast("Link chia sẻ chỉ được xem");
        return;
      }
      showToast(`Action: ${detail.intent}`);

      if (detail.intent === "cancel" || detail.intent === "open_dispatch") return;
      const payload = isRecord(detail.payload) ? detail.payload : {};
      void chatApi
        .sendAction(
          {
            ...payload,
            kind: detail.intent,
            reason: `User approved ${detail.id ?? "action_proposal"}`,
          },
          undefined,
          currentConversation?.id
        )
        .then((result) => {
          if (result?.status === "queued" && result.request_id) {
            showToast(`Đã gửi yêu cầu (${result.request_id})`);
          } else if (result?.status) {
            showToast(`Trạng thái action: ${result.status}`);
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Không thực hiện được action";
          showToast(message);
        });
    };
    window.addEventListener("render:action", onAction);
    return () => window.removeEventListener("render:action", onAction);
  }, [currentConversation?.id, readOnly, showToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (readOnly) return;
        if (currentConversationId) void chatApi.clearMemory(undefined, currentConversationId);
        createConversation();
      }
      if (event.key === "\\") {
        event.preventDefault();
        toggleInspector();
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const index = conversations.findIndex(
          (conversation) => conversation.id === currentConversationId
        );
        const nextIndex =
          event.key === "["
            ? Math.max(index - 1, 0)
            : Math.min(index + 1, conversations.length - 1);
        const next = conversations[nextIndex];
        if (next) selectConversation(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    conversations,
    createConversation,
    currentConversationId,
    readOnly,
    selectConversation,
    toggleInspector,
  ]);

  if (!currentConversation) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-[#F7F7F8] text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
      <TopBar
        inspectorOpen={inspectorOpen}
        onQuickAction={showToast}
        onSaveReport={saveCurrentReport}
        onToggleInspector={toggleInspector}
        readOnly={readOnly}
        reportSaving={reportSaving}
        shareUrl={shareUrl}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!readOnly && (
          <HistorySidebar
            collapsed={historyCollapsed}
            conversations={conversations}
            currentConversationId={currentConversation.id}
            onNew={() => {
              void chatApi.clearMemory(undefined, currentConversation.id);
              createConversation();
            }}
            onDelete={(conversationId) => {
              void chatApi.clearMemory(undefined, conversationId);
              deleteConversation(conversationId);
              showToast("Đã xóa cuộc trò chuyện");
            }}
            onToggleCollapse={() => setHistoryCollapsed((value) => !value)}
            pinnedBlocks={pinnedBlocks}
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
            const isToggleOff = feedback[turnId] === vote;
            setFeedback(turnId, vote);
            if (!isToggleOff && currentConversation) {
              void chatApi
                .sendFeedback({
                  turnId,
                  conversationId: currentConversation.id,
                  rating: vote,
                })
                .then(() => showToast(vote === "up" ? "Đã ghi nhận phản hồi tốt" : "Đã ghi nhận góp ý"))
                .catch((error: unknown) => {
                  const message =
                    error instanceof Error ? error.message : "Không gửi được phản hồi";
                  showToast(message);
                });
            }
          }}
          onPinTurn={(turn) => {
            if (readOnly) return;
            const blocks = extractBlocksFromTurn(currentConversation.id, turn);
            if (blocks.length === 0) {
              showToast("Câu trả lời này không có khối render để ghim");
              return;
            }
            addConversationPins(currentConversation.id, blocks);
            showToast(
              blocks.length === 1
                ? "Đã ghim 1 khối render"
                : `Đã ghim ${blocks.length} khối render`
            );
          }}
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
            showToast(
              currentConversation.pinned ? "Đã bỏ ghim cuộc trò chuyện" : "Đã ghim cuộc trò chuyện"
            );
          }}
          readOnly={readOnly}
        />
        {inspectorOpen && (
          <Inspector
            blocks={pinnedBlocks.filter((block) => block.conversationId === currentConversation.id)}
            conversation={currentConversation}
            onClearMemory={() => {
              if (readOnly) {
                showToast("Link chia sẻ chỉ được xem");
                return;
              }
              if (!window.confirm("Xóa bộ nhớ phiên hiện tại? AI sẽ bắt đầu lại từ đầu.")) return;
              void chatApi
                .clearMemory(undefined, currentConversation.id)
                .then(() => showToast("Đã xóa bộ nhớ phiên"))
                .catch(() => showToast("Không thể xóa bộ nhớ phiên"));
            }}
            onClose={toggleInspector}
            onCopyConversation={() => {
              const text = currentConversation.turns
                .map((turn) => {
                  const role = turn.role === "user" ? "Bạn" : "Trợ lý AI";
                  return `${role}:\n${turn.text}`;
                })
                .join("\n\n---\n\n");
              if (!text.trim()) {
                showToast("Chưa có nội dung để sao chép");
                return;
              }
              void copyText(text);
              showToast("Đã sao chép cuộc trò chuyện");
            }}
            onQuickAction={showToast}
            onSaveReport={saveCurrentReport}
            onShowShortcuts={() => setShortcutsOpen(true)}
            readOnly={readOnly}
            reasoning={latestReasoning}
            reportSaving={reportSaving}
            savedReports={savedReports.filter(
              (report) => report.conversationId === currentConversation.id
            )}
          />
        )}
      </div>
      <ShortcutsDialog onClose={() => setShortcutsOpen(false)} open={shortcutsOpen} />
      <Toast message={toast} />
    </div>
  );
}
