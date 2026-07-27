import assert from "node:assert/strict";

import {
  BOOKING_OPTION_REGISTRY_VERSION,
  availableBookingOptions,
} from "../lib/booking-assistant/option-registry.ts";

function run(): void {
  assert.equal(BOOKING_OPTION_REGISTRY_VERSION, 1);
  const anonymous = availableBookingOptions("collecting", false).map((option) => option.actionId);
  assert.deepEqual(anonymous, ["ask_question"]);
  const contacted = availableBookingOptions("collecting", true).map((option) => option.actionId);
  assert.ok(contacted.includes("continue_later"));
  assert.ok(contacted.includes("cancel_delete"));
  const ready = availableBookingOptions("ready_to_call_agent", true).map((option) => option.actionId);
  assert.equal(ready.includes("continue_later"), false);
  assert.ok(ready.includes("stop_reminders"));
  console.log("Booking Assistant option registry tests passed.");
}

run();
