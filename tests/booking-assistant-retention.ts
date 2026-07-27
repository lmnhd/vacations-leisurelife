import assert from "node:assert/strict";

import { retentionDisposition } from "../lib/booking-assistant/retention.ts";

function run(): void {
  const now = new Date("2026-07-26T12:00:00.000Z");
  assert.equal(retentionDisposition("2026-07-01T12:00:00.000Z", 30, now), "retain");
  assert.equal(retentionDisposition("2026-06-01T12:00:00.000Z", 30, now), "delete_protected_content");
  assert.throws(() => retentionDisposition("2026-06-01T12:00:00.000Z", 0, now));
  console.log("Booking Assistant retention tests passed.");
}

run();
