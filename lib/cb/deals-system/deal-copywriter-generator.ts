/**
 * Deal Copywriter — Step 3 agent.
 *
 * The copywriter is a strict EXPANSION engine. It takes the unified manifest
 * (Step 1 creative brief + Step 2 inventory/promo manifest) and writes direct-
 * response retail ad copy — multiple variants (a primary play on the strongest
 * promo + aspirational upsell tiers). It does NOT originate concepts or change the
 * angle; it expands the brief's hook against the manifest's promo/pricing/itinerary
 * constraints. This replaces the older targeting / sales-pitch / deal-copy steps for
 * this workflow — ad-platform targeting hooks are embedded in each variant.
 *
 * AI-only/hard-fail via the LLM gateway (AI_POLICY §5). Banned vocabulary is scanned
 * post-hoc and surfaced to the operator; promo ids the model cites are validated
 * against the unified manifest's appliedPromos.
 */

import { z } from "zod";

import { generateStructuredObject, ModelName } from "@/lib/ai/llm-gateway";

import type { DealAiGenerationTrace } from "./campaign-types";
import type {
  DealAdCopy,
  DealAdVariant,
} from "./deal-ad-copy-types";
import { buildDealAdCopyId, extractNumericDealId, slugifyIdPart } from "./deal-ids";
import type { DealUnifiedManifest } from "./deal-unified-manifest-types";

const COPYWRITER_MODEL = ModelName.CLAUDE_4_OPUS;
const COPYWRITER_TIMEOUT_MS = Number(process.env.DEAL_COPYWRITER_TIMEOUT_MS ?? "150000");

/** TEST SEAM (see deal-discovery-generator for the rationale). */
type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;
export function __setCopywriterStructuredObjectGeneratorForTests(fn?: StructuredObjectFn): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

/**
 * Resolve the canonical dealId (= Odysseus packageId) for a unified manifest.
 * New manifests carry it verbatim in assembleDraft.suggestedDealId (see
 * deal-trip-manifest-generator + deal-ids.ts); legacy manifests embed it at
 * the tail of sourceManifestId; hand-seeded manifests without a number fall
 * back to the slugified manifest id — still unique per manifest, just longer.
 */
export function resolveManifestDealId(manifest: DealUnifiedManifest): string {
  const suggested = manifest.inventoryManifest.assembleDraft?.suggestedDealId?.trim();
  if (suggested && /^\d+$/.test(suggested)) return suggested;
  return extractNumericDealId(manifest.sourceManifestId) ?? slugifyIdPart(manifest.sourceManifestId);
}

/** @deprecated Legacy signature kept for the id-migration script. New code
 * should call resolveManifestDealId + buildDealAdCopyId (deal-ids.ts). */
export function buildAdCopyId(campaignName: string, sourceManifestId: string): string {
  const dealId = extractNumericDealId(sourceManifestId) ?? slugifyIdPart(sourceManifestId);
  return buildDealAdCopyId(dealId, campaignName);
}

/**
 * Banned travel-agent platitudes + mass-group terms. Direct-response, insider voice
 * only. Surfaced as operator warnings; never auto-rewritten.
 */
export const AD_COPY_BANNED_TERMS = [
  "paradise",
  "escape",
  "unwind",
  "cruising",
  "hidden gem",
  "luxury for less",
  "magnificent",
  "breathtaking",
  "group cruise",
  "meetup",
  "meetups",
  "organized event",
  "organized events",
];

/** Scan an ad variant's customer-facing fields for banned vocabulary. */
export function validateAdCopyVoice(variant: {
  headline: string;
  bodyCopy: string;
  callToAction: string;
}): string[] {
  const warnings: string[] = [];
  const fields: Array<[string, string]> = [
    ["headline", variant.headline],
    ["bodyCopy", variant.bodyCopy],
    ["callToAction", variant.callToAction],
  ];
  for (const [field, raw] of fields) {
    const text = raw.toLowerCase();
    for (const term of AD_COPY_BANNED_TERMS) {
      if (new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`).test(text)) {
        warnings.push(`${field} uses banned term "${term}".`);
      }
    }
  }
  return Array.from(new Set(warnings));
}

// ── Output schema ─────────────────────────────────────────────────────────────

const variantSchema = z.object({
  promoApplied: z.string(),
  variantLabel: z.string(),
  headline: z.string(),
  bodyCopy: z.string(),
  pricingDisclaimers: z.string(),
  callToAction: z.string(),
  adPlatformTargetingHooks: z.object({
    demographicTargeting: z.string(),
    interestKeywords: z.array(z.string()).min(1),
  }),
});

const adCopySchema = z.object({
  campaignName: z.string(),
  targetAudienceTag: z.string(),
  primaryPromoApplied: z.string(),
  variants: z.array(variantSchema).min(1),
});

// The operator's exact Step 3 system prompt.
const SYSTEM_PROMPT = `You are an elite, direct-response direct-to-consumer (DTC) copywriting agent. Your sole purpose is to synthesize a hyper-targeted Creative Brief with live Inventory/Promotional data to write high-converting retail ad copy.

### INPUTS TO PROCESS:
1. {{CREATIVE_BRIEF_JSON}}: Contains the isolated niche, core question answer, insider vocabulary, visual anchor, target audience data, and any attached internal targeting rationale / audience signals.
2. {{INVENTORY_MANIFEST_JSON}}: Contains the live cruise line, ship class, itinerary, dates, promotions, and critical booking window deadlines.

### STRICT AD COPY RULES:
1. THE EXPANSION RULE: Do not invent new creative concepts or change the marketing angle. Your job is strictly to expand the specific hook provided in the Creative Brief into natural, flowing copy, seamlessly embedding the pricing, promotions, and itinerary constraints.
2. HYPER-SPECIFICITY & INSIDER COGNITION: Lean heavily into the unique pain points, specific tools (e.g., exact brand names or specific rulesets mentioned), and insider vocabulary from the brief. If a regular tourist doesn't understand the opening line, but the target enthusiast feels seen, you have succeeded.
3. NO MASS-GROUP OR ISOLATED TRAVELER TRAPS: Pitch this as a self-contained retail vacation for an individual, a couple, or a single household. Do not use terms like "group cruise," "organized meetups," "clubs," or "mass gatherings." Never alienate travelers who may want to bring a spouse or partner, but keep the core focus on the personal passion.
4. BANNED TRAVEL-AGENT PLATITUDES: You are strictly forbidden from using generic industry buzzwords. Ban these words completely: "paradise", "escape", "unwind", "cruising", "hidden gem", "luxury for less", "magnificent", "breathtaking".
5. INTEGRATE THE PROMO LEGALLY & LIFESTYLE-WISE:
   - If promotionBriefs contains an applicable promotion, the primary variant MUST use it. "none" is forbidden for the primary variant in that case.
   - Use the supplied public claims and qualifiers. Never claim that no promotion or onboard credit applies when a promotion brief is present.
   - Translate generic incentives into the subculture's lifestyle (e.g., reframe Onboard Credit as a specific lifestyle subsidy matching their props/hobbies).
   - Append mandatory, clear-cut discretionary disclaimers at the bottom of the body copy regarding select sailings, stateroom dependencies, and live lookup availability to protect the platform.

### VARIANTS:
Produce a primary retail play on the strongest applicable promo, plus an aspirational upsell variant for each additional applicable promo tier when one fits. Tag each variant with the exact promo id it leans on (use "none" only if a variant features no promo). Only reference promo ids present in the inventory manifest's appliedPromos.

### OUTPUT FORMAT:
Return a single valid JSON object: campaignName, targetAudienceTag, primaryPromoApplied, and a variants array. Each variant: promoApplied, variantLabel, headline, bodyCopy, pricingDisclaimers, callToAction, adPlatformTargetingHooks {demographicTargeting, interestKeywords}. No prose outside the JSON.`;

function buildPrompt(unified: DealUnifiedManifest, variantCount: number): string {
  const brief = {
    isolatedNiche: unified.creativeBrief.isolatedNiche,
    researchRationale: unified.creativeBrief.researchRationale,
    successLogic: unified.creativeBrief.successLogic,
    audienceSignals: unified.creativeBrief.audienceSignals,
    ...unified.creativeBrief.angle,
  };
  const inventory = unified.inventoryManifest;
  return `{{CREATIVE_BRIEF_JSON}}:
${JSON.stringify(brief, null, 2)}

{{INVENTORY_MANIFEST_JSON}}:
${JSON.stringify(
    {
      assembleDraft: inventory.assembleDraft,
      lookupQuery: inventory.lookupQuery,
      appliedPromos: inventory.appliedPromos,
      promotionBriefs: inventory.promotionBriefs,
      promoStrategy: inventory.promoStrategy,
      manifestReasoning: inventory.manifestReasoning,
    },
    null,
    2
  )}

Produce up to ${variantCount} ad variant(s): a primary retail play plus aspirational upsell(s) where an additional applicable promo tier fits. Expand the brief's exact hook — do not change the angle.`;
}

export interface GenerateDealAdCopyOptions {
  unifiedManifest: DealUnifiedManifest;
  /** Max variants (primary + upsells). Default 2. */
  variantCount?: number;
  generatedAtIso?: string;
}

export interface GenerateDealAdCopyResult {
  adCopy: DealAdCopy;
  /** Promo ids the model cited that were not in the unified manifest (dropped). */
  rejectedPromoIds: string[];
}

export async function generateDealAdCopy(
  options: GenerateDealAdCopyOptions
): Promise<GenerateDealAdCopyResult> {
  const { unifiedManifest } = options;
  const variantCount = Math.min(Math.max(options.variantCount ?? 2, 1), 5);
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const applicablePromos = unifiedManifest.inventoryManifest.appliedPromos.filter(
    (promo) =>
      promo.status === "likely_applicable" ||
      promo.status === "possibly_applicable_needs_review"
  );
  const promotionBriefs =
    unifiedManifest.inventoryManifest.promotionBriefs ?? [];

  if (applicablePromos.length > 0 && promotionBriefs.length === 0) {
    throw new Error(
      "Applicable promotion ids are attached, but their promotion records could not be loaded. Refresh promotion intelligence before writing ad copy."
    );
  }

  const prompt = buildPrompt(unifiedManifest, variantCount);
  const startedAt = Date.now();
  const result = await structuredObjectFn({
    model: COPYWRITER_MODEL,
    schema: adCopySchema,
    system: SYSTEM_PROMPT,
    prompt,
    timeoutMs: COPYWRITER_TIMEOUT_MS,
  });
  const latencyMs = Date.now() - startedAt;

  const trace: DealAiGenerationTrace = {
    model: result.modelId,
    promptSent: `SYSTEM:\n${SYSTEM_PROMPT}\n\nPROMPT:\n${prompt}`,
    rawResponse: JSON.stringify(result.object, null, 2),
    latencyMs,
    generatedAtIso,
  };

  // Promo ids the copywriter may reference: those in the unified manifest + "none".
  const allowedPromoIds = new Set([
    "none",
    ...promotionBriefs.map((promo) => promo.promoRecordId),
  ]);
  const rejectedPromoIds: string[] = [];

  const variants: DealAdVariant[] = result.object.variants.map((v) => {
    let promoApplied = v.promoApplied;
    if (!allowedPromoIds.has(promoApplied)) {
      rejectedPromoIds.push(promoApplied);
      promoApplied = "none";
    }
    return {
      promoApplied,
      variantLabel: v.variantLabel,
      headline: v.headline,
      bodyCopy: v.bodyCopy,
      pricingDisclaimers: v.pricingDisclaimers,
      callToAction: v.callToAction,
      adPlatformTargetingHooks: v.adPlatformTargetingHooks,
      voiceWarnings: validateAdCopyVoice(v),
    };
  });

  const primaryPromoApplied = allowedPromoIds.has(result.object.primaryPromoApplied)
    ? result.object.primaryPromoApplied
    : variants[0]?.promoApplied ?? "none";

  if (
    promotionBriefs.length > 0 &&
    (primaryPromoApplied === "none" || variants[0]?.promoApplied === "none")
  ) {
    throw new Error(
      "The copywriter omitted the attached promotion from the primary ad variant. No ad copy was saved."
    );
  }

  const falseNoPromoPhrases = [
    "no promotion",
    "no promotional",
    "no onboard credit",
    "no special offer",
    "no special promotion",
  ];
  if (
    promotionBriefs.length > 0 &&
    variants.some((variant) => {
      const publicCopy = `${variant.bodyCopy} ${variant.pricingDisclaimers}`.toLowerCase();
      return falseNoPromoPhrases.some((phrase) => publicCopy.includes(phrase));
    })
  ) {
    throw new Error(
      "The copywriter contradicted the attached promotion by claiming no offer applies. No ad copy was saved."
    );
  }

  const adCopy: DealAdCopy = {
    id: buildDealAdCopyId(resolveManifestDealId(unifiedManifest), result.object.campaignName),
    generatedAtIso,
    generator: "gpt",
    sourceUnifiedManifestId: unifiedManifest.id,
    campaignName: result.object.campaignName,
    targetAudienceTag: result.object.targetAudienceTag,
    primaryPromoApplied,
    variants,
    aiTrace: trace,
  };

  return { adCopy, rejectedPromoIds };
}
