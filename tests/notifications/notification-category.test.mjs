import assert from "node:assert/strict";
import test from "node:test";

import { getNotificationCategory } from "../../src/lib/notification-category.ts";

test("separates maintenance, busy-request and general notifications", () => {
  assert.equal(getNotificationCategory({ type: "vehicle_maintenance" }), "maintenance");
  assert.equal(getNotificationCategory({ type: "lot_tag_request" }), "lotTagRequest");
  assert.equal(getNotificationCategory({ type: "transport" }), "general");
  assert.equal(getNotificationCategory({}), "general");
});
