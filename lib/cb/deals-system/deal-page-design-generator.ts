/**
 * Deal Funnel Synthesis — Step 7 agent.
 *
 * A conversion-rate-optimization (CRO) specialist that takes the verbose, hyper-niche
 * Step 3 ad copy (the operator-selected variant) and splits it into two assets:
 *
 *   (A) a BROAD-MARKET landing page — jargon stripped, short paragraphs per ship
 *       segment (Cabins / Lounges / Atrium / Dining / Excursions), written to sit
 *       beside premium imagery;
 *   (B) a HYPER-NICHE 4-card Meta carousel — doubles down on insider vocabulary to
 *       flag the subculture in the feed.
 *
 * AI-only/hard-fail via the LLM gateway. Carousel character limits and landing-page
 * jargon are validated POST-HOC and surfaced as operator warnings — never truncated
 * or auto-rewritten (mirrors validateAdCopyVoice / validateSailingAngleProfile).
 */

import { z } from "zod";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";

import type { DealAiGenerationTrace } from "./campaign-types";
import type { DealAdCopy, DealAdVariant } from "./deal-ad-copy-types";
import { buildFunnelSynthesisId } from "./deal-ids";
import {
  DEAL_LANDING_SEGMENT_KEYS,
  type DealCarouselAd,
  type DealCarouselCard,
  type DealFunnelSynthesis,
  type DealImageCandidate,
  type DealLandingPageCopy,
  type DealLandingSegment,
  type DealLandingSegmentKey,
} from "./deal-page-design-types";

const SYNTHESIS_MODEL = ModelName.CLAUDE_4_OPUS;
const SYNTHESIS_TIMEOUT_MS = Number(process.env.DEAL_FUNNEL_SYNTHESIS_TIMEOUT_MS ?? "150000");

export const CAROUSEL_HEADLINE_MAX = 40;
export const CAROUSEL_PRIMARY_TEXT_MAX = 125;

/** TEST SEAM (mirrors the other deals generators). */
type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;
export function __setFunnelSynthesisStructuredObjectGeneratorForTests(fn?: StructuredObjectFn): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

// ── Landing-page jargon guard ─────────────────────────────────────────────────
// The whole point of the landing page is BROAD appeal: it must not leak the ad's
// insider vocabulary. We can't know every niche term, but we can catch the obvious
// always-wrong-for-a-public-page categories and let the operator eyeball the rest.
export const LANDING_PAGE_BANNED_TERMS = [
  "rpg",
  "ttrpg",
  "vampire",
  "dice",
  "polyhedral",
  "leuchtturm",
  "oracle",
  "campaign",
  "prompt 34",
  "zine",
  "dungeon",
];

/** Scan a landing-page segment body for niche jargon that breaks broad appeal. */
export function validateLandingBroadAppeal(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const term of LANDING_PAGE_BANNED_TERMS) {
    if (new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`).test(lower)) {
      hits.push(`landing copy leaks niche term "${term}"`);
    }
  }
  return Array.from(new Set(hits));
}

/** Validate carousel card lengths (validate-and-warn, never truncate). */
export function validateCarouselCard(card: DealCarouselCard, index: number): string[] {
  const warnings: string[] = [];
  if (card.headline.length > CAROUSEL_HEADLINE_MAX) {
    warnings.push(`card ${index + 1} headline ${card.headline.length}/${CAROUSEL_HEADLINE_MAX} chars`);
  }
  if (card.primaryText.length > CAROUSEL_PRIMARY_TEXT_MAX) {
    warnings.push(
      `card ${index + 1} primaryText ${card.primaryText.length}/${CAROUSEL_PRIMARY_TEXT_MAX} chars`
    );
  }
  return warnings;
}

/** Common cruise region/ocean labels checked against carousel copy. */
const KNOWN_DESTINATION_REGIONS = [
  "caribbean",
  "bahamas",
  "alaska",
  "alaskan",
  "mediterranean",
  "south pacific",
  "mexican riviera",
  "mexico",
  "bermuda",
  "hawaii",
  "hawaiian",
  "panama canal",
  "transatlantic",
  "northern europe",
  "baltic",
  "asia",
  "australia",
  "new zealand",
  "galapagos",
];

/**
 * Warn if NO carousel card mentions the cruise's destination/region — either
 * the exact `destinationLabel` (e.g. itinerary name) or a known region word
 * (e.g. "Caribbean", "Alaska"). Validate-and-warn only; never rewritten.
 */
export function validateCarouselDestinationMention(
  cards: DealCarouselCard[],
  destinationLabel?: string
): string[] {
  if (!destinationLabel?.trim()) return [];
  const haystack = cards.map((c) => `${c.headline} ${c.primaryText}`.toLowerCase()).join(" ");
  const labelWords = destinationLabel
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const mentionsLabel = labelWords.some((w) => haystack.includes(w));
  const mentionsKnownRegion = KNOWN_DESTINATION_REGIONS.some((r) => haystack.includes(r));
  if (!mentionsLabel && !mentionsKnownRegion) {
    return [`no carousel card mentions the destination/region ("${destinationLabel}")`];
  }
  return [];
}

// ── Output schema ─────────────────────────────────────────────────────────────

const segmentSchema = z.object({
  segment: z.enum(["cabins", "lounges", "atrium", "dining", "excursions"]),
  heading: z.string(),
  body: z.string(),
});

const cardSchema = z.object({
  headline: z.string(),
  primaryText: z.string(),
});

const synthesisSchema = z.object({
  heroHeadline: z.string(),
  heroSubhead: z.string(),
  segments: z.array(segmentSchema).min(1),
  carouselCards: z.array(cardSchema).min(1),
});

// The operator's CRO funnel-split system prompt.
const SYSTEM_PROMPT = `You are a conversion-rate-optimization (CRO) specialist. Your job is to take a verbose, hyper-niche ad copy draft and split it into two distinct digital assets: an inclusive, visually-driven Landing Page and a hyper-targeted Meta Carousel ad.

INPUT: a single high-niche ad copy draft (headline + body + disclaimers + targeting), produced for one specific subculture.

STRICT TRANSFORMATION RULES:

PART 1: THE PUBLIC LANDING PAGE (Broad Market Appeal)
- Tone: sophisticated, relaxed, premium — "a great cruise with great perks".
- Rule: COMPLETELY REMOVE all hyper-specific niche vocabulary. Kill every reference to the subculture's hobby, props, brands, in-jokes, and personas. A standard retail traveler, or a partner who is NOT into the niche, must read this and think "this looks like an incredible upscale cruise."
- Keep the VIBE the ad promised (peace, ocean views, quiet sophisticated spaces, unhurried dining, atmospheric ports) but strip the jargon.
- Structure: write short, evocative paragraphs (MAXIMUM 3 sentences each) designed to sit next to premium imagery, broken down exactly by these ship segments, in this order. Use these exact headings (clean, premium, and campaign-agnostic — true for any cruise):
  1. cabins  (heading "Your Space at Sea")
  2. lounges (heading "Room to Unwind")
  3. atrium  (heading "First Impressions")
  4. dining  (heading "A Table for Every Night")
  5. excursions (heading "Where You'll Step Ashore")
- Also write a broad heroHeadline and a one-line heroSubhead with NO niche jargon.

PART 2: THE META CAROUSEL AD (Hyper-Niche Target)
- Tone: inside-baseball, urgent, direct-response.
- Structure: a 4-card carousel sequence. Each card: headline (MAX 40 characters) and primaryText (MAX 125 characters).
- Rule: DOUBLE DOWN on the niche terminology here to flag the exact consumer scrolling the feed. Use the subculture's exact words, props, and pain points from the draft.
- Rule: AT LEAST ONE of the 4 cards MUST clearly signal the cruise's destination/region (e.g. "Caribbean", "Alaska", "Mediterranean", "South Pacific", "Mexican Riviera") in its headline or primaryText, so a scroller instantly knows where this cruise sails to. Weave it in naturally — don't break the niche tone to do it.
- Rule: TRIP-LENGTH CLARITY. The ad copy draft may describe sub-durations that are SHORTER than the cruise's actual total length (e.g. "7 consecutive sea days" within a 13-night crossing, a "3-night stopover" within a longer itinerary). The draft's total length is given as {{NIGHTS}} nights. If a carousel card calls out ANY day/night count that differs from {{NIGHTS}}, that card (or an adjacent card) MUST also state the total trip length, so no card reads as if the sub-duration IS the whole cruise (e.g. "13 Nights, 7 Pure Sea Days" — not just "7 Unbroken Days"). Never let a sub-duration stand alone where it could be mistaken for the total cruise length.

OUTPUT FORMAT:
Return a single valid JSON object: heroHeadline, heroSubhead, segments (array of {segment, heading, body}), carouselCards (array of 4 {headline, primaryText}). No prose outside the JSON.`;

function buildPrompt(
  variant: DealAdVariant,
  adCopy: DealAdCopy,
  destinationLabel?: string,
  nights?: number
): string {
  const draft = {
    campaignName: adCopy.campaignName,
    targetAudienceTag: adCopy.targetAudienceTag,
    headline: variant.headline,
    bodyCopy: variant.bodyCopy,
    pricingDisclaimers: variant.pricingDisclaimers,
    callToAction: variant.callToAction,
    interestKeywords: variant.adPlatformTargetingHooks.interestKeywords,
    ...(destinationLabel ? { destination: destinationLabel } : {}),
    ...(nights ? { nights } : {}),
  };
  return `{{HIGH_NICHE_COPY_DRAFT}}:
${JSON.stringify(draft, null, 2)}

Produce PART 1 (broad landing page: heroHeadline, heroSubhead, and exactly the five ship-segment paragraphs in order — cabins, lounges, atrium, dining, excursions — each <=3 sentences, jargon stripped) and PART 2 (exactly 4 hyper-niche carousel cards, headline <=40 chars, primaryText <=125 chars, at least 1 mentioning the destination/region, and no card implying a trip length other than ${nights ? `${nights} nights` : "the actual total"}).`;
}

function orderSegments(
  raw: Array<{ segment: DealLandingSegmentKey; heading: string; body: string }>
): DealLandingSegment[] {
  const byKey = new Map(raw.map((s) => [s.segment, s]));
  const ordered: DealLandingSegment[] = [];
  for (const key of DEAL_LANDING_SEGMENT_KEYS) {
    const found = byKey.get(key);
    if (found) {
      ordered.push({ segment: key, heading: found.heading, body: found.body });
    }
  }
  // Preserve any unexpected extras (defensive — schema constrains to known keys).
  for (const s of raw) {
    if (!DEAL_LANDING_SEGMENT_KEYS.includes(s.segment)) {
      ordered.push({ segment: s.segment, heading: s.heading, body: s.body });
    }
  }
  return ordered;
}

export interface GenerateDealFunnelSynthesisOptions {
  adCopy: DealAdCopy;
  /** Which ad-copy variant to synthesize from. Default = selected (or primary). */
  variantIndex?: number;
  /** SERP candidates to attach (sourced separately). Default empty. */
  candidates?: DealImageCandidate[];
  sailingAngleTitle?: string;
  /**
   * The curated deal id (CuratedOdysseusDeal.id, i.e. the resolved package's
   * packageId) this synthesis belongs to. Falls back to the unified manifest
   * id (with its "unified-" prefix stripped) when not provided, but that
   * fallback does NOT match any CuratedOdysseusDeal.id — downstream stages
   * (e.g. Step 9 Meta distribution) need the real packageId.
   */
  dealId?: string;
  generatedAtIso?: string;
  /**
   * Human destination/region label (e.g. "7-Night Eastern Caribbean" or
   * "Alaska") from the source trip manifest. When provided, the prompt
   * instructs the model to surface it in at least one carousel card, and
   * the carousel is validated for a destination/region mention.
   */
  destinationLabel?: string;
  /**
   * The cruise's actual total nights, from the source trip manifest. When
   * provided, the prompt instructs the model not to let a shorter
   * sub-duration (e.g. "7 sea days" within a 13-night crossing) read as the
   * whole trip's length.
   */
  nights?: number;
}

export interface GenerateDealFunnelSynthesisResult {
  synthesis: DealFunnelSynthesis;
}

export async function generateDealFunnelSynthesis(
  options: GenerateDealFunnelSynthesisOptions
): Promise<GenerateDealFunnelSynthesisResult> {
  const { adCopy } = options;
  const variantIndex =
    options.variantIndex ?? adCopy.selectedVariantIndex ?? 0;
  const variant = adCopy.variants[variantIndex];
  if (!variant) {
    throw new Error(
      `Ad copy "${adCopy.id}" has no variant at index ${variantIndex} (0..${adCopy.variants.length - 1}).`
    );
  }
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();

  const prompt = buildPrompt(variant, adCopy, options.destinationLabel, options.nights);
  const startedAt = Date.now();
  const result = await structuredObjectFn({
    model: SYNTHESIS_MODEL,
    schema: synthesisSchema,
    system: SYSTEM_PROMPT,
    prompt,
    timeoutMs: SYNTHESIS_TIMEOUT_MS,
  });
  const latencyMs = Date.now() - startedAt;

  const trace: DealAiGenerationTrace = {
    model: result.modelId,
    promptSent: `SYSTEM:\n${SYSTEM_PROMPT}\n\nPROMPT:\n${prompt}`,
    rawResponse: JSON.stringify(result.object, null, 2),
    latencyMs,
    generatedAtIso,
  };

  const segments = orderSegments(result.object.segments);
  for (const seg of segments) {
    seg.imageId = undefined;
  }
  const landingWarnings = [
    ...segments.flatMap((s) => validateLandingBroadAppeal(s.body)),
    ...validateLandingBroadAppeal(result.object.heroHeadline),
    ...validateLandingBroadAppeal(result.object.heroSubhead),
  ];
  const landingPage: DealLandingPageCopy = {
    heroHeadline: result.object.heroHeadline,
    heroSubhead: result.object.heroSubhead,
    segments,
    warnings: Array.from(new Set(landingWarnings)),
  };

  const cards: DealCarouselCard[] = result.object.carouselCards.map((c) => ({
    headline: c.headline,
    primaryText: c.primaryText,
  }));
  const carousel: DealCarouselAd = {
    cards,
    warnings: [
      ...cards.flatMap((c, i) => validateCarouselCard(c, i)),
      ...validateCarouselDestinationMention(cards, options.destinationLabel),
    ],
  };

  // The real Odysseus deal id is the stable, guaranteed-unique key. Prefer the
  // explicitly-resolved options.dealId; fall back to stripping the manifest
  // prefix only when a caller didn't pass one.
  const resolvedDealId = options.dealId ?? adCopy.sourceUnifiedManifestId.replace(/^unified-/, "");

  const synthesis: DealFunnelSynthesis = {
    // Lead the id with the real dealId so it can NEVER collide with another
    // deal, regardless of campaign-name length (the old
    // slugify(campaignName-…).slice(0,80) scheme truncated away the
    // disambiguator and mixed unrelated deals). buildFunnelSynthesisId also
    // caps the human-readable slug tail so the id stays bounded.
    id: buildFunnelSynthesisId(resolvedDealId, adCopy.campaignName),
    dealId: resolvedDealId,
    generatedAtIso,
    generator: "gpt",
    sourceAdCopyId: adCopy.id,
    sailingAngleTitle: options.sailingAngleTitle ?? adCopy.campaignName,
    landingPage,
    carousel,
    candidates: options.candidates ?? [],
    galleryIds: [],
    heroImageId: undefined,
    aiTrace: trace,
  };

  return { synthesis };
}
