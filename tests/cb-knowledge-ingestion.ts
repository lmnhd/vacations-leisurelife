import assert from "node:assert/strict";

import {
    KnowledgeCacheSchema,
    assessFreshness,
    entriesFromCache,
    retrieveByKeyword,
    type KnowledgeEntry,
} from "@/lib/chat/tools/cb-knowledge-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic retrieval + freshness coverage for the authenticated CBAT
// ingestion expansion. No network, no LLM — asserts the guarantees the ingest
// pipeline must uphold for insurance, deposit, refund, cancellation, and flight
// questions (plan step 5).
// ─────────────────────────────────────────────────────────────────────────────

const fixtureRetrievedAt = "2026-07-20T00:00:00.000Z";

const fixture: KnowledgeEntry[] = [
    {
        title: "Travel Protection Plan — Florida",
        content:
            "Travel insurance coverage details for Florida residents. Cancel-for-any-reason waiver terms and premium schedule.",
        source: "Cruise Brothers insurance (Travel Protection Plan)",
        url: "https://www.cbagenttools.com/marketing/insurance/fl/",
        sectionKind: "insurance",
        supplier: "Travel Guard",
        jurisdiction: "FL",
        docType: "page",
        effectiveDate: "January 1, 2026",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["insurance", "fl"],
    },
    {
        title: "Travel Protection Plan — New York",
        content: "Travel insurance coverage details for New York residents with state-specific disclosures.",
        url: "https://www.cbagenttools.com/marketing/insurance/ny/",
        sectionKind: "insurance",
        jurisdiction: "NY",
        docType: "page",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["insurance", "ny"],
    },
    {
        title: "Deposit Requirements by Cruise Line — table 1",
        content: "Deposit and down payment amounts required at booking by cruise line and sailing length.",
        url: "https://www.cbagenttools.com/marketing/deposits/",
        sectionKind: "deposit",
        docType: "table",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["deposit", "table"],
    },
    {
        title: "Refund Policy Overview",
        content: "Refund timelines and money-back eligibility after cancellation windows close.",
        url: "https://www.cbagenttools.com/marketing/refunds/",
        sectionKind: "refund",
        docType: "page",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["refund"],
    },
    {
        title: "Cancellation Penalty Schedule — table 1",
        content: "Cancellation penalty percentages by days before departure across suppliers.",
        url: "https://www.cbagenttools.com/marketing/cancellation/",
        sectionKind: "cancellation",
        docType: "table",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["cancellation", "penalty"],
    },
    {
        title: "Choice Air Flight Program",
        content: "Airline booking procedures, flight change fees, and airfare protection through the air program.",
        url: "https://www.cbagenttools.com/marketing/flights/",
        sectionKind: "flight",
        docType: "page",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["flight", "air"],
    },
    {
        title: "Carnival Cruise Lines",
        content: "Cruise line: Carnival Cruise Lines. Commission: 16%. Agent phone: 800-282-2386.",
        url: "https://www.cbagenttools.com/marketing/vendor_urls/",
        sectionKind: "vendor",
        supplier: "Carnival Cruise Lines",
        jurisdiction: "ALL",
        docType: "directory",
        retrievedAtIso: fixtureRetrievedAt,
        tags: ["vendor", "commission"],
    },
];

// ── Retrieval by section kind returns the correctly-classified entry ──
const insurance = retrieveByKeyword("insurance coverage for my client", fixture, { limit: 3 });
assert.equal(insurance.length >= 1, true, "insurance query should return matches");
assert.equal(insurance[0]!.sectionKind, "insurance", "top insurance result must be an insurance entry");

const deposit = retrieveByKeyword("what deposit is required", fixture);
assert.equal(deposit[0]!.sectionKind, "deposit", "deposit query must surface deposit entry first");

const refund = retrieveByKeyword("can they get a refund", fixture);
assert.equal(refund[0]!.sectionKind, "refund", "refund query must surface refund entry first");

const cancellation = retrieveByKeyword("cancellation penalty schedule", fixture);
assert.equal(cancellation[0]!.sectionKind, "cancellation", "cancellation query must surface cancellation entry first");

const flight = retrieveByKeyword("flight air booking question", fixture);
assert.equal(flight[0]!.sectionKind, "flight", "flight query must surface flight entry first");

// ── Jurisdiction facet steers state-specific insurance selection ──
const flInsurance = retrieveByKeyword("insurance for resident", fixture, { jurisdiction: "FL", limit: 1 });
assert.equal(flInsurance[0]!.jurisdiction, "FL", "FL jurisdiction hint must prefer the FL insurance entry");

// ── Empty / too-short queries retrieve nothing (fail-closed) ──
assert.deepEqual(retrieveByKeyword("a", fixture), [], "sub-3-char query returns nothing");
assert.deepEqual(retrieveByKeyword("   ", fixture), [], "blank query returns nothing");

// ── Freshness: dated fresh, dated stale, and undated are classified correctly ──
const freshRef = new Date("2026-07-25T00:00:00.000Z");

// Effective date is the age anchor when present; a recently-effective insurance
// entry is fresh even against the tight 30-day insurance threshold.
const freshInsurance: KnowledgeEntry = {
    ...fixture[0]!,
    effectiveDate: "July 10, 2026",
};
assert.equal(assessFreshness(freshInsurance, freshRef).state, "fresh", "recently-effective insurance entry is fresh");

// A stale-dated insurance entry (effective long ago) exceeds the 30-day window.
const staleInsurance: KnowledgeEntry = {
    ...fixture[0]!,
    effectiveDate: undefined,
    retrievedAtIso: "2026-01-01T00:00:00.000Z",
};
assert.equal(assessFreshness(staleInsurance, freshRef).state, "stale", "6-month-old insurance entry is stale");

// The original fixture entry (effective Jan 1, 2026) is correctly stale by July.
assert.equal(assessFreshness(fixture[0]!, freshRef).state, "stale", "Jan-effective insurance entry is stale by July");

const undated: KnowledgeEntry = { title: "x", content: "y", sectionKind: "insurance" };
assert.equal(assessFreshness(undated, freshRef).state, "unknown", "undated entry is unknown, not stale");

// ── Schema round-trips both cache shapes and legacy metadata-free entries ──
const legacyArrayCache = KnowledgeCacheSchema.parse([
    { title: "Legacy Vendor", content: "Commission: 16%." },
]);
assert.equal(entriesFromCache(legacyArrayCache).length, 1, "legacy array cache parses");

const objectCache = KnowledgeCacheSchema.parse({
    generatedAtIso: fixtureRetrievedAt,
    entries: fixture,
});
assert.equal(entriesFromCache(objectCache).length, fixture.length, "object cache parses with full metadata");

console.log("CB Agent Tools knowledge ingestion tests passed.");
