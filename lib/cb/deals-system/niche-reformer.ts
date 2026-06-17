/**
 * Match & Re-Form Niche (Deal Workflow Step 1B — inventory-first Discovery).
 *
 * Step 1A (deep-cruise-search) selects REAL, excellent, bookable sailings. This
 * step takes one such `SelectedDeal` plus the operator's saved niche research and
 * asks the model the inverted question: "Here is an excellent real cruise — which
 * niche from this research is THIS sailing the uniquely ideal venue for? Re-form
 * that niche's angle to fit this exact ship / itinerary / season."
 *
 * The cruise facts are non-negotiable truth; the AI only chooses the niche and
 * writes the angle framing around the real sailing. It reuses the existing
 * SailingAngleProfile schema + voice rules, so everything downstream (Step 2
 * manifest, Step 3 copywriter, funnel synthesis) is unchanged.
 *
 * MATCH-OR-DISCARD: the model returns a fit decision + 0..1 confidence. When it
 * cannot honestly land a specific, high-conviction niche for this cruise, it
 * declines — the caller HOLDS the deal as "strong deal, no angle yet" rather than
 * forcing a contrived audience. We never fabricate a niche to fill a slot.
 *
 * AI-only, hard fail (AI-FIRST mandate): all calls go through the LLM gateway with
 * a ModelName enum value. No Gemini/Perplexity here — saved research is read-only.
 */

import { z } from "zod";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";

import type { DealAiGenerationTrace } from "./campaign-types";
import type { SelectedDeal } from "./deep-cruise-search";
import type {
  DealDiscoveryGroundedCandidate,
  DealDiscoveryIdea,
  SailingAngleProfile,
} from "./deal-discovery-types";
import { validateSailingAngleProfile } from "./deal-discovery-generator";
import {
  readSavedDiscoveryResearch,
  type SavedDiscoveryResearch,
} from "./discovery-research-source";

const NICHE_REFORM_MODEL = ModelName.CLAUDE_4_OPUS;
const NICHE_REFORM_TIMEOUT_MS = Number(process.env.DEAL_DISCOVERY_TIMEOUT_MS ?? "120000");

/**
 * Minimum fit confidence for an angle to be ACCEPTED. Below this, the deal is held
 * as "strong deal, no angle yet" (match-or-discard). This gates NICHE FIT — not
 * inventory reality (the cruise is already real by construction from Step 1A).
 */
export const NICHE_FIT_THRESHOLD = 0.7;

/** TEST SEAM: override the gateway generator (proof scripts inject a stub). */
type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;
export function __setNicheReformerStructuredObjectGeneratorForTests(fn?: StructuredObjectFn): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Model output schema ───────────────────────────────────────────────────────

const reformSchema = z.object({
  /** Whether a specific, high-conviction niche fits THIS real cruise. */
  nicheFits: z.boolean(),
  /** 0..1 honest confidence the chosen niche genuinely fits this sailing. */
  fitConfidence: z.number().min(0).max(1),
  /** One sentence: why this cruise is (or is not) the ideal venue for the niche. */
  fitReasoning: z.string(),
  /**
   * The re-formed angle. Present (and meaningful) only when nicheFits is true; the
   * schema keeps it optional so a decline can omit it without a parse failure.
   */
  isolatedNiche: z.string().optional(),
  angle: z
    .object({
      sailingAngleTitle: z.string(),
      theCorePitch: z.string(),
      visualAnchor: z.string(),
      targetAudienceDescriptor: z.string(),
      relevantKeywords: z.array(z.string()).min(6).max(8),
      destinationAndTimeOfYearHints: z.string(),
      onboardAssetRequirements: z.string(),
    })
    .optional(),
});

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a direct-response creative marketing strategist. You are given ONE real, bookable cruise that has already been selected as an excellent deal, plus niche/community research. Your job is to decide which single niche from the research this specific cruise is the UNIQUELY IDEAL venue for, and then re-form that niche's "Sailing Angle Profile" to fit THIS exact ship, itinerary, and season.

THE CRUISE FACTS ARE NON-NEGOTIABLE TRUTH. The ship, cruise line, sail date, nights, departure/arrival ports, and ports of call are REAL and fixed. You do NOT pick the destination or season — they are given. You only (a) choose the best-fitting niche and (b) write angle framing that honestly matches the real sailing.

MATCH-OR-DISCARD — THIS IS THE MOST IMPORTANT RULE:
- Only claim a fit if a SPECIFIC, high-conviction niche from the research is genuinely, honestly served by THIS cruise's real itinerary, season, sea-day profile, and onboard reality.
- If the cruise is generic, or no niche in the research is a strong honest fit, set "nicheFits": false and explain why in fitReasoning. DO NOT invent or stretch a niche to force a match. A declined deal is a correct, valuable outcome — it is held for review, not discarded.
- fitConfidence must be your honest probability the niche truly fits. Do not inflate it.

CRITICAL AD COPY RULES (when you DO write an angle):
- NO MASS-GROUP LANGUAGE: no "group cruise," "meetups," "clubs," or "organized events." This is an independent retail vacation.
- BAN GENERIC TRAVEL CLICHÉS: no "unwind," "escape," "luxury," or "paradise."
- TARGET THE INSIDER: use native vocabulary from the niche's own community.
- destinationAndTimeOfYearHints and onboardAssetRequirements must DESCRIBE THE REAL CRUISE you were given (its actual region, season, and ship reality) — not a wished-for itinerary.

OUTPUT: nicheFits, fitConfidence, fitReasoning, and (only when nicheFits is true) isolatedNiche + a full angle (sailingAngleTitle, theCorePitch, visualAnchor, targetAudienceDescriptor, relevantKeywords [6-8], destinationAndTimeOfYearHints, onboardAssetRequirements).`;

function describeDeal(deal: SelectedDeal): string {
  const lines = [
    `Cruise line: ${deal.cruiseLine ?? "unknown"}`,
    `Ship / itinerary name: ${deal.cruiseName}`,
    `Sail date: ${deal.sailDateIso}`,
    deal.nights ? `Nights: ${deal.nights}` : undefined,
    deal.departurePortCode ? `Departure port: ${deal.departurePortCode}` : undefined,
    deal.arrivalPortCode ? `Arrival port: ${deal.arrivalPortCode}` : undefined,
    deal.portsOfCall ? `Ports of call: ${deal.portsOfCall}` : undefined,
    deal.leadFare ? `Lead fare: from $${deal.leadFare}` : undefined,
    `Why it was selected as a strong deal: ${deal.qualitySignals
      .filter((s) => s.points > 0)
      .map((s) => s.reason)
      .join("; ")}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildExclusionBlock(usedNiches: string[]): string {
  if (usedNiches.length === 0) return "";
  return `\n\nALREADY USED NICHES — DO NOT REUSE:
These niches have already been matched to other cruises this batch. Choose a DIFFERENT
niche from the research. Only reuse one of these if it is a genuinely, dramatically better
fit for THIS cruise than any unused niche — and if you do, say so in fitReasoning. Prefer a
distinct niche so the batch covers varied audiences:
${usedNiches.map((n) => `- ${n}`).join("\n")}`;
}

function buildPrompt(deal: SelectedDeal, research: SavedDiscoveryResearch, usedNiches: string[]): string {
  const psychographic = research.psychographicData?.trim();
  const aesthetic = research.aestheticData?.trim();
  return `THE REAL CRUISE (selected as an excellent deal — these facts are fixed truth):
${describeDeal(deal)}

NICHE / COMMUNITY RESEARCH (choose the single best-fitting niche from this — it is consumer/community research, not travel research):

${psychographic ? `COMMUNITY / PSYCHOGRAPHIC RESEARCH:\n${psychographic}` : ""}

${aesthetic ? `AESTHETIC / SHIP-FIT RESEARCH:\n${aesthetic}` : ""}

Decide whether a specific, high-conviction niche from the research above is genuinely served by THIS real cruise. If yes, re-form that niche's Sailing Angle Profile to fit this exact ship/itinerary/season. If no honest strong fit exists, decline (nicheFits: false). Return the JSON object.${buildExclusionBlock(usedNiches)}`;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface ReformNicheOptions {
  /** Use this research instead of reading the saved cache (for tests). */
  research?: SavedDiscoveryResearch;
  /** Override the accept threshold (defaults to NICHE_FIT_THRESHOLD). */
  fitThreshold?: number;
  /**
   * Niches already matched to other cruises in this batch — fed to the model as a
   * "prefer a different niche" exclusion so a batch covers varied audiences instead
   * of stamping the same niche onto every long sea-day voyage.
   */
  usedNiches?: string[];
  generatedAtIso?: string;
}

export type ReformNicheOutcome =
  | {
      status: "matched";
      /** A full discovery idea, grounded on the real deal — ready for the cache. */
      idea: DealDiscoveryIdea;
      fitConfidence: number;
      fitReasoning: string;
      /** Voice warnings on the produced angle (surfaced, not auto-fixed). */
      voiceWarnings: string[];
    }
  | {
      status: "held";
      /** Why the deal was held with no angle (declined or below threshold). */
      reason: string;
      fitConfidence: number;
    };

/** Turn a SelectedDeal's real facts into the grounded candidate carried downstream. */
function dealToGroundedCandidate(deal: SelectedDeal, resolvedAtIso: string): DealDiscoveryGroundedCandidate {
  return {
    resolvedAtIso,
    packageId: deal.packageId,
    cruiseName: deal.cruiseName,
    cruiseLine: deal.cruiseLine,
    sailDateIso: deal.sailDateIso,
    nights: deal.nights ?? undefined,
    departurePortCode: deal.departurePortCode,
    portsOfCall: deal.portsOfCall,
    // The deal is real by construction; carry the deal-quality score as its
    // confidence and the per-signal reasons as the grounding rationale.
    confidence: deal.qualityScore,
    reasons: deal.qualitySignals.filter((s) => s.points > 0).map((s) => `${s.signal}: ${s.reason}`),
  };
}

/**
 * Re-form a niche to fit one real, selected cruise (match-or-discard).
 *
 * Returns a `matched` outcome with a fully-grounded `DealDiscoveryIdea` when the
 * model lands a specific niche at/above the fit threshold, or a `held` outcome
 * (no angle) when it declines or falls short. AI failure propagates (hard fail).
 */
export async function reformNicheForDeal(
  deal: SelectedDeal,
  options: ReformNicheOptions = {}
): Promise<ReformNicheOutcome> {
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const threshold = options.fitThreshold ?? NICHE_FIT_THRESHOLD;

  const research = options.research ?? readSavedDiscoveryResearch();
  if (!research || (!research.psychographicData && !research.aestheticData)) {
    throw new Error(
      "No saved discovery research available. Run Group discovery research first " +
        "(POST /api/groups/discovery/research) to populate discovery-research-cache.json, " +
        "then re-form niches for selected deals."
    );
  }

  const prompt = buildPrompt(deal, research, options.usedNiches ?? []);

  const startedAt = Date.now();
  const result = await structuredObjectFn({
    model: NICHE_REFORM_MODEL,
    schema: reformSchema,
    system: SYSTEM_PROMPT,
    prompt,
    timeoutMs: NICHE_REFORM_TIMEOUT_MS,
  });
  const latencyMs = Date.now() - startedAt;

  const out = result.object;

  // Decline path: model said no, or no usable angle, or below the fit threshold.
  if (!out.nicheFits || !out.angle || !out.isolatedNiche || out.fitConfidence < threshold) {
    const reason = !out.nicheFits
      ? `Declined: ${out.fitReasoning}`
      : !out.angle || !out.isolatedNiche
        ? "Model claimed a fit but returned no usable niche/angle."
        : `Fit confidence ${out.fitConfidence.toFixed(2)} below threshold ${threshold}: ${out.fitReasoning}`;
    return { status: "held", reason, fitConfidence: out.fitConfidence };
  }

  const trace: DealAiGenerationTrace = {
    model: result.modelId,
    promptSent: `SYSTEM:\n${SYSTEM_PROMPT}\n\nPROMPT:\n${prompt}`,
    rawResponse: JSON.stringify(out, null, 2),
    latencyMs,
    generatedAtIso,
  };

  const sailingAngleProfile: SailingAngleProfile = {
    sailingAngleTitle: out.angle.sailingAngleTitle,
    theCorePitch: out.angle.theCorePitch,
    visualAnchor: out.angle.visualAnchor,
    targetAudienceDescriptor: out.angle.targetAudienceDescriptor,
    relevantKeywords: out.angle.relevantKeywords,
    destinationAndTimeOfYearHints: out.angle.destinationAndTimeOfYearHints,
    onboardAssetRequirements: out.angle.onboardAssetRequirements,
  };

  const idea: DealDiscoveryIdea = {
    id: `angle-${slugify(out.angle.sailingAngleTitle) || slugify(deal.cruiseName) || deal.packageId}`,
    generatedAtIso,
    generator: "gpt",
    sourceResearchCachedAt: research.cachedAt,
    isolatedNiche: out.isolatedNiche,
    sailingAngleProfile,
    groundedCandidate: dealToGroundedCandidate(deal, generatedAtIso),
    aiTrace: trace,
  };

  return {
    status: "matched",
    idea,
    fitConfidence: out.fitConfidence,
    fitReasoning: out.fitReasoning,
    voiceWarnings: validateSailingAngleProfile(sailingAngleProfile),
  };
}
