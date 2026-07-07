import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLotTagFormulaMessages,
  parseLotTagFormulaResponse,
} from "../../src/services/lot-tag-formula-llm.ts";

test("builds messages with new tag, existing catalog and QA history", () => {
  const messages = buildLotTagFormulaMessages({
    name: "Hỏng lốp",
    rule: "Xe hỏng lốp thì mai chạy cuối",
    existingTags: [
      { name: "Về sớm", rule: "Xếp lốt đầu.", sort_group: 10 },
      { name: "Nghỉ", rule: "Cuối cùng tuyệt đối.", sort_group: 60 },
    ],
    qaHistory: [{ question: "Trước hay sau xe nghỉ?", answer: "Trước xe nghỉ" }],
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /sort_group/);
  const payload = JSON.parse(messages[1].content);
  assert.equal(payload.tag_moi.ten, "Hỏng lốp");
  assert.equal(payload.danh_muc_hien_co.length, 2);
  assert.equal(payload.danh_muc_hien_co[1].sort_group, 60);
  assert.equal(payload.hoi_dap_da_co[0].dap, "Trước xe nghỉ");
});

test("omits QA block when history is empty", () => {
  const messages = buildLotTagFormulaMessages({
    name: "A",
    rule: "B",
    existingTags: [],
  });
  const payload = JSON.parse(messages[1].content);
  assert.equal("hoi_dap_da_co" in payload, false);
});

test("parses an ok result and clamps sort_group to integer range", () => {
  const ok = parseLotTagFormulaResponse(
    '{"status":"ok","sort_group":35,"summary":"Sau Trực sản xuất, trước Chạy bơm"}'
  );
  assert.deepEqual(ok, {
    status: "ok",
    sort_group: 35,
    summary: "Sau Trực sản xuất, trước Chạy bơm",
  });

  assert.equal(parseLotTagFormulaResponse('{"status":"ok","sort_group":250}').sort_group, 99);
  assert.equal(parseLotTagFormulaResponse('{"status":"ok","sort_group":-5}').sort_group, 1);
  assert.equal(parseLotTagFormulaResponse('{"status":"ok","sort_group":34.6}').sort_group, 35);
});

test("parses a clarifying question, even inside code fences", () => {
  const result = parseLotTagFormulaResponse(
    '```json\n{"status":"question","question":"Xe này đứng trước hay sau xe nghỉ?"}\n```'
  );
  assert.deepEqual(result, {
    status: "question",
    question: "Xe này đứng trước hay sau xe nghỉ?",
  });
});

test("returns null for garbage, empty question or missing sort_group", () => {
  assert.equal(parseLotTagFormulaResponse("không rõ"), null);
  assert.equal(parseLotTagFormulaResponse('{"status":"question","question":""}'), null);
  assert.equal(parseLotTagFormulaResponse('{"status":"ok"}'), null);
});
