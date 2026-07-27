import assert from "node:assert/strict";

import {
  BOOKING_FIELD_CATALOG_VERSION,
  getBookingFieldDefinition,
  validateBookingFieldValue,
} from "../lib/booking-assistant/field-catalog.ts";
import { getPilotFlowDefinition } from "../lib/booking-assistant/flow-definition.ts";

function run(): void {
  const flow = getPilotFlowDefinition();
  assert.equal(flow.fieldCatalogVersion, BOOKING_FIELD_CATALOG_VERSION);
  assert.equal(flow.flowId, "deal_booking_completion/call_agent_to_finalize_v1");
  assert.equal(flow.tasks.at(-1)?.taskId, "review");
  assert.ok(flow.tasks.some((task) => task.taskId === "savings_eligibility"));

  const email = getBookingFieldDefinition("contact.email");
  assert.ok(email);
  assert.equal(validateBookingFieldValue(email!, "guest@example.com"), null);
  assert.ok(validateBookingFieldValue(email!, "not-an-email"));
  assert.equal(getBookingFieldDefinition("travelers.legal_identity.2")?.privacy, "tier_c");
  assert.equal(getBookingFieldDefinition("unknown"), null);
  console.log("Booking Assistant field catalog and flow tests passed.");
}

run();
