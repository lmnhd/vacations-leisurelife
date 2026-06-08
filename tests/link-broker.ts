/**
 * Phase 2 proof artifact: Internal Link Broker unit tests.
 *
 * Covers the Phase 2 Test checklist:
 *  - package entry URL generation
 *  - prepared details URL generation
 *  - parsing of captured package / details / clone / cabin URLs
 *  - redaction of phone numbers in logs/diagnostics
 *  - clonebkg and brn cannot be guessed (constructed links never carry them)
 *
 * Plus the Phase 2 exit-criteria scenarios via resolveBestBookingLink.
 *
 * Run:
 *   npm run test:link-broker
 */

import {
  buildPackageEntryLink,
  buildPreparedDetailsLink,
  buildPreparedDetailsLinkEngineVariant,
  parseCapturedOdysseusLink,
  redactPhone,
  redactUrlForLog,
  staticValidateLink,
  resolveBestBookingLink,
  travelerSetupHash,
  getCachedBrokerLink,
  upsertBrokerLink,
  detectOfficeIdMismatch,
} from "../lib/cb/link-broker";
import { emptyLinkBrokerCache } from "../lib/cb/deals-system/caches";
import type { LinkBrokerRequest } from "../lib/cb/deals-system/link-broker-types";

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

const SIID = "1049337";

console.log("Phase 2 - Internal Link Broker\n");

// --- Package entry URL generation ---
console.log("Package entry link builder:");
const pkgUrl = buildPackageEntryLink({
  packageId: "1636340",
  siid: SIID,
  slug: "4-day-moreton-island",
});
check(
  "builds expected package entry URL",
  pkgUrl ===
    "https://bookings.cbagenttools.com/swift/cruise/package/1636340--4-day-moreton-island?siid=1049337&lang=1",
  pkgUrl
);
check(
  "builds without slug",
  buildPackageEntryLink({ packageId: "999", siid: SIID }) ===
    "https://bookings.cbagenttools.com/swift/cruise/package/999?siid=1049337&lang=1"
);

// --- Prepared details URL generation ---
console.log("\nPrepared details link builder:");
const prepUrl = buildPreparedDetailsLink({
  packageId: "1621764",
  siid: SIID,
  officeId: "286",
  passengerCount: 2,
  ages: [45, 32],
  state: "FL",
  airportCode: "FLL",
});
// Canonical shape MATCHES the real portal Share-button output.
check("prepared details uses double-slash share path", prepUrl.includes("/web//cruises/details.aspx"));
check("prepared details contains pid", prepUrl.includes("pid=1621764"));
check("prepared details uses lowercase skipdetails", prepUrl.includes("skipdetails=true") && !prepUrl.includes("skipDetails=true"));
check("prepared details contains CurrId=USD", prepUrl.includes("CurrId=USD"));
check("prepared details omits packageTourId", !prepUrl.includes("packageTourId"));
check("prepared details encodes ages as p2=45%2c32", prepUrl.includes("p2=45%2c32"));
check("prepared details encodes res triple", prepUrl.includes("res=US%2cFL%2cFLL"));
check("prepared details contains tt=29", prepUrl.includes("tt=29"));
check("prepared details contains officeId + siid", prepUrl.includes("officeId=286") && prepUrl.includes("siid=1049337"));
check("prepared details omits PhoneNum when no phone", !prepUrl.includes("PhoneNum"));
check(
  "prepared details rejects mismatched age count",
  (() => {
    try {
      buildPreparedDetailsLink({
        packageId: "1",
        siid: SIID,
        officeId: "286",
        passengerCount: 2,
        ages: [35],
        state: "FL",
        airportCode: "DAB",
      });
      return false;
    } catch {
      return true;
    }
  })()
);
// Engine fallback variant keeps its own (single-slash, camelCase) shape.
const engineUrl = buildPreparedDetailsLinkEngineVariant({
  packageId: "1621764",
  siid: SIID,
  officeId: "193",
  passengerCount: 2,
  ages: [45, 32],
  state: "FL",
  airportCode: "DAB",
});
check("engine variant uses single-slash + camelCase + packageTourId", engineUrl.includes("/web/cruises/details.aspx") && engineUrl.includes("skipDetails=true") && engineUrl.includes("packageTourId=-1"));

// --- Captured-link parsing ---
console.log("\nCaptured-link parser:");
const parsedPkg = parseCapturedOdysseusLink(pkgUrl);
check("classifies package entry", parsedPkg.linkClass === "package_entry");
check("extracts package id from path", parsedPkg.packageId === "1636340");
check("extracts siid", parsedPkg.siid === SIID);

const parsedDetails = parseCapturedOdysseusLink(prepUrl + "&PhoneNum=5615551234");
check("classifies prepared details", parsedDetails.linkClass === "prepared_details");
check("parses passenger count", parsedDetails.passengerCount === 2);
check("parses ages", JSON.stringify(parsedDetails.ages) === JSON.stringify([45, 32]));
check("parses state from res", parsedDetails.state === "FL");
check("detects phone present", parsedDetails.hasPhone === true);
check(
  "parser redacts phone in rawParams",
  parsedDetails.rawParams.PhoneNum === "[redacted]"
);

const cloneUrl =
  "https://bookings.cbagenttools.com/web/cruises/details.aspx?source=swift&pid=1477753&siid=1049337&clonebkg=ABC123";
const parsedClone = parseCapturedOdysseusLink(cloneUrl);
check("classifies captured clone via clonebkg", parsedClone.linkClass === "captured_clone");
check("captures clone token", parsedClone.cloneBookingToken === "ABC123");

const cabinUrl = "https://bookings.cbagenttools.com/web/cruises/cabin.aspx?brn=XYZ789";
const parsedCabin = parseCapturedOdysseusLink(cabinUrl);
check("classifies captured cabin via brn", parsedCabin.linkClass === "captured_cabin");
check("captures booking reference", parsedCabin.bookingReference === "XYZ789");

// Real portal Share link: details.aspx path + clonebkg present -> captured_clone.
const realShareLink =
  "https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid=1621764&siid=1049337&lang=1&CurrId=USD&officeId=286&skipdetails=true&op=0%2c0%2c0%2c0%2c0%2c0%2c0%2c0%2c%2c%2c0%2c0&res=US%2cFL%2cFLL&tt=29&p1=2&p2=45%2c32&PhoneNum=9042573090&clonebkg=07A__BESTPRICE__07A__";
const parsedShare = parseCapturedOdysseusLink(realShareLink);
check("real share link classifies as captured_clone (clonebkg present)", parsedShare.linkClass === "captured_clone");
check("real share link captures structured clonebkg", parsedShare.cloneBookingToken === "07A__BESTPRICE__07A__");
check("real share link parses pid", parsedShare.packageId === "1621764");
check("real share link parses officeId 286", parsedShare.officeId === "286");
check("real share link parses CurrId", parsedShare.currencyId === "USD");
check("real share link redacts phone in rawParams", parsedShare.rawParams.PhoneNum === "[redacted]");

// officeId mismatch detection.
console.log("\nofficeId mismatch diagnostics:");
check("no warning when officeId matches default", detectOfficeIdMismatch("286", "286") === undefined);
check("warning when officeId differs from default", Boolean(detectOfficeIdMismatch("193", "286")));
check("no warning when nothing captured", detectOfficeIdMismatch(undefined, "286") === undefined);

// --- Phone redaction ---
console.log("\nPhone redaction:");
check("redactPhone keeps last two digits", redactPhone("561-555-1234") === "********34");
check("redactPhone handles empty", redactPhone(undefined) === "");
check(
  "redactUrlForLog strips PhoneNum",
  redactUrlForLog("https://x/y?a=1&PhoneNum=5615551234&b=2") ===
    "https://x/y?a=1&PhoneNum=[redacted]&b=2"
);

// --- clonebkg / brn cannot be guessed ---
console.log("\nPortal-generated tokens cannot be guessed:");
check(
  "constructed package entry has no clonebkg/brn",
  !pkgUrl.includes("clonebkg") && !pkgUrl.includes("brn")
);
check(
  "constructed prepared details has no clonebkg/brn",
  !prepUrl.includes("clonebkg") && !prepUrl.includes("brn")
);
check(
  "static validation flags a constructed link carrying a clonebkg",
  !staticValidateLink(cloneUrl, "prepared_details", { constructed: true }).ok
);

// --- Cache helpers (in-memory, does not touch the on-disk seed) ---
console.log("\nCache lookup/upsert (in-memory):");
const memCache = emptyLinkBrokerCache();
const setupHash = travelerSetupHash({ passengerCount: 2, ages: [35, 35], state: "FL", airportCode: "DAB", officeId: "193" });
upsertBrokerLink(
  {
    id: `prepared_details::1477753::${SIID}::${setupHash}`,
    packageId: "1477753",
    siid: SIID,
    linkClass: "prepared_details",
    url: prepUrl,
    urlHash: "h",
    source: "constructed",
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
    health: { status: "unknown" },
    parameterSummary: { hasPhone: false, hasCloneBookingToken: false, hasBookingReference: false },
  },
  memCache,
  { persist: false }
);
const hit = getCachedBrokerLink(
  { packageId: "1477753", siid: SIID, linkClass: "prepared_details", travelerSetupHash: setupHash },
  memCache
);
check("cache upsert+lookup round-trips", hit?.url === prepUrl);
check(
  "cache miss on different setup hash",
  getCachedBrokerLink(
    { packageId: "1477753", siid: SIID, linkClass: "prepared_details", travelerSetupHash: "different" },
    memCache
  ) === undefined
);

// --- Exit-criteria scenarios (cache disabled to avoid mutating the seed file) ---
console.log("\nExit-criteria scenarios (resolveBestBookingLink):");

async function run(): Promise<void> {
  // 1. package ID + siid -> package entry link
  const r1 = await resolveBestBookingLink(
    {
      intent: "build_from_package_id",
      cruise: { packageId: "1636340", itineraryName: "4 Day Moreton Island" },
      agent: { siid: SIID },
    } satisfies LinkBrokerRequest,
    { useCache: false }
  );
  check(
    "package ID + siid returns a package entry link",
    r1.linkClass === "package_entry" && Boolean(r1.url),
    `${r1.status} / ${r1.linkClass}`
  );

  // 2. package ID + siid + traveler setup -> prepared details link
  const r2 = await resolveBestBookingLink(
    {
      intent: "build_from_package_id",
      cruise: { packageId: "1477753" },
      agent: { siid: SIID, officeId: "193" },
      travelerSetup: { passengerCount: 2, ages: [35, 35], state: "FL", airportCode: "DAB" },
    } satisfies LinkBrokerRequest,
    { useCache: false }
  );
  check(
    "package ID + setup returns a prepared details link",
    r2.linkClass === "prepared_details" && Boolean(r2.url),
    `${r2.status} / ${r2.linkClass}`
  );

  // 3. only ship/line/date -> needs_package_lookup
  const r3 = await resolveBestBookingLink(
    {
      intent: "find_best_link",
      cruise: { cruiseLine: "Celebrity", shipName: "Edge", sailDate: "2026-09-01" },
      agent: { siid: SIID },
    } satisfies LinkBrokerRequest,
    { useCache: false }
  );
  check(
    "ship/line/date only returns needs_package_lookup",
    r3.status === "needs_package_lookup",
    r3.status
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
