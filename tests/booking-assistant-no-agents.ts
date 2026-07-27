import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { effectiveAgentAvailability } from "../lib/booking-assistant/agent-availability.ts";
import { canTransitionBookingStatus } from "../lib/booking-assistant/contracts.ts";
import { requireBookingEventDefinition } from "../lib/booking-assistant/event-registry.ts";

function run(): void {
  const active = effectiveAgentAvailability({
    mode: "no_agents",
    effectiveUntilIso: "2026-07-27T12:00:00.000Z",
    changedAtIso: "2026-07-26T12:00:00.000Z",
    changedByOperatorId: "operator",
    version: 2,
  }, new Date("2026-07-26T13:00:00.000Z"));
  assert.equal(active.mode, "no_agents");

  const expired = effectiveAgentAvailability({
    ...active,
    effectiveUntilIso: "2026-07-26T12:30:00.000Z",
  }, new Date("2026-07-26T13:00:00.000Z"));
  assert.equal(expired.mode, "available");

  assert.equal(
    canTransitionBookingStatus("ready_to_call_agent", "human_requested"),
    true
  );
  assert.equal(
    canTransitionBookingStatus("ready_to_call_agent", "ready_to_call_agent"),
    true
  );
  assert.equal(requireBookingEventDefinition("callback_requested").owner, "guest");
  assert.equal(requireBookingEventDefinition("no_agents_try_later_selected").owner, "guest");

  const signalService = readFileSync("lib/booking-assistant/guest-service.ts", "utf8");
  assert.equal(signalService.includes("availabilityConditionCheck(config.tableName, nowIso)"), true);
  assert.equal(signalService.includes('outcome: "no_agents"'), true);

  const callbackService = readFileSync("lib/booking-assistant/no-agents-service.ts", "utf8");
  assert.equal(callbackService.includes('"callback_requested_receipt"'), true);
  assert.equal(callbackService.includes('"no_agents_try_later_receipt"'), true);
  assert.equal(callbackService.includes('SK: { S: "CALLBACK_ACTIVE" }'), true);
  assert.equal(callbackService.includes("Call key:"), true);

  const reminderWorker = readFileSync("lib/booking-assistant/reminder-worker.ts", "utf8");
  assert.equal(reminderWorker.includes('availability.mode === "no_agents"'), true);
  assert.equal(reminderWorker.includes("deferReminderProgram("), true);

  const guestFlow = readFileSync(
    "app/(tests)/tests/deals-system/booking-assistant/booking-flow-experience.tsx",
    "utf8"
  );
  assert.equal(guestFlow.includes("No agents currently available"), true);
  assert.equal(guestFlow.includes("Have an agent call me"), true);
  assert.equal(guestFlow.includes("I'll try again later"), false);
  assert.equal(guestFlow.includes("I&apos;ll try again later"), true);

  const operator = readFileSync(
    "app/(tests)/tests/booking-assistant-operator/page.tsx",
    "utf8"
  );
  assert.equal(operator.includes("No Agents until tomorrow"), true);
  assert.equal(operator.includes("No Agents until changed"), true);
  assert.equal(operator.includes("Guest asked for help"), true);
  assert.equal(operator.includes("Live calls now"), true);
  assert.equal(operator.includes("Callback requests"), true);
  assert.equal(operator.includes("Waiting for guest call"), true);
  assert.equal(operator.includes("Guests in this lane are trying to reach an agent right now."), true);
  assert.equal(operator.includes("Guests in this lane asked to be called back."), true);
  assert.equal(operator.includes("This guest is trying to reach an agent now."), true);
  assert.equal(operator.includes("This guest asked to be called back."), true);
  assert.equal(operator.includes("Claim this callback request to unlock the guest packet and callback details."), true);
  assert.equal(operator.includes("This was a callback request. Reveal the packet to get the guest&apos;s callback phone number and saved details."), true);
  assert.equal(operator.includes("canRevealPacket(activeDraftStatus, claimed, verified)"), true);

  console.log("Booking Assistant No Agents mode tests passed.");
}

run();
