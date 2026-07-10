import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMixerItemNote,
  getVehicleDayTagGroup,
  isVehicleDayTag,
  LEGACY_LOT_TAG_SEEDS,
  parseMixerItemNoteTag,
  slugifyLotTagKey,
  VEHICLE_DAY_TAGS,
} from "../../src/services/vehicle-day-tag-utils.ts";

test("round-trips every tag through the mixer item note", () => {
  for (const tag of VEHICLE_DAY_TAGS) {
    const note = buildMixerItemNote("XE BỒN", tag);
    assert.equal(note, `XE BỒN#tag:${tag}`);
    assert.equal(parseMixerItemNoteTag(note), tag);
  }
});

test("keeps the plain note when there is no tag", () => {
  assert.equal(buildMixerItemNote("XE BỒN", null), "XE BỒN");
  assert.equal(parseMixerItemNoteTag("XE BỒN"), null);
  assert.equal(parseMixerItemNoteTag(null), null);
  assert.equal(parseMixerItemNoteTag(undefined), null);
});

test("accepts dynamic catalog keys but rejects malformed suffixes", () => {
  // Danh mục tag là động → key lạ nhưng đúng dạng slug vẫn hợp lệ.
  assert.equal(parseMixerItemNoteTag("XE BỒN#tag:hong_lop"), "hong_lop");
  assert.equal(isVehicleDayTag("hong_lop"), true);
  assert.equal(isVehicleDayTag("ve_som"), true);
  // Sai dạng (rỗng, hoa, dấu cách, ký tự lạ) → null.
  assert.equal(parseMixerItemNoteTag("XE BỒN#tag:"), null);
  assert.equal(parseMixerItemNoteTag("XE BỒN#tag:Về Sớm"), null);
  assert.equal(isVehicleDayTag("Về Sớm"), false);
  assert.equal(isVehicleDayTag(""), false);
});

test("maps seed tags to fallback lot groups; unknown keys default to group 20", () => {
  assert.equal(getVehicleDayTagGroup("ve_som"), 10);
  assert.equal(getVehicleDayTagGroup(null), 20);
  assert.equal(getVehicleDayTagGroup("sua_chua"), 20);
  assert.equal(getVehicleDayTagGroup("du_be_tong"), 20);
  assert.equal(getVehicleDayTagGroup("keo_bom_tinh"), 20);
  assert.equal(getVehicleDayTagGroup("truc_san_xuat"), 30);
  assert.equal(getVehicleDayTagGroup("chay_bom"), 40);
  assert.equal(getVehicleDayTagGroup("lam_viec_khac"), 50);
  assert.equal(getVehicleDayTagGroup("nghi"), 60);
  assert.equal(getVehicleDayTagGroup("hong_lop"), 20);
});

test("defines legacy lot-tag seeds in the old tag order", () => {
  assert.deepEqual(
    LEGACY_LOT_TAG_SEEDS.map((tag) => [tag.lot_tag_key, tag.sort_group, tag.display_order]),
    [
      ["ve_som", 10, 1],
      ["sua_chua", 20, 2],
      ["du_be_tong", 20, 3],
      ["keo_bom_tinh", 20, 4],
      ["truc_san_xuat", 30, 5],
      ["chay_bom", 40, 6],
      ["lam_viec_khac", 50, 7],
      ["nghi", 60, 8],
    ]
  );
});

test("slugifies Vietnamese tag names into stable keys", () => {
  assert.equal(slugifyLotTagKey("Về sớm"), "ve_som");
  assert.equal(slugifyLotTagKey("Hỏng lốp"), "hong_lop");
  assert.equal(slugifyLotTagKey("Dư bê tông"), "du_be_tong");
  assert.equal(slugifyLotTagKey("  Trực  sản xuất!  "), "truc_san_xuat");
  assert.equal(slugifyLotTagKey(""), "");
});
