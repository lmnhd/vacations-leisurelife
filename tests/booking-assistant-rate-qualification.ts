import assert from "node:assert/strict";

import { calculateAgeAtSailing } from "../lib/booking-assistant/age-at-sailing.ts";
import { compareRateCandidate } from "../lib/booking-assistant/rate-comparison.ts";
import {
  isAgeCandidate,
  qualificationRulesForSupplier,
} from "../lib/booking-assistant/rate-qualification-registry.ts";

function run(): void {
  assert.equal(calculateAgeAtSailing("1961-08-22", "2026-08-22").age, 65);
  assert.equal(calculateAgeAtSailing("1961-08-23", "2026-08-22").age, 64);
  assert.throws(() => calculateAgeAtSailing("2026-02-30", "2026-08-22"));
  const seniorRule = qualificationRulesForSupplier("MSC Cruises").find((rule) => rule.minimumAge === 65);
  assert.ok(seniorRule);
  assert.equal(isAgeCandidate([65, 66], seniorRule!), true);
  assert.equal(isAgeCandidate([65, 64], seniorRule!), false);
  const comparison = compareRateCandidate({
    rateCandidateId: "rate-1",
    supplierRateCode: "TEST",
    rateLabel: "Candidate",
    capturedAtIso: "2026-07-26T12:00:00.000Z",
    qualifiedTravelerIds: ["traveler-1"],
    totalIncludingTaxesFees: "$1,850.00",
    ordinaryRateBaselineTotal: "$2,000.00",
    verificationStatus: "candidate",
  });
  assert.equal(comparison.savings, 150);
  assert.equal(comparison.isCheaper, true);
  assert.equal(comparison.requiresGuestChoice, true);
  console.log("Booking Assistant rate qualification tests passed.");
}

run();
