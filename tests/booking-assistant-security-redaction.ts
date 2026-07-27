import assert from "node:assert/strict";

import {
  assertAllowedStructuredKeys,
  assertNoRestrictedStructuredContent,
  redactConversationText,
} from "../lib/booking-assistant/redaction.ts";

function run(): void {
  assert.equal(redactConversationText("Which cabin types are available?").disposition, "accepted");
  assert.equal(redactConversationText("My credit card number is 4111111111111111").disposition, "discarded");
  assert.equal(redactConversationText("I can send my DD214").disposition, "quarantined");
  assert.throws(() => assertAllowedStructuredKeys({ cvv: "123" }), /Restricted field/);
  assert.throws(() => assertAllowedStructuredKeys({ traveler: { military_id: "secret" } }), /Restricted field/);
  assert.doesNotThrow(() => assertAllowedStructuredKeys({ traveler: { legalFirstName: "Test" } }));
  assert.throws(
    () => assertNoRestrictedStructuredContent({ accessibilityNeeds: "My card number is 4111 1111 1111 1111" }),
    /Restricted payment/
  );
  console.log("Booking Assistant redaction security tests passed.");
}

run();
