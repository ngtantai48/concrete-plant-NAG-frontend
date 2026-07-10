import http from "@/lib/http";
import type { LotTagFormulaMessage } from "@/services/lot-tag-formula-llm";
import { LEGACY_LOT_TAG_SEEDS } from "@/services/vehicle-day-tag-utils";

/**
 * Danh mục tag trạng thái xe theo ngày (bảng lot_tags trên BE).
 * Mỗi tag có tên hiển thị + mô tả ảnh hưởng sắp xếp (lot_tag_rule) — mô tả này được
 * đưa cho LLM đọc để quyết định thứ tự khi "Xếp theo tag" trong modal Chụp lốt.
 */
export interface LotTag {
  lot_tag_id: number;
  lot_tag_key: string;
  lot_tag_name: string;
  lot_tag_rule: string;
  /** Công thức xếp cố định: số nguyên, nhỏ = gọi trước; xe không tag = 20. */
  sort_group?: number | null;
  display_order?: number | null;
  delete_flag?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type LotTagPayload = {
  lot_tag_key: string;
  lot_tag_name: string;
  lot_tag_rule: string;
  sort_group?: number;
  display_order?: number;
};

const LIST_PAYLOAD_KEYS = ["lot_tags", "lotTags", "items", "results", "rows", "data"];

const extractLotTagList = (payload: unknown): LotTag[] => {
  if (Array.isArray(payload)) return payload as LotTag[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of LIST_PAYLOAD_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) return value as LotTag[];
    if (value && typeof value === "object") {
      const nested = extractLotTagList(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
};

/**
 * Gọi LLM phân tích công thức xếp tag qua route nội bộ /api/lot-tags/analyze
 * (proxy tới api.svnagentic.site, không cần key). Trả về text thô để parse.
 */
export const analyzeLotTagFormula = async (messages: LotTagFormulaMessage[]): Promise<string> => {
  let lastError: unknown = null;
  // Thử 2 lần: model/mạng có thể lỗi tạm thời trả rỗng.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/lot-tags/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Lot tag analyze failed (${res.status}): ${detail}`);
      }
      const data = (await res.json().catch(() => null)) as { content?: string } | null;
      const content = typeof data?.content === "string" ? data.content : "";
      if (content.trim()) return content;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return "";
};

const fetchLotTagList = async (): Promise<LotTag[]> => {
  const res = await http.get("/lot-tags", { params: { limit: 100 } });
  return extractLotTagList(res.data)
    .filter((tag) => tag && !tag.delete_flag && tag.lot_tag_key)
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) || (a.lot_tag_id ?? 0) - (b.lot_tag_id ?? 0)
    );
};

const isDuplicateLotTagError = (error: unknown) => {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  const detail = JSON.stringify(response?.data ?? "");
  return response?.status === 409 || /duplicate|already|exists|unique/i.test(detail);
};

const createLotTag = (data: LotTagPayload) => http.post("/lot-tags", data);

const seedLegacyDefaults = async (): Promise<LotTag[]> => {
  const existing = await fetchLotTagList();
  const existingKeys = new Set(existing.map((tag) => tag.lot_tag_key));
  const missingSeeds = LEGACY_LOT_TAG_SEEDS.filter((seed) => !existingKeys.has(seed.lot_tag_key));

  if (missingSeeds.length === 0) return existing;

  for (const seed of missingSeeds) {
    try {
      await createLotTag({ ...seed });
    } catch (error) {
      if (!isDuplicateLotTagError(error)) throw error;
    }
  }

  return fetchLotTagList();
};

// Gộp các lần gọi list() trùng nhau đang bay (StrictMode double-fire, nhiều màn cùng fetch)
// thành 1 request; xong thì nhả để lần sau lấy dữ liệu mới.
let inflightList: Promise<LotTag[]> | null = null;

const lotTagApi = {
  list: (): Promise<LotTag[]> => {
    if (inflightList) return inflightList;
    inflightList = fetchLotTagList().finally(() => {
      inflightList = null;
    });
    return inflightList;
  },
  create: createLotTag,
  update: (id: number, data: Partial<LotTagPayload>) => http.put(`/lot-tags/${id}`, data),
  delete: (id: number) => http.delete(`/lot-tags/${id}`),
  seedLegacyDefaults,
};

export default lotTagApi;
