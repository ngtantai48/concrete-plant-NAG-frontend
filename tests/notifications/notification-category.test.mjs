import assert from "node:assert/strict";
import test from "node:test";

import {
  getLotTagRequestId,
  getNotificationCategory,
  isLotTagRequestInvalidTransition,
} from "../../src/lib/notification-category.ts";

test("separates maintenance, busy-request and general notifications", () => {
  assert.equal(getNotificationCategory({ type: "vehicle_maintenance" }), "maintenance");
  assert.equal(getNotificationCategory({ type: "lot_tag_request" }), "lotTagRequest");
  assert.equal(getNotificationCategory({ type: "transport" }), "general");
  assert.equal(getNotificationCategory({}), "general");
});

test("reads only valid positive lot-tag request ids from notifications", () => {
  assert.equal(getLotTagRequestId({ lot_tag_request_id: 18 }), 18);
  assert.equal(getLotTagRequestId({ lot_tag_request_id: "27" }), 27);
  assert.equal(getLotTagRequestId({ lot_tag_request_id: 0 }), null);
  assert.equal(getLotTagRequestId({ lot_tag_request_id: "invalid" }), null);
});

test("recognizes stale busy-request transition errors", () => {
  assert.equal(
    isLotTagRequestInvalidTransition("ERR_LOT_TAG_REQUESTS::INVALID_TRANSITION"),
    true
  );
  assert.equal(isLotTagRequestInvalidTransition("Network Error"), false);
});
