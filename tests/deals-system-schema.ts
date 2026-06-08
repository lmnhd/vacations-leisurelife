/**
 * Phase 1 proof artifact: Deals System schema/cache validation.
 *
 * Asserts that:
 *  - empty cache factories validate
 *  - the four on-disk cache files load and validate
 *  - the hand-authored sample Curated Deal does NOT publish (publishing gate)
 *  - the hand-authored sample Link Broker record validates
 *  - malformed payloads are rejected (negative cases)
 *
 * Run:
 *   npm run test:deals-schema
 */

import * as fs from "fs";

import {
  DEALS_CACHE_PATHS,
  emptyPromoIntelligenceCache,
  emptyCuratedDealsCache,
  emptyLinkBrokerCache,
  emptyCallbackRequestsCache,
  validatePromoIntelligenceCache,
  validateCuratedDealsCache,
  validateLinkBrokerCache,
  validateCallbackRequestsCache,
} from "../lib/cb/deals-system";

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

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

console.log("Phase 1 - Deals System schema validation\n");

// 1. Empty factories validate.
console.log("Empty cache factories:");
check(
  "empty promo intelligence cache validates",
  validatePromoIntelligenceCache(emptyPromoIntelligenceCache()).ok
);
check(
  "empty curated deals cache validates",
  validateCuratedDealsCache(emptyCuratedDealsCache()).ok
);
check(
  "empty link broker cache validates",
  validateLinkBrokerCache(emptyLinkBrokerCache()).ok
);
check(
  "empty callback requests cache validates",
  validateCallbackRequestsCache(emptyCallbackRequestsCache()).ok
);

// 2. On-disk cache files load and validate.
console.log("\nOn-disk cache files:");
const promoResult = validatePromoIntelligenceCache(readJson(DEALS_CACHE_PATHS.promoIntelligence));
check("cb-promo-intelligence-cache.json validates", promoResult.ok, promoResult.errors.join("; "));

const dealsResult = validateCuratedDealsCache(readJson(DEALS_CACHE_PATHS.curatedDeals));
check("odysseus-curated-deals-cache.json validates", dealsResult.ok, dealsResult.errors.join("; "));

const brokerResult = validateLinkBrokerCache(readJson(DEALS_CACHE_PATHS.linkBroker));
check("cb-link-broker-cache.json validates", brokerResult.ok, brokerResult.errors.join("; "));

const callbackResult = validateCallbackRequestsCache(readJson(DEALS_CACHE_PATHS.callbackRequests));
check("deal-callback-requests-cache.json validates", callbackResult.ok, callbackResult.errors.join("; "));

// 3. Sample Curated Deal must NOT publish (status !== bookable / link not valid).
console.log("\nPublishing gate (no public Deal without a valid booking path):");
const sampleDeal = dealsResult.value?.deals.find(
  (d) => d.id === "sample-deal-bahamas-not-published"
);
check("sample Curated Deal exists", Boolean(sampleDeal));
check(
  "sample Curated Deal does not publish (status is not bookable)",
  sampleDeal?.status !== "bookable"
);
check(
  "sample Curated Deal link health is not valid",
  sampleDeal?.linkHealth.status !== "valid"
);

// 4. Sample Link Broker record validates and is a non-portal-generated class.
console.log("\nSample Link Broker record:");
const sampleBroker = brokerResult.value?.records.find(
  (r) => r.id === "sample-link-broker-1636340-package-entry"
);
check("sample Link Broker record exists", Boolean(sampleBroker));
check(
  "sample Link Broker record is a package_entry link",
  sampleBroker?.linkClass === "package_entry"
);
check(
  "sample Link Broker record carries no portal-generated tokens",
  sampleBroker?.parameterSummary.hasCloneBookingToken === false &&
    sampleBroker?.parameterSummary.hasBookingReference === false
);

// 5. Negative cases — malformed payloads must be rejected.
console.log("\nNegative cases (malformed payloads must fail):");
check(
  "wrong version rejected",
  !validateLinkBrokerCache({ version: 2, generatedAtIso: new Date().toISOString(), records: [] }).ok
);
check(
  "bookable Deal with non-valid link health rejected",
  !validateCuratedDealsCache({
    version: 1,
    generatedAtIso: new Date().toISOString(),
    briefs: [],
    deals: [
      {
        id: "bad",
        status: "bookable",
        source: "odysseus_curated_retail",
        briefId: "x",
        capturedAtIso: new Date().toISOString(),
        packageId: "1",
        siid: "1049337",
        bookingUrl: "https://example.com",
        bookingUrlSource: "constructed_package_url",
        linkHealth: { status: "stale" },
        cruiseFacts: {
          title: "x",
          cruiseLine: "x",
          shipName: "x",
          itineraryName: "x",
          nights: 1,
          sailDateIso: "2026-01-01",
          portsOfCall: [],
          cabinPrices: { currencyCode: "USD" },
          promoSignals: [],
        },
        scoring: { score: 0, reasons: [], warnings: [] },
        packaging: {
          headline: "x",
          shortSummary: "x",
          highlights: [],
          destinationNotes: [],
          bestFor: [],
        },
      },
    ],
  }).ok
);
check(
  "link broker record claiming clone token but not captured_clone rejected",
  !validateLinkBrokerCache({
    version: 1,
    generatedAtIso: new Date().toISOString(),
    records: [
      {
        id: "bad",
        packageId: "1",
        siid: "1049337",
        linkClass: "package_entry",
        url: "https://example.com",
        urlHash: "x",
        source: "constructed",
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
        health: { status: "unknown" },
        parameterSummary: {
          hasPhone: false,
          hasCloneBookingToken: true,
          hasBookingReference: false,
        },
      },
    ],
  }).ok
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
