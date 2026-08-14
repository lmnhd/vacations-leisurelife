/**
 * Deal Discovery — Stage 2: saved niche research → Sailing Angle Profiles.
 *
 * This is step 1 of the deal workflow (6-10-26/DISCOVERY_LAB_DESIGN.md). It REUSES
 * the operator's last saved niche research (Group pipeline output, persisted to
 * `discovery-research-cache.json`) and asks a top-tier model to act as a
 * direct-response creative marketing strategist: isolate each niche, answer why a
 * cruise is its ideal venue, then emit a Sailing Angle Profile pitched to an
 * independent consumer/household.
 *
 * AI-only, hard fail (AI-FIRST mandate): if the gateway call fails, the error
 * propagates and no angles are produced. All calls go through the LLM gateway with
 * a ModelName enum value (AI_POLICY §5). We never trigger Gemini here — that is
 * operator-run via the Group pipeline; we only read its saved output.
 */

import { z } from "zod/v3";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";

import type { DealAiGenerationTrace } from "./campaign-types";
import type {
  DealDiscoveryIdea,
  SailingAngleProfile,
} from "./deal-discovery-types";
import {
  readSavedDiscoveryResearch,
  type SavedDiscoveryResearch,
} from "./discovery-research-source";

const DEAL_GENERATION_MODEL = ModelName.CLAUDE_4_OPUS;
const DEAL_DISCOVERY_TIMEOUT_MS = Number(
  process.env.DEAL_DISCOVERY_TIMEOUT_MS ?? "120000"
);

/**
 * Indirection over the gateway so proof-script tests (run via `tsx`, no mocking
 * framework) can inject a deterministic structured-object generator. Production
 * code never sets this — it defaults to the real gateway call.
 */
type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;

/** TEST SEAM: override the gateway generator. Pass no argument to reset. */
export function __setDiscoveryStructuredObjectGeneratorForTests(fn?: StructuredObjectFn): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Banned language (surfaced to the operator; not auto-fixed) ────────────────

/** Mass-group language is forbidden — this is an independent retail vacation. */
export const SAILING_ANGLE_BANNED_GROUP_TERMS = [
  "group cruise",
  "group",
  "meetup",
  "meetups",
  "club",
  "clubs",
  "organized event",
  "organized events",
  "cohort",
  "hosted",
];

/** Generic/corporate travel clichés are forbidden — insider vocabulary only. */
export const SAILING_ANGLE_BANNED_GENERIC_PHRASES = [
  "unwind",
  "escape",
  "luxury",
  "paradise",
];

/**
 * Scan a Sailing Angle Profile's copy fields for banned mass-group language or
 * generic travel clichés. Returns human-readable warnings for the operator.
 */
export function validateSailingAngleProfile(profile: SailingAngleProfile): string[] {
  const warnings: string[] = [];
  const fields: Array<[string, string]> = [
    ["sailingAngleTitle", profile.sailingAngleTitle],
    ["theCorePitch", profile.theCorePitch],
    ["visualAnchor", profile.visualAnchor],
    ["targetAudienceDescriptor", profile.targetAudienceDescriptor],
    ["destinationAndTimeOfYearHints", profile.destinationAndTimeOfYearHints],
    ["onboardAssetRequirements", profile.onboardAssetRequirements],
    ...profile.relevantKeywords.map(
      (kw, i) => [`relevantKeywords[${i}]`, kw] as [string, string]
    ),
  ];
  for (const [field, raw] of fields) {
    const text = raw.toLowerCase();
    for (const term of SAILING_ANGLE_BANNED_GROUP_TERMS) {
      if (new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`).test(text)) {
        warnings.push(`${field} uses banned mass-group term "${term}".`);
      }
    }
    for (const phrase of SAILING_ANGLE_BANNED_GENERIC_PHRASES) {
      if (new RegExp(`\\b${phrase}\\b`).test(text)) {
        warnings.push(`${field} uses banned generic travel phrase "${phrase}".`);
      }
    }
  }
  return Array.from(new Set(warnings));
}

// ── Zod schema for the model output ───────────────────────────────────────────

const angleSchema = z.object({
  isolatedNiche: z.string(),
  sailingAngleTitle: z.string(),
  theCorePitch: z.string(),
  visualAnchor: z.string(),
  targetAudienceDescriptor: z.string(),
  relevantKeywords: z.array(z.string()).min(6).max(8),
  destinationAndTimeOfYearHints: z.string(),
  onboardAssetRequirements: z.string(),
});

const anglesBatchSchema = z.object({
  angles: z.array(angleSchema).min(1),
});

// ── Prompt (system role + rules + few-shot examples) ──────────────────────────

const SYSTEM_PROMPT = `You are a direct-response creative marketing strategist. Your job is to generate a comprehensive "Sailing Angle Profile" to pitch a cruise booking directly to a passionate consumer or household.

CRITICAL AD COPY RULES:
- NO MASS-GROUP LANGUAGE: Do not use words like "group cruise," "meetups," "clubs," or "organized events." Pitch this as an independent, self-contained retail vacation.
- BAN GENERIC TRAVEL PHRASES: Avoid corporate speak like "unwind," "escape," "luxury," or "paradise."
- TARGET THE INSIDER: The copy and keywords must use native vocabulary drawn from the niche's own community.

For each niche, reason in two steps before writing the profile:
- STEP 1 — Isolate the niche: name the exact consumer identity (e.g. "The Cyanotype Botanical Alchemist").
- STEP 2 — Answer the core question: why is a cruise the uniquely ideal venue for THIS niche's practice? Build the pitch, asset requirements, and timing from that answer.

OUTPUT (per niche): isolatedNiche, then a Sailing Angle Profile:
1. sailingAngleTitle — a punchy 3-to-6 word thematic ad hook.
2. theCorePitch — a 2-sentence emotional direct-response pitch driving an immediate booking.
3. visualAnchor — a description of the high-contrast ad imagery matching this pitch.
4. targetAudienceDescriptor — a clear definition of the specific buyer profile, lifestyle, and household dynamic.
5. relevantKeywords — 6 to 8 hyper-targeted insider search terms and semantic tags for ad-platform targeting.
6. destinationAndTimeOfYearHints — strategic geographical and seasonal recommendations that maximize the angle's success.
7. onboardAssetRequirements — a precise physical checklist of ship amenities, vessel styles, or architectural layouts required to fulfill the ad's promise.

FEW-SHOT EXAMPLE A (Creative & Environmental — Cyanotype Alchemists):
Isolated niche: The Cyanotype Botanical Alchemist.
Core question answer: A cruise is a floating ultraviolet observatory and geographic conduit; shifting latitudinal sunlight plus new exotic island flora at every port let the artist make site-specific prints from the deck chair without land-based travel friction.
Output:
{
  "isolatedNiche": "The Cyanotype Botanical Alchemist",
  "sailingAngleTitle": "Prints of Changing Latitudes",
  "theCorePitch": "Stop trying to force your creative practice into the unpredictable weather and familiar flora of home. On a cruise, the shifting latitude dynamically alters your UV exposure metrics daily, while foreign port stops provide a brand-new canvas of exotic, foraged botanicals to rinse and reveal right from the sun decks.",
  "visualAnchor": "A high-contrast, first-person shot of a traveler's hands unclipping a shatterproof plexiglass frame on a sun-drenched ship deck. A brilliant Prussian blue cyanotype print is revealed, showcasing the stark white silhouette of a freshly foraged tropical fern leaf, with the sparkling turquoise ocean rolling past in the background.",
  "targetAudienceDescriptor": "Solo creators, artistic couples, or mindful parents who practice alternative photography, printmaking, or botanical art, and value slow, analog creative travel.",
  "relevantKeywords": ["cyanotype printing", "alternative process photography", "botanical art", "Prussian blue prints", "sun printing", "analog art processing"],
  "destinationAndTimeOfYearHints": "Tropical or high-sun regions (Caribbean, Mediterranean, or Greek Isles) scheduled during high-UV seasons (Late Spring through early Autumn) to ensure reliable exposure conditions.",
  "onboardAssetRequirements": "Vessels featuring expansive open-air top decks with wind-shielded alcoves, a high percentage of private ocean-facing balconies, and easy access to outdoor fresh-water rinsing stations (such as pool deck showers)."
}

FEW-SHOT EXAMPLE B (High-Net-Worth & Intellectual — Mechanical Puzzle Solvers):
Isolated niche: The High-End Mechanical Puzzle Collector.
Core question answer: Blind sequential-discovery puzzles need deep cognitive quiet, free of digital pings and domestic interruption. A cruise is the ultimate distraction-free sanctuary — hours of mental white space in wood-paneled lounges with the ocean's low-frequency rhythm behind intense tactical logic.
Output:
{
  "isolatedNiche": "The High-End Mechanical Puzzle Collector",
  "sailingAngleTitle": "The Out-of-Office Enigma",
  "theCorePitch": "Your brain doesn’t know how to turn off corporate problem-solving just by staring at a beach. Trade the digital exhaustion of your daily grind for the pure physics of a masterfully machined sequential discovery puzzle, cracked during hours of uninterrupted cognitive flow in a quiet ocean lounge.",
  "visualAnchor": "A moody, elegant close-up shot on a polished wood table inside a quiet ship lounge. A heavy, gleaming machined-brass trick lock rests on a dark velvet mat alongside a glass of single-malt scotch, while massive panoramic windows in the background reveal the deep blue, unhurried expanse of the open ocean.",
  "targetAudienceDescriptor": "High-net-worth professionals, software engineers, executives, and mechanical puzzle collectors seeking an intellectually stimulating way to completely disconnect from screens and digital noise.",
  "relevantKeywords": ["sequential discovery puzzles", "trick locks", "mechanical puzzles", "Hanayama cast puzzles", "wood puzzle boxes", "analog brain teasers", "cognitive flow state"],
  "destinationAndTimeOfYearHints": "Transatlantic crossings, scenic fjord sailings, or open-ocean itineraries with high sea-day densities, scheduled during shoulder seasons to guarantee lower public venue volume and maximum quietude.",
  "onboardAssetRequirements": "Vessels favoring a traditional ocean-liner aesthetic, featuring dedicated library carrels, upscale wood-paneled observation bars (e.g., Schooner bars), stable/level lounge tables, and a distinct layout design that prioritizes quiet acoustic sanctuaries over high-decibel family attractions."
}`;

/** Normalize a niche/title for duplicate comparison (case/spacing/punctuation-insensitive). */
function normalizeForDedup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Build the "already generated — do not repeat" exclusion block from existing
 * angles, so each run produces genuinely different niches/angles. Mirrors the
 * Group discovery pipeline's dedup exclusion approach.
 */
function buildExclusionBlock(existingAngles: DealDiscoveryIdea[]): string {
  if (existingAngles.length === 0) return "";
  const lines = existingAngles
    .map((a) => `- ${a.isolatedNiche} — "${a.sailingAngleProfile.sailingAngleTitle}"`)
    .join("\n");
  return `\n\nALREADY GENERATED — DO NOT REPEAT:
The following niches and angles have already been produced. Choose entirely different
niches from the research and write entirely different angles. Do not reuse, lightly
reword, or produce near-neighbors of any of these isolated niches or titles:
${lines}

If the research contains no meaningfully different niches left to isolate, return
fewer angles (or an empty "angles" array) rather than repeating or paraphrasing the above.`;
}

function buildPrompt(
  research: SavedDiscoveryResearch,
  count: number,
  existingAngles: DealDiscoveryIdea[]
): string {
  const psychographic = research.psychographicData?.trim();
  const aesthetic = research.aestheticData?.trim();
  return `Saved niche discovery research (isolate niches from this — it is consumer/community research, not travel research):

${psychographic ? `COMMUNITY / PSYCHOGRAPHIC RESEARCH:\n${psychographic}` : ""}

${aesthetic ? `AESTHETIC / SHIP-FIT RESEARCH:\n${aesthetic}` : ""}

Produce up to ${count} distinct Sailing Angle Profiles, each isolated from a different niche in the research above. Each must obey the CRITICAL AD COPY RULES and follow the STEP 1 / STEP 2 reasoning. Return them as a JSON object with an "angles" array.${buildExclusionBlock(existingAngles)}`;
}

export interface GenerateDealDiscoveryIdeasOptions {
  /** How many angles to produce. Default 5. */
  count?: number;
  /** Use this research instead of reading the saved cache (for tests). */
  research?: SavedDiscoveryResearch;
  /**
   * Angles already in the cache. Fed into the prompt as a "do not repeat"
   * exclusion list, and used to skip any returned duplicate (by niche or title)
   * so repeated runs accumulate genuinely new ideas instead of near-copies.
   */
  existingAngles?: DealDiscoveryIdea[];
  generatedAtIso?: string;
}

/**
 * A candidate angle, generated but not yet grounded against live inventory.
 * The caller (Discovery route) must run the inventory-grounding search and
 * attach `groundedCandidate` before this can become a real DealDiscoveryIdea —
 * see deal-discovery-types.ts header comment.
 */
export type UngroundedDealDiscoveryIdea = Omit<DealDiscoveryIdea, "groundedCandidate">;

export interface GenerateDealDiscoveryIdeasResult {
  /** Newly generated, de-duplicated angle candidates — NOT YET GROUNDED. */
  ideas: UngroundedDealDiscoveryIdea[];
  /** Returned angles dropped because their niche/title already existed. */
  skipped: Array<{ isolatedNiche: string; sailingAngleTitle: string; reason: string }>;
  /**
   * True when the model returned nothing new (every angle was a duplicate, or it
   * returned an empty array) — a signal the current research is exhausted and the
   * operator should refresh discovery research to go deeper.
   */
  exhausted: boolean;
}

/**
 * Generate Sailing Angle Profiles from saved niche research. Throws a clear
 * operator error if no saved research is available — we never run Gemini here.
 *
 * Repeated runs do not regenerate the same ideas: existing angles are injected as
 * a prompt exclusion list, and any returned duplicate (same niche or title) is
 * skipped and reported rather than overwriting or near-copying.
 */
export async function generateDealDiscoveryIdeas(
  options: GenerateDealDiscoveryIdeasOptions = {}
): Promise<GenerateDealDiscoveryIdeasResult> {
  const count = Math.min(Math.max(options.count ?? 5, 1), 8);
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const existingAngles = options.existingAngles ?? [];

  const research = options.research ?? readSavedDiscoveryResearch();
  if (!research || (!research.psychographicData && !research.aestheticData)) {
    throw new Error(
      "No saved discovery research available. Run Group discovery research first " +
        "(POST /api/groups/discovery/research) to populate discovery-research-cache.json, " +
        "then generate Sailing Angle Profiles from it."
    );
  }

  const prompt = buildPrompt(research, count, existingAngles);

  const startedAt = Date.now();
  const result = await structuredObjectFn({
    model: DEAL_GENERATION_MODEL,
    schema: anglesBatchSchema,
    system: SYSTEM_PROMPT,
    prompt,
    timeoutMs: DEAL_DISCOVERY_TIMEOUT_MS,
  });
  const latencyMs = Date.now() - startedAt;

  const trace: DealAiGenerationTrace = {
    model: result.modelId,
    promptSent: `SYSTEM:\n${SYSTEM_PROMPT}\n\nPROMPT:\n${prompt}`,
    rawResponse: JSON.stringify(result.object, null, 2),
    latencyMs,
    generatedAtIso,
  };

  // Seed dedup sets from existing angles, then grow them as we accept new ones,
  // so duplicates within a single batch are also caught.
  const seenNiches = new Set(existingAngles.map((a) => normalizeForDedup(a.isolatedNiche)));
  const seenTitles = new Set(
    existingAngles.map((a) => normalizeForDedup(a.sailingAngleProfile.sailingAngleTitle))
  );

  const ideas: UngroundedDealDiscoveryIdea[] = [];
  const skipped: GenerateDealDiscoveryIdeasResult["skipped"] = [];

  result.object.angles.forEach((raw, index) => {
    const nicheKey = normalizeForDedup(raw.isolatedNiche);
    const titleKey = normalizeForDedup(raw.sailingAngleTitle);
    if (seenNiches.has(nicheKey) || seenTitles.has(titleKey)) {
      skipped.push({
        isolatedNiche: raw.isolatedNiche,
        sailingAngleTitle: raw.sailingAngleTitle,
        reason: seenNiches.has(nicheKey)
          ? "niche already generated"
          : "angle title already generated",
      });
      return;
    }
    seenNiches.add(nicheKey);
    seenTitles.add(titleKey);

    const sailingAngleProfile: SailingAngleProfile = {
      sailingAngleTitle: raw.sailingAngleTitle,
      theCorePitch: raw.theCorePitch,
      visualAnchor: raw.visualAnchor,
      targetAudienceDescriptor: raw.targetAudienceDescriptor,
      relevantKeywords: raw.relevantKeywords,
      destinationAndTimeOfYearHints: raw.destinationAndTimeOfYearHints,
      onboardAssetRequirements: raw.onboardAssetRequirements,
    };
    ideas.push({
      id: `angle-${slugify(raw.sailingAngleTitle) || `idea-${index + 1}`}`,
      generatedAtIso,
      generator: "gpt",
      sourceResearchCachedAt: research.cachedAt,
      isolatedNiche: raw.isolatedNiche,
      sailingAngleProfile,
      // Share one trace across the batch; each angle references the same call.
      aiTrace: trace,
    });
  });

  return {
    ideas,
    skipped,
    exhausted: ideas.length === 0,
  };
}
