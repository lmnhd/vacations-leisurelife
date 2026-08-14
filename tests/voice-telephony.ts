/**
 * Telephony control-service tests.
 *
 * Covers webhook signature verification, idempotency, incoming-call parsing,
 * call admission (including the caller-ID-never-authenticates rule),
 * business-hours and transfer availability, and emergency-language handling.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifyWebhookSignature,
  WebhookDeduplicator,
  parseIncomingCall,
} from "../services/voice-telephony/src/webhook-verification.ts";
import {
  admitCall,
  canBindDraftFromCallerIdAlone,
  detectsEmergencyLanguage,
  isCorrelationUsable,
  isWithinBusinessHours,
  resolveTransferTarget,
  type CallIntentRecord,
} from "../services/voice-telephony/src/call-policy.ts";
import { buildCallOpeningResponse } from "../services/voice-telephony/src/call-opening.ts";

const SECRET = "whsec_" + Buffer.from("test-secret-value-1234567890").toString("base64");

function sign(webhookId: string, timestamp: string, body: string): string {
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${digest}`;
}

function testWebhookVerification(): void {
  const body = JSON.stringify({ type: "realtime.call.incoming", id: "evt_1" });
  const now = Math.floor(Date.now() / 1000);
  const timestamp = String(now);

  // Valid signature.
  const valid = verifyWebhookSignature(
    body,
    {
      webhookId: "wh_1",
      webhookTimestamp: timestamp,
      webhookSignature: sign("wh_1", timestamp, body),
    },
    SECRET,
    now
  );
  assert.equal(valid.valid, true, "a correctly signed webhook must verify");

  // Tampered body.
  const tampered = verifyWebhookSignature(
    JSON.stringify({ type: "realtime.call.incoming", id: "evt_2" }),
    {
      webhookId: "wh_1",
      webhookTimestamp: timestamp,
      webhookSignature: sign("wh_1", timestamp, body),
    },
    SECRET,
    now
  );
  assert.equal(tampered.valid, false, "a tampered body must fail verification");

  // Wrong secret.
  const wrongSecret = verifyWebhookSignature(
    body,
    {
      webhookId: "wh_1",
      webhookTimestamp: timestamp,
      webhookSignature: sign("wh_1", timestamp, body),
    },
    "whsec_" + Buffer.from("a-different-secret").toString("base64"),
    now
  );
  assert.equal(wrongSecret.valid, false, "a wrong secret must fail verification");

  // Replay outside the tolerance window.
  const oldTimestamp = String(now - 3600);
  const replayed = verifyWebhookSignature(
    body,
    {
      webhookId: "wh_1",
      webhookTimestamp: oldTimestamp,
      webhookSignature: sign("wh_1", oldTimestamp, body),
    },
    SECRET,
    now
  );
  assert.equal(replayed.valid, false, "stale timestamps must be rejected");

  // Missing headers.
  const missing = verifyWebhookSignature(body, {}, SECRET, now);
  assert.equal(missing.valid, false, "missing signature headers must be rejected");

  // Unconfigured secret must fail closed.
  const unconfigured = verifyWebhookSignature(
    body,
    {
      webhookId: "wh_1",
      webhookTimestamp: timestamp,
      webhookSignature: sign("wh_1", timestamp, body),
    },
    "",
    now
  );
  assert.equal(unconfigured.valid, false, "an unconfigured secret must fail closed");

  console.log("  webhook signature verification: ok");
}

function testWebhookIdempotency(): void {
  const deduplicator = new WebhookDeduplicator(1000);
  assert.equal(deduplicator.claim("wh_a", 0), true, "first delivery is claimed");
  assert.equal(deduplicator.claim("wh_a", 10), false, "a retry must be ignored");
  assert.equal(deduplicator.claim("wh_b", 10), true, "distinct ids are independent");
  // After the TTL passes, the entry is pruned.
  assert.equal(deduplicator.claim("wh_a", 5000), true, "entries expire after the ttl");

  console.log("  webhook idempotency: ok");
}

function testIncomingCallParsing(): void {
  const payload = JSON.stringify({
    object: "event",
    id: "evt_123",
    type: "realtime.call.incoming",
    created_at: 1750287018,
    data: {
      call_id: "rtc_abc",
      sip_headers: [
        { name: "From", value: "sip:+14015551234@example.com" },
        { name: "To", value: "sip:proj_1@sip.api.openai.com" },
        { name: "Call-ID", value: "xyz" },
      ],
    },
  });

  const parsed = parseIncomingCall(payload);
  assert.ok(parsed, "a valid incoming-call event must parse");
  assert.equal(parsed?.callId, "rtc_abc");
  assert.equal(parsed?.webhookId, "evt_123");
  assert.ok(parsed?.fromUri?.includes("+14015551234"));

  // Unrelated event types are ignored, not treated as calls.
  assert.equal(
    parseIncomingCall(JSON.stringify({ type: "response.completed", id: "evt_9" })),
    null
  );
  assert.equal(parseIncomingCall("not json"), null);
  assert.equal(
    parseIncomingCall(JSON.stringify({ type: "realtime.call.incoming", data: {} })),
    null,
    "an event with no call_id is not usable"
  );

  console.log("  incoming call parsing: ok");
}

function testCallAdmission(): void {
  const now = Date.now();

  // No correlation: the caller becomes the anonymous concierge, not an error.
  const anonymous = admitCall({
    callId: "rtc_1",
    fromUri: "sip:+14015551234@example.com",
    activeCalls: 0,
    maxConcurrentCalls: 4,
    correlation: null,
    nowMs: now,
  });
  assert.equal(anonymous.decision, "accept");
  if (anonymous.decision === "accept") {
    assert.equal(anonymous.mode, "anonymous_concierge");
  }

  // Caller ID alone can never bind a private draft.
  assert.equal(
    canBindDraftFromCallerIdAlone(),
    false,
    "caller ID must never authenticate or bind a draft"
  );

  // A valid correlation upgrades to a correlated resume.
  const correlation: CallIntentRecord = {
    code: "482913",
    conversationId: "conv_1",
    bookingDraftId: "draft_1",
    dealId: "deal_1",
    expiresAtMs: now + 60_000,
    consumed: false,
  };
  const correlated = admitCall({
    callId: "rtc_2",
    fromUri: null,
    activeCalls: 0,
    maxConcurrentCalls: 4,
    correlation,
    nowMs: now,
  });
  assert.equal(correlated.decision, "accept");
  if (correlated.decision === "accept") {
    assert.equal(correlated.mode, "correlated_resume");
  }

  // An expired correlation degrades to anonymous rather than ending the call.
  const expired = admitCall({
    callId: "rtc_3",
    fromUri: null,
    activeCalls: 0,
    maxConcurrentCalls: 4,
    correlation: { ...correlation, expiresAtMs: now - 1 },
    nowMs: now,
  });
  assert.equal(expired.decision, "accept");
  if (expired.decision === "accept") {
    assert.equal(
      expired.mode,
      "anonymous_concierge",
      "an expired code must not attach a private draft"
    );
  }

  // A consumed code likewise cannot be reused.
  const consumed = isCorrelationUsable({ ...correlation, consumed: true }, now);
  assert.equal(consumed.usable, false);

  // At capacity, reject with SIP 486 Busy.
  const busy = admitCall({
    callId: "rtc_4",
    fromUri: null,
    activeCalls: 4,
    maxConcurrentCalls: 4,
    correlation: null,
    nowMs: now,
  });
  assert.equal(busy.decision, "reject");
  if (busy.decision === "reject") {
    assert.equal(busy.statusCode, 486);
  }

  console.log("  call admission and correlation: ok");
}

function testTransferAvailability(): void {
  // No destination configured: transfer is unavailable and says so honestly.
  const unconfigured = resolveTransferTarget(undefined, true);
  assert.equal(unconfigured.available, false);
  if (!unconfigured.available) {
    assert.equal(unconfigured.reason, "no_transfer_destination_configured");
  }

  // Outside business hours: no promise of a person.
  const afterHours = resolveTransferTarget("+14015551234", false);
  assert.equal(afterHours.available, false);

  // Configured and in hours: a tel: URI for the refer operation.
  const available = resolveTransferTarget("+14015551234", true);
  assert.equal(available.available, true);
  if (available.available) {
    assert.equal(available.target, "tel:+14015551234");
  }

  // Business hours boundary behavior.
  const config = { startHour: 9, endHour: 20, timeZone: "America/New_York" };
  // 14:00 UTC is 10:00 EDT (inside) in August.
  assert.equal(
    isWithinBusinessHours(config, new Date("2026-08-13T14:00:00Z")),
    true,
    "mid-morning eastern must be inside business hours"
  );
  // 06:00 UTC is 02:00 EDT (outside).
  assert.equal(
    isWithinBusinessHours(config, new Date("2026-08-13T06:00:00Z")),
    false,
    "the middle of the night must be outside business hours"
  );

  console.log("  transfer availability: ok");
}

function testEmergencyDetection(): void {
  assert.equal(detectsEmergencyLanguage("I think we need to call 911 right now"), true);
  assert.equal(detectsEmergencyLanguage("this is a medical emergency"), true);
  assert.equal(detectsEmergencyLanguage("MAN OVERBOARD"), true, "matching is case-insensitive");
  assert.equal(detectsEmergencyLanguage("I would like a balcony cabin"), false);
  // The check is a substring match on explicit phrases. It errs toward
  // triggering (saying the emergency line to a caller who is fine is far
  // cheaper than missing a real emergency), so an incidental "emergency"
  // still fires. That is intended, and this test pins the behavior.
  assert.equal(
    detectsEmergencyLanguage("does the ship have an emergency doctor on board"),
    true,
    "incidental use of an emergency phrase still triggers the safety line by design"
  );

  console.log("  emergency language detection: ok");
}

function testCallOpeningResponse(): void {
  const event = buildCallOpeningResponse("Hello from the AI assistant.");
  assert.equal(event["type"], "response.create");
  const response = event["response"] as Record<string, unknown>;
  assert.equal(
    response["instructions"],
    "Say exactly this, then stop: Hello from the AI assistant."
  );
  console.log("  proactive call opening: ok");
}

function run(): void {
  console.log("Telephony service checks:");
  testWebhookVerification();
  testWebhookIdempotency();
  testIncomingCallParsing();
  testCallAdmission();
  testTransferAvailability();
  testEmergencyDetection();
  testCallOpeningResponse();
  console.log("All telephony service checks passed.");
}

run();
