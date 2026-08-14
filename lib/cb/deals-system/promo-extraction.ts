/**
 * Phase 5 - Structured Promo Extraction.
 *
 * Turns the raw promo sections captured in Phase 4 into structured promotion
 * rules + marketing-use guidance via GPT-5.4 through the LLM gateway.
 *
 * Hard rule (CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN, Step 3): the model must not
 * invent perk values, dates, applicability, or exclusions. Every extracted claim
 * must trace back to the source section text. The system prompt enforces this and
 * the result is re-validated with Zod by the gateway.
 *
 * Public-copy discipline: visitor-safe claims are separated from
 * needs-qualifier claims and agent-only notes, and the visitor summary must use
 * "may qualify"-style language — never a guaranteed perk.
 */

import { z } from "zod/v3";

import {
  ModelName,
  generateStructuredObject,
} from "@/lib/ai/llm-gateway";
import type {
  CbPromoExtractedTerms,
  CbPromoIntelligenceRecord,
  CbPromoMarketingUse,
} from "./promo-intelligence-types";

// ─── Zod schema (mirrors CbPromoExtractedTerms + CbPromoMarketingUse) ───────────

const OFFER_TYPES = [
  "second_guest_discount",
  "dollars_off",
  "onboard_credit",
  "free_extra_guests",
  "instant_savings",
  "all_included",
  "agency_special",
  "suite_perk",
  "other",
] as const;

// Tolerate an out-of-vocabulary offer type by mapping it to "other" rather than
// failing the whole record. Keeps a near-miss extraction usable.
const offerTypeEnum = z
  .enum(OFFER_TYPES)
  .catch("other");

/** A number that also accepts "$700", "75%", or "" from the model. */
const looseNumber = z.preprocess((val) => {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number.parseFloat(val.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}, z.number());

const extractedTermsSchema = z.object({
  offerTypes: z.array(offerTypeEnum).default([]),
  percentDiscounts: z
    .array(
      z.object({
        appliesTo: z.string(),
        percentOff: looseNumber,
        depositType: z.enum(["refundable", "non_refundable"]).optional(),
        rawText: z.string(),
      })
    )
    .default([]),
  dollarSavings: z
    .array(
      z.object({
        amountUsd: looseNumber,
        appliesTo: z.string(),
        voyageLength: z.string().optional(),
        cabinCategory: z.string().optional(),
        bookingDayWindow: z.string().optional(),
        rawText: z.string(),
      })
    )
    .default([]),
  onboardCredits: z
    .array(
      z.object({
        amountUsd: looseNumber,
        appliesTo: z.string(),
        voyageLength: z.string().optional(),
        cabinCategory: z.string().optional(),
        bookingDayWindow: z.string().optional(),
        rawText: z.string(),
      })
    )
    .default([]),
  freeGuestOffers: z
    .array(
      z.object({
        guestNumbers: z.string(),
        excludedCabins: z.array(z.string()).optional(),
        rawText: z.string(),
      })
    )
    .default([]),
  combinability: z
    .object({
      cruiseOnly: z.boolean().optional(),
      allIncluded: z.boolean().optional(),
      refundableDeposit: z.boolean().optional(),
      nonRefundableDeposit: z.boolean().optional(),
      groupRates: z.boolean().optional(),
      groupXRates: z.boolean().optional(),
      singleSupplements: z.boolean().optional(),
      riverCruises: z.boolean().optional(),
      cruiseTours: z.boolean().optional(),
      rawRules: z.array(z.string()).default([]),
    })
    .default({ rawRules: [] }),
  exclusions: z.array(z.string()).default([]),
  applicableProducts: z.array(z.string()).default([]),
  applicableMarkets: z.array(z.string()).default([]),
});

const marketingUseSchema = z.object({
  publicClaimsAllowed: z.array(z.string()).default([]),
  publicClaimsNeedsQualifier: z.array(z.string()).default([]),
  agentOnlyNotes: z.array(z.string()).default([]),
  suggestedAngles: z.array(z.string()).default([]),
  cautionFlags: z.array(z.string()).default([]),
  bestMatchedDealBriefs: z.array(z.string()).default([]),
  visitorFriendlySummary: z.string().default(""),
});

const promoExtractionSchema = z.object({
  extracted: extractedTermsSchema,
  marketingUse: marketingUseSchema,
});

export type PromoExtractionResult = z.infer<typeof promoExtractionSchema>;

// ─── Prompt ─────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract structured cruise-promotion intelligence for a travel agency.

You are given the RAW text sections of one Cruise Brothers Agent Tools promotion.
Convert them into the requested JSON structure.

HARD RULES — do not break these:
- Do NOT invent perk values, dollar amounts, percentages, dates, applicability,
  products, markets, or exclusions. Every value must come from the supplied text.
- For each percentDiscount, dollarSaving, onboardCredit, and freeGuestOffer,
  copy the exact supporting phrase into "rawText". If you cannot find supporting
  text, do not emit the item.
- combinability.rawRules must quote the agent-instruction lines you based the
  booleans on. Only set a boolean when the text clearly states it; otherwise omit it.
- exclusions must be grounded in the text (e.g. an explicit "except ..." clause).

MARKETING USE — separate claims by safety:
- publicClaimsAllowed: claims safe to advertise to consumers AS QUALIFIED offers
  (e.g. "select sailings may qualify for ..."). Never state a guaranteed perk.
- publicClaimsNeedsQualifier: claims that are true but require careful wording
  (deposit type, cabin class, booking-day, voyage-length, or sailing-date limits).
- agentOnlyNotes: operational/combinability notes that must stay internal.
- cautionFlags: things that would make a claim misleading if advertised broadly.
- visitorFriendlySummary: 1-2 sentences, consumer-safe. Must use "may qualify"
  style language and must NOT promise a specific perk amount as guaranteed. It
  should also note that final pricing/perks are confirmed in the booking portal.
- suggestedAngles: short marketing angle ideas grounded in the offer.
- bestMatchedDealBriefs: leave [] unless the text clearly implies an audience.

If a section is empty, return empty arrays for the fields it would have populated.`;

function buildUserPrompt(record: CbPromoIntelligenceRecord): string {
  return `PROMOTION
Title: ${record.title}
Vendor: ${record.vendor}
Booking window: ${record.bookingWindow.rawText || "(none)"}
Sailing window: ${record.sailingWindow.rawText || "(none)"}

=== Promotion Details ===
${record.promotionDetailsRaw || "(empty)"}

=== Key Features ===
${record.keyFeaturesRaw || "(empty)"}

=== Agent Instructions ===
${record.agentInstructionsRaw || "(empty)"}

=== Applicable Sailings ===
${record.applicableSailingsRaw || "(empty)"}

=== Offer Applicable Products ===
${record.applicableProductsRaw || "(empty)"}

=== Applicable Markets ===
${record.applicableMarketsRaw || "(empty)"}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ExtractPromoOptions {
  /** Override the model. Defaults to GPT_5_HIGH (gpt-5.4) for extraction accuracy. */
  model?: ModelName;
  timeoutMs?: number;
}

export interface ExtractPromoOutcome {
  extracted: CbPromoExtractedTerms;
  marketingUse: CbPromoMarketingUse;
  modelId: string;
  warnings: string[];
}

/**
 * Extracts one promo record's structured terms + marketing use. Throws on model
 * or validation failure so the caller can mark the record as `failed`.
 */
export async function extractPromoIntelligence(
  record: CbPromoIntelligenceRecord,
  options: ExtractPromoOptions = {}
): Promise<ExtractPromoOutcome> {
  const model = options.model ?? ModelName.GPT_5_HIGH;
  const result = await generateStructuredObject({
    model,
    schema: promoExtractionSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(record),
    timeoutMs: options.timeoutMs ?? 90_000,
    // The schema uses optional inner fields (depositType, voyageLength, etc.).
    // OpenAI strict JSON-Schema mode demands every property be required, which
    // conflicts with optionals; disable strict mode so optionals are allowed.
    // The gateway still re-validates the result with Zod.
    strictJsonSchema: false,
  });

  return {
    extracted: result.object.extracted,
    marketingUse: result.object.marketingUse,
    modelId: result.modelId,
    warnings: result.warnings,
  };
}
