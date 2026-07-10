import assert from "node:assert/strict";
import test from "node:test";

import {
  getLotTagRequestAvailableActions,
  normalizeLotTagRequestList,
  normalizeLotTagRequestStatus,
} from "../../src/services/lot-tag-request-workflow.ts";

test("normalizes lot-tag request statuses from backend aliases", () => {
  assert.equal(normalizeLotTagRequestStatus("submitted"), "pending");
  assert.equal(normalizeLotTagRequestStatus("reviewing"), "pending");
  assert.equal(normalizeLotTagRequestStatus("cancelled"), "canceled");
  assert.equal(normalizeLotTagRequestStatus("approved"), "approved");
  assert.equal(normalizeLotTagRequestStatus("unknown"), "pending");
});

test("derives default workflow actions by status and permission", () => {
  assert.deepEqual(
    getLotTagRequestAvailableActions({ request_status: "pending" }, { canReview: true }),
    ["approve", "reject"]
  );
  assert.deepEqual(
    getLotTagRequestAvailableActions({ request_status: "pending" }, { canCancel: true }),
    ["cancel"]
  );
  assert.deepEqual(
    getLotTagRequestAvailableActions(
      { request_status: "approved" },
      { canReview: true, canCancel: true, canDelete: true }
    ),
    ["delete"]
  );
  assert.deepEqual(
    getLotTagRequestAvailableActions(
      { request_status: "pending" },
      { canReview: true, canCancel: true, canDelete: true }
    ),
    ["approve", "reject", "cancel", "delete"]
  );
});

test("intersects backend workflow actions with the current user permissions", () => {
  const request = {
    request_status: "pending",
    workflow_available_actions: ["approve", "reject", "cancel", "delete"],
  };

  assert.deepEqual(getLotTagRequestAvailableActions(request, { canReview: true }), [
    "approve",
    "reject",
  ]);
  assert.deepEqual(getLotTagRequestAvailableActions(request, { canCancel: true }), ["cancel"]);
  assert.deepEqual(getLotTagRequestAvailableActions(request, { canDelete: true }), ["delete"]);
});

test("normalizes lot-tag request list payloads from common API wrappers", () => {
  const result = normalizeLotTagRequestList(
    {
      data: {
        items: [
          {
            id: 77,
            status: "submitted",
            date: "2026-07-07T00:00:00.000Z",
            reason: "Xe cần về sớm",
            vehicle: { vehicle_id: 9, vehicle_license_plate: "51C-12345" },
            lot_tag: { lot_tag_id: 3, lot_tag_key: "ve_som", lot_tag_name: "Về sớm" },
            requester: { user_id: 5, user_full_name: "Anh Tài" },
          },
        ],
        total: 12,
        page: 2,
        limit: 5,
      },
    },
    { page: 2, limit: 5 }
  );

  assert.equal(result.total, 12);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 5);
  assert.equal(result.data[0].lot_tag_request_id, 77);
  assert.equal(result.data[0].request_status, "pending");
  assert.equal(result.data[0].work_date, "2026-07-07");
  assert.equal(result.data[0].request_reason, "Xe cần về sớm");
  assert.equal(result.data[0].vehicle?.vehicle_license_plate, "51C-12345");
  assert.equal(result.data[0].lot_tag?.lot_tag_name, "Về sớm");
  assert.equal(result.data[0].requested_by_user?.user_full_name, "Anh Tài");
});
