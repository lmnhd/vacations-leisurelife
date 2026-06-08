/**
 * Phase 5 proof artifact: Structured Promo Extraction.
 *
 * Asserts the Celebrity Summer Sale record in the on-disk cache extracted the
 * specific terms the plan calls out, and that public-copy discipline held. This
 * runs against the persisted extraction (deterministic, no token spend). To
 * regenerate the extraction first:
 *
 *   npm run extract-cb-promo-intelligence -- --id cbpromo-2837
 *
 * Run:
 *   npm run test:promo-extraction
 */

import * as fs from "fs";
import path from "path";

import { validatePromoIntelligenceCache } from "../lib/cb/deals-system";
import type { CbPromoIntelligenceRecord } from "../lib/cb/deals-system/promo-intelligence-types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CACHE_PATH = path.join(process.cwd(), ".github", "data", "cb-promo-intelligence-cache.json");

console.log("Phase 5 - Structured Promo Extraction (Celebrity fixture)\n");

const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
const validation = validatePromoIntelligenceCache(raw);
check("cache validates against schema", validation.ok, validation.errors.join("; "));

const celebrity: CbPromoIntelligenceRecord | undefined = validation.value?.records.find(
  (r) => r.id === "cbpromo-2837"
);

if (!celebrity) {
  console.error("\n  Celebrity record cbpromo-2837 not found. Run the scraper first.");
  process.exit(1);
}

if (celebrity.diagnostics.status !== "succeeded") {
  console.error(
    `\n  Celebrity record not yet extracted (status=${celebrity.diagnostics.status}).` +
      ` Run: npm run extract-cb-promo-intelligence -- --id cbpromo-2837`
  );
  process.exit(1);
}

const e = celebrity.extracted;
const m = celebrity.marketingUse;
const hay = JSON.stringify(celebrity).toLowerCase();

// --- Windows (deterministic, from Phase 4 scrape) ---
console.log("Date windows:");
check("booking window starts 2026-06-02", celebrity.bookingWindow.startsOn === "2026-06-02");
check("booking window ends 2026-07-27", celebrity.bookingWindow.endsOn === "2026-07-27");
check("sailing window starts 2026-06-03", celebrity.sailingWindow.startsOn === "2026-06-03");
check("sailing window ends 2028-05-10", celebrity.sailingWindow.endsOn === "2028-05-10");

// --- Offer types ---
console.log("\nOffer types:");
check("includes second_guest_discount", e.offerTypes.includes("second_guest_discount"));
check("includes onboard_credit", e.offerTypes.includes("onboard_credit"));
check("includes free_extra_guests", e.offerTypes.includes("free_extra_guests"));

// --- 75% second guest language ---
console.log("\n75% second guest:");
const has75 = e.percentDiscounts.some(
  (p) => p.percentOff === 75 && /2nd|second/i.test(p.appliesTo)
);
check("captures 75% off 2nd guest", has75);
const has75NonRefundable = e.percentDiscounts.some(
  (p) => p.percentOff === 75 && p.depositType === "non_refundable"
);
check("75% tied to non-refundable deposit", has75NonRefundable);

// --- Bonus savings / OBC tiers ---
console.log("\nBonus savings / OBC tiers:");
check("has dollar savings OR onboard credit tiers", e.dollarSavings.length + e.onboardCredits.length > 0);
const has700 =
  e.dollarSavings.some((d) => d.amountUsd === 700) ||
  e.onboardCredits.some((c) => c.amountUsd === 700);
check("captures the $700 top-tier amount", has700);
const tiersHaveContext = [...e.dollarSavings, ...e.onboardCredits].some(
  (t) => Boolean(t.voyageLength) || Boolean(t.cabinCategory) || Boolean(t.bookingDayWindow)
);
check("tiers carry voyage/cabin/booking-day context", tiersHaveContext);

// --- Every numeric perk traces to source text ---
console.log("\nSource tracing:");
const allMonetary = [...e.percentDiscounts, ...e.dollarSavings, ...e.onboardCredits];
check(
  "every monetary perk has non-empty rawText",
  allMonetary.length > 0 && allMonetary.every((x) => x.rawText.trim().length > 0)
);

// --- GroupX / single supplement exclusion ---
console.log("\nGroupX / single supplement exclusion:");
check("groupX not combinable (false) or flagged", e.combinability.groupXRates === false || hay.includes("groupx"));
check("single supplement not combinable (false) or flagged", e.combinability.singleSupplements === false || hay.includes("single supplement"));

// --- Galapagos exclusion ---
console.log("\nGalapagos exclusion:");
check("Galapagos exclusion captured somewhere", hay.includes("galapagos"));

// --- Public-copy discipline ---
console.log("\nPublic-copy discipline:");
check("has at least one public-safe claim", m.publicClaimsAllowed.length > 0);
check("has caution flags", m.cautionFlags.length > 0);
check("visitor summary is non-empty", m.visitorFriendlySummary.trim().length > 0);
const summaryLower = m.visitorFriendlySummary.toLowerCase();
check(
  "visitor summary uses qualified language (may/select/vary/eligible)",
  /\bmay\b|select|vary|varies|eligible|depend/.test(summaryLower)
);
check(
  "visitor summary does not promise a guaranteed flat perk amount",
  !/guaranteed|\$700 onboard|every second guest gets 75/.test(summaryLower)
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
