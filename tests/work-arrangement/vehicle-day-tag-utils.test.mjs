import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMixerItemNote,
  getVehicleDayTagGroup,
  isVehicleDayTag,
  parseMixerItemNoteTag,
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

test("ignores unknown or malformed tag suffixes", () => {
  assert.equal(parseMixerItemNoteTag("XE BỒN#tag:bogus"), null);
  assert.equal(parseMixerItemNoteTag("XE BỒN#tag:"), null);
  assert.equal(isVehicleDayTag("ve_som"), true);
  assert.equal(isVehicleDayTag("bogus"), false);
});

test("maps tags to lot groups in the agreed order", () => {
  assert.equal(getVehicleDayTagGroup("ve_som"), 1);
  assert.equal(getVehicleDayTagGroup(null), 2);
  assert.equal(getVehicleDayTagGroup("sua_chua"), 2);
  assert.equal(getVehicleDayTagGroup("du_be_tong"), 2);
  assert.equal(getVehicleDayTagGroup("keo_bom_tinh"), 2);
  assert.equal(getVehicleDayTagGroup("truc_san_xuat"), 3);
  assert.equal(getVehicleDayTagGroup("chay_bom"), 4);
  assert.equal(getVehicleDayTagGroup("lam_viec_khac"), 5);
  assert.equal(getVehicleDayTagGroup("nghi"), 6);
});
