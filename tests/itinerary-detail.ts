/**
 * Proof artifact: Odysseus day-by-day itinerary capture + normalization.
 *
 * The search API only returns a coarse ports-of-call STRING. The real day-by-day
 * schedule (port names, arrival/departure times, sea days) lives at
 * GET /nitroapi/v2/cruise/itinerary/{id}. This test parses the ACTUAL archived
 * payload (itinerary 479966) through the schema + normalizer to prove we extract
 * the exact itinerary the booking page shows.
 *
 * Run:
 *   npx tsx tests/itinerary-detail.ts
 */

import { readFileSync } from "fs";
import path from "path";

import {
  ItineraryDetailSchema,
  normalizeItineraryDetail,
} from "../lib/services/odysseus/types";
import {
  applyResolvedPackage,
  parseRankedCandidate,
} from "../lib/cb/deals-system/deal-package-resolver";
import type { DealTripManifest } from "../lib/cb/deals-system/deal-trip-manifest-types";
import type { RankedPackageCandidate } from "../lib/cb/link-broker/package-lookup";

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

const ARCHIVE = path.join(
  process.cwd(),
  ".github/DOCS/ODYSSEUS_ARCHIVE/odysseus-intercepted-payloads.json"
);

console.log("Odysseus itinerary-detail capture\n");

// Pull the real itinerary-detail response (the /cruise/itinerary/{id} call) out of
// the archived intercepted payloads — proves the parse against live-shaped data.
const raw = JSON.parse(readFileSync(ARCHIVE, "utf8")) as Array<{ url: string; payload: unknown }>;
const detailEntry = raw.find((e) => /\/cruise\/itinerary\/\d+/.test(e.url));
check("archived payload contains an itinerary-detail response", Boolean(detailEntry), "no /cruise/itinerary/{id} entry found");

const data = (detailEntry?.payload as { data?: unknown } | undefined)?.data;
const parsed = ItineraryDetailSchema.safeParse(data);
check("itinerary-detail payload passes the schema", parsed.success, parsed.success ? undefined : parsed.error.issues[0]?.message);

if (parsed.success) {
  const detail = parsed.data;
  check("detail has day nodes", detail.nodes.length > 0);

  const norm = normalizeItineraryDetail(detail);
  check("normalizer returns a day-by-day itinerary", norm !== null);

  if (norm) {
    // Embarkation day: Orlando (Port Canaveral) departs 15:30, no arrival.
    const day1 = norm.days[0];
    check("day 1 is embarkation with a departure time", day1.day === 1 && day1.departureTime === "15:30:00" && !day1.arrivalTime, JSON.stringify(day1));
    check("day 1 carries the readable port name", /Orlando|Port Canaveral/i.test(day1.portName), day1.portName);

    // Sea days are flagged.
    check("at least one sea day is flagged", norm.days.some((d) => d.atSea && /at sea/i.test(d.portName)));

    // A port call carries both arrival and departure times.
    const portCall = norm.days.find((d) => !d.atSea && d.arrivalTime && d.departureTime);
    check("a port call has arrival + departure times", Boolean(portCall), portCall ? JSON.stringify(portCall) : "none found");

    // Readable port names came through (San Juan etc.), not just codes.
    check("readable port names resolved (San Juan)", norm.days.some((d) => /San Juan/i.test(d.portName)));

    // Days are sequential from 1.
    const seq = norm.days.map((d) => d.day);
    check("day numbers are sequential from 1", seq.every((n, i) => n === i + 1), seq.join(","));

    // Map path + ports string carried.
    check("route map path captured", Boolean(norm.mapPath));
    check("readable ports-of-call string captured", Boolean(norm.portsOfCall && /San Juan/i.test(norm.portsOfCall)));
  }
}

// Normalizer is resilient: empty / missing detail yields null (caller falls back).
check("normalizer returns null for empty nodes", normalizeItineraryDetail({ id: 1, nodes: [] }) === null);
check("normalizer returns null for null detail", normalizeItineraryDetail(null) === null);

// ── Pipeline round-trip: candidate (with dayByDay) → resolved package ──────────
console.log("\nPipeline round-trip:");

const candidateWithSchedule: RankedPackageCandidate = {
  packageId: "1619969",
  cruiseCode: "RC7",
  cruiseName: "7 Night Eastern Caribbean",
  cruiseLine: "Royal Caribbean",
  shipName: "Wonder of the Seas",
  sailDateIso: "2026-11-08",
  nights: 7,
  departurePortCode: "XPC",
  portsOfCall: "Orlando | San Juan",
  itinerary: {
    itineraryId: 479966,
    portsOfCall: "Orlando (Port Canaveral), Fl | San Juan, Puerto Rico",
    dayByDay: {
      days: [
        { day: 1, portName: "Orlando (Port Canaveral), Fl", atSea: false, departureTime: "15:30:00" },
        { day: 2, portName: "At Sea", atSea: true },
        { day: 3, portName: "San Juan, Puerto Rico", atSea: false, arrivalTime: "10:30:00", departureTime: "18:00:00" },
      ],
      portsOfCall: "Orlando (Port Canaveral), Fl | San Juan, Puerto Rico",
      mapPath: "XPC_SJU.jpg",
    },
  },
  confidence: 0.9,
  reasons: ["test"],
};

// Survives the unknown→typed boundary (CLI / route JSON) without losing the schedule.
const reparsed = parseRankedCandidate(JSON.parse(JSON.stringify(candidateWithSchedule)));
check("parseRankedCandidate preserves the day-by-day schedule", reparsed?.itinerary?.dayByDay?.days.length === 3, JSON.stringify(reparsed?.itinerary?.dayByDay?.days?.length));
check("parseRankedCandidate preserves the itinerary id", reparsed?.itinerary?.itineraryId === 479966);
check("parseRankedCandidate preserves package-page ship name", reparsed?.shipName === "Wonder of the Seas", reparsed?.shipName);

// Lands on the manifest's resolvedPackage in the stored (flat day[]) shape.
const baseManifest = { id: "m1", assembleDraft: { portsOfCall: [] } } as unknown as DealTripManifest;
const resolved = applyResolvedPackage(baseManifest, {
  candidate: reparsed ?? candidateWithSchedule,
  siid: "1049337",
});
const storedDays = resolved.resolvedPackage?.itinerary?.dayByDay;
check("resolved package carries flat day-by-day array", Array.isArray(storedDays) && storedDays.length === 3, JSON.stringify(storedDays?.length));
check("resolved package stores the real ship name", resolved.resolvedPackage?.shipName === "Wonder of the Seas", resolved.resolvedPackage?.shipName);
check("stored schedule keeps the port name", storedDays?.[2]?.portName === "San Juan, Puerto Rico", storedDays?.[2]?.portName);
check("stored schedule keeps arrival/departure times", storedDays?.[2]?.arrivalTime === "10:30:00" && storedDays?.[2]?.departureTime === "18:00:00");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
