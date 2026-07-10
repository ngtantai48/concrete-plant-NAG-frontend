/**
 * Phân tích CÔNG THỨC XẾP cho tag lúc LƯU TAG (không phải lúc xếp lốt).
 * LLM đọc mô tả luật của tag mới + danh mục tag hiện có (đã chốt sort_group) và trả về:
 *  - {status:"ok", sort_group, summary}: công thức cố định cho tag; hoặc
 *  - {status:"question", question}: câu hỏi làm rõ khi mô tả mơ hồ — hỏi người dùng rồi gọi lại.
 * Một khi đã lưu, việc xếp lốt chạy thuần stable-sort theo sort_group, không cần LLM nữa.
 * Module tự chứa (không import runtime) để test bằng node.
 */

export type LotTagFormulaExistingTag = {
  name: string;
  rule: string;
  sort_group: number;
};

export type LotTagFormulaInput = {
  name: string;
  rule: string;
  existingTags: LotTagFormulaExistingTag[];
  qaHistory?: { question: string; answer: string }[];
};

export type LotTagFormulaMessage = { role: "system" | "user"; content: string };

export type LotTagFormulaResult =
  | { status: "ok"; sort_group: number; summary: string }
  | { status: "question"; question: string };

/** Mốc cố định của thang nhóm: xe không tag = 20. Giữ đồng bộ với DEFAULT_LOT_TAG_GROUP. */
export const UNTAGGED_GROUP = 20;

const MIN_SORT_GROUP = 1;
const MAX_SORT_GROUP = 99;

const SYSTEM_PROMPT = [
  "Bạn là bộ phân tích luật xếp lốt xe bồn cho trạm trộn bê tông.",
  "Mỗi tag trạng thái xe có một CÔNG THỨC XẾP cố định là số nguyên sort_group (1-99):",
  "- Số càng NHỎ xe càng được gọi SỚM (đứng đầu lốt).",
  `- Mốc cố định: xe KHÔNG có tag thuộc nhóm ${UNTAGGED_GROUP}.`,
  `- Tag kiểu 'giữ nguyên vị trí / theo thực tế / điều độ tự xếp / theo bố trí' cũng thuộc nhóm ${UNTAGGED_GROUP}.`,
  "- Có thể chen giữa hai nhóm hiện có bằng số ở giữa (vd 35 nằm giữa 30 và 40).",
  "- NGHĨA NGHIỆP VỤ (bắt buộc theo): 'về sớm / đi sớm' = ĐẦU lốt (nhóm nhỏ, khoảng 10). 'xin nghỉ / nghỉ' = CUỐI CÙNG (nhóm lớn nhất). 'trước xe nghỉ' nghĩa là GẦN CUỐI (ngay trước nhóm nghỉ), TUYỆT ĐỐI KHÔNG phải đầu lốt. 'làm việc khác / chạy bơm / trực sản xuất / trực chốt' = về cuối lốt nhưng đứng TRƯỚC xe nghỉ, và SAU nhóm chạy hàng bình thường (nhóm 20).",
  "- Nếu luật nhắc tới loại xe/tag CHƯA có trong danh mục (vd 'trước xe nghỉ' mà chưa có tag nghỉ), hãy suy luận theo nghĩa nghiệp vụ trên (nghỉ ở cuối) — ĐỪNG đặt nhầm về đầu lốt.",
  "- CHỈ xếp tag HIỆN TẠI. TUYỆT ĐỐI KHÔNG hỏi/không đề xuất tạo tag khác, không hỏi sort_group của tag chưa tồn tại. Nếu tag tham chiếu chưa có, cứ đặt theo nghĩa nghiệp vụ và ghi rõ trong summary — KHÔNG bỏ cuộc, luôn trả về JSON hợp lệ (ok hoặc question).",
  "- Nếu luật tag mới TƯƠNG ĐƯƠNG một tag đã có (cùng hướng, không nói rõ trước/sau, vd cả hai đều 'đưa ra sau') → ĐỪNG tự tách thành nhóm khác. Hãy HỎI LẠI: hai tag gọi CÙNG ĐỢT (chung nhóm) hay tag nào ra sau/xa hơn?",
  "- Chỉ gán sort_group KHÁC nhau khi luật nêu RÕ thứ tự tương đối (đứng trước/sau, xa hơn; 'cuối cùng / sau cùng' xa hơn 'gần cuối').",
  "- Chỉ gán CHUNG sort_group khi chắc chắn hai tag gọi cùng đợt (không cần phân biệt trước/sau).",
  "- Được HỎI NHIỀU VÒNG, mỗi vòng MỘT câu hỏi ngắn, cho tới khi rõ.",
  "Nhiệm vụ: đọc mô tả luật của TAG MỚI, so với danh mục tag hiện có, và chốt sort_group.",
  "Chỉ trả về status:'ok' khi đã CHẮC CHẮN (cùng nhóm hay trước/sau) so với mọi tag cùng vùng; còn nghi ngờ thì hỏi tiếp.",
  "Nếu đã đủ rõ:",
  '  → trả về {"status":"ok","sort_group":N,"summary":"1 câu tiếng Việt mô tả vị trí (vd: Xếp sau Trực sản xuất, trước Chạy bơm)"}.',
  "Nếu còn mơ hồ (chưa rõ đứng trước/sau tag nào, hoặc chưa rõ tag nào xa nhất):",
  '  → trả về {"status":"question","question":"MỘT câu hỏi ngắn tiếng Việt để làm rõ (vd: Tag này nằm xa nhất hay đứng trước tag Nghỉ?)"}.',
  "Chỉ trả về DUY NHẤT một JSON hợp lệ, không viết thêm chữ nào khác.",
].join("\n");

export const buildLotTagFormulaMessages = (input: LotTagFormulaInput): LotTagFormulaMessage[] => {
  const payload = {
    tag_moi: { ten: input.name, luat: input.rule },
    danh_muc_hien_co: input.existingTags.map((tag) => ({
      ten: tag.name,
      luat: tag.rule,
      sort_group: tag.sort_group,
    })),
    ...(input.qaHistory && input.qaHistory.length > 0
      ? { hoi_dap_da_co: input.qaHistory.map((qa) => ({ hoi: qa.question, dap: qa.answer })) }
      : {}),
  };

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload) },
  ];
};

/** Tìm khối JSON đầu tiên cân bằng ngoặc trong text (bỏ code fence nếu có). */
const extractJsonBlock = (text: string): string | null => {
  const cleaned = String(text || "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
};

export const parseLotTagFormulaResponse = (text: string): LotTagFormulaResult | null => {
  const block = extractJsonBlock(text);
  if (!block) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;

  if (record.status === "question") {
    const question = typeof record.question === "string" ? record.question.trim() : "";
    return question ? { status: "question", question } : null;
  }

  const rawGroup = Number(record.sort_group ?? record.group);
  if (!Number.isFinite(rawGroup)) return null;
  const sortGroup = Math.min(MAX_SORT_GROUP, Math.max(MIN_SORT_GROUP, Math.round(rawGroup)));
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  return { status: "ok", sort_group: sortGroup, summary };
};
