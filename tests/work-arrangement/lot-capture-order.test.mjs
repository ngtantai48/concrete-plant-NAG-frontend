import assert from "node:assert/strict";
import test from "node:test";

import {
  getLotItemKey,
  getPersistedLotOrderPosition,
  getPersistedLotOrderUpdates,
  isPersistedLotOrderItem,
  moveLotItemByDirection,
  moveLotItemToPosition,
} from "../../src/components/features/work-arrangement/assignment/lot-capture-order.ts";

const makeItems = () => [
  { order_id: 1, vehicle_id: 101, label: "A" },
  { order_id: 2, vehicle_id: 102, label: "B" },
  { order_id: 3, vehicle_id: 103, label: "C" },
];

const labels = (items) => items.map((item) => item.label);

test("moves the selected lot item to a one-based position", () => {
  const items = makeItems();
  const next = moveLotItemToPosition(items, getLotItemKey(items[2]), 1);

  assert.deepEqual(labels(next), ["C", "A", "B"]);
  assert.deepEqual(labels(items), ["A", "B", "C"]);
});

test("finds the selected lot item by key instead of a stale render index", () => {
  const [first, second, third] = makeItems();
  const currentItems = [second, third, first];
  const next = moveLotItemToPosition(currentItems, getLotItemKey(first), 2);

  assert.deepEqual(labels(next), ["B", "A", "C"]);
});

test("moves the selected lot item by direction and respects bounds", () => {
  const items = makeItems();

  assert.deepEqual(labels(moveLotItemByDirection(items, getLotItemKey(items[0]), 1)), [
    "B",
    "A",
    "C",
  ]);
  assert.strictEqual(moveLotItemByDirection(items, getLotItemKey(items[0]), -1), items);
});

test("ignores invalid selected positions", () => {
  const items = makeItems();

  assert.strictEqual(moveLotItemToPosition(items, getLotItemKey(items[1]), Number.NaN), items);
  assert.strictEqual(moveLotItemToPosition(items, getLotItemKey(items[1]), 4), items);
});

test("computes persisted order positions while ignoring vehicles without real orders", () => {
  const items = [
    { order_id: 1, vehicle_id: 101, label: "A" },
    { order_id: -201, vehicle_id: 201, group: "unreturned", label: "U" },
    { order_id: 2, vehicle_id: 102, label: "B" },
  ];

  assert.equal(isPersistedLotOrderItem(items[0]), true);
  assert.equal(isPersistedLotOrderItem(items[1]), false);
  assert.equal(getPersistedLotOrderPosition(items, getLotItemKey(items[2])), 2);
});

test("returns backend order updates in descending target position order", () => {
  const items = [
    { order_id: 2, vehicle_id: 102, label: "B" },
    { order_id: 1, vehicle_id: 101, label: "A" },
    { order_id: 3, vehicle_id: 103, label: "C" },
    { order_id: -201, vehicle_id: 201, group: "unreturned", label: "U" },
  ];

  assert.deepEqual(
    getPersistedLotOrderUpdates(items, [
      getLotItemKey(items[1]),
      getLotItemKey(items[2]),
      getLotItemKey(items[3]),
    ]),
    [
      { itemKey: getLotItemKey(items[2]), orderId: 3, targetPosition: 3 },
      { itemKey: getLotItemKey(items[1]), orderId: 1, targetPosition: 2 },
    ]
  );
});
