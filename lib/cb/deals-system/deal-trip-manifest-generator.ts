/**
 * Deal Trip Manifestation — Step 2 agent.
 *
 * Takes a selected DealDiscoveryIdea — which is ALREADY GROUNDED on a real,
 * verified Odysseus inventory candidate (angle.groundedCandidate: real packageId,
 * cruise line, ship, sail date, nights, ports) — and produces a DealTripManifest:
 * the applicable perks/discounts + promo strategy, shaped to pre-fill SOURCE &
 * ASSEMBLE for Step 3.
 *
 * The cruise line / ship / sail date / nights / ports come directly from
 * angle.groundedCandidate, not from the model. The itineraryName / destination
 * framing is DERIVED DETERMINISTICALLY from those real facts (deriveDestination /
 * deriveItineraryName) — it is NOT AI-written, so it can never drift from the
 * niche-reformer's framing of the same cruise. The AI's ONLY job here is promo
 * correlation: which prefiltered promos apply, the promo strategy, and why the real
 * sailing fulfils the angle's onboard-asset needs.
 *
 * Pipeline: (1) prefilter the promo records against the grounded candidate's real
 * cruise line + sail date to cut noise; (2) AI correlates the surviving promos.
 * AI-only/hard-fail via the LLM gateway (AI_POLICY §5). Promo ids the model returns
 * are validated against the prefiltered input — hallucinated ids are dropped.
 */

import { z } from "zod/v3";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";
import type { RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";

import type { DealAiGenerationTrace } from "./campaign-types";
import { buildTripManifestId } from "./deal-ids";
import type { DealDiscoveryIdea } from "./deal-discovery-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import { prefilterPromoRecords } from "./promo-prefilter";
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
  // Clear the fit-select cache when the generator is swapped so tests never
  // reuse a result produced by a different stub.
  __clearFitSelectCacheForTests();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// ── AI output schema ──────────────────────────────────────────────────────────

const APPLICABILITY_STATUSES = [
  "likely_applicable",
  "possibly_applicable_needs_review",
  "not_applicable",
  "insufficient_data",
] as const;

const manifestSchema = z.object({
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
});

// ── Deterministic framing (no AI) ──────────────────────────────────────────────
// itineraryName + destination used to be AI-written here, re-deriving region/season
// framing the grounded candidate's REAL facts already carry — overlapping with the
// niche-reformer's angle prose. They are now derived deterministically from those
// facts, so Step 2's AI call is promo-correlation ONLY and the two steps can never
// drift on what region the cruise is.

/** Coarse region label inferred from a sailing's name + ports of call. */
function deriveDestination(g: DealDiscoveryIdea["groundedCandidate"]): string {
  const hay = `${g.cruiseName} ${g.portsOfCall ?? ""}`.toLowerCase();
  const REGIONS: Array<[RegExp, string]> = [
    [/transatlantic|crossing/, "Transatlantic Crossing"],
    [/transpacific/, "Transpacific Crossing"],
    [/mediterranean|barcelona|rome|civitavecchia|naples|santorini|athens/, "Mediterranean"],
    [/caribbean|nassau|cozumel|st\.? thomas|st\.? maarten|grand cayman|jamaica/, "Caribbean"],
    [/alaska|juneau|ketchikan|skagway|glacier/, "Alaska"],
    [/norway|fjord|geiranger|bergen/, "Norwegian Fjords"],
    [/iceland|reykjavik/, "Iceland"],
    [/south america|buenos aires|rio|santiago|valparaiso|montevideo/, "South America"],
    [/southeast asia|singapore|bali|bangkok|ho chi minh|phuket/, "Southeast Asia"],
    [/australia|sydney|melbourne|brisbane|tasmania/, "Australia & South Pacific"],
    [/new england|canada|halifax|quebec|bar harbor/, "New England & Canada"],
    [/hawaii|honolulu|maui|kona/, "Hawaii"],
    [/bahamas|coco ?cay|freeport/, "Bahamas"],
    [/bermuda/, "Bermuda"],
    [/panama canal/, "Panama Canal"],
  ];
  for (const [re, label] of REGIONS) {
    if (re.test(hay)) return label;
  }
  // Fallback: the sailing's own name with any leading "N-Day/Night" stripped.
  return g.cruiseName.replace(/^\s*\d+\s*-?\s*(day|night)s?\s*/i, "").trim() || g.cruiseName;
}

/** A thematic-but-truthful itinerary name from the real nights + derived region. */
function deriveItineraryName(g: DealDiscoveryIdea["groundedCandidate"], destination: string): string {
  const nights = g.nights ? `${g.nights}-Night ` : "";
  return `${nights}${destination}`.trim();
}

const SYSTEM_PROMPT = `You are a cruise promo-intelligence strategist. You are given a direct-response
"Sailing Angle Profile" AND the REAL, ALREADY-VERIFIED sailing it is grounded on (real cruise line,
ship, sail date, nights, ports — found in live Odysseus inventory before this step ever ran). The
cruise is chosen and its marketing framing (itinerary name / destination) is derived elsewhere —
do NOT name the itinerary or restate the destination. Your ONLY job is promo correlation:

1. Determine exactly which of the PROVIDED promo records apply to THIS REAL sailing.
2. Write promoStrategy: how the applicable perks/discounts strengthen the angle, in its insider voice.
3. Write manifestReasoning: why this real sailing fulfils the angle's onboard-asset requirements and timing.

HARD RULES:
- The cruise line, ship, sail date, nights, and ports are FACTS — you cannot change them.
- Only reference promotions from the PROVIDED promo records. Never cite a promo id that is not in
  the list. If none apply, return an empty appliedPromos array and say so in promoStrategy.
- Qualify every perk/discount claim; do not promise guaranteed savings. Match the angle's insider,
  direct-response voice — no mass-group language, no generic travel clichés.

OUTPUT: appliedPromos (each: promoRecordId, status, matchedOn[], assumptions[], warnings[]),
promoStrategy, manifestReasoning.`;

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
  const g = angle.groundedCandidate;
  return `SELECTED SAILING ANGLE:
Isolated niche: ${angle.isolatedNiche}
Title: ${p.sailingAngleTitle}
Core pitch: ${p.theCorePitch}
Target audience: ${p.targetAudienceDescriptor}
Destination & time-of-year hints: ${p.destinationAndTimeOfYearHints}
Onboard asset requirements: ${p.onboardAssetRequirements}
Insider keywords: ${p.relevantKeywords.join(", ")}

THE REAL, VERIFIED SAILING THIS ANGLE IS GROUNDED ON (found in live Odysseus inventory — facts,
not negotiable):
- Cruise line: ${g.cruiseLine ?? "?"}
- Ship: ${g.cruiseName}
- Sail date: ${g.sailDateIso}
- Nights: ${g.nights ?? "?"}
- Departure port: ${g.departurePortCode ?? "?"}
- Ports of call: ${g.portsOfCall ?? "(not listed)"}

AVAILABLE PROMO RECORDS (already prefiltered to plausible matches — only cite ids from here):
${promoBlock(promos)}

Determine which of the promo records above apply to THIS real sailing and how their perks/discounts
strengthen the angle. Do not name the itinerary or restate the destination — that framing is derived
from the real facts elsewhere.`;
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

  // (1) prefilter promos by the grounded candidate's real cruise line + sail date
  // (cuts noise before the AI call).
  const g = angle.groundedCandidate;
  const prefilter = prefilterPromoRecords(options.promoRecords, {
    cruiseLine: g.cruiseLine,
    sailWindow: { earliestIso: g.sailDateIso, latestIso: g.sailDateIso },
  });

  // (2) AI correlation over the survivors.
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

  const cruiseLine = g.cruiseLine ?? "";
  // Framing derived deterministically from the REAL grounded facts (no AI) — see
  // the deriveDestination/deriveItineraryName helpers above.
  const destination = deriveDestination(g);
  const itineraryName = deriveItineraryName(g, destination);
  // Canonical id: leads with the REAL Odysseus packageId (see deal-ids.ts).
  // The old title-based slug ignored the package number the pipeline already
  // had, producing ids that couldn't be traced back to a bookable sailing.
  const manifestId = buildTripManifestId(g.packageId, p.sailingAngleTitle);
  const portsOfCall = g.portsOfCall
    ? g.portsOfCall.split(/\s*[,>]\s*/).filter((port) => port.length > 0)
    : [];

  const manifest: DealTripManifest = {
    id: manifestId,
    generatedAtIso,
    generator: "gpt",
    sourceAngleId: angle.id,
    isolatedNiche: angle.isolatedNiche,
    sailingAngleTitle: p.sailingAngleTitle,
    assembleDraft: {
      // The dealId IS the Odysseus packageId (canonical rule — deal-ids.ts).
      // Downstream steps (assemble, copywriter) read this verbatim instead of
      // re-deriving an ad-hoc slug.
      suggestedDealId: g.packageId,
      suggestedBriefId: `brief-${slugify(p.sailingAngleTitle)}`,
      cruiseLine,
      // shipClassHint was AI-written for imagery sourcing; no longer part of the
      // promo-only AI output. Left undefined (optional) — derive later if needed.
      shipClassHint: undefined,
      itineraryName,
      destination,
      nights: g.nights,
      sailWindow: {
        earliestIso: g.sailDateIso,
        latestIso: g.sailDateIso,
        rationale: `Grounded on a verified sailing departing ${g.sailDateIso}.`,
      },
      departurePortHint: g.departurePortCode,
      portsOfCall,
    },
    appliedPromos,
    promoStrategy: result.object.promoStrategy,
    manifestReasoning: result.object.manifestReasoning,
    lookupQuery: {
      line: cruiseLine,
      ship: g.cruiseName,
      destination,
      date: g.sailDateIso,
      nights: g.nights,
      port: g.departurePortCode,
      windowDays: 0,
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

// ── Inventory-aware best-fit selection (Step 2, after the live search) ─────────
// The broad lookupQuery returns a pool of REAL sailings. This pass reads the
// angle's transferable essence (onboard assets, audience, season feel) and picks
// the single real candidate that best embodies it — so we build the manifest
// around a cruise that exists AND fits, instead of jamming the idea onto a needle.

const SELECT_FIT_MODEL = ModelName.CLAUDE_4_OPUS;

const fitSelectSchema = z.object({
  chosenPackageId: z.string(),
  fitRationale: z.string(),
  runnerUpPackageIds: z.array(z.string()).optional(),
  needsReframe: z.boolean(),
  reframedItineraryName: z.string().optional(),
  reframedDestination: z.string().optional(),
  reframedSailWindowRationale: z.string().optional(),
});

const SELECT_FIT_SYSTEM_PROMPT = `You are a cruise inventory matcher. You are given ONE direct-response Sailing
Angle Profile and a list of REAL, bookable cruise sailings returned by a live inventory search.
Choose the SINGLE sailing that best embodies the angle's transferable essence — its onboard-asset
requirements, target audience, destination feel, and season — NOT merely the cheapest or the
nearest date. Every listed sailing is real and bookable, so you MUST choose one; never refuse.
Return the chosen sailing's exact packageId (copied verbatim from the list), a concise fitRationale
explaining why it serves the angle, and optionally a couple of runner-up packageIds.

REFRAME WHEN THE FIT IS LOOSE: the angle's draft itineraryName/destination/sail-season rationale
were written before live inventory was checked, and the chosen sailing may not actually match that
destination, region, or season (e.g. the draft says "Transatlantic crossing" but the only real
sailings available are Northern Europe). Selling a real, bookable cruise always beats holding out
for an exact-match itinerary that doesn't exist in inventory.

Set needsReframe=true whenever the chosen sailing's actual destination/region/season meaningfully
diverges from the angle's draft. When true, also return:
- reframedItineraryName: a new thematic name that fits the CHOSEN sailing's real ports/region while
  preserving as much of the angle's voice/hook as still applies
- reframedDestination: the chosen sailing's real destination/region (plain, factual)
- reframedSailWindowRationale: a short rewrite of the season rationale grounded in the chosen
  sailing's actual sail date

Set needsReframe=false (and omit the reframed* fields) only when the chosen sailing genuinely
matches the angle's draft destination/region/season.`;

function candidateBlock(candidates: RankedPackageCandidate[]): string {
  return candidates
    .map((c) => {
      const ports = c.itinerary?.portsOfCall || c.portsOfCall || "";
      const lead = c.cabinPricing?.leadFare;
      return [
        `- pkg ${c.packageId} | ${c.cruiseName}`,
        `  line: ${c.cruiseLine ?? "?"} | sails: ${c.sailDateIso || "?"} | nights: ${c.nights ?? "?"}` +
          `${lead !== undefined ? ` | from ${c.cabinPricing?.currencyCode ?? "USD"} ${lead}` : ""}`,
        ports ? `  ports: ${ports}` : "  ports: (not listed)",
      ].join("\n");
    })
    .join("\n");
}

/**
 * AI pass that picks the best angle-fit sailing from the real inventory pool.
 * Pure (no I/O): the caller supplies the live candidates. Falls back to the
 * date-closest candidate if the model returns an id outside the pool, so a ship
 * is ALWAYS chosen whenever the pool is non-empty.
 *
 * Inline option/return shapes (no new named types per repo type-ownership rule).
 */
type FitSelectResult = {
  candidate?: RankedPackageCandidate;
  fitRationale: string;
  modelId?: string;
  diagnostics: string[];
  reframe?: { itineraryName?: string; destination?: string; sailWindowRationale?: string };
};

// In-memory fit-select cache. A `resolve` RETRY (or the multi-line loop) that
// produces the SAME candidate pool for the SAME angle must not re-spend the
// fit-select AI call — that pass is the per-attempt token cost. Keyed by angle
// id + the sorted candidate package ids, so it only reuses when the inputs are
// genuinely identical. Process-scoped (dev server lifetime), which is exactly
// the window in which an operator retries a wedged lookup.
const fitSelectCache = new Map<string, FitSelectResult>();
function fitSelectCacheKey(angle: DealDiscoveryIdea, candidates: RankedPackageCandidate[]): string {
  const ids = candidates.map((c) => c.packageId).sort().join(",");
  return `${angle.id}::${ids}`;
}
/** Test seam: clear the fit-select cache (called when the generator stub swaps). */
export function __clearFitSelectCacheForTests(): void {
  fitSelectCache.clear();
}

export async function selectBestFitCandidate(
  options: { angle: DealDiscoveryIdea; candidates: RankedPackageCandidate[]; timeoutMs?: number }
): Promise<FitSelectResult> {
  const { angle, candidates } = options;
  const diagnostics: string[] = [];

  if (candidates.length === 0) {
    return { candidate: undefined, fitRationale: "No inventory candidates to choose from.", diagnostics };
  }
  if (candidates.length === 1) {
    return {
      candidate: candidates[0],
      fitRationale: "Sole inventory candidate.",
      diagnostics: ["Single candidate — selected without an AI pass."],
    };
  }

  const cacheKey = fitSelectCacheKey(angle, candidates);
  const cached = fitSelectCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      diagnostics: [...cached.diagnostics, "Reused cached fit-select for an identical candidate pool (no AI re-spend)."],
    };
  }

  const p = angle.sailingAngleProfile;
  const prompt = `SAILING ANGLE PROFILE:
Isolated niche: ${angle.isolatedNiche}
Title: ${p.sailingAngleTitle}
Core pitch: ${p.theCorePitch}
Target audience: ${p.targetAudienceDescriptor}
Destination & time-of-year hints: ${p.destinationAndTimeOfYearHints}
Onboard asset requirements: ${p.onboardAssetRequirements}
Insider keywords: ${p.relevantKeywords.join(", ")}

REAL BOOKABLE SAILINGS (choose exactly one by packageId):
${candidateBlock(candidates)}

Pick the one sailing that best embodies the angle's essence and explain the fit.`;

  try {
    const result = await structuredObjectFn({
      model: SELECT_FIT_MODEL,
      schema: fitSelectSchema,
      system: SELECT_FIT_SYSTEM_PROMPT,
      prompt,
      timeoutMs: options.timeoutMs ?? MANIFEST_TIMEOUT_MS,
    });

    const chosen = candidates.find((c) => c.packageId === result.object.chosenPackageId);
    if (chosen) {
      const fitDiagnostics = [`AI selected pkg ${chosen.packageId} by angle fit.`];
      let reframe: { itineraryName?: string; destination?: string; sailWindowRationale?: string } | undefined;
      if (result.object.needsReframe) {
        reframe = {
          itineraryName: result.object.reframedItineraryName,
          destination: result.object.reframedDestination,
          sailWindowRationale: result.object.reframedSailWindowRationale,
        };
        fitDiagnostics.push(
          "Chosen sailing diverged from the angle's draft destination/season — reframed itinerary name/destination/sail window to match real inventory."
        );
      }
      const out: FitSelectResult = {
        candidate: chosen,
        fitRationale: result.object.fitRationale,
        modelId: result.modelId,
        diagnostics: fitDiagnostics,
        reframe,
      };
      // Cache only a successful AI selection — a retry on an identical pool
      // reuses it instead of paying again. The error/fallback paths below are
      // deliberately NOT cached, so a retry genuinely re-attempts the AI.
      fitSelectCache.set(cacheKey, out);
      return out;
    }
    diagnostics.push(
      `AI returned packageId "${result.object.chosenPackageId}" not in the pool; falling back to the date-closest candidate.`
    );
  } catch (error) {
    diagnostics.push(
      `Best-fit AI pass failed (${error instanceof Error ? error.message : String(error)}); falling back to the date-closest candidate.`
    );
  }

  // Fallback: the search already ranks the pool best-first (date-closest in
  // best-effort mode), so candidates[0] is the safe coin-flip pick.
  return {
    candidate: candidates[0],
    fitRationale: "Fell back to the highest-ranked (date-closest) inventory candidate.",
    diagnostics,
  };
}
