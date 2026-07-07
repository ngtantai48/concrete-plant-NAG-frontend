import assert from "node:assert/strict";
import test from "node:test";

import {
  findBestMenuRouteMatch,
  isMenuRouteMatch,
} from "../../src/components/layout/sidebar-route-match.ts";

const menuItems = [
  {
    key: "tools-group",
    children: [{ key: "/work-arrangements" }, { key: "/work-arrangements/lot-tag-requests" }],
  },
  {
    key: "category-group",
    children: [{ key: "/configuration/lot-tags" }],
  },
];

test("matches route boundaries without selecting similarly prefixed routes", () => {
  assert.equal(isMenuRouteMatch("/work-arrangements/lot-tag-requests", "/work-arrangements"), true);
  assert.equal(isMenuRouteMatch("/work-arrangements-extra", "/work-arrangements"), false);
});

test("selects the longest sidebar route match for nested work-arrangement pages", () => {
  assert.deepEqual(findBestMenuRouteMatch(menuItems, "/work-arrangements/lot-tag-requests"), {
    key: "/work-arrangements/lot-tag-requests",
    parentKeys: ["tools-group"],
  });
});

test("keeps detail pages active on their parent sidebar item", () => {
  assert.deepEqual(findBestMenuRouteMatch(menuItems, "/configuration/lot-tags/12"), {
    key: "/configuration/lot-tags",
    parentKeys: ["category-group"],
  });
});
