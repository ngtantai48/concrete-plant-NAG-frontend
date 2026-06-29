import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkMixSlotItems } from "../../src/services/work-mix-slot-utils.ts";

const symbolByTypeId = new Map([[10, "X"]]);
const shortNameByUserId = new Map([[501, "An"]]);

test("includes every X vehicle and moves vehicles without active slot orders to the end", () => {
  const items = buildWorkMixSlotItems({
    includeAllMixerVehicles: true,
    symbolByTypeId,
    shortNameByUserId,
    vehicles: [
      { vehicle_id: 1, vehicle_name: "X1", vehicle_license_plate: "51A-001", vehicle_type_id: 10 },
      { vehicle_id: 2, vehicle_name: "X2", vehicle_license_plate: "51A-002", vehicle_type_id: 10 },
      { vehicle_id: 3, vehicle_name: "X3", vehicle_license_plate: "51A-003", vehicle_type_id: 10 },
    ],
    orders: [
      {
        order_id: 1001,
        order_number: 7,
        order_status: "pending",
        shift_closing: null,
        users: { user_id: 501, user_full_name: "Nguyen Van An" },
        vehicles: {
          vehicle_id: 2,
          vehicle_name: "X2",
          vehicle_license_plate: "51A-002",
          vehicle_type_id: 10,
          vehicle_status: "available",
        },
      },
    ],
  });

  assert.deepEqual(
    items.map((item) => item.vehicle_name),
    ["X2", "X1", "X3"]
  );
  assert.equal(items[0].group, "pending");
  assert.deepEqual(
    items.slice(1).map((item) => item.group),
    ["unreturned", "unreturned"]
  );
});

test("keeps active-order-only behavior unless all mixer vehicles are requested", () => {
  const items = buildWorkMixSlotItems({
    includeAllMixerVehicles: false,
    symbolByTypeId,
    shortNameByUserId,
    vehicles: [
      { vehicle_id: 1, vehicle_name: "X1", vehicle_license_plate: "51A-001", vehicle_type_id: 10 },
    ],
    orders: [],
  });

  assert.deepEqual(items, []);
});
