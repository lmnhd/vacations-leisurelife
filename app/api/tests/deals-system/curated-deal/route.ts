/**
 * Deals Campaign Workbench staged-action route (Phase 9A).
 *
 * Operates directly on the curated deals cache via the deals-system library so
 * the operator can run each stage independently from `/tests/deals-system`:
 *
 *   action "assemble"        -> build a needs_review Deal from cruise facts
 *   action "stage"           -> regenerate one stage (research/targeting/copy/ad/media)
 *   action "set_link_valid"  -> record operator-verified link health
 *   action "approve"         -> promote to bookable IF all blocking gates pass
 *   action "reject"          -> return to needs_review and record the note
 *   action "pin"             -> sort the Deal first on the homepage (Phase 14)
 *   action "unpin"           -> clear the pin
 *   action "hide"            -> hide an otherwise-eligible Deal from the homepage
 *   action "unhide"          -> clear the hide flag
 *   action "delete"          -> remove a duplicate/test Deal from the operator workbench
 *   action "send_to_pipeline" -> create a resolved trip manifest for the main pipeline
 *   action "refresh_link"    -> mark link health stale, pending operator re-verification
 *   action "request_capture" -> flag the Deal for an operator CBAT/Odysseus capture
 *
 * Safety: this never books, holds, or submits guest info. It never publishes a
 * Deal on its own - the assemble/stage actions always leave the Deal
 * needs_review, and approve only succeeds when every blocking gate passes.
 * refresh_link and request_capture only flag work for the operator; CBAT/Odysseus
 * browser operations remain operator-controlled.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  generateStructuredObject,
  modelForTask,
} from "@/lib/ai/llm-gateway";
import {
  approveCuratedDeal,
  deleteCuratedDealRecord,
  evaluateApprovalGates,
  getCuratedDeal,
  getDealBrief,
  getPromoRecordsByIds,
  loadDealDiscoveryIdeasCache,
  rejectCuratedDeal,
  saveDealDiscoveryIdeasCache,
  upsertDealDiscoveryIdea,
  upsertDealTripManifestRecord,
  upsertCuratedDealRecord,
  upsertDealBriefRecord,
  type AssembleCuratedDealInput,
  type CuratedDealCruiseFacts,
  type CuratedOdysseusDeal,
  type DealCampaignStrategy,
  type DealCampaignStage,
  type DealAdStructure,
  type DealAngleResearch,
  type DealCopyPackage,
  type DealMediaPlan,
  type DealPitchBrief,
  type DealTargetingDemographic,
  type DealDiscoveryIdea,
  type DealTripManifest,
  type PromoApplicabilityResult,
  buildOfferLines,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import { assessPromoHandoff } from "@/lib/cb/deals-system/promo-handoff-assessment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  action?: unknown;
  dealId?: unknown;
  briefId?: unknown;
  packageId?: unknown;
  siid?: unknown;
  cruiseFacts?: unknown;
  bookingUrl?: unknown;
  stage?: unknown;
  promoRecordIds?: unknown;
  decisionNote?: unknown;
  textOnlyLaunchWaived?: unknown;
  campaignAngle?: unknown;
  targetAudience?: unknown;
  visualAngle?: unknown;
  targetingKeywords?: unknown;
}

const angleOptionSchema = z.object({
  campaignAngle: z.string(),
  targetAudience: z.string(),
  visualAngle: z.string(),
  targetingKeywords: z.array(z.string()).min(4).max(10),
  rationale: z.string(),
});

const angleOptionsSchema = z.object({
  angles: z.array(angleOptionSchema).min(1).max(3),
});

const STAGE_NAMES: DealCampaignStage[] = [
  "research",
  "targeting",
  "pitch",
  "copy",
  "ad_structure",
  "media",
  "approval",
];

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseCruiseFacts(value: unknown): CuratedDealCruiseFacts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const rawCabinPrices =
    typeof v.cabinPrices === "object" && v.cabinPrices !== null
      ? (v.cabinPrices as Record<string, unknown>)
      : {};
  const cabinAmount = (key: string): number | undefined => {
    const amount = Number(rawCabinPrices[key]);
    return Number.isFinite(amount) && amount > 0 ? amount : undefined;
  };
  const facts: CuratedDealCruiseFacts = {
    title: str(v.title) ?? str(v.itineraryName) ?? "Curated cruise deal",
    cruiseLine: str(v.cruiseLine) ?? "",
    shipName: str(v.shipName) ?? "",
    itineraryName: str(v.itineraryName) ?? str(v.title) ?? "",
    nights: Number(v.nights) || 0,
    sailDateIso: str(v.sailDateIso) ?? "",
    departurePort: str(v.departurePort),
    portsOfCall: Array.isArray(v.portsOfCall)
      ? v.portsOfCall.map((p) => String(p)).filter(Boolean)
      : [],
    cabinPrices: {
      inside: cabinAmount("inside"),
      outside: cabinAmount("outside"),
      balcony: cabinAmount("balcony"),
      suite: cabinAmount("suite"),
      currencyCode: str(rawCabinPrices.currencyCode) ?? str(v.currencyCode) ?? "USD",
    },
    promoSignals: Array.isArray(v.promoSignals)
      ? v.promoSignals.map((p) => String(p)).filter(Boolean)
      : [],
  };
  return facts;
}

function buildPackageUrl(packageId: string, siid: string): string {
  return `https://bookings.cbagenttools.com/swift/cruise/package/${packageId}?siid=${siid}&lang=1`;
}

function isAsciiLetterOrDigit(char: string): boolean {
  const code = char.toLowerCase().charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function slugifyText(value: string): string {
  let out = "";
  let lastWasDash = false;
  for (const rawChar of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(rawChar)) {
      out += rawChar;
      lastWasDash = false;
      continue;
    }
    if (!lastWasDash && out.length > 0) {
      out += "-";
      lastWasDash = true;
    }
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out;
}

function firstDestination(facts: CuratedDealCruiseFacts): string {
  return facts.portsOfCall[0] ?? facts.itineraryName;
}

interface PipelineStrategyInput {
  campaignAngle?: string;
  targetAudience?: string;
  visualAngle?: string;
  targetingKeywords?: string[];
}

function buildCampaignStrategy(input: PipelineStrategyInput): DealCampaignStrategy | undefined {
  const campaignAngle = str(input.campaignAngle);
  const targetAudience = str(input.targetAudience);
  const visualAngle = str(input.visualAngle);
  const targetingKeywords = input.targetingKeywords
    ? input.targetingKeywords.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (!campaignAngle && !targetAudience && !visualAngle && targetingKeywords.length === 0) {
    return undefined;
  }
  return {
    campaignAngle: campaignAngle ?? "",
    targetAudience: targetAudience ?? "",
    visualAngle: visualAngle ?? "",
    targetingKeywords,
    savedAtIso: new Date().toISOString(),
  };
}

function inferGeoFocusFromCruiseFacts(deal: CuratedOdysseusDeal): string[] {
  const facts = deal.cruiseFacts;
  const departure = facts.departurePort?.trim();
  const firstPorts = facts.portsOfCall.slice(0, 4);
  const geo: string[] = [];

  if (departure) geo.push(departure);
  if (facts.itineraryName) geo.push(facts.itineraryName);
  geo.push(...firstPorts);

  const combined = `${facts.title} ${facts.itineraryName} ${departure ?? ""} ${firstPorts.join(" ")}`.toLowerCase();
  if (combined.includes("alaska")) geo.push("Alaska travel");
  if (combined.includes("seattle")) geo.push("Pacific Northwest travel");
  if (combined.includes("caribbean")) geo.push("Caribbean travel");
  if (combined.includes("mediterranean")) geo.push("Mediterranean travel");
  if (combined.includes("southampton")) geo.push("Southampton departures");

  return uniqueNonEmpty(geo);
}

function buildWorkbenchTargetingSeeds(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>,
  strategy: PipelineStrategyInput
) {
  const targeting = deal.targetingDemographic;
  const facts = deal.cruiseFacts;
  const selectedKeywords = strategy.targetingKeywords ?? [];
  const promoTitles = promoRecords.map((promo) => promo.title);
  const promoClaims = promoRecords.flatMap((promo) => [
    ...promo.marketingUse.publicClaimsAllowed.slice(0, 2),
    ...promo.marketingUse.publicClaimsNeedsQualifier.slice(0, 2),
  ]);
  const markets = uniqueNonEmpty(
    promoRecords.flatMap((promo) => promo.extracted.applicableMarkets ?? [])
  );

  return {
    inferredMarket: markets[0] ?? "US",
    geoFocus: uniqueNonEmpty([
      ...inferGeoFocusFromCruiseFacts(deal),
      ...(targeting?.nicheKeywords.destination ?? []).slice(0, 4),
    ]).slice(0, 8),
    personaSignals: uniqueNonEmpty([
      strategy.targetAudience,
      targeting?.primaryAudience.label,
      ...(targeting?.primaryAudience.emotionalDrivers ?? []).slice(0, 3),
      facts.cruiseLine,
      facts.shipName,
    ]).slice(0, 8),
    metaInterestSeeds: uniqueNonEmpty([
      ...selectedKeywords,
      ...(targeting?.channelTargeting.meta.interestClusters ?? []).slice(0, 8),
      ...(targeting?.nicheKeywords.shipExperience ?? []).slice(0, 4),
      ...promoTitles,
      ...promoClaims,
    ]).slice(0, 18),
    metaBehaviorSignals: uniqueNonEmpty([
      ...(targeting?.channelTargeting.meta.behaviorSignals ?? []),
      promoRecords.length > 0 ? "responds to limited-time travel offers" : undefined,
      promoRecords.length > 0 ? "compares premium vacation value" : undefined,
      facts.shipName ? `engages with ${facts.shipName} ship-specific content` : undefined,
    ]).slice(0, 8),
    excludedAudienceSignals: uniqueNonEmpty([
      ...(targeting?.nicheKeywords.exclusionKeywords ?? []).slice(0, 6),
      "Avoid broad cruise-interest targeting as the only audience.",
    ]).slice(0, 8),
  };
}

function splitKeywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPromoContext(promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>): string {
  if (promoRecords.length === 0) {
    return "No promo intelligence was selected.";
  }
  return promoRecords
    .map((promo) => {
      const publicSummary = promo.marketingUse.visitorFriendlySummary;
      const offer = promo.title;
      const allowedClaims = promo.marketingUse.publicClaimsAllowed.join("; ");
      const qualifiedClaims = promo.marketingUse.publicClaimsNeedsQualifier.join("; ");
      const suggestedAngles = promo.marketingUse.suggestedAngles.join("; ");
      const cautions = promo.marketingUse.cautionFlags.join("; ");
      return [
        `Promo: ${promo.vendor} - ${offer}`,
        publicSummary ? `Public-safe summary: ${publicSummary}` : "",
        allowedClaims ? `Allowed claims: ${allowedClaims}` : "",
        qualifiedClaims ? `Qualified claims: ${qualifiedClaims}` : "",
        suggestedAngles ? `Suggested promo angles: ${suggestedAngles}` : "",
        cautions ? `Cautions: ${cautions}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildPromoHandoffAssessment(input: {
  deal: CuratedOdysseusDeal;
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>;
  strategy?: PipelineStrategyInput;
}) {
  return assessPromoHandoff({
    cruiseLine: input.deal.cruiseFacts.cruiseLine,
    departurePort: input.deal.cruiseFacts.departurePort,
    campaignAngle: input.strategy?.campaignAngle,
    targetAudience: input.strategy?.targetAudience,
    targetingKeywords: input.strategy?.targetingKeywords,
    selectedPromos: input.promoRecords.map((promo) => ({
      id: promo.id,
      title: promo.title,
      vendor: promo.vendor,
      applicableMarkets: promo.extracted.applicableMarkets,
    })),
    cruiseLinePromoCount: input.promoRecords.length,
  });
}

function buildAnglePrompt(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>
): string {
  const facts = deal.cruiseFacts;
  const lockedHook = deal.campaignStrategy;
  return `Generate three differentiated advertising angle packages for this real cruise sailing.

Sailing facts:
Title: ${facts.title}
Cruise line: ${facts.cruiseLine}
Ship: ${facts.shipName}
Sail date: ${facts.sailDateIso}
Nights: ${facts.nights}
Departure port: ${facts.departurePort ?? ""}
Ports of call: ${facts.portsOfCall.join(", ")}
Package ID: ${deal.packageId}
Booking link status: ${deal.linkHealth.status}

${lockedHook ? `Locked operator campaign hook to preserve:
Hook: ${lockedHook.campaignAngle}
Audience: ${lockedHook.targetAudience}
Visual angle: ${lockedHook.visualAngle}
Targeting keywords: ${lockedHook.targetingKeywords.join(", ")}
Do not invent a different central promise.` : ""}

Promo context:
${buildPromoContext(promoRecords)}

Return exactly three options. Each option must include:
- campaignAngle: a concise ad hook that is specific to this sailing
- targetAudience: the buyer profile and targeting angle
- visualAngle: the visual concept for ads and landing hero
- targetingKeywords: 4 to 10 ad/search/interest keywords
- rationale: why this angle fits the sailing and promo

Rules:
- Do not claim exact prices, availability, or benefits unless the promo context supports them.
- Do not use generic cruise slogans.
- Keep each option public-safe and ready for a travel agency operator to choose.`;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function summarizePromoSignal(
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>
): string | undefined {
  const first = promoRecords[0];
  if (!first) return undefined;
  const claim =
    first.marketingUse.publicClaimsAllowed[0] ??
    first.marketingUse.publicClaimsNeedsQualifier[0] ??
    first.marketingUse.visitorFriendlySummary;
  return uniqueNonEmpty([
    `${first.vendor} ${first.title}`,
    claim,
    first.bookingWindow.rawText,
  ]).join(" | ");
}

function buildWorkbenchAudienceSignals(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>,
  strategy: PipelineStrategyInput
): string[] {
  const facts = deal.cruiseFacts;
  const itinerarySignal = uniqueNonEmpty([
    facts.departurePort ? `${facts.departurePort} roundtrip` : undefined,
    ...facts.portsOfCall.slice(0, 4),
  ]).join(", ");
  const keywordSignal = (strategy.targetingKeywords ?? []).slice(0, 6).join(", ");
  const promoSignal = summarizePromoSignal(promoRecords);

  return uniqueNonEmpty([
    `Real sailing selected in the Campaign Workbench: ${facts.shipName} on ${facts.cruiseLine}, ${facts.nights} nights, sailing ${facts.sailDateIso}.`,
    itinerarySignal
      ? `Concrete itinerary signal: ${itinerarySignal}.`
      : undefined,
    strategy.targetAudience
      ? `Operator-selected audience angle: ${strategy.targetAudience}.`
      : undefined,
    keywordSignal
      ? `Targeting seeds chosen for this sailing: ${keywordSignal}.`
      : undefined,
    promoSignal
      ? `Promo support attached to this sailing: ${promoSignal}.`
      : undefined,
  ]).slice(0, 4);
}

function buildWorkbenchResearchRationale(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>,
  strategy: PipelineStrategyInput
): string {
  const facts = deal.cruiseFacts;
  const angle = strategy.campaignAngle ?? facts.title;
  const promoSignal = summarizePromoSignal(promoRecords);
  const factsBlock = uniqueNonEmpty([
    facts.shipName,
    facts.sailDateIso,
    facts.departurePort,
    facts.portsOfCall.slice(0, 3).join(", "),
  ]).join(" | ");

  return uniqueNonEmpty([
    `Workbench-selected real sailing chosen for the angle "${angle}".`,
    factsBlock ? `Grounding facts: ${factsBlock}.` : undefined,
    promoSignal ? `Promo context considered: ${promoSignal}.` : undefined,
  ]).join(" ");
}

function buildWorkbenchSuccessLogic(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>,
  strategy: PipelineStrategyInput
): string {
  const facts = deal.cruiseFacts;
  const audience =
    strategy.targetAudience ??
    `travelers considering a ${facts.cruiseLine} sailing with a clear ship, date, and itinerary`;
  const promoSignal = promoRecords[0]?.title;
  const valueReason =
    promoSignal
      ? `The attached ${promoSignal} gives the audience a timely reason to act.`
      : "The exact package facts give the audience a specific sailing to compare and price-check.";

  return `${audience} can convert because this is a real ${facts.shipName} sailing on ${facts.sailDateIso}, not a generic cruise sale. ${valueReason}`;
}

async function generateAngleOptions(
  deal: CuratedOdysseusDeal,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>
) {
  const result = await generateStructuredObject({
    model: modelForTask("creative"),
    schema: angleOptionsSchema,
    system:
      "You are a travel agency direct-response strategist. Generate specific advertising and targeting angles for real cruise sailings. Return only the requested structured object.",
    prompt: buildAnglePrompt(deal, promoRecords),
    timeoutMs: 90_000,
  });

  return {
    angles: result.object.angles,
    modelId: result.modelId,
    warnings: result.warnings,
  };
}

function buildPipelineArtifacts(
  deal: CuratedOdysseusDeal,
  promoApplicability: PromoApplicabilityResult[],
  strategy: PipelineStrategyInput = {},
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>> = []
): { idea: DealDiscoveryIdea; manifest: DealTripManifest; nextUrl: string } {
  const generatedAtIso = new Date().toISOString();
  const facts = deal.cruiseFacts;
  const destination = firstDestination(facts);
  const angleTitle = strategy.campaignAngle || facts.title;
  const targetAudience =
    strategy.targetAudience ||
    `Travelers considering a ${facts.cruiseLine} sailing with a clear ship, date, itinerary, and booking path.`;
  const visualAngle =
    strategy.visualAngle ||
    `${facts.shipName}, premium cruise imagery, and destination visuals for ${destination}.`;
  const targetingKeywords =
    strategy.targetingKeywords && strategy.targetingKeywords.length > 0
      ? strategy.targetingKeywords
      : [
          facts.cruiseLine,
          facts.shipName,
          facts.itineraryName,
          destination,
        ].filter(Boolean);
  const baseSlug = slugifyText(`${facts.title}-${facts.shipName}-${deal.packageId}`) || deal.packageId;
  const angleId = `angle-workbench-${baseSlug}`;
  const manifestId = `manifest-workbench-${baseSlug}`;
  const bookingUrl = deal.bookingUrl || buildPackageUrl(deal.packageId, deal.siid);
  const ports = facts.portsOfCall.length > 0 ? facts.portsOfCall.join(" | ") : facts.itineraryName;
  const audienceSignals = buildWorkbenchAudienceSignals(deal, promoRecords, strategy);
  const researchRationale = buildWorkbenchResearchRationale(deal, promoRecords, strategy);
  const successLogic = buildWorkbenchSuccessLogic(deal, promoRecords, strategy);
  const targetingSeeds = buildWorkbenchTargetingSeeds(deal, promoRecords, strategy);

  const idea: DealDiscoveryIdea = {
    id: angleId,
    generatedAtIso,
    generator: "gpt",
    sourceResearchCachedAt: "workbench",
    isolatedNiche: targetAudience,
    researchRationale,
    successLogic,
    audienceSignals,
    sailingAngleProfile: {
      sailingAngleTitle: angleTitle,
      theCorePitch: `${angleTitle}: ${facts.shipName} on ${facts.itineraryName} gives this audience a specific real sailing to evaluate, not a generic cruise sale.`,
      visualAnchor: visualAngle,
      targetAudienceDescriptor: targetAudience,
      relevantKeywords: targetingKeywords,
      destinationAndTimeOfYearHints: `${facts.itineraryName} departing ${facts.sailDateIso}.`,
      onboardAssetRequirements: `${facts.shipName} ship assets, destination imagery, itinerary map, and booking-link proof.`,
    },
    groundedCandidate: {
      resolvedAtIso: generatedAtIso,
      packageId: deal.packageId,
      cruiseName: facts.title,
      cruiseLine: facts.cruiseLine,
      sailDateIso: facts.sailDateIso,
      nights: facts.nights,
      departurePortCode: facts.departurePort,
      portsOfCall: ports,
      confidence: 1,
      reasons: ["Created from operator-selected workbench sailing."],
    },
  };

  const manifest: DealTripManifest = {
    id: manifestId,
    generatedAtIso,
    generator: "gpt",
    expiresOnIso: deal.expiresOnIso,
    sourceAngleId: angleId,
    isolatedNiche: idea.isolatedNiche,
    sailingAngleTitle: angleTitle,
    assembleDraft: {
      suggestedDealId: deal.id,
      suggestedBriefId: deal.briefId,
      cruiseLine: facts.cruiseLine,
      itineraryName: facts.itineraryName || facts.title,
      destination,
      nights: facts.nights,
      sailWindow: {
        earliestIso: facts.sailDateIso,
        latestIso: facts.sailDateIso,
        rationale: "Exact sail date selected in the campaign workbench.",
      },
      departurePortHint: facts.departurePort,
      portsOfCall: facts.portsOfCall,
    },
    appliedPromos: promoApplicability,
    promoStrategy:
      promoApplicability.length > 0
        ? `Use selected promo intelligence to support "${angleTitle}" with qualified, public-safe language.`
        : `No promo was selected during the workbench handoff; copywriting should sell "${angleTitle}" without perk or savings claims.`,
    manifestReasoning: `Created from an operator-selected real sailing in the Campaign Workbench. Advertising angle: ${angleTitle}. Targeting angle: ${targetAudience}. ${researchRationale}`,
    lookupQuery: {
      line: facts.cruiseLine,
      ship: facts.shipName,
      destination,
      date: facts.sailDateIso,
      nights: facts.nights,
      port: facts.departurePort,
      windowDays: 0,
    },
    targetingSeeds,
    resolvedPackage: {
      resolvedAtIso: generatedAtIso,
      source: "operator_package_lookup",
      packageId: deal.packageId,
      cruiseName: facts.title,
      cruiseLine: facts.cruiseLine,
      shipName: facts.shipName,
      sailDateIso: facts.sailDateIso,
      nights: facts.nights,
      departurePortCode: facts.departurePort,
      confidence: 1,
      reasons: ["Operator selected this exact workbench sailing."],
      siid: deal.siid,
      bookingUrl,
      bookingLinkClass: deal.bookingUrlSource,
      linkHealth: deal.linkHealth,
      cabinPricing: facts.cabinPrices,
      itinerary: {
        durationNights: facts.nights,
        departurePortCode: facts.departurePort,
        portsOfCall: ports,
        normalizedPortsOfCall: facts.portsOfCall.join(", "),
        dayByDay: facts.dayByDayItinerary,
      },
      lookupDiagnostics: ["Resolved from Campaign Workbench handoff; no new Odysseus search was run."],
    },
  };

  return {
    idea,
    manifest,
    nextUrl: `/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifestId)}`,
  };
}

function buildScoring(deal: Partial<CuratedOdysseusDeal>) {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (deal.angleResearch) {
    score += 20;
    reasons.push("Has trip angle research scaffold.");
  }
  if (deal.targetingDemographic) {
    score += 20;
    reasons.push("Has targeting scaffold.");
  }
  if (deal.pitchBrief) {
    score += 10;
    reasons.push("Has pitch brief scaffold.");
  }
  if (deal.linkHealth?.status === "valid") {
    score += 10;
    reasons.push("Link health is valid.");
  } else {
    warnings.push(`Link health is "${deal.linkHealth?.status ?? "unknown"}".`);
  }

  return { score, reasons, warnings };
}

function buildPackaging(facts: CuratedDealCruiseFacts, deal: Partial<CuratedOdysseusDeal>) {
  return {
    headline: facts.title,
    shortSummary: `${facts.nights}-night ${facts.itineraryName}`,
    highlights: deal.pitchBrief ? [deal.pitchBrief.primaryHook] : [facts.title],
    destinationNotes: facts.portsOfCall.slice(0, 4),
    bestFor: deal.pitchBrief ? [deal.pitchBrief.audienceStatement] : facts.promoSignals,
  };
}

function buildScaffoldAngleResearch(input: {
  dealId: string;
  generatedAtIso: string;
  cruiseFacts: CuratedDealCruiseFacts;
}): DealAngleResearch {
  const { dealId, generatedAtIso, cruiseFacts } = input;
  return {
    dealCandidateId: dealId,
    generatedAtIso,
    shipAppeal: [
      `${cruiseFacts.shipName} offers a premium-feeling ${cruiseFacts.nights}-night sailing.`,
      `The itinerary centers on ${cruiseFacts.itineraryName}.`,
    ],
    amenityHighlights: [
      cruiseFacts.cruiseLine,
      cruiseFacts.shipName,
      cruiseFacts.departurePort ?? "",
    ].filter(Boolean),
    destinationHooks: cruiseFacts.portsOfCall.length > 0 ? cruiseFacts.portsOfCall : [cruiseFacts.itineraryName],
    itineraryPacingNotes: cruiseFacts.portsOfCall.length > 0 ? cruiseFacts.portsOfCall : [cruiseFacts.itineraryName],
    nicheAudienceAngles: [
      `travelers who want ${cruiseFacts.itineraryName.toLowerCase()}`,
      `guests who prefer ${cruiseFacts.cruiseLine} sailings`,
    ],
    trendMatches: [],
    competitorBlindSpots: [
      "Most cruise listings lead with generic route copy instead of a traveler-specific angle.",
    ],
    recommendedPrimaryAngle: {
      title: cruiseFacts.title,
      rationale: `Fast scaffold built from the manually found sailing facts for ${cruiseFacts.shipName}.`,
      publicCopyHook: cruiseFacts.title,
      whyThisFeelsExclusive: "It is pre-framed around a specific real sailing instead of a generic sale page.",
    },
    rejectedAngles: [],
    factualGuardrails: [
      "Verify all pricing and perk language before approval.",
      "Use the staged generators to replace the scaffold with richer research.",
    ],
    sources: [
      {
        title: cruiseFacts.title,
        url: "internal://workbench-import",
        usedFor: "Manual workbench scaffold from found sailing facts.",
      },
    ],
  };
}

function buildScaffoldTargetingDemographic(input: {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  angleResearch: DealAngleResearch;
}): DealTargetingDemographic {
  const { dealId, packageId, cruiseFacts, angleResearch } = input;
  return {
    dealId,
    packageId,
    generatedAtIso: angleResearch.generatedAtIso,
    primaryAudience: {
      label: `${cruiseFacts.cruiseLine} travelers`,
      description: `People who want ${cruiseFacts.title.toLowerCase()} and prefer a premium cruise line.`,
      whyThisCruiseFits: cruiseFacts.itineraryName,
      emotionalDrivers: ["ease", "anticipation", "premium comfort"],
      likelyObjections: ["price", "time off work"],
    },
    secondaryAudiences: [],
    nicheKeywords: {
      lifestyle: [cruiseFacts.cruiseLine, cruiseFacts.shipName].filter(Boolean),
      destination: cruiseFacts.portsOfCall.slice(0, 6),
      shipExperience: [cruiseFacts.shipName],
      amenities: [],
      eventsAndSeasonality: [],
      trendSignals: [],
      exclusionKeywords: ["free cruise", "cruise job"],
    },
    channelTargeting: {
      meta: {
        interestClusters: [cruiseFacts.cruiseLine, cruiseFacts.shipName].filter(Boolean),
        behaviorSignals: [],
        creativeHooks: [cruiseFacts.title],
        audienceWarnings: ["Use this scaffold as a starting point only."],
      },
      google: {
        searchThemes: [cruiseFacts.title],
        keywordIdeas: [cruiseFacts.shipName, cruiseFacts.cruiseLine].filter(Boolean),
        negativeKeywords: ["free cruise", "cruise job"],
        landingPageIntentNotes: [cruiseFacts.itineraryName],
      },
      tiktok: {
        creatorAngles: [cruiseFacts.title],
        trendHooks: [],
        shortVideoConcepts: [],
      },
      email: {
        segmentIdeas: [cruiseFacts.cruiseLine],
        subjectLineAngles: [cruiseFacts.title],
        personalizationNotes: [],
      },
    },
    researchSummary: {
      primaryInsight: cruiseFacts.title,
      whyNow: "Fast scaffold assembled from a live-found sailing.",
      competitorBlindSpot: "Generic cruise pages rarely preserve a specific sailing's shape.",
      positioningStatement: cruiseFacts.title,
    },
    sources: [
      {
        title: cruiseFacts.title,
        url: "internal://workbench-import",
        usedFor: "Manual workbench scaffold from found sailing facts.",
      },
    ],
    confidence: {
      score: 0.5,
      strengths: ["Real package ID", "Real sail date", "Real ports"],
      risks: ["Scaffold only; regenerate research/targeting before approval."],
      needsHumanReview: ["Replace scaffold text with staged research outputs."],
    },
  };
}

function buildScaffoldPitchBrief(input: {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  targetingDemographic: DealTargetingDemographic;
  angleResearch: DealAngleResearch;
  campaignStrategy?: DealCampaignStrategy;
}): DealPitchBrief {
  const { dealId, packageId, cruiseFacts, targetingDemographic, angleResearch, campaignStrategy } = input;
  return {
    dealId,
    packageId,
    generatedAtIso: angleResearch.generatedAtIso,
    generator: "deterministic_scaffold",
    tripSummary: cruiseFacts.title,
    audienceStatement: campaignStrategy?.targetAudience?.trim() || targetingDemographic.primaryAudience.label,
    primaryHook:
      campaignStrategy?.campaignAngle?.trim() || angleResearch.recommendedPrimaryAngle.publicCopyHook,
    curatedReason:
      campaignStrategy?.campaignAngle?.trim()
        ? `${angleResearch.recommendedPrimaryAngle.whyThisFeelsExclusive} Operator hook: ${campaignStrategy.campaignAngle.trim()}`
        : angleResearch.recommendedPrimaryAngle.whyThisFeelsExclusive,
    sellingFacts: [
      cruiseFacts.shipName,
      cruiseFacts.departurePort ?? cruiseFacts.itineraryName,
      cruiseFacts.portsOfCall[0] ?? cruiseFacts.itineraryName,
    ],
    researchRationale: campaignStrategy?.campaignAngle?.trim()
      ? `Workbench scaffold built from manually imported sailing facts. Locked hook: ${campaignStrategy.campaignAngle.trim()}`
      : "Workbench scaffold built from manually imported sailing facts.",
  };
}

function buildScaffoldCopyPackage(input: {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  pitchBrief: DealPitchBrief;
  promoRecords?: Parameters<typeof buildOfferLines>[0]["promoRecords"];
}): DealCopyPackage {
  const { dealId, packageId, cruiseFacts, pitchBrief, promoRecords } = input;
  const { offerLines, agentOnlyNotes } = buildOfferLines({ promoRecords });
  return {
    dealId,
    packageId,
    generatedAtIso: pitchBrief.generatedAtIso,
    generator: "deterministic_scaffold",
    headlineOptions: [
      pitchBrief.primaryHook,
      `${cruiseFacts.nights}-Night ${cruiseFacts.shipName} Sailing`,
      cruiseFacts.itineraryName,
    ],
    shortTileCopy: `${cruiseFacts.nights}-night ${cruiseFacts.itineraryName}`,
    heroCopy: [
      `Set sail on ${cruiseFacts.shipName} for ${cruiseFacts.nights} nights through the Norwegian Fjords.`,
      pitchBrief.curatedReason,
    ].join(" "),
    whyThisTrip: [
      `A specific ${cruiseFacts.nights}-night sailing on ${cruiseFacts.shipName}.`,
      `Ports of call: ${cruiseFacts.portsOfCall.join(", ")}.`,
      `Built from the live-found package ${packageId}.`,
    ],
    offerLines,
    ctaCopy: [
      {
        kind: "book_now",
        label: "Check availability",
        supportingText: "Open the booking path for live pricing and availability.",
      },
      {
        kind: "email_link",
        label: "Send details by email",
        supportingText: "Share the sailing facts with a traveler who wants a follow-up.",
      },
      {
        kind: "request_callback",
        label: "Request a callback",
        supportingText: "Have an agent review the sailing and talk through options.",
      },
    ],
    publicCopyRedFlags: [],
    agentOnlyNotes: [
      ...agentOnlyNotes,
      "Workbench scaffold built from manually imported sailing facts.",
      "Refine the copy package after operator review if you want a stronger public angle.",
    ],
  };
}

function buildScaffoldAdStructure(input: {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  pitchBrief: DealPitchBrief;
  copyPackage: DealCopyPackage;
  targetingDemographic: DealTargetingDemographic;
}): DealAdStructure {
  const { dealId, packageId, cruiseFacts, pitchBrief, copyPackage, targetingDemographic } = input;
  return {
    dealId,
    packageId,
    generatedAtIso: pitchBrief.generatedAtIso,
    generator: "deterministic_scaffold",
    campaignThesis: `${cruiseFacts.shipName} via a specific ${cruiseFacts.nights}-night Norwegian Fjords sailing.`,
    channels: [
      {
        channel: "meta",
        primaryAngle: pitchBrief.primaryHook,
        hooks: [pitchBrief.curatedReason, targetingDemographic.primaryAudience.whyThisCruiseFits],
        proofPoints: copyPackage.whyThisTrip,
        notes: ["Use premium scenic imagery and clear sailing facts."],
      },
      {
        channel: "google",
        primaryAngle: cruiseFacts.itineraryName,
        hooks: [cruiseFacts.shipName, cruiseFacts.departurePort ?? cruiseFacts.itineraryName],
        proofPoints: copyPackage.offerLines.map((line) => line.text),
        notes: ["Keep search intent close to itinerary facts."],
      },
      {
        channel: "tiktok",
        primaryAngle: cruiseFacts.title,
        hooks: [cruiseFacts.shipName, "Norwegian fjords scenery", "travel planning"],
        proofPoints: [cruiseFacts.portsOfCall.join(", ")],
        notes: ["Short scenic cutdowns and ship reveal clips."],
      },
      {
        channel: "email",
        primaryAngle: pitchBrief.audienceStatement,
        hooks: [pitchBrief.primaryHook],
        proofPoints: [pitchBrief.sellingFacts.join(" | ")],
        notes: ["Use a simple follow-up and a clear booking path."],
      },
    ],
    nicheKeywords: [
      ...targetingDemographic.nicheKeywords.lifestyle,
      ...targetingDemographic.nicheKeywords.destination,
      ...targetingDemographic.nicheKeywords.shipExperience,
    ],
    trendKeywords: [],
    negativeKeywords: targetingDemographic.nicheKeywords.exclusionKeywords,
    creativeHypotheses: [
      "Lead with the fjords scenery and the premium ship experience.",
      "Frame the sailing as a specific Norway itinerary, not a generic cruise sale.",
      "Use the Summer Sale savings only where the promo record supports it.",
    ],
    offerProofPoints: copyPackage.offerLines.map((line) => line.text),
  };
}

function buildScaffoldMediaPlan(input: {
  dealId: string;
  packageId: string;
  cruiseFacts: CuratedDealCruiseFacts;
  pitchBrief: DealPitchBrief;
  copyPackage: DealCopyPackage;
  adStructure: DealAdStructure;
}): DealMediaPlan {
  const { dealId, packageId, cruiseFacts, pitchBrief, copyPackage } = input;
  return {
    dealId,
    packageId,
    generatedAtIso: pitchBrief.generatedAtIso,
    generator: "deterministic_scaffold",
    visualDirection: [
      "Clean, premium ocean horizon shots",
      "Celebrity Apex exterior and deck imagery",
      "Scenic Norwegian fjord landscape framing",
    ],
    imageSlots: [
      {
        slot: "hero",
        purpose: "Lead image",
        visualConceptPrompt: `Celebrity Apex sailing through the Norwegian Fjords, premium cruise photography, ${cruiseFacts.title}.`,
        requiredSourceAssets: ["ship exterior", "fjord scenery"],
      },
      {
        slot: "feature",
        purpose: "Itinerary proof",
        visualConceptPrompt: `A map-style or route-style visual for ${cruiseFacts.portsOfCall.join(", ")}.`,
        requiredSourceAssets: ["destination imagery", "route map"],
      },
      {
        slot: "detail",
        purpose: "Cabin and onboard feel",
        visualConceptPrompt: `Elegant stateroom or lounge detail on Celebrity Apex.`,
        requiredSourceAssets: ["interior ship photography"],
      },
    ],
    shortVideoConcepts: [
      {
        concept: "Fjord reveal",
        hook: "Watch the Norway scenery unfold day by day.",
        shots: ["ship departure", "fjord views", "ship deck", "route map"],
      },
      {
        concept: "Apex premium moments",
        hook: "Show the ship experience behind the itinerary.",
        shots: ["dining", "deck", "stateroom", "destination"],
      },
    ],
    requiredSourceAssets: [
      "ship exterior",
      "destination photography",
      "route map",
      "stateroom imagery",
    ],
    readiness: "concepts_ready",
  };
}

function stageWorkbenchDeal(
  existing: CuratedOdysseusDeal,
  stage: Exclude<DealCampaignStage, "approval">,
  promoRecords: Awaited<ReturnType<typeof getPromoRecordsByIds>>
): CuratedOdysseusDeal {
  const generatedAtIso = new Date().toISOString();
  const next: CuratedOdysseusDeal = { ...existing };

  if (stage === "research") {
    next.angleResearch = buildScaffoldAngleResearch({
      dealId: existing.id,
      generatedAtIso,
      cruiseFacts: existing.cruiseFacts,
    });
  } else if (stage === "targeting") {
    next.angleResearch =
      next.angleResearch ??
      buildScaffoldAngleResearch({
        dealId: existing.id,
        generatedAtIso,
        cruiseFacts: existing.cruiseFacts,
      });
    next.targetingDemographic = buildScaffoldTargetingDemographic({
      dealId: existing.id,
      packageId: existing.packageId,
      cruiseFacts: existing.cruiseFacts,
      angleResearch: next.angleResearch,
    });
  } else if (stage === "pitch") {
    next.angleResearch =
      next.angleResearch ??
      buildScaffoldAngleResearch({
        dealId: existing.id,
        generatedAtIso,
        cruiseFacts: existing.cruiseFacts,
      });
    next.targetingDemographic =
      next.targetingDemographic ??
      buildScaffoldTargetingDemographic({
        dealId: existing.id,
        packageId: existing.packageId,
        cruiseFacts: existing.cruiseFacts,
        angleResearch: next.angleResearch,
      });
    next.pitchBrief = buildScaffoldPitchBrief({
      dealId: existing.id,
      packageId: existing.packageId,
      cruiseFacts: existing.cruiseFacts,
      targetingDemographic: next.targetingDemographic,
      angleResearch: next.angleResearch,
      campaignStrategy: existing.campaignStrategy,
    });
  } else {
    next.angleResearch =
      next.angleResearch ??
      buildScaffoldAngleResearch({
        dealId: existing.id,
        generatedAtIso,
        cruiseFacts: existing.cruiseFacts,
      });
    next.targetingDemographic =
      next.targetingDemographic ??
      buildScaffoldTargetingDemographic({
        dealId: existing.id,
        packageId: existing.packageId,
        cruiseFacts: existing.cruiseFacts,
        angleResearch: next.angleResearch,
      });
    next.pitchBrief =
      next.pitchBrief ??
      buildScaffoldPitchBrief({
        dealId: existing.id,
        packageId: existing.packageId,
        cruiseFacts: existing.cruiseFacts,
        targetingDemographic: next.targetingDemographic,
        angleResearch: next.angleResearch,
        campaignStrategy: existing.campaignStrategy,
      });
    const copyPackage =
      next.copyPackage ??
      buildScaffoldCopyPackage({
        dealId: existing.id,
        packageId: existing.packageId,
        cruiseFacts: existing.cruiseFacts,
        pitchBrief: next.pitchBrief,
        promoRecords,
      });
    next.copyPackage = copyPackage;

    if (stage === "copy") {
      // Nothing else to do.
    } else {
      const adStructure =
        next.adStructure ??
        buildScaffoldAdStructure({
          dealId: existing.id,
          packageId: existing.packageId,
          cruiseFacts: existing.cruiseFacts,
          pitchBrief: next.pitchBrief,
          copyPackage,
          targetingDemographic: next.targetingDemographic,
        });
      next.adStructure = adStructure;

      if (stage === "media") {
        next.mediaPlan =
          next.mediaPlan ??
          buildScaffoldMediaPlan({
            dealId: existing.id,
            packageId: existing.packageId,
            cruiseFacts: existing.cruiseFacts,
            pitchBrief: next.pitchBrief,
            copyPackage,
            adStructure,
          });
      }
    }
  }

  next.scoring = buildScoring(next);
  next.packaging = buildPackaging(existing.cruiseFacts, next);

  const gates = evaluateApprovalGates(next, {
    textOnlyLaunchWaived: next.operatorApproval?.textOnlyLaunchWaived,
  });
  next.status = "needs_review";
  next.operatorApproval = {
    dealId: existing.id,
    status: "needs_review",
    updatedAtIso: generatedAtIso,
    decidedBy: "system",
    textOnlyLaunchWaived: next.operatorApproval?.textOnlyLaunchWaived ?? false,
    gates,
  };
  return next;
}

function assembleWorkbenchDeal(input: AssembleCuratedDealInput): CuratedOdysseusDeal {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const linkHealth = input.linkHealth ?? {
    status: "unknown",
    failureReason: "Constructed link not yet browser-validated.",
  };
  const bookingUrl = input.bookingUrl ?? buildPackageUrl(input.packageId, input.siid);
  const bookingUrlSource = input.bookingUrl ? "share_button" : "constructed_package_url";
  const angleResearch = buildScaffoldAngleResearch({
    dealId: input.dealId,
    generatedAtIso,
    cruiseFacts: input.cruiseFacts,
  });
  const targetingDemographic = buildScaffoldTargetingDemographic({
    dealId: input.dealId,
    packageId: input.packageId,
    cruiseFacts: input.cruiseFacts,
    angleResearch,
  });
  const pitchBrief = buildScaffoldPitchBrief({
    dealId: input.dealId,
    packageId: input.packageId,
    cruiseFacts: input.cruiseFacts,
    targetingDemographic,
    angleResearch,
    campaignStrategy: input.campaignStrategy,
  });
  const partial: Partial<CuratedOdysseusDeal> = {
    packageId: input.packageId,
    linkHealth,
    angleResearch,
    campaignStrategy: input.campaignStrategy,
    targetingDemographic,
    pitchBrief,
  };
  const gates = evaluateApprovalGates(partial, { textOnlyLaunchWaived: false });
  const agentOnlyNotes = ["Workbench scaffold assembled from manually imported sailing facts."];

  return {
    id: input.dealId,
    status: "needs_review",
    source: "odysseus_curated_retail",
    briefId: input.briefId,
    capturedAtIso: generatedAtIso,
    expiresOnIso: input.expiresOnIso?.trim() || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
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
    operatorApproval: {
      dealId: input.dealId,
      status: "needs_review",
      updatedAtIso: generatedAtIso,
      decidedBy: "system",
      textOnlyLaunchWaived: false,
      gates,
    },
    agentOnlyNotes,
  };
}

function ok(deal: CuratedOdysseusDeal, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, deal, ...extra });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const action = str(body.action);
  if (!action) return bad("action is required.");

  const promoRecordIds = Array.isArray(body.promoRecordIds)
    ? body.promoRecordIds.map((id) => String(id))
    : [];

  try {
    if (action === "assemble") {
      const dealId = str(body.dealId);
      const briefId = str(body.briefId);
      const packageId = str(body.packageId);
      const cruiseFacts = parseCruiseFacts(body.cruiseFacts);
      if (!dealId || !briefId || !packageId || !cruiseFacts) {
        return bad("assemble requires dealId, briefId, packageId, and cruiseFacts.");
      }
      const input: AssembleCuratedDealInput = {
        dealId,
        briefId,
        packageId,
        siid: str(body.siid) ?? process.env.CB_AGENT_SIID ?? "1049337",
        cruiseFacts,
        bookingUrl: str(body.bookingUrl),
        campaignStrategy: buildCampaignStrategy({
          campaignAngle: str(body.campaignAngle),
          targetAudience: str(body.targetAudience),
          visualAngle: str(body.visualAngle),
          targetingKeywords: splitKeywordList(body.targetingKeywords),
        }),
        promoRecords: promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : [],
      };
      const deal = assembleWorkbenchDeal(input);
      await upsertCuratedDealRecord(deal);
      const existingBrief = await getDealBrief(deal.briefId);
      if (!existingBrief) {
        await upsertDealBriefRecord({
          id: deal.briefId,
          title: deal.cruiseFacts.title,
          destinationKeywords: deal.cruiseFacts.portsOfCall,
          cruiseLine: deal.cruiseFacts.cruiseLine,
          shipName: deal.cruiseFacts.shipName,
          departurePort: deal.cruiseFacts.departurePort,
          minNights: deal.cruiseFacts.nights,
          maxNights: deal.cruiseFacts.nights,
          marketingAngle: deal.packaging.headline,
          audienceFit: deal.packaging.bestFor,
        });
      }
      return ok(deal);
    }

    const dealId = str(body.dealId);
    if (!dealId) return bad("dealId is required for this action.");
    const existing = await getCuratedDeal(dealId);
    if (!existing) return bad(`No Deal found with id "${dealId}".`, 404);

    if (action === "stage") {
      const stage = str(body.stage);
      if (!stage || !STAGE_NAMES.includes(stage as DealCampaignStage) || stage === "approval") {
        return bad("stage must be one of research, targeting, copy, ad_structure, media.");
      }
      const updated = stageWorkbenchDeal(
        existing,
        stage as Exclude<DealCampaignStage, "approval">,
        promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : []
      );
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "save_strategy") {
      const strategy =
        buildCampaignStrategy({
          campaignAngle: str(body.campaignAngle),
          targetAudience: str(body.targetAudience),
          visualAngle: str(body.visualAngle),
          targetingKeywords: splitKeywordList(body.targetingKeywords),
        }) ?? existing.campaignStrategy;
      const updated: CuratedOdysseusDeal = {
        ...existing,
        campaignStrategy: strategy,
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "generate_angles") {
      const promoRecords = promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : [];
      const strategy = buildCampaignStrategy({
        campaignAngle: str(body.campaignAngle),
        targetAudience: str(body.targetAudience),
        visualAngle: str(body.visualAngle),
        targetingKeywords: splitKeywordList(body.targetingKeywords),
      });
      const updated: CuratedOdysseusDeal = strategy
        ? { ...existing, campaignStrategy: strategy }
        : existing;
      if (strategy) {
        await upsertCuratedDealRecord(updated);
      }
      const handoffAssessment = buildPromoHandoffAssessment({
        deal: updated,
        promoRecords,
      });
      const generated = await generateAngleOptions(updated, promoRecords);
      return ok(updated, {
        angleOptions: generated.angles,
        modelId: generated.modelId,
        warnings: [...generated.warnings, ...handoffAssessment.warnings],
        handoffAssessment,
      });
    }

    if (action === "send_to_pipeline") {
      const promoRecords = promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : [];
      const strategy = buildCampaignStrategy({
        campaignAngle: str(body.campaignAngle),
        targetAudience: str(body.targetAudience),
        visualAngle: str(body.visualAngle),
        targetingKeywords: splitKeywordList(body.targetingKeywords),
      }) ?? existing.campaignStrategy;
      const handoffAssessment = buildPromoHandoffAssessment({
        deal: existing,
        promoRecords,
        strategy,
      });
      if (handoffAssessment.blockingIssues.length > 0) {
        return bad(`Promo handoff blocked. ${handoffAssessment.blockingIssues.join(" ")}`);
      }
      const updated = strategy ? { ...existing, campaignStrategy: strategy } : existing;
      if (strategy) {
        await upsertCuratedDealRecord(updated);
      }
      const existingPromoApplicability = existing.promoApplicability ?? [];
      const promoApplicability =
        promoRecords.length > 0
          ? promoRecords.map(
              (promo) =>
                existingPromoApplicability.find(
                  (applicability) => applicability.promoRecordId === promo.id
                ) ?? {
                  promoRecordId: promo.id,
                  status: "possibly_applicable_needs_review" as const,
                  matchedOn: [
                    existing.cruiseFacts.cruiseLine,
                    existing.cruiseFacts.sailDateIso,
                  ].filter(Boolean),
                  assumptions: ["Selected by the operator in the Campaign Workbench."],
                  warnings: ["Confirm promo eligibility before publishing public copy."],
                }
            )
          : existingPromoApplicability;
      const pipeline = buildPipelineArtifacts(updated, promoApplicability, strategy, promoRecords);
      saveDealDiscoveryIdeasCache(
        upsertDealDiscoveryIdea(loadDealDiscoveryIdeasCache(), pipeline.idea)
      );
      await upsertDealTripManifestRecord(pipeline.manifest);
      return ok(updated, {
        angleId: pipeline.idea.id,
        manifestId: pipeline.manifest.id,
        handoffAssessment,
        nextUrl: pipeline.nextUrl,
      });
    }

    if (action === "set_link_valid") {
      const nowIso = new Date().toISOString();
      const updated: CuratedOdysseusDeal = {
        ...existing,
        linkHealth: {
          status: "valid",
          lastVerifiedAtIso: nowIso,
          capturedAtIso: existing.linkHealth.capturedAtIso ?? nowIso,
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "approve") {
      const result = approveCuratedDeal(existing, {
        decisionNote: str(body.decisionNote),
        textOnlyLaunchWaived: body.textOnlyLaunchWaived === true,
      });
      await upsertCuratedDealRecord(result.deal);
      return ok(result.deal, {
        approved: result.approved,
        blockingFailures: result.blockingFailures,
      });
    }

    if (action === "reject") {
      const updated = rejectCuratedDeal(existing, { decisionNote: str(body.decisionNote) });
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "pin" || action === "unpin") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        operatorVisibility: {
          ...existing.operatorVisibility,
          pinned: action === "pin",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "hide" || action === "unhide") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        operatorVisibility: {
          ...existing.operatorVisibility,
          hidden: action === "hide",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "delete") {
      await deleteCuratedDealRecord(existing.id);
      return NextResponse.json({ ok: true, deleted: true, dealId: existing.id });
    }

    if (action === "refresh_link") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        linkHealth: {
          ...existing.linkHealth,
          status: "stale",
          failureReason: str(body.decisionNote) ?? "Operator requested link re-verification.",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "request_capture") {
      const note =
        str(body.decisionNote) ?? "Operator capture requested via production dashboard.";
      const updated: CuratedOdysseusDeal = {
        ...existing,
        agentOnlyNotes: [...(existing.agentOnlyNotes ?? []), `[capture requested] ${note}`],
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error), 500);
  }
}
