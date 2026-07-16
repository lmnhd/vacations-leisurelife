/**
 * Curated Deal assembly (Phase 9 / Phase 9A).
 *
 * Merges package facts, the Link Broker booking URL + health, promo
 * applicability, trip research, the Targeting-Demographic resource, visitor-safe
 * copy, ad structure, and the media plan into one CuratedOdysseusDeal — built in
 * independent, rerunnable stages so the operator can inspect and regenerate one
 * layer at a time inside `/tests/deals-system`.
 *
 * Hard rule: assembly NEVER produces a publishable Deal on its own. A new Deal is
 * always `needs_review` with `operatorApproval.status` "needs_review". Only an
 * explicit operator approval (`approveCuratedDeal`) can promote it to `bookable`,
 * and only when every blocking gate passes (valid link health, public copy clean,
 * targeting present, media ready or text-only waived).
 *
 * This module is dependency-light: link construction is injected so the module
 * stays free of any Playwright/Odysseus import and runs in scripts, the Next
 * runtime, and tests alike.
 */

import type { CampaignStageInputs } from "./campaign-generators";
import {
  generateDealAdStructureAi,
  generateDealAngleResearchAi,
  generateDealCopyPackageAi,
  generateDealMediaPlanAi,
  generateDealPitchBriefAi,
  generateDealTargetingDemographicAi,
} from "./ai-generators";
import type {
  DealApprovalGate,
  DealApprovalState,
  DealCampaignStrategy,
} from "./campaign-types";
import type {
  CuratedDealCruiseFacts,
  CuratedDealPackaging,
  CuratedDealScoring,
  CuratedOdysseusDeal,
} from "./curated-deal-types";
import type { LinkBrokerHealth } from "./link-broker-types";
import type {
  CbPromoIntelligenceRecord,
  PromoApplicabilityResult,
} from "./promo-intelligence-types";
import type {
  DealAngleResearch,
  DealResearchCruiseCandidate,
  DealTargetingDemographic,
  RetailDiscoveryBrief,
} from "./research-types";

/**
 * Minimum Step 2 package-lookup confidence to clear the "match_confidence"
 * approval gate. Mirrors DEFAULT_CONFIDENCE_THRESHOLD in package-lookup.ts —
 * a resolvedPackage below this was a best-effort/low-confidence pick and may
 * be the wrong cruise (wrong ship/line/date/nights for the booking link).
 */
export const MATCH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Stages an operator can run independently from the workbench.
 * Order matters: research → targeting → pitch → copy → ad_structure → media → approval.
 * "pitch" is the Phase 9B boundary stage — must run before "copy".
 */
export type DealCampaignStage =
  | "research"
  | "targeting"
  | "pitch"
  | "copy"
  | "ad_structure"
  | "media"
  | "approval";

export interface AssembleCuratedDealInput {
  dealId: string;
  briefId: string;
  packageId: string;
  siid: string;
  cruiseFacts: CuratedDealCruiseFacts;
  /**
   * Booking URL. Pass a captured Share link to set `bookingUrlSource` to
   * "share_button"; otherwise the assembler constructs a package entry URL via
   * the injected link builder.
   */
  bookingUrl?: string;
  bookingUrlSource?: CuratedOdysseusDeal["bookingUrlSource"];
  linkHealth?: LinkBrokerHealth;
  retailBrief?: RetailDiscoveryBrief;
  campaignStrategy?: DealCampaignStrategy;
  angleResearch?: DealAngleResearch;
  targetingDemographic?: DealTargetingDemographic;
  promoRecords?: CbPromoIntelligenceRecord[];
  promoApplicability?: PromoApplicabilityResult[];
  agentOnlyNotes?: string[];
  generatedAtIso?: string;
  expiresOnIso?: string;
}

export interface AssembleCuratedDealOptions {
  /**
   * Constructs a package entry booking URL from packageId + siid. Injected so
   * this module never imports the Link Broker's Playwright/Odysseus surface.
   * When omitted and no bookingUrl is supplied, a deterministic fallback URL is
   * used and link health is forced to "unknown".
   */
  buildPackageUrl?: (packageId: string, siid: string) => string;
}

function fallbackPackageUrl(packageId: string, siid: string): string {
  return `https://bookings.cbagenttools.com/swift/cruise/package/${packageId}?siid=${siid}&lang=1`;
}

function toResearchCandidate(
  input: AssembleCuratedDealInput
): DealResearchCruiseCandidate {
  const facts = input.cruiseFacts;
  return {
    id: input.dealId,
    cruiseLine: facts.cruiseLine,
    shipName: facts.shipName,
    itineraryName: facts.itineraryName,
    destination: facts.portsOfCall[0] ?? facts.itineraryName,
    nights: facts.nights,
    sailDateIso: facts.sailDateIso,
    departurePort: facts.departurePort,
    portsOfCall: facts.portsOfCall,
  };
}

function stageInputs(
  input: AssembleCuratedDealInput,
  angleResearch: DealAngleResearch | undefined,
  targetingDemographic: DealTargetingDemographic | undefined
): CampaignStageInputs {
  return {
    dealId: input.dealId,
    packageId: input.packageId,
    cruiseFacts: input.cruiseFacts,
    campaignStrategy: input.campaignStrategy,
    angleResearch,
    targetingDemographic,
    promoRecords: input.promoRecords,
    generatedAtIso: input.generatedAtIso,
  };
}

function buildScoring(deal: Partial<CuratedOdysseusDeal>): CuratedDealScoring {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (deal.angleResearch) {
    score += 20;
    reasons.push("Has trip angle research.");
  } else {
    warnings.push("No angle research attached.");
  }
  if (deal.campaignStrategy?.campaignAngle) {
    score += 5;
    reasons.push("Has locked campaign hook.");
  } else {
    warnings.push("No campaign hook saved from the workbench.");
  }
  if (deal.targetingDemographic) {
    score += 20;
    reasons.push("Has Targeting-Demographic resource.");
  } else {
    warnings.push("No Targeting-Demographic attached.");
  }
  if (deal.pitchBrief) {
    score += 10;
    reasons.push("Has pitch brief (research-to-copy boundary).");
  } else {
    warnings.push("No pitch brief — copy sourced without Phase 9B step.");
  }
  if (deal.copyPackage) {
    score += 20;
    reasons.push("Has visitor-safe copy package.");
    if (deal.copyPackage.publicCopyRedFlags.length > 0) {
      warnings.push(
        `Copy has ${deal.copyPackage.publicCopyRedFlags.length} public-copy red flag(s).`
      );
    }
  }
  if (deal.adStructure) {
    score += 10;
    reasons.push("Has ad/campaign structure.");
  }
  if (deal.mediaPlan) {
    score += 10;
    reasons.push("Has media plan.");
  }
  if (deal.linkHealth?.status === "valid") {
    score += 10;
    reasons.push("Booking link health is valid.");
  } else {
    warnings.push(`Link health is "${deal.linkHealth?.status ?? "unknown"}".`);
  }

  return { score, reasons, warnings };
}

function buildPackaging(
  facts: CuratedDealCruiseFacts,
  deal: Partial<CuratedOdysseusDeal>
): CuratedDealPackaging {
  const copy = deal.copyPackage;
  return {
    headline: copy?.headlineOptions[0] ?? facts.title,
    shortSummary: copy?.shortTileCopy ?? `${facts.nights}-night ${facts.itineraryName}`,
    highlights: copy?.whyThisTrip ?? [],
    destinationNotes: deal.angleResearch?.destinationHooks.slice(0, 4) ?? [],
    bestFor: deal.targetingDemographic
      ? [
          deal.targetingDemographic.primaryAudience.label,
          ...deal.targetingDemographic.secondaryAudiences.map((a) => a.label),
        ]
      : facts.promoSignals,
  };
}

/**
 * Evaluate the approval gates for a Deal. Blocking gates must all pass before the
 * operator can approve. This is the single source of truth for "can this publish".
 */
export function evaluateApprovalGates(
  deal: Partial<CuratedOdysseusDeal>,
  options: { textOnlyLaunchWaived?: boolean } = {}
): DealApprovalGate[] {
  const textOnly = options.textOnlyLaunchWaived ?? false;
  const copy = deal.copyPackage;
  const media = deal.mediaPlan;
  const mediaReady =
    textOnly ||
    media?.readiness === "ready" ||
    media?.readiness === "waived_text_only";
  const cabinPricingReady = [
    deal.cruiseFacts?.cabinPrices.inside,
    deal.cruiseFacts?.cabinPrices.outside,
    deal.cruiseFacts?.cabinPrices.balcony,
    deal.cruiseFacts?.cabinPrices.suite,
  ].some((value) => typeof value === "number" && value > 0);

  return [
    {
      id: "real_package",
      label: "Real Odysseus/CB package",
      passed: Boolean(deal.packageId && deal.packageId !== "0000000"),
      detail: deal.packageId
        ? `Package ${deal.packageId}.`
        : "No package ID set.",
      blocking: true,
    },
    {
      id: "link_valid",
      label: "Link health is valid",
      passed: deal.linkHealth?.status === "valid",
      detail: `Link health is "${deal.linkHealth?.status ?? "unknown"}". Run operator browser validation to reach "valid".`,
      blocking: true,
    },
    {
      id: "cabin_pricing",
      label: "Cabin pricing resolved",
      passed: cabinPricingReady,
      detail: cabinPricingReady
        ? "At least one numeric cabin-tier fare is available."
        : "No cabin-tier fares are available. Re-read the acquired booking URL before approval.",
      blocking: true,
    },
    {
      id: "match_confidence",
      label: "Package match confidence",
      passed:
        deal.packageMatch === undefined ||
        deal.packageMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD,
      detail:
        deal.packageMatch === undefined
          ? "No package-match confidence recorded — re-run Step 2 · Trip Manifestation."
          : deal.packageMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD
            ? `Match confidence ${deal.packageMatch.confidence.toFixed(2)} clears the ${MATCH_CONFIDENCE_THRESHOLD} threshold.`
            : `Match confidence ${deal.packageMatch.confidence.toFixed(2)} is below ${MATCH_CONFIDENCE_THRESHOLD} — this packageId may be the wrong cruise. Reasons: ${deal.packageMatch.reasons.join("; ")}. Re-run Step 2 · Trip Manifestation and verify the booking link's actual ship before approving.`,
      blocking: true,
    },
    {
      id: "pitch_brief_present",
      label: "Pitch brief generated (Phase 9B)",
      passed: Boolean(deal.pitchBrief),
      detail: deal.pitchBrief
        ? `Pitch brief present (${deal.pitchBrief.generator}).`
        : "No pitch brief — run the pitch stage before generating copy.",
      blocking: true,
    },
    {
      id: "public_copy_clean",
      label: "Public copy passed guardrails",
      passed: Boolean(copy) && (copy?.publicCopyRedFlags.length ?? 1) === 0,
      detail: !copy
        ? "No copy package generated yet."
        : copy.publicCopyRedFlags.length === 0
          ? "No public-copy red flags."
          : `${copy.publicCopyRedFlags.length} red flag(s) to resolve: ${copy.publicCopyRedFlags[0]}`,
      blocking: true,
    },
    {
      id: "targeting_present",
      label: "Targeting-Demographic exists",
      passed: Boolean(deal.targetingDemographic),
      detail: deal.targetingDemographic
        ? "Targeting resource attached."
        : "No Targeting-Demographic attached.",
      blocking: true,
    },
    {
      id: "media_ready",
      label: "Media/creative ready or text-only waived",
      passed: mediaReady,
      detail: textOnly
        ? "Operator waived media for a text-only launch."
        : `Media readiness is "${media?.readiness ?? "not_started"}".`,
      blocking: true,
    },
  ];
}

function initialApprovalState(
  dealId: string,
  gates: DealApprovalGate[],
  generatedAtIso: string
): DealApprovalState {
  return {
    dealId,
    status: "needs_review",
    updatedAtIso: generatedAtIso,
    decidedBy: "system",
    textOnlyLaunchWaived: false,
    gates,
  };
}

/**
 * Assemble a full Curated Deal in `needs_review`. Runs every stage generator that
 * was not supplied as input. The result is NEVER publishable: status is
 * `needs_review` and operatorApproval is `needs_review` until an operator runs
 * `approveCuratedDeal`.
 */
export async function assembleCuratedDeal(
  input: AssembleCuratedDealInput,
  options: AssembleCuratedDealOptions = {}
): Promise<CuratedOdysseusDeal> {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const buildUrl = options.buildPackageUrl ?? fallbackPackageUrl;

  const candidate = toResearchCandidate(input);
  const angleResearch =
    input.angleResearch ??
    (await generateDealAngleResearchAi({
      candidate,
      retailBrief: input.retailBrief,
      generatedAtIso,
    }));
  const targetingDemographic =
    input.targetingDemographic ??
    (await generateDealTargetingDemographicAi({
      dealId: input.dealId,
      packageId: input.packageId,
      candidate,
      angleResearch,
      retailBrief: input.retailBrief,
      generatedAtIso,
    }));

  // Phase 9B: pitch brief sits between research/targeting and copy
  const pitchBrief = await generateDealPitchBriefAi({
    dealId: input.dealId,
    packageId: input.packageId,
    cruiseFacts: input.cruiseFacts,
    campaignStrategy: input.campaignStrategy,
    angleResearch,
    targetingDemographic,
    promoRecords: input.promoRecords,
    generatedAtIso,
  });

  const stage = stageInputs(input, angleResearch, targetingDemographic);
  const copyPackage = await generateDealCopyPackageAi(stage, pitchBrief);
  const adStructure = await generateDealAdStructureAi(stage);
  const mediaPlan = await generateDealMediaPlanAi(stage);

  const bookingUrl =
    input.bookingUrl ?? buildUrl(input.packageId, input.siid);
  const bookingUrlSource =
    input.bookingUrlSource ??
    (input.bookingUrl ? "share_button" : "constructed_package_url");
  const linkHealth: LinkBrokerHealth = input.linkHealth ?? {
    status: "unknown",
    failureReason:
      "Constructed link not yet browser-validated. Run operator link validation before approval.",
  };

  const partial: Partial<CuratedOdysseusDeal> = {
    packageId: input.packageId,
    linkHealth,
    angleResearch,
    campaignStrategy: input.campaignStrategy,
    targetingDemographic,
    pitchBrief,
    copyPackage,
    adStructure,
    mediaPlan,
  };

  const gates = evaluateApprovalGates(partial, { textOnlyLaunchWaived: false });
  const agentOnlyNotes = Array.from(
    new Set([...(input.agentOnlyNotes ?? []), ...copyPackage.agentOnlyNotes])
  );

  return {
    id: input.dealId,
    status: "needs_review",
    source: "odysseus_curated_retail",
    briefId: input.briefId,
    capturedAtIso: generatedAtIso,
    // Expiration is non-optional: default to exactly DEFAULT_DEAL_EXPIRY_DAYS (90)
    // days from assembly when the operator does not supply one — capped at the
    // sail date, since a deal can never be sold after its own departure.
    expiresOnIso: capExpiryAtSailDate(
      input.expiresOnIso?.trim() || defaultDealExpiresOnIso(generatedAtIso),
      input.cruiseFacts.sailDateIso
    ),
    packageId: input.packageId,
    siid: input.siid,
    bookingUrl,
    bookingUrlSource,
    linkHealth,
    cruiseFacts: input.cruiseFacts,
    scoring: buildScoring(partial),
    packaging: buildPackaging(input.cruiseFacts, partial),
    campaignStrategy: input.campaignStrategy,
    promoApplicability: input.promoApplicability,
    angleResearch,
    targetingDemographic,
    pitchBrief,
    copyPackage,
    adStructure,
    mediaPlan,
    operatorApproval: initialApprovalState(input.dealId, gates, generatedAtIso),
    agentOnlyNotes: agentOnlyNotes.length > 0 ? agentOnlyNotes : undefined,
  };
}

/**
 * Regenerate a single campaign stage on an existing Deal without disturbing the
 * other layers. Rebuilds scoring/packaging and re-evaluates gates, but does NOT
 * change approval status — regenerating a layer always returns the Deal to a
 * non-approved state so a stale approval can never ride along.
 */
export async function runDealCampaignStage(
  deal: CuratedOdysseusDeal,
  stageName: Exclude<DealCampaignStage, "approval">,
  input: { promoRecords?: CbPromoIntelligenceRecord[]; retailBrief?: RetailDiscoveryBrief; generatedAtIso?: string } = {}
): Promise<CuratedOdysseusDeal> {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const candidate: DealResearchCruiseCandidate = {
    id: deal.id,
    cruiseLine: deal.cruiseFacts.cruiseLine,
    shipName: deal.cruiseFacts.shipName,
    itineraryName: deal.cruiseFacts.itineraryName,
    destination: deal.cruiseFacts.portsOfCall[0] ?? deal.cruiseFacts.itineraryName,
    nights: deal.cruiseFacts.nights,
    sailDateIso: deal.cruiseFacts.sailDateIso,
    departurePort: deal.cruiseFacts.departurePort,
    portsOfCall: deal.cruiseFacts.portsOfCall,
  };

  const next: CuratedOdysseusDeal = { ...deal };

  if (stageName === "research") {
    next.angleResearch = await generateDealAngleResearchAi({
      candidate,
      retailBrief: input.retailBrief,
      generatedAtIso,
    });
  } else if (stageName === "targeting") {
    const research =
      next.angleResearch ??
      (await generateDealAngleResearchAi({ candidate, retailBrief: input.retailBrief, generatedAtIso }));
    next.angleResearch = research;
    next.targetingDemographic = await generateDealTargetingDemographicAi({
      dealId: deal.id,
      packageId: deal.packageId,
      candidate,
      angleResearch: research,
      retailBrief: input.retailBrief,
      generatedAtIso,
    });
  } else if (stageName === "pitch") {
    // Phase 9B: regenerating pitch always uses current research + targeting
    next.pitchBrief = await generateDealPitchBriefAi({
      dealId: deal.id,
      packageId: deal.packageId,
      cruiseFacts: deal.cruiseFacts,
      campaignStrategy: deal.campaignStrategy,
      angleResearch: next.angleResearch,
      targetingDemographic: next.targetingDemographic,
      promoRecords: input.promoRecords,
      generatedAtIso,
    });
  } else {
    const activePitchBrief =
      next.pitchBrief ??
      (await generateDealPitchBriefAi({
        dealId: deal.id,
        packageId: deal.packageId,
        cruiseFacts: deal.cruiseFacts,
        campaignStrategy: deal.campaignStrategy,
        angleResearch: next.angleResearch,
        targetingDemographic: next.targetingDemographic,
        promoRecords: input.promoRecords,
        generatedAtIso,
      }));
    next.pitchBrief = activePitchBrief;

    const stage: CampaignStageInputs = {
      dealId: deal.id,
      packageId: deal.packageId,
      cruiseFacts: deal.cruiseFacts,
      campaignStrategy: deal.campaignStrategy,
      angleResearch: next.angleResearch,
      targetingDemographic: next.targetingDemographic,
      promoRecords: input.promoRecords,
      generatedAtIso,
    };
    if (stageName === "copy") next.copyPackage = await generateDealCopyPackageAi(stage, activePitchBrief);
    if (stageName === "ad_structure") next.adStructure = await generateDealAdStructureAi(stage);
    if (stageName === "media") next.mediaPlan = await generateDealMediaPlanAi(stage);
  }

  next.scoring = buildScoring(next);
  next.packaging = buildPackaging(deal.cruiseFacts, next);

  // Regenerating any layer invalidates a prior approval and keeps the Deal hidden.
  const gates = evaluateApprovalGates(next, {
    textOnlyLaunchWaived: next.operatorApproval?.textOnlyLaunchWaived,
  });
  next.status = "needs_review";
  next.operatorApproval = {
    dealId: deal.id,
    status: "needs_review",
    updatedAtIso: generatedAtIso,
    decidedBy: "system",
    textOnlyLaunchWaived: next.operatorApproval?.textOnlyLaunchWaived ?? false,
    gates,
  };
  return next;
}

export interface ApproveDealResult {
  deal: CuratedOdysseusDeal;
  approved: boolean;
  blockingFailures: DealApprovalGate[];
}

/**
 * Operator approval. Approves and promotes to `bookable` ONLY when every blocking
 * gate passes. Otherwise the Deal stays `needs_review` and the failing gates are
 * returned so the operator knows what to fix. This is the only path to a
 * publishable Deal.
 */
export function approveCuratedDeal(
  deal: CuratedOdysseusDeal,
  options: {
    decisionNote?: string;
    textOnlyLaunchWaived?: boolean;
    decidedAtIso?: string;
  } = {}
): ApproveDealResult {
  const decidedAtIso = options.decidedAtIso ?? new Date().toISOString();
  const textOnlyLaunchWaived =
    options.textOnlyLaunchWaived ?? deal.operatorApproval?.textOnlyLaunchWaived ?? false;
  const gates = evaluateApprovalGates(deal, { textOnlyLaunchWaived });
  const blockingFailures = gates.filter((gate) => gate.blocking && !gate.passed);
  const approved = blockingFailures.length === 0;

  const operatorApproval: DealApprovalState = {
    dealId: deal.id,
    status: approved ? "approved" : "needs_review",
    updatedAtIso: decidedAtIso,
    decidedBy: "operator",
    decisionNote: options.decisionNote,
    textOnlyLaunchWaived,
    gates,
  };

  return {
    deal: {
      ...deal,
      status: approved ? "bookable" : "needs_review",
      operatorApproval,
    },
    approved,
    blockingFailures,
  };
}

/** Operator rejection. Returns the Deal to `needs_review` and records the note. */
export function rejectCuratedDeal(
  deal: CuratedOdysseusDeal,
  options: { decisionNote?: string; decidedAtIso?: string } = {}
): CuratedOdysseusDeal {
  const decidedAtIso = options.decidedAtIso ?? new Date().toISOString();
  return {
    ...deal,
    status: "needs_review",
    operatorApproval: {
      dealId: deal.id,
      status: "rejected",
      updatedAtIso: decidedAtIso,
      decidedBy: "operator",
      decisionNote: options.decisionNote,
      textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived ?? false,
      gates: evaluateApprovalGates(deal, {
        textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived,
      }),
    },
  };
}

/** Default public-visibility window: a deal expires 90 days after it is assembled. */
export const DEFAULT_DEAL_EXPIRY_DAYS = 90;

/**
 * The expiration a deal gets when the operator does not supply one: exactly
 * `DEFAULT_DEAL_EXPIRY_DAYS` days from `fromIso`, as a `YYYY-MM-DD` date (end-of-day
 * UTC per `dealExpiryDate`).
 */
export function defaultDealExpiresOnIso(fromIso: string = new Date().toISOString()): string {
  const base = new Date(fromIso);
  const from = Number.isNaN(base.getTime()) ? new Date() : base;
  const expires = new Date(from.getTime());
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_DEAL_EXPIRY_DAYS);
  return expires.toISOString().slice(0, 10);
}

/**
 * A deal can never be sold after its own departure: when the sail date is known
 * and earlier than the proposed expiry, the sail date wins. Dates compare as
 * plain YYYY-MM-DD strings (both sides are date-only), and an absent/unparseable
 * sail date leaves the expiry untouched.
 */
export function capExpiryAtSailDate(
  expiresOnIso: string,
  sailDateIso: string | undefined
): string {
  const sail = sailDateIso?.trim();
  if (!sail || !/^\d{4}-\d{2}-\d{2}$/.test(sail)) return expiresOnIso;
  const expiry = expiresOnIso.slice(0, 10);
  return sail < expiry ? sail : expiresOnIso;
}

function dealExpiryDate(expiresOnIso: string | undefined): Date | undefined {
  const trimmed = expiresOnIso?.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes("T")) {
    const exactDate = new Date(trimmed);
    return Number.isNaN(exactDate.getTime()) ? undefined : exactDate;
  }

  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function isDealExpired(
  deal: Pick<CuratedOdysseusDeal, "expiresOnIso">,
  now = new Date()
): boolean {
  const expiresAt = dealExpiryDate(deal.expiresOnIso);
  return expiresAt ? now.getTime() > expiresAt.getTime() : false;
}

/**
 * True once the deal's sailing has departed (sail date passed, end-of-day UTC).
 * Guards independently of `expiresOnIso`: the stored expiry defaults to 90 days
 * from assembly and (before 2026-07) was never capped at the sail date, so a
 * deal could outlive its own departure by weeks. A missing/unparseable sail
 * date returns false — never hide a deal on absent data.
 */
export function hasDealSailed(
  deal: Pick<CuratedOdysseusDeal, "cruiseFacts">,
  now = new Date()
): boolean {
  const sailedAt = dealExpiryDate(deal.cruiseFacts.sailDateIso);
  return sailedAt ? now.getTime() > sailedAt.getTime() : false;
}

/**
 * Single source of truth for homepage eligibility. The homepage filter must use
 * this; never re-derive the rule inline.
 */
export function isDealHomepageEligible(deal: CuratedOdysseusDeal): boolean {
  return (
    deal.status === "bookable" &&
    deal.operatorApproval?.status === "approved" &&
    deal.linkHealth.status === "valid" &&
    !isDealExpired(deal) &&
    !hasDealSailed(deal) &&
    !deal.operatorVisibility?.hidden
  );
}
