import assert from "node:assert/strict";
import test from "node:test";

import {
  getLotItemKey,
  getLotOrderMoveUpdates,
  sortLotItemsByGroup,
} from "../../src/components/features/work-arrangement/assignment/lot-capture-order.ts";

const makeItems = () => [
  { order_id: 1, vehicle_id: 101, label: "X1" },
  { order_id: 2, vehicle_id: 102, label: "X2" },
  { order_id: 3, vehicle_id: 103, label: "X3" },
  { order_id: 4, vehicle_id: 104, label: "X4" },
  { order_id: -205, vehicle_id: 205, group: "unreturned", label: "U" },
];

const labels = (items) => items.map((item) => item.label);

test("moves tagged vehicles into their groups while keeping in-group order", () => {
  // X3 về sớm (nhóm 10), X1 nghỉ (nhóm 60), X2/X4 không tag (nhóm 20, giữ thứ tự).
  const groups = new Map([
    [103, 10],
    [101, 60],
  ]);
  const next = sortLotItemsByGroup(makeItems(), groups);

  assert.deepEqual(labels(next), ["X3", "X2", "X4", "X1", "U"]);
});

test("orders the tail groups: trực sản xuất → chạy bơm → việc khác → nghỉ", () => {
  const items = [
    { order_id: 1, vehicle_id: 1, label: "nghi" },
    { order_id: 2, vehicle_id: 2, label: "chay_bom" },
    { order_id: 3, vehicle_id: 3, label: "thuong" },
    { order_id: 4, vehicle_id: 4, label: "lam_viec_khac" },
    { order_id: 5, vehicle_id: 5, label: "truc_san_xuat" },
    { order_id: 6, vehicle_id: 6, label: "ve_som" },
  ];
  const groups = new Map([
    [1, 60],
    [2, 40],
    [4, 50],
    [5, 30],
    [6, 10],
  ]);

  assert.deepEqual(labels(sortLotItemsByGroup(items, groups)), [
    "ve_som",
    "thuong",
    "truc_san_xuat",
    "chay_bom",
    "lam_viec_khac",
    "nghi",
  ]);
});

test("returns the same array reference when nothing moves", () => {
  const items = makeItems();
  assert.strictEqual(sortLotItemsByGroup(items, new Map()), items);
  assert.strictEqual(sortLotItemsByGroup(items, new Map([[101, 10]])), items);
});

test("keeps unreturned vehicles pinned at the end", () => {
  const groups = new Map([[205, 10]]); // tag trên xe chưa về không được kéo lên đầu
  const items = makeItems();
  assert.strictEqual(sortLotItemsByGroup(items, groups), items);
});

test("computes sequential move updates that replay previous → next", () => {
  const previous = makeItems();
  const groups = new Map([
    [103, 10],
    [101, 60],
  ]);
  const next = sortLotItemsByGroup(previous, groups);
  const updates = getLotOrderMoveUpdates(previous, next);

  // Mô phỏng backend rút-chèn theo từng update để kiểm tra hội tụ đúng thứ tự cuối.
  const working = previous.filter((item) => item.order_id > 0).map(getLotItemKey);
  for (const update of updates) {
    const fromIndex = working.indexOf(update.itemKey);
    working.splice(fromIndex, 1);
    working.splice(update.targetPosition - 1, 0, update.itemKey);
  }

  assert.deepEqual(working, next.filter((item) => item.order_id > 0).map(getLotItemKey));
  assert.deepEqual(getLotOrderMoveUpdates(previous, previous), []);
});
