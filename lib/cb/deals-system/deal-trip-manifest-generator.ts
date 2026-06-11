/**
 * Deal Trip Manifestation — Step 2 agent.
 *
 * Takes a selected SailingAngleProfile + the raw CB promo intelligence and produces
 * a DealTripManifest: the cruise line / destination / sail window / nights and the
 * applicable perks/discounts, shaped to pre-fill SOURCE & ASSEMBLE for Step 3.
 *
 * Hard constraint: live Odysseus package search is operator-run Playwright, so this
 * agent NEVER fabricates a packageId, shipName, siid, or booking URL. It emits an
 * assembleDraft (cruise facts minus those) plus a lookupQuery the operator pastes
 * into Package Lookup to resolve them; the link broker then builds the link.
 *
 * Pipeline: (1) deterministically seed a coarse cruise line + sail window from the
 * angle's timing hints; (2) prefilter the promo records by that seed to cut noise;
 * (3) AI correlates the angle + surviving promos into the manifest. AI-only/hard-fail
 * via the LLM gateway (AI_POLICY §5). Promo ids the model returns are validated
 * against the prefiltered input — hallucinated ids are dropped.
 */

import { z } from "zod";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";

import type { DealAiGenerationTrace } from "./campaign-types";
import type { DealDiscoveryIdea } from "./deal-discovery-types";
import type {
  DealManifestSailWindow,
  DealTripManifest,
} from "./deal-trip-manifest-types";
import { cruiseLineMatches, prefilterPromoRecords } from "./promo-prefilter";
import type {
  CbPromoIntelligenceRecord,
  PromoApplicabilityResult,
  PromoApplicabilityStatus,
} from "./promo-intelligence-types";

const MANIFEST_MODEL = ModelName.CLAUDE_4_OPUS;
const MANIFEST_TIMEOUT_MS = Number(process.env.DEAL_MANIFEST_TIMEOUT_MS ?? "120000");

/** TEST SEAM (see deal-discovery-generator for the rationale). */
type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;
export function __setManifestStructuredObjectGeneratorForTests(fn?: StructuredObjectFn): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// ── Deterministic seed: a coarse cruise line + sail window from the angle ──────
// Used ONLY to prefilter promos before the AI call. The AI's manifest is the
// authoritative line/window; this is a noise-reduction heuristic, intentionally
// loose and permissive (it never narrows more than it can justify).

const KNOWN_CRUISE_LINES = [
  "Royal Caribbean",
  "Celebrity",
  "Carnival",
  "Norwegian",
  "Princess",
  "Holland America",
  "MSC",
  "Disney",
  "Cunard",
  "Regent",
  "Silversea",
  "Oceania",
  "Azamara",
  "Virgin Voyages",
];

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const SEASONS: Record<string, [number, number]> = {
  "early spring": [3, 4], spring: [3, 5], "late spring": [5, 6],
  "early summer": [6, 7], summer: [6, 8], "late summer": [8, 9],
  "early autumn": [9, 10], autumn: [9, 11], fall: [9, 11], "late autumn": [11, 12],
  winter: [12, 2], "shoulder season": [4, 5],
};

function endOfMonthIso(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function startOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function seedCruiseLine(angleText: string): string | undefined {
  const lower = angleText.toLowerCase();
  return KNOWN_CRUISE_LINES.find((line) => cruiseLineMatches(line, lower) || lower.includes(line.toLowerCase()));
}

/** Parse a coarse sail window from timing hints. Permissive; returns undefined bounds if unsure. */
function seedSailWindow(hints: string): DealManifestSailWindow {
  const lower = hints.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear() + 1;

  // Explicit month range or single month.
  const monthsFound = Object.keys(MONTHS).filter((m) => lower.includes(m));
  if (monthsFound.length > 0) {
    const nums = monthsFound.map((m) => MONTHS[m]).sort((a, b) => a - b);
    return {
      earliestIso: startOfMonthIso(year, nums[0]),
      latestIso: endOfMonthIso(year, nums[nums.length - 1]),
      rationale: `Seeded from month hint(s): ${monthsFound.join(", ")} ${year}.`,
    };
  }

  // Season phrase.
  const season = Object.keys(SEASONS).find((s) => lower.includes(s));
  if (season) {
    const [a, b] = SEASONS[season];
    if (a <= b) {
      return {
        earliestIso: startOfMonthIso(year, a),
        latestIso: endOfMonthIso(year, b),
        rationale: `Seeded from season hint "${season}" ${year}.`,
      };
    }
    // Wraps year-end (e.g. winter Dec–Feb).
    return {
      earliestIso: startOfMonthIso(year, a),
      latestIso: endOfMonthIso(year + 1, b),
      rationale: `Seeded from season hint "${season}" spanning ${year}-${year + 1}.`,
    };
  }

  return { rationale: "No parseable timing in the angle; promo sail-window filter not applied." };
}

// ── AI output schema ──────────────────────────────────────────────────────────

const APPLICABILITY_STATUSES = [
  "likely_applicable",
  "possibly_applicable_needs_review",
  "not_applicable",
  "insufficient_data",
] as const;

const manifestSchema = z.object({
  assembleDraft: z.object({
    cruiseLine: z.string(),
    shipClassHint: z.string().optional(),
    itineraryName: z.string(),
    destination: z.string(),
    nights: z.number().optional(),
    sailWindow: z.object({
      earliestIso: z.string().optional(),
      latestIso: z.string().optional(),
      rationale: z.string(),
    }),
    departurePortHint: z.string().optional(),
    portsOfCall: z.array(z.string()),
  }),
  appliedPromos: z.array(
    z.object({
      promoRecordId: z.string(),
      status: z.enum(APPLICABILITY_STATUSES),
      matchedOn: z.array(z.string()),
      assumptions: z.array(z.string()),
      warnings: z.array(z.string()),
    })
  ),
  promoStrategy: z.string(),
  manifestReasoning: z.string(),
  lookupQuery: z.object({
    line: z.string(),
    ship: z.string().optional(),
    destination: z.string(),
    date: z.string().optional(),
    nights: z.number().optional(),
    port: z.string().optional(),
    windowDays: z.number(),
  }),
});

const SYSTEM_PROMPT = `You are a cruise inventory and promo-intelligence strategist. You take a single
direct-response "Sailing Angle Profile" and the available CB promotion records, and you
meticulously correlate the ideal cruise line, destination, sail window, and nights that
fulfil the angle's onboard-asset requirements and timing — then determine exactly which
promotions' perks/discounts apply and how they strengthen the angle.

HARD RULES:
- NEVER invent a packageId, exact ship name, siid, or booking URL. Those are resolved by an
  operator-run package lookup, not by you. Provide a ship CLASS hint only (e.g. "Radiance class").
- Only reference promotions from the PROVIDED promo records. Never cite a promo id that is not
  in the list. If none apply, return an empty appliedPromos array and say so in promoStrategy.
- Qualify every perk/discount claim; do not promise guaranteed savings. Match the angle's
  insider, direct-response voice — no mass-group language, no generic travel clichés.
- The sail window and destination must be plausible for the cruise line you pick and the angle's
  timing requirements.

OUTPUT: assembleDraft (cruiseLine, optional shipClassHint, itineraryName, destination, optional
nights, sailWindow {earliestIso?, latestIso?, rationale}, optional departurePortHint, portsOfCall),
appliedPromos (each: promoRecordId, status, matchedOn[], assumptions[], warnings[]), promoStrategy,
manifestReasoning, and lookupQuery (line, ship?, destination, date?, nights?, port?, windowDays) —
the exact inputs an operator pastes into Package Lookup to resolve the real package + link.`;

function promoBlock(records: CbPromoIntelligenceRecord[]): string {
  if (records.length === 0) return "No promo records survived prefiltering — return an empty appliedPromos array.";
  return records
    .map((p) => {
      const claims = [
        ...p.marketingUse.publicClaimsAllowed,
        ...p.marketingUse.publicClaimsNeedsQualifier,
      ];
      return [
        `- id: ${p.id} | vendor: ${p.vendor} | title: ${p.title}`,
        `  booking window: ${p.bookingWindow.rawText || "?"} | sailing window: ${p.sailingWindow.rawText || "?"}`,
        `  offer types: ${p.extracted.offerTypes.join(", ") || "none"}`,
        claims.length ? `  claims: ${claims.join(" | ")}` : "  claims: none",
      ].join("\n");
    })
    .join("\n");
}

function buildPrompt(angle: DealDiscoveryIdea, promos: CbPromoIntelligenceRecord[]): string {
  const p = angle.sailingAngleProfile;
  return `SELECTED SAILING ANGLE:
Isolated niche: ${angle.isolatedNiche}
Title: ${p.sailingAngleTitle}
Core pitch: ${p.theCorePitch}
Target audience: ${p.targetAudienceDescriptor}
Destination & time-of-year hints: ${p.destinationAndTimeOfYearHints}
Onboard asset requirements: ${p.onboardAssetRequirements}
Insider keywords: ${p.relevantKeywords.join(", ")}

AVAILABLE PROMO RECORDS (already prefiltered to plausible matches — only cite ids from here):
${promoBlock(promos)}

Produce the trip manifest. The cruiseLine and sailWindow you choose are authoritative. Make the
lookupQuery concrete enough to drive a package search (windowDays = how many days around the date
to search).`;
}

export interface GenerateDealTripManifestOptions {
  angle: DealDiscoveryIdea;
  promoRecords: CbPromoIntelligenceRecord[];
  generatedAtIso?: string;
}

export interface GenerateDealTripManifestResult {
  manifest: DealTripManifest;
  prefilter: {
    kept: number;
    dropped: Array<{ id: string; vendor: string; reason: string }>;
    diagnostics: string[];
  };
  /** Promo ids the model cited that were not in the prefiltered input (dropped). */
  rejectedPromoIds: string[];
}

export async function generateDealTripManifest(
  options: GenerateDealTripManifestOptions
): Promise<GenerateDealTripManifestResult> {
  const { angle } = options;
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const p = angle.sailingAngleProfile;

  // (1) deterministic seed from the angle's timing/asset text.
  const seedText = `${p.destinationAndTimeOfYearHints} ${p.onboardAssetRequirements} ${p.sailingAngleTitle}`;
  const seedLine = seedCruiseLine(seedText);
  const seedWindow = seedSailWindow(p.destinationAndTimeOfYearHints);

  // (2) prefilter promos by the seed (cuts noise before the AI call).
  const prefilter = prefilterPromoRecords(options.promoRecords, {
    cruiseLine: seedLine,
    sailWindow:
      seedWindow.earliestIso || seedWindow.latestIso
        ? { earliestIso: seedWindow.earliestIso, latestIso: seedWindow.latestIso }
        : undefined,
  });

  // (3) AI correlation over the survivors.
  const prompt = buildPrompt(angle, prefilter.kept);
  const startedAt = Date.now();
  const result = await structuredObjectFn({
    model: MANIFEST_MODEL,
    schema: manifestSchema,
    system: SYSTEM_PROMPT,
    prompt,
    timeoutMs: MANIFEST_TIMEOUT_MS,
  });
  const latencyMs = Date.now() - startedAt;

  const trace: DealAiGenerationTrace = {
    model: result.modelId,
    promptSent: `SYSTEM:\n${SYSTEM_PROMPT}\n\nPROMPT:\n${prompt}`,
    rawResponse: JSON.stringify(result.object, null, 2),
    latencyMs,
    generatedAtIso,
  };

  // Validate promo references against the prefiltered input — drop hallucinated ids.
  const allowedIds = new Set(prefilter.kept.map((r) => r.id));
  const rejectedPromoIds: string[] = [];
  const appliedPromos: PromoApplicabilityResult[] = [];
  for (const ap of result.object.appliedPromos) {
    if (!allowedIds.has(ap.promoRecordId)) {
      rejectedPromoIds.push(ap.promoRecordId);
      continue;
    }
    appliedPromos.push({
      promoRecordId: ap.promoRecordId,
      status: ap.status as PromoApplicabilityStatus,
      matchedOn: ap.matchedOn,
      assumptions: ap.assumptions,
      warnings: ap.warnings,
    });
  }

  const draft = result.object.assembleDraft;
  const manifestId = `manifest-${slugify(`${p.sailingAngleTitle}-${draft.cruiseLine}`) || angle.id}`;

  const manifest: DealTripManifest = {
    id: manifestId,
    generatedAtIso,
    generator: "gpt",
    sourceAngleId: angle.id,
    isolatedNiche: angle.isolatedNiche,
    sailingAngleTitle: p.sailingAngleTitle,
    assembleDraft: {
      suggestedDealId: `deal-${slugify(`${draft.cruiseLine}-${draft.destination}-${p.sailingAngleTitle}`)}`,
      suggestedBriefId: `brief-${slugify(p.sailingAngleTitle)}`,
      cruiseLine: draft.cruiseLine,
      shipClassHint: draft.shipClassHint,
      itineraryName: draft.itineraryName,
      destination: draft.destination,
      nights: draft.nights,
      sailWindow: draft.sailWindow,
      departurePortHint: draft.departurePortHint,
      portsOfCall: draft.portsOfCall,
    },
    appliedPromos,
    promoStrategy: result.object.promoStrategy,
    manifestReasoning: result.object.manifestReasoning,
    lookupQuery: {
      line: result.object.lookupQuery.line,
      ship: result.object.lookupQuery.ship,
      destination: result.object.lookupQuery.destination,
      date: result.object.lookupQuery.date,
      nights: result.object.lookupQuery.nights,
      port: result.object.lookupQuery.port,
      windowDays: result.object.lookupQuery.windowDays,
    },
    aiTrace: trace,
  };

  return {
    manifest,
    prefilter: {
      kept: prefilter.kept.length,
      dropped: prefilter.dropped,
      diagnostics: prefilter.diagnostics,
    },
    rejectedPromoIds,
  };
}
