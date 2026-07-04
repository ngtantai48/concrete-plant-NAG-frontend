/**
 * Tag trạng thái xe bồn theo ngày, gắn trên bảng Xe bồn (Bố trí công việc).
 * Modal "Chụp lốt" đọc tag để tự xếp nhóm lốt:
 *   nhóm 1  ve_som          → lốt đầu
 *   nhóm 2  (không tag) / sua_chua / du_be_tong / keo_bom_tinh → theo thực tế, không di chuyển
 *   nhóm 3  truc_san_xuat   → cuối lốt, trước chạy bơm
 *   nhóm 4  chay_bom        → cuối lốt, trước việc khác
 *   nhóm 5  lam_viec_khac   → cuối lốt, trước xe nghỉ
 *   nhóm 6  nghi            → cuối cùng
 * Module tự chứa (không import runtime) để chạy được dưới `node --test`.
 */

export type VehicleDayTag =
  | "ve_som"
  | "sua_chua"
  | "du_be_tong"
  | "keo_bom_tinh"
  | "truc_san_xuat"
  | "chay_bom"
  | "lam_viec_khac"
  | "nghi";

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

export const DEFAULT_LOT_TAG_GROUP = 2;

const VEHICLE_DAY_TAG_GROUPS: Record<VehicleDayTag, number> = {
  ve_som: 1,
  sua_chua: 2,
  du_be_tong: 2,
  keo_bom_tinh: 2,
  truc_san_xuat: 3,
  chay_bom: 4,
  lam_viec_khac: 5,
  nghi: 6,
};

export const isVehicleDayTag = (value: unknown): value is VehicleDayTag =>
  typeof value === "string" && (VEHICLE_DAY_TAGS as readonly string[]).includes(value);

export const getVehicleDayTagGroup = (tag: VehicleDayTag | null | undefined): number =>
  tag ? VEHICLE_DAY_TAG_GROUPS[tag] : DEFAULT_LOT_TAG_GROUP;

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
