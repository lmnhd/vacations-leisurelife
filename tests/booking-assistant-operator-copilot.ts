import assert from "node:assert/strict";

import { modelForTask, ModelName } from "@/lib/ai/llm-gateway";
import { inspectCurrentBookingLink } from "@/lib/booking-assistant/current-booking-link-research";
import { buildOperatorCopilotContext } from "@/lib/booking-assistant/operator-copilot";
import type { BookingDraft } from "@/lib/booking-assistant/types";

const draft: BookingDraft = {
  metadata: {
    bookingDraftId: "draft-secret",
    personId: "person-secret",
    dealId: "123",
    packageId: "PKG",
    siid: "SIID",
    status: "review_ready",
    urgency: "normal",
    flowDefinitionVersion: 1,
    bookingFlowVersion: 1,
    completionMode: "agent",
    completionModeVersion: 1,
    packetVersion: 1,
    createdAtIso: "2026-07-26T00:00:00.000Z",
    updatedAtIso: "2026-07-26T00:00:00.000Z",
    lastGuestActivityAtIso: "2026-07-26T00:00:00.000Z",
    lastMeaningfulGuestActivityAtIso: "2026-07-26T00:00:00.000Z",
    journalSequence: 1,
    version: 1,
  },
  dealSnapshot: {
    dealId: "123",
    packageId: "PKG",
    siid: "SIID",
    cruiseLine: "Royal Caribbean",
    ship: "Allure of the Seas",
    sailingDateIso: "2027-02-08",
    nights: 7,
    departurePort: "Miami",
    itineraryLabel: "Eastern Caribbean",
    dealAngle: "Winter escape",
    priceDisplay: "$999",
    currency: "USD",
    taxFeeBasis: "Taxes additional",
    priceCapturedAtIso: "2026-07-25T00:00:00.000Z",
    sourceBookingUrl: "https://example.com/private-booking",
    linkHealthState: "healthy",
  },
  contact: {
    firstName: "Secret Name",
    email: "secret@example.com",
    phoneE164: "+19045551234",
    preferredChannel: "phone",
    emailVerified: true,
    phoneVerified: true,
    transactionalEmailConsent: true,
    callbackConsent: true,
    smsConsent: false,
    marketingConsent: false,
  },
  travelers: [
    {
      travelerId: "traveler-secret",
      isPrimary: true,
      classification: "adult",
      ageAtSailing: 67,
      legalFirstName: "Secret",
      legalLastName: "Person",
      dateOfBirth: "1959-01-01",
      addressLine1: "123 Secret Street",
      residencyCountry: "United States",
      residencyStateProvince: "FL",
      rateQualificationClaims: [],
      fieldStatuses: {},
    },
  ],
  cabins: [
    {
      cabinId: "cabin-secret",
      assignedTravelerIds: ["traveler-secret"],
      categoryPreference: "Balcony",
      qualifyingTravelerIds: [],
      rateCandidates: [],
    },
  ],
  decisions: {
    travelInsuranceDecision: "interested",
    passengerDataReviewConfirmed: true,
    packetStorageConsent: true,
  },
};

const context = buildOperatorCopilotContext(draft);
const serialized = JSON.stringify(context);

assert.equal(modelForTask("operator_copilot"), ModelName.GPT_5_HIGH);
assert.equal(serialized.includes("Allure of the Seas"), true);
assert.equal(serialized.includes("\"FL\""), true);
assert.equal(serialized.includes("Balcony"), true);
assert.equal(serialized.includes("Secret Name"), false);
assert.equal(serialized.includes("secret@example.com"), false);
assert.equal(serialized.includes("+19045551234"), false);
assert.equal(serialized.includes("1959-01-01"), false);
assert.equal(serialized.includes("123 Secret Street"), false);
assert.equal(serialized.includes("private-booking"), false);
assert.equal(serialized.includes("draft-secret"), false);
assert.equal(serialized.includes("person-secret"), false);

console.log("Booking Assistant operator copilot tests passed.");

async function testCurrentBookingLinkSanitization(): Promise<void> {
  const bookingDraft: BookingDraft = {
    ...draft,
    dealSnapshot: {
      ...draft.dealSnapshot,
      sourceBookingUrl: "https://bookings.cbagenttools.com/swift/cruise/package/123",
    },
  };
  const fetchMock = (async () => new Response(
    "<html><head><title>Current sailing</title></head><body>Allure of the Seas now from $1,099. Secret Name secret@example.com +19045551234</body></html>",
    { status: 200, headers: { "content-type": "text/html" } }
  )) as typeof fetch;

  const research = await inspectCurrentBookingLink(bookingDraft, fetchMock);
  assert.equal(research.pageExcerpt.includes("Allure of the Seas now from $1,099"), true);
  assert.equal(research.pageExcerpt.includes("Secret Name"), false);
  assert.equal(research.pageExcerpt.includes("secret@example.com"), false);
  assert.equal(research.pageExcerpt.includes("+19045551234"), false);
  assert.equal(research.sourceUrl, "https://bookings.cbagenttools.com/swift/cruise/package/123");
  assert.equal(research.sourceLabel.includes("?"), false);
}

void testCurrentBookingLinkSanitization().then(() => {
  console.log("Current booking-link research tests passed.");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
