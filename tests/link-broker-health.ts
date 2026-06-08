/**
 * Phase 3 proof artifact: Link health rules.
 *
 * Covers the Phase 3 Test checklist that does NOT require a live browser:
 *  - valid / stale / broken / unknown labeling
 *  - stale-link rules (freshness window)
 *  - malformed links fail (static health -> broken)
 *  - missing siid fails
 *  - prepared details parameter consistency
 *
 * Browser validation against a real CB/Odysseus link is operator-run:
 *   npx tsx -e "import('./lib/cb/link-broker').then(m => m.validateBrokerLink('<url>', { storageStatePath: '.playwright-state.json' }).then(console.log))"
 *
 * Run:
 *   npm run test:link-broker-health
 */

import {
  computeHealth,
  staticHealth,
  refreshHealthStaleness,
  isStale,
  addHoursIso,
  DEFAULT_FRESHNESS_HOURS,
} from "../lib/cb/link-broker";

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

const NOW = "2026-06-08T12:00:00.000Z";

console.log("Phase 3 - Link health rules\n");

// --- computeHealth labeling ---
console.log("computeHealth labeling:");
const validHealth = computeHealth({ passed: true, verifiedAtIso: NOW, nowIso: NOW });
check("passed + fresh -> valid", validHealth.status === "valid", validHealth.status);
check(
  "valid sets nextVerificationDueIso 24h out",
  validHealth.nextVerificationDueIso === addHoursIso(NOW, DEFAULT_FRESHNESS_HOURS)
);

const brokenHealth = computeHealth({ passed: false, failureReason: "Package Not Found", nowIso: NOW });
check("not passed -> broken", brokenHealth.status === "broken");
check("broken keeps failureReason", brokenHealth.failureReason === "Package Not Found");

const unknownHealth = computeHealth({ passed: undefined, nowIso: NOW });
check("undefined passed -> unknown", unknownHealth.status === "unknown");

// verified 30h ago with a 24h window -> stale
const staleVerifiedAt = addHoursIso(NOW, -30);
const staleHealth = computeHealth({ passed: true, verifiedAtIso: staleVerifiedAt, nowIso: NOW });
check("passed but aged out -> stale", staleHealth.status === "stale", staleHealth.status);

// --- stale rules ---
console.log("\nStale-link rules:");
check("isStale false within window", isStale(addHoursIso(NOW, -1), 24, NOW) === false);
check("isStale true past window", isStale(addHoursIso(NOW, -25), 24, NOW) === true);
check("isStale false when never verified", isStale(undefined, 24, NOW) === false);
check(
  "refreshHealthStaleness flips aged valid -> stale",
  refreshHealthStaleness(
    { status: "valid", lastVerifiedAtIso: addHoursIso(NOW, -25) },
    24,
    NOW
  ).status === "stale"
);
check(
  "refreshHealthStaleness leaves fresh valid alone",
  refreshHealthStaleness(
    { status: "valid", lastVerifiedAtIso: addHoursIso(NOW, -1) },
    24,
    NOW
  ).status === "valid"
);
check(
  "refreshHealthStaleness leaves broken alone",
  refreshHealthStaleness({ status: "broken" }, 24, NOW).status === "broken"
);

// --- static health: malformed / missing siid / param consistency ---
console.log("\nStatic health (no browser):");

const goodPackageEntry =
  "https://bookings.cbagenttools.com/swift/cruise/package/1636340--x?siid=1049337&lang=1";
check(
  "valid package entry -> unknown (needs live check)",
  staticHealth(goodPackageEntry, "package_entry", { constructed: true }).status === "unknown"
);

const wrongHost = "https://example.com/swift/cruise/package/1?siid=1049337&lang=1";
check("wrong host -> broken", staticHealth(wrongHost, "package_entry").status === "broken");

const missingSiid =
  "https://bookings.cbagenttools.com/swift/cruise/package/1636340--x?lang=1";
const missingSiidHealth = staticHealth(missingSiid, "package_entry");
check("missing siid -> broken", missingSiidHealth.status === "broken");
check(
  "missing siid reports siid in failureReason",
  Boolean(missingSiidHealth.failureReason?.toLowerCase().includes("siid"))
);

// prepared details parameter consistency: ages count must match passenger count
const inconsistentPrepared =
  "https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid=1&siid=1049337&lang=1&CurrId=USD&officeId=286&skipdetails=true&res=US%2cFL%2cFLL&tt=29&p1=2&p2=35";
check(
  "prepared details with mismatched age count -> broken",
  staticHealth(inconsistentPrepared, "prepared_details").status === "broken"
);

const consistentPrepared =
  "https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid=1&siid=1049337&lang=1&CurrId=USD&officeId=286&skipdetails=true&res=US%2cFL%2cFLL&tt=29&p1=2&p2=45%2c32";
check(
  "prepared details with consistent params -> unknown (needs live check)",
  staticHealth(consistentPrepared, "prepared_details").status === "unknown"
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
