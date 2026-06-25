/**
 * Phase 6 proof artifact: Odysseus package-lookup ranker.
 *
 * Covers the Phase 6 Test checklist that doesn't need a live portal:
 *  - package ID resolution from exact ship + sail date
 *  - resolution from ship + date + nights
 *  - resolution from cruise line + destination + date window
 *  - ambiguous matches return candidates instead of silently picking
 *  - results without a package ID are dropped
 *
 * The live operator lookup (real Odysseus search) is run separately:
 *   npx tsx --env-file=.env.local scripts/lookup-odysseus-package.ts --line "Royal Caribbean" --date 2026-MM-DD
 *
 * Run:
 *   npm run test:package-lookup
 */

import { rankPackageCandidates } from "../lib/cb/link-broker/package-lookup";
import type { CruiseResult } from "../lib/services/odysseus/types";
import type { LinkBrokerCruiseFacts } from "../lib/cb/link-broker";
import { extractPackagePageCabinPricing } from "../lib/services/odysseus/package-page-pricing";

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

/** Minimal CruiseResult fixture builder. */
function makeResult(opts: {
  pkgId: number;
  code: string;
  name: string;
  cruiselineId?: number;
  shipId?: number;
  startDateTime: string;
  duration: number;
  departureCode?: string;
  ports?: string;
}): CruiseResult {
  return {
    code: opts.code,
    name: opts.name,
    uniqueItineraryId: opts.code,
    itinerary: {
      id: opts.pkgId,
      duration: opts.duration,
      departure: { code: opts.departureCode ?? "MIA", type: "port" },
      arrival: { code: opts.departureCode ?? "MIA", type: "port" },
      portsOfCalls: opts.ports ?? "",
      normalizedPortsOfCall: opts.ports ?? "",
    },
    prices: [],
    ship: { id: opts.shipId ?? 100, cruiseline: opts.cruiselineId ? { id: opts.cruiselineId } : undefined },
    packages: [
      {
        id: opts.pkgId,
        startDateTime: opts.startDateTime,
        endDateTime: opts.startDateTime,
        prices: [],
        voyageId: String(opts.pkgId),
        maxOccupancy: 4,
        minOccupancy: 1,
        cruiseDuration: opts.duration,
      },
    ],
  } as CruiseResult;
}

console.log("Phase 6 - Odysseus package-lookup ranker\n");

const packagePagePricing = extractPackagePageCabinPricing([
  {
    currencyCode: "USD",
    items: [
      { name: "Balcony", value: 2268 },
      { name: "Inside", value: 1420 },
      { code: "CruiseTax", value: 346.17 },
      { code: "BalconyPortCharge", value: 315 },
    ],
  },
]);
check("package-page pricing captures cabin fares", packagePagePricing?.balcony === 2268);
check("package-page pricing ignores taxes as cabin fares", packagePagePricing?.leadFare === 1420);
check("package-page pricing ignores cabin-labeled port charges", packagePagePricing?.balcony === 2268);

// --- Exact ship + sail date -> confident ---
console.log("Exact ship + sail date:");
const wonder = makeResult({
  pkgId: 1500001,
  code: "WONDER-7N",
  name: "Wonder of the Seas 7-Night Caribbean",
  cruiselineId: 8,
  startDateTime: "2026-11-08T00:00:00",
  duration: 7,
});
const decoy = makeResult({
  pkgId: 1500002,
  code: "INDY-4N",
  name: "Independence of the Seas 4-Night Bahamas",
  cruiselineId: 8,
  startDateTime: "2026-12-20T00:00:00",
  duration: 4,
});
const r1 = rankPackageCandidates(
  { cruiseLine: "Royal Caribbean", shipName: "Wonder of the Seas", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [wonder, decoy]
);
check("exact ship+date -> confident_match", r1.status === "confident_match", r1.status);
check("selects the right package", r1.selected?.packageId === "1500001", r1.selected?.packageId);

// --- Ship + date + nights ---
console.log("\nShip + date + nights:");
const r2 = rankPackageCandidates(
  { shipName: "Wonder of the Seas", sailDate: "2026-11-08", nights: 7 } satisfies LinkBrokerCruiseFacts,
  [wonder, decoy]
);
check("ship+date+nights -> confident_match", r2.status === "confident_match", r2.status);
check("nights match recorded in reasons", Boolean(r2.selected?.reasons.some((x) => /nights match/.test(x))));

// --- Cruise line + destination + date window (no ship name) ---
console.log("\nLine + destination + date window:");
const alaska = makeResult({
  pkgId: 1600001,
  code: "OVA-7N-ALASKA",
  name: "Ovation of the Seas 7-Night Alaska",
  cruiselineId: 8,
  startDateTime: "2026-07-12T00:00:00",
  duration: 7,
  departureCode: "SEA",
  ports: "Juneau, Skagway, Sitka",
});
const r3 = rankPackageCandidates(
  { cruiseLine: "Royal Caribbean", destination: "Juneau", sailDate: "2026-07-12" } satisfies LinkBrokerCruiseFacts,
  [alaska]
);
check("line+destination+date -> confident_match (sole)", r3.status === "confident_match", r3.status);
check("destination keyword noted", Boolean(r3.selected?.reasons.some((x) => /destination/.test(x))));

// --- Ambiguous: two same-line, same-date sailings, no distinguishing ship ---
console.log("\nAmbiguous case:");
const twinA = makeResult({
  pkgId: 1700001,
  code: "TWIN-A",
  name: "7-Night Caribbean",
  cruiselineId: 8,
  startDateTime: "2026-09-05T00:00:00",
  duration: 7,
});
const twinB = makeResult({
  pkgId: 1700002,
  code: "TWIN-B",
  name: "7-Night Caribbean",
  cruiselineId: 8,
  startDateTime: "2026-09-05T00:00:00",
  duration: 7,
});
const r4 = rankPackageCandidates(
  { cruiseLine: "Royal Caribbean", sailDate: "2026-09-05" } satisfies LinkBrokerCruiseFacts,
  [twinA, twinB]
);
check("two indistinguishable sailings -> ambiguous (not silently picked)", r4.status === "ambiguous", r4.status);
check("ambiguous returns both candidates", r4.candidates.length === 2);
check("ambiguous has no auto-selection", r4.selected === undefined);

// --- Out of tolerance -> no_match ---
console.log("\nOut of date tolerance:");
const r5 = rankPackageCandidates(
  { shipName: "Wonder of the Seas", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [decoy] // sails 12/20, far from 11/08
);
check("far-off date -> no_match", r5.status === "no_match", r5.status);

// --- Result without package ID is dropped ---
console.log("\nMissing package ID:");
const noPkg = makeResult({
  pkgId: 0,
  code: "NOPKG",
  name: "Wonder of the Seas 7-Night",
  cruiselineId: 8,
  startDateTime: "2026-11-08T00:00:00",
  duration: 7,
});
const r6 = rankPackageCandidates(
  { shipName: "Wonder of the Seas", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [noPkg]
);
check("result with no package ID is dropped -> no_match", r6.status === "no_match", r6.status);
check("diagnostics mention dropped result", r6.diagnostics.some((d) => /no usable package id/i.test(d)));

// --- bestEffort: far-off date still resolves (deal system "always find a ship") ---
console.log("\nBest-effort (deal system):");
const r7 = rankPackageCandidates(
  { shipName: "Wonder of the Seas", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [decoy], // sails 12/20, far from 11/08 — strict mode returns no_match
  { bestEffort: true }
);
check("best-effort far-off date -> confident_match (not no_match)", r7.status === "confident_match", r7.status);
check("best-effort selects the sole real package", r7.selected?.packageId === "1500002", r7.selected?.packageId);

// --- bestEffort: ambiguous twins -> still auto-picks the closest, never ambiguous ---
const r8 = rankPackageCandidates(
  { cruiseLine: "Royal Caribbean", sailDate: "2026-09-05" } satisfies LinkBrokerCruiseFacts,
  [twinA, twinB],
  { bestEffort: true }
);
check("best-effort indistinguishable twins -> confident_match (coin flip)", r8.status === "confident_match", r8.status);
check("best-effort still returns a selection", r8.selected !== undefined);
check("best-effort keeps both candidates", r8.candidates.length === 2);

// --- bestEffort: prefers the candidate closest to the requested date ---
const near = makeResult({
  pkgId: 1800001,
  code: "NEAR",
  name: "7-Night Caribbean",
  cruiselineId: 8,
  startDateTime: "2026-11-10T00:00:00", // 2 days off
  duration: 7,
});
const far = makeResult({
  pkgId: 1800002,
  code: "FAR",
  name: "7-Night Caribbean",
  cruiselineId: 8,
  startDateTime: "2027-02-01T00:00:00", // far off
  duration: 7,
});
const r9 = rankPackageCandidates(
  { cruiseLine: "Royal Caribbean", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [far, near],
  { bestEffort: true }
);
check("best-effort picks the date-closest candidate", r9.selected?.packageId === "1800001", r9.selected?.packageId);

// --- bestEffort with zero candidates still returns no_match (nothing to pick) ---
const r10 = rankPackageCandidates(
  { shipName: "Wonder of the Seas", sailDate: "2026-11-08" } satisfies LinkBrokerCruiseFacts,
  [noPkg],
  { bestEffort: true }
);
check("best-effort with no usable package -> no_match", r10.status === "no_match", r10.status);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
