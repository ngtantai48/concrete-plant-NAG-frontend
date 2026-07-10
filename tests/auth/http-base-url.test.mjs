import assert from "node:assert/strict";
import test from "node:test";

import { resolveHttpBaseUrl } from "../../src/lib/http-base-url.ts";

test("uses the current frontend origin for browser API calls when enabled", () => {
  assert.equal(
    resolveHttpBaseUrl(
      "https://backend.na.savinatestinghub.com/api/v1/",
      "https://nguyenanhdonghoi.com",
      true
    ),
    "https://nguyenanhdonghoi.com/api/v1/"
  );
});

test("keeps the configured backend URL for server and development calls", () => {
  const configured = "https://backend.na.savinatestinghub.com/api/v1/";
  assert.equal(resolveHttpBaseUrl(configured, undefined, true), configured);
  assert.equal(resolveHttpBaseUrl(configured, "http://localhost:3000", false), configured);
});
