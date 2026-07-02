/**
 * Shared helpers for the Deal campaign stages.
 *
 * The stage GENERATORS themselves are AI-backed and live in `ai-generators.ts`
 * (AI-FIRST mandate — see TO_FIX.md). This module holds only the deterministic,
 * non-reasoning helpers that AI generation reuses:
 *
 *   - CampaignStageInputs        — the shared input shape for every stage
 *   - QUALIFIER_SUFFIX           — the standard live-pricing/eligibility qualifier
 *   - ANALYST_VOICE_FORBIDDEN    — phrases that must not appear in customer copy
 *   - PROMO_RISK_TERMS           — risky promotional phrasing to flag
 *   - buildOfferLines            — public-safe, qualified offer lines from promo records
 *   - detectRedFlags             — scans copy for risky promotional language
 *   - unique / compact / factsDestination — small shared utilities
 *
 * detectRedFlags is still run on AI-generated copy before approval: model output
 * is not trusted blindly. Promo claims arrive from CB Agent Tools and may contain
 * unqualified guarantee language even when the surrounding copy is AI-written.
 */

import type { DealCopyOfferLine } from "./campaign-types";
import type { DealCampaignStrategy } from "./campaign-types";
import type { CuratedDealCruiseFacts } from "./curated-deal-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import type {
  DealAngleResearch,
  DealTargetingDemographic,
} from "./research-types";

export function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

export function compact<T>(values: Array<T | undefined | null | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

export const QUALIFIER_SUFFIX =
  "Confirm live pricing, availability, and eligibility through the booking portal.";

/** Analyst/operator-voice phrases that must never reach customer-facing copy. */
export const ANALYST_VOICE_FORBIDDEN = [
  "target audience",
  "demographic",
  "segment",
  "positioning statement",
  "value proposition",
  "conversion",
  "funnel",
  "persona",
  "we recommend",
  "our analysis",
  "competitor blind spot",
];

/** Risky promotional phrasing to flag in any public-facing copy. */
export const PROMO_RISK_TERMS = [
  "guaranteed",
  "lowest price",
  "free cruise",
  "always",
  "no restrictions",
  "best price ever",
];

/** A human destination label from cruise facts (facts carry ports, not a destination field). */
export function factsDestination(facts: CuratedDealCruiseFacts): string {
  return facts.portsOfCall[0] ?? facts.itineraryName;
}

/**
 * The shared input shape for every campaign stage generator.
 */
export interface CampaignStageInputs {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  /** Operator-selected campaign hook/voice, persisted on the Deal record. */
  campaignStrategy?: DealCampaignStrategy;
  angleResearch?: DealAngleResearch;
  targetingDemographic?: DealTargetingDemographic;
  /** Promo records whose extracted claims feed offer copy and proof points. */
  promoRecords?: CbPromoIntelligenceRecord[];
  generatedAtIso?: string;
}

/**
 * Build public-safe, qualified offer lines from promo records. Only allowed and
 * needs-qualifier claims are used; agent-only notes are returned separately.
 * Reused by AI copy generation to assemble the offer-line list deterministically
 * from vetted promo claims rather than asking the model to invent offers.
 */
export function buildOfferLines(input: {
  promoRecords?: CbPromoIntelligenceRecord[];
}): {
  offerLines: DealCopyOfferLine[];
  agentOnlyNotes: string[];
} {
  const offerLines: DealCopyOfferLine[] = [];
  const agentOnlyNotes: string[] = [];

  for (const promo of input.promoRecords ?? []) {
    const use = promo.marketingUse;
    for (const claim of use.publicClaimsAllowed) {
      offerLines.push({
        text: claim,
        promoRecordId: promo.id,
        needsQualifier: false,
      });
    }
    for (const claim of use.publicClaimsNeedsQualifier) {
      offerLines.push({
        text: `${claim} ${QUALIFIER_SUFFIX}`.trim(),
        promoRecordId: promo.id,
        needsQualifier: true,
      });
    }
    for (const note of use.agentOnlyNotes) {
      agentOnlyNotes.push(`[${promo.vendor}] ${note}`);
    }
  }

  if (offerLines.length === 0) {
    offerLines.push({
      text: `Ask our agent about current savings and onboard perks for this sailing. ${QUALIFIER_SUFFIX}`,
      needsQualifier: true,
    });
  }

  return { offerLines, agentOnlyNotes: unique(agentOnlyNotes) };
}

/**
 * Scan copy strings for risky promotional language. These are real ongoing content
 * risks because promo text arrives from CB Agent Tools and may contain unqualified
 * guarantee language. Run on AI copy output before approval — AI text is not trusted
 * blindly.
 */
export function detectRedFlags(values: string[]): string[] {
  const flags: string[] = [];
  for (const value of values) {
    const lower = value.toLowerCase();
    for (const term of PROMO_RISK_TERMS) {
      if (lower.includes(term)) {
        flags.push(
          `"${value.slice(0, 80)}" uses risky promotional phrasing ("${term}") — qualify or remove.`
        );
      }
    }
  }
  return unique(flags);
}
