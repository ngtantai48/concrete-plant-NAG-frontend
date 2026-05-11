export const ORDER_STATUSES = [
  "init",
  "pending",
  "collecting",
  "transporting",
  "running",
  "completed",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

type OrderStatusGroupKey = "waiting" | "collecting" | "moving" | "completed" | "canceled" | "other";

type OrderStatusGroupMeta = {
  key: OrderStatusGroupKey;
  label: string;
  color: string;
  tone: "blue" | "green" | "amber" | "red" | "purple" | "neutral" | "good" | "warn" | "bad" | "info";
  rawStatuses: string[];
};

export type OrderStatusGroupSummary = OrderStatusGroupMeta & {
  value: number;
};

export const ORDER_STATUS_BUSINESS_RULES =
  "Ngữ nghĩa trạng thái trong ngày: pending/init = Đang đợi; running/transporting = Đang di chuyển; completed = Hoàn thành; collecting = Đang thu thập; canceled = Đã hủy.";

const STATUS_LABELS: Record<OrderStatus, string> = {
  init: "Đang đợi",
  pending: "Đang đợi",
  collecting: "Đang thu thập",
  transporting: "Đang di chuyển",
  running: "Đang di chuyển",
  completed: "Hoàn thành",
  canceled: "Đã hủy",
};

const STATUS_GROUPS: Record<OrderStatus, OrderStatusGroupMeta> = {
  init: {
    key: "waiting",
    label: "Đang đợi",
    color: "#FF9F0A",
    tone: "amber",
    rawStatuses: ["init", "pending"],
  },
  pending: {
    key: "waiting",
    label: "Đang đợi",
    color: "#FF9F0A",
    tone: "amber",
    rawStatuses: ["init", "pending"],
  },
  collecting: {
    key: "collecting",
    label: "Đang thu thập",
    color: "#AF52DE",
    tone: "purple",
    rawStatuses: ["collecting"],
  },
  transporting: {
    key: "moving",
    label: "Đang di chuyển",
    color: "#007AFF",
    tone: "blue",
    rawStatuses: ["running", "transporting"],
  },
  running: {
    key: "moving",
    label: "Đang di chuyển",
    color: "#007AFF",
    tone: "blue",
    rawStatuses: ["running", "transporting"],
  },
  completed: {
    key: "completed",
    label: "Hoàn thành",
    color: "#34C759",
    tone: "good",
    rawStatuses: ["completed"],
  },
  canceled: {
    key: "canceled",
    label: "Đã hủy",
    color: "#FF3B30",
    tone: "bad",
    rawStatuses: ["canceled"],
  },
};

const GROUP_ORDER: OrderStatusGroupKey[] = ["completed", "moving", "collecting", "waiting", "canceled", "other"];

function normalizeStatus(status: unknown): OrderStatus | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  return ORDER_STATUSES.find((item) => item === normalized) ?? null;
}

function statusGroupMeta(status: unknown): OrderStatusGroupMeta {
  const normalized = normalizeStatus(status);
  if (normalized) return STATUS_GROUPS[normalized];
  const label = typeof status === "string" && status.trim() ? status.trim() : "Khác";
  return {
    key: "other",
    label,
    color: "#8E8E93",
    tone: "neutral",
    rawStatuses: [label],
  };
}

export function orderStatusLabel(status: unknown): string {
  const normalized = normalizeStatus(status);
  if (normalized) return STATUS_LABELS[normalized];
  return typeof status === "string" && status.trim() ? status.trim() : "Khác";
}

export function orderStatusGroupLabel(status: unknown): string {
  return statusGroupMeta(status).label;
}

export function aggregateOrderStatusGroups(counts: Record<string, unknown>): OrderStatusGroupSummary[] {
  const grouped = new Map<OrderStatusGroupKey, OrderStatusGroupSummary>();

  for (const [status, rawValue] of Object.entries(counts)) {
    const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 0;
    if (value <= 0) continue;

    const meta = statusGroupMeta(status);
    const current = grouped.get(meta.key) ?? { ...meta, value: 0 };
    current.value += value;
    current.rawStatuses = [...new Set([...current.rawStatuses, status])];
    grouped.set(meta.key, current);
  }

  return [...grouped.values()].sort((left, right) => GROUP_ORDER.indexOf(left.key) - GROUP_ORDER.indexOf(right.key));
}
