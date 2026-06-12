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
import type { RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";

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
  // Clear the fit-select cache when the generator is swapped so tests never
  // reuse a result produced by a different stub.
  __clearFitSelectCacheForTests();
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
    alternateCruiseLines: z.array(z.string()).optional(),
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

LOOKUP QUERY = A BROAD SEARCH PROFILE, NOT A SINGLE CRUISE (CRITICAL):
The lookupQuery is fed to a LIVE inventory search that then picks the real ship/sail-date that
best fits this angle. Your job is to define the SEARCH NET — broad enough that real inventory
almost always falls inside it — NOT to pin one specific sailing. The angle is about a transferable
vibe + onboard assets + audience; the concrete ship, exact date, and exact nights are OUTPUTS of
the inventory match, never inputs you dictate. So:
- DO set 'line' to the single cruise line whose fleet best delivers the angle's onboard assets.
- DO ALSO set 'alternateCruiseLines' on assembleDraft to a ranked list of 2-3 OTHER cruise lines
  whose fleets deliver a similar onboard-asset/vibe profile for this angle (e.g. for a quiet,
  library-and-sea-days angle: Cunard, then Holland America, then Princess). This agency's live
  inventory feed for any single line can be thin or missing certain itinerary types — if 'line'
  has nothing that genuinely fits, the matcher falls through to these alternates IN ORDER before
  giving up. Pick alternates that could plausibly deliver the SAME onboard assets and feel, even
  if the headline itinerary type might shift slightly (the matcher will reframe copy as needed).
- DO set 'destination' to a BROAD region/category the angle fits (e.g. "Caribbean", "Mediterranean",
  "Alaska", "Transatlantic or open-ocean") — not a single port-pinned route.
- DO set 'date' to the CENTER of the angle's season and 'windowDays' WIDE (60–150) so the search
  spans the whole plausible season. Prefer a wider window over a narrow one.
- DO NOT set 'ship' (leave it empty) — never lock the search to one vessel; the matcher decides.
- Treat 'nights' as a SOFT preference only; omit it unless the angle truly requires a specific
  length. 'port' is optional and should be omitted unless the angle genuinely requires one homeport.
- Never combine multiple narrow constraints (specific ship + exact date + rare route + exact nights)
  — that boxes the search into a needle and is forbidden.

OUTPUT: assembleDraft (cruiseLine, optional alternateCruiseLines[] (2-3 fallback lines with a
similar onboard-asset/vibe profile), optional shipClassHint, itineraryName, destination, optional
nights, sailWindow {earliestIso?, latestIso?, rationale}, optional departurePortHint, portsOfCall),
appliedPromos (each: promoRecordId, status, matchedOn[], assumptions[], warnings[]), promoStrategy,
manifestReasoning, and lookupQuery (line, ship?, destination, date?, nights?, port?, windowDays) —
the BROAD search profile the inventory matcher uses to find the real best-fit package + link.`;

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

Produce the trip manifest. The cruiseLine and sailWindow you choose are authoritative. The
lookupQuery must be a BROAD search profile (single line, broad destination region, season-centered
date with a WIDE windowDays of 60–150, NO ship, nights only as a soft preference) so the live
inventory matcher can find the real best-fit sailing — do not pin one specific cruise. Also set
alternateCruiseLines to 2-3 ranked fallback lines sharing this angle's onboard-asset/vibe profile,
for the matcher to try if 'line' has nothing that fits.`;
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
      alternateCruiseLines: draft.alternateCruiseLines,
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
