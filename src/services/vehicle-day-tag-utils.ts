/**
 * Tag trạng thái xe bồn theo ngày, gắn trên bảng Xe bồn (Bố trí công việc).
 *
 * Tag là DANH MỤC ĐỘNG lưu DB (bảng lot_tags — xem lot-tag.service.ts). Mỗi tag mang một
 * CÔNG THỨC XẾP CỐ ĐỊNH `sort_group` (số nguyên, nhỏ = gọi trước) do LLM phân tích và chốt
 * MỘT LẦN lúc lưu tag; khi "Xếp theo tag" chỉ chạy stable sort thuần theo sort_group.
 * Mốc cố định: xe KHÔNG tag = nhóm 20. Thang seed:
 *   10  ve_som          → lốt đầu
 *   20  (không tag) / sua_chua / du_be_tong / keo_bom_tinh → theo thực tế, đứng yên
 *   30  truc_san_xuat   → cuối lốt, trước chạy bơm
 *   40  chay_bom        → cuối lốt, trước việc khác
 *   50  lam_viec_khac   → cuối lốt, trước xe nghỉ
 *   60  nghi            → cuối cùng
 * Tag mới có thể chen giữa (vd 35 = sau trực sản xuất, trước chạy bơm).
 * Module tự chứa (không import runtime) để chạy được dưới `node --test`.
 */

/** Key tag động từ danh mục lot_tags (slug chữ thường/số/gạch). */
export type VehicleDayTag = string;

/** 8 tag gốc — seed cho danh mục DB và fallback khi chưa tải được danh mục. */
export const VEHICLE_DAY_TAGS: readonly VehicleDayTag[] = [
  "ve_som",
  "sua_chua",
  "du_be_tong",
  "keo_bom_tinh",
  "truc_san_xuat",
  "chay_bom",
  "lam_viec_khac",
  "nghi",
];

export type LegacyLotTagSeed = {
  lot_tag_key: VehicleDayTag;
  lot_tag_name: string;
  lot_tag_rule: string;
  sort_group: number;
  display_order: number;
};

export const LEGACY_LOT_TAG_SEEDS: readonly LegacyLotTagSeed[] = [
  {
    lot_tag_key: "ve_som",
    lot_tag_name: "Về sớm",
    lot_tag_rule: "Xe về sớm được ưu tiên gọi ở đầu lốt.",
    sort_group: 10,
    display_order: 1,
  },
  {
    lot_tag_key: "sua_chua",
    lot_tag_name: "Sửa chữa",
    lot_tag_rule: "Xe sửa chữa xếp theo thực tế như xe không tag.",
    sort_group: 20,
    display_order: 2,
  },
  {
    lot_tag_key: "du_be_tong",
    lot_tag_name: "Dư bê tông",
    lot_tag_rule: "Xe dư bê tông xếp theo thực tế như xe không tag.",
    sort_group: 20,
    display_order: 3,
  },
  {
    lot_tag_key: "keo_bom_tinh",
    lot_tag_name: "Kéo bơm tỉnh",
    lot_tag_rule: "Xe kéo bơm tỉnh xếp theo thực tế như xe không tag.",
    sort_group: 20,
    display_order: 4,
  },
  {
    lot_tag_key: "truc_san_xuat",
    lot_tag_name: "Trực sản xuất",
    lot_tag_rule: "Xe trực sản xuất xếp cuối lốt, trước xe chạy bơm.",
    sort_group: 30,
    display_order: 5,
  },
  {
    lot_tag_key: "chay_bom",
    lot_tag_name: "Chạy bơm",
    lot_tag_rule: "Xe chạy bơm xếp cuối lốt, sau trực sản xuất và trước làm việc khác.",
    sort_group: 40,
    display_order: 6,
  },
  {
    lot_tag_key: "lam_viec_khac",
    lot_tag_name: "Làm việc khác",
    lot_tag_rule: "Xe làm việc khác xếp cuối lốt, trước xe nghỉ.",
    sort_group: 50,
    display_order: 7,
  },
  {
    lot_tag_key: "nghi",
    lot_tag_name: "Nghỉ",
    lot_tag_rule: "Xe nghỉ xếp cuối cùng.",
    sort_group: 60,
    display_order: 8,
  },
];

/** Nhóm của xe KHÔNG tag — mốc tham chiếu cố định của mọi công thức. */
export const DEFAULT_LOT_TAG_GROUP = 20;

/** Nhóm fallback cho 8 tag gốc (khi chưa tải được sort_group từ danh mục DB). */
const VEHICLE_DAY_TAG_GROUPS: Record<string, number> = {
  ve_som: 10,
  sua_chua: 20,
  du_be_tong: 20,
  keo_bom_tinh: 20,
  truc_san_xuat: 30,
  chay_bom: 40,
  lam_viec_khac: 50,
  nghi: 60,
};

const TAG_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Key hợp lệ (slug) — KHÔNG giới hạn trong 8 tag gốc vì danh mục là động. */
export const isVehicleDayTag = (value: unknown): value is VehicleDayTag =>
  typeof value === "string" && TAG_KEY_PATTERN.test(value);

export const getVehicleDayTagGroup = (tag: VehicleDayTag | null | undefined): number =>
  tag ? (VEHICLE_DAY_TAG_GROUPS[tag] ?? DEFAULT_LOT_TAG_GROUP) : DEFAULT_LOT_TAG_GROUP;

const ITEM_NOTE_TAG_SEPARATOR = "#tag:";

/** item_note dạng "XE BỒN" hoặc "XE BỒN#tag:ve_som" — BE lưu text tự do, không cần đổi schema. */
export const parseMixerItemNoteTag = (note: string | null | undefined): VehicleDayTag | null => {
  const raw = String(note || "");
  const index = raw.indexOf(ITEM_NOTE_TAG_SEPARATOR);
  if (index < 0) return null;
  const value = raw.slice(index + ITEM_NOTE_TAG_SEPARATOR.length).trim();
  return isVehicleDayTag(value) ? value : null;
};

export const buildMixerItemNote = (base: string, tag: VehicleDayTag | null | undefined): string =>
  tag ? `${base}${ITEM_NOTE_TAG_SEPARATOR}${tag}` : base;

/** Chuyển tên tag người dùng nhập thành key slug (vd "Hỏng lốp" → "hong_lop"). */
export const slugifyLotTagKey = (name: string): string =>
  String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
