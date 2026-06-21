/**
 * Deal Manifest Assembly (Deal Workflow Step 5 — Publish).
 *
 * Assembles a CuratedOdysseusDeal directly from a resolved DealTripManifest +
 * its DealAdCopy, WITHOUT re-running AI generators. This is the "no creative
 * drift" bridge: everything the Deal needs (cruise facts, copy, ad structure,
 * targeting) is carried forward from Steps 1-3.
 *
 * The resulting Deal is always `needs_review`; only `approveCuratedDeal` can
 * promote it to `bookable`.
 */

import type {
  DealAdCopy,
  DealAdVariant,
  DealTripManifest,
} from "@/lib/cb/deals-system";
import type {
  CuratedDealCruiseFacts,
  CuratedDealPackaging,
  CuratedDealScoring,
  CuratedOdysseusDeal,
} from "./curated-deal-types";
import type {
  DealAdChannelPlan,
  DealAdStructure,
  DealApprovalGate,
  DealApprovalState,
  DealCopyOfferLine,
  DealCopyPackage,
  DealCtaCopy,
  DealMediaPlan,
  DealPitchBrief,
} from "./campaign-types";
import { defaultDealExpiresOnIso, evaluateApprovalGates } from "./curated-deal-assembly";
import type { DealAngleResearch, DealTargetingDemographic } from "./research-types";
import {
  resolvedPackageShipName,
  resolveCruiseLineForPackage,
} from "./ship-identity";

export interface AssembleFromManifestInput {
  manifest: DealTripManifest;
  adCopy: DealAdCopy;
  generatedAtIso?: string;
}

/**
 * Return the ad copy with the operator-selected variant moved to index 0 (the
 * "primary" slot every builder below reads from), so the published deal page
 * uses the chosen variant's headline/hero/pitch. The remaining variants keep
 * their order as upsell ad sets. Absent/0 selection is a no-op.
 */
export function withSelectedVariantPrimary(adCopy: DealAdCopy): DealAdCopy {
  const idx = adCopy.selectedVariantIndex ?? 0;
  if (idx <= 0 || idx >= adCopy.variants.length) return adCopy;
  const chosen = adCopy.variants[idx];
  const rest = adCopy.variants.filter((_, i) => i !== idx);
  return {
    ...adCopy,
    variants: [chosen, ...rest],
    primaryPromoApplied: chosen.promoApplied,
    selectedVariantIndex: 0,
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function splitPortList(values: string[]): string[] {
  return uniqueNonEmpty(values.flatMap((value) => value.split("|").map((part) => part.trim())));
}

function buildCruiseFacts(manifest: DealTripManifest): CuratedDealCruiseFacts {
  const d = manifest.assembleDraft;
  const r = manifest.resolvedPackage;
  const cabinPricing = r?.cabinPricing;
  const cruiseName = r?.cruiseName?.trim();
  const shipName = resolvedPackageShipName(r, d.shipClassHint) ?? "";
  const resolvedPorts = r?.itinerary?.portsOfCall
    ? splitPortList([r.itinerary.portsOfCall])
    : [];
  return {
    title: cruiseName || d.itineraryName,
    cruiseLine: resolveCruiseLineForPackage(r?.packageId, r?.cruiseLine ?? d.cruiseLine),
    shipName,
    itineraryName: cruiseName || d.itineraryName,
    nights: r?.nights ?? d.nights ?? 0,
    sailDateIso: r?.sailDateIso ?? d.sailWindow.earliestIso ?? "",
    departurePort: r?.departurePortCode ?? d.departurePortHint,
    portsOfCall: resolvedPorts.length > 0 ? resolvedPorts : splitPortList(d.portsOfCall),
    dayByDayItinerary:
      r?.itinerary?.dayByDay && r.itinerary.dayByDay.length > 0
        ? r.itinerary.dayByDay
        : undefined,
    cabinPrices: {
      inside: cabinPricing?.inside,
      outside: cabinPricing?.outside,
      balcony: cabinPricing?.balcony,
      suite: cabinPricing?.suite,
      currencyCode: cabinPricing?.currencyCode ?? "USD",
    },
    promoSignals: manifest.appliedPromos
      .filter((p) => p.status === "likely_applicable" || p.status === "possibly_applicable_needs_review")
      .map((p) => p.promoRecordId),
  };
}

function buildCopyPackage(adCopy: DealAdCopy): DealCopyPackage {
  const variants = adCopy.variants;
  const primary = variants[0];
  const headlines = variants.map((v) => v.headline);

  const offerLines: DealCopyOfferLine[] = [];
  for (const v of variants) {
    // Split pricing disclaimers into individual lines
    const lines = v.pricingDisclaimers
      .split(/\n|•/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const text of lines) {
      offerLines.push({ text, needsQualifier: true });
    }
  }

  const ctaCopy: DealCtaCopy[] = [
    {
      kind: "book_now",
      label: primary.callToAction,
      supportingText: "Book directly with our preferred partner.",
    },
    {
      kind: "email_link",
      label: "Email me the booking link",
      supportingText: "We'll send the live link to your inbox.",
    },
    {
      kind: "request_callback",
      label: "Request an agent callback",
      supportingText: "An agent will call you within one business day.",
    },
  ];

  const voiceWarnings = variants.flatMap((v) => v.voiceWarnings);

  return {
    dealId: "",
    packageId: "",
    generatedAtIso: adCopy.generatedAtIso,
    generator: "gpt",
    headlineOptions: headlines,
    shortTileCopy: primary.bodyCopy.slice(0, 180),
    heroCopy: primary.bodyCopy,
    whyThisTrip: [adCopy.campaignName, primary.variantLabel],
    offerLines,
    ctaCopy,
    publicCopyRedFlags: voiceWarnings,
    agentOnlyNotes: [
      `Assembled from manifest ${adCopy.sourceUnifiedManifestId} + ad copy ${adCopy.id}`,
    ],
    aiTrace: adCopy.aiTrace,
  };
}

function buildAdStructure(adCopy: DealAdCopy): DealAdStructure {
  const channels: DealAdChannelPlan[] = adCopy.variants.map((v) => ({
    channel: "meta",
    primaryAngle: v.variantLabel,
    hooks: [v.headline, v.callToAction],
    proofPoints: [v.pricingDisclaimers],
    notes: [
      `promo: ${v.promoApplied}`,
      `demographic: ${v.adPlatformTargetingHooks.demographicTargeting}`,
    ],
  }));

  // Add a Google channel plan from the first variant's keywords
  const first = adCopy.variants[0];
  if (first) {
    channels.push({
      channel: "google",
      primaryAngle: first.variantLabel,
      hooks: first.adPlatformTargetingHooks.interestKeywords.slice(0, 6),
      proofPoints: [first.pricingDisclaimers],
      notes: ["Built from ad copywriter output."],
    });
  }

  return {
    dealId: "",
    packageId: "",
    generatedAtIso: adCopy.generatedAtIso,
    generator: "gpt",
    campaignThesis: adCopy.campaignName,
    channels,
    nicheKeywords: first?.adPlatformTargetingHooks.interestKeywords ?? [],
    trendKeywords: [],
    negativeKeywords: [],
    creativeHypotheses: adCopy.variants.map((v) => `${v.variantLabel}: ${v.headline}`),
    offerProofPoints: adCopy.variants.map((v) => v.pricingDisclaimers),
    aiTrace: adCopy.aiTrace,
  };
}

function buildAngleResearch(manifest: DealTripManifest): DealAngleResearch {
  return {
    dealCandidateId: manifest.id,
    generatedAtIso: manifest.generatedAtIso,
    shipAppeal: [manifest.manifestReasoning],
    amenityHighlights: [manifest.assembleDraft.shipClassHint ?? ""].filter(Boolean),
    destinationHooks: [manifest.assembleDraft.destination],
    itineraryPacingNotes: manifest.assembleDraft.portsOfCall,
    nicheAudienceAngles: [manifest.isolatedNiche, manifest.sailingAngleTitle],
    trendMatches: [],
    competitorBlindSpots: [],
    recommendedPrimaryAngle: {
      title: manifest.sailingAngleTitle,
      rationale: manifest.manifestReasoning,
      publicCopyHook: manifest.sailingAngleTitle,
      whyThisFeelsExclusive: manifest.promoStrategy,
    },
    rejectedAngles: [],
    factualGuardrails: [],
    sources: [],
  };
}

function buildTargetingDemographic(adCopy: DealAdCopy): DealTargetingDemographic {
  const first = adCopy.variants[0];
  const hooks = first?.adPlatformTargetingHooks;
  return {
    dealId: "",
    packageId: "",
    generatedAtIso: adCopy.generatedAtIso,
    primaryAudience: {
      label: adCopy.targetAudienceTag,
      description: hooks?.demographicTargeting ?? "",
      whyThisCruiseFits: adCopy.campaignName,
      emotionalDrivers: [],
      likelyObjections: [],
    },
    secondaryAudiences: [],
    nicheKeywords: {
      lifestyle: hooks?.interestKeywords ?? [],
      destination: [],
      shipExperience: [],
      amenities: [],
      eventsAndSeasonality: [],
      trendSignals: [],
      exclusionKeywords: [],
    },
    channelTargeting: {
      meta: {
        interestClusters: hooks?.interestKeywords ?? [],
        behaviorSignals: [],
        creativeHooks: adCopy.variants.map((v) => v.headline),
        audienceWarnings: adCopy.variants.flatMap((v) => v.voiceWarnings),
      },
      google: {
        searchThemes: hooks?.interestKeywords ?? [],
        keywordIdeas: hooks?.interestKeywords ?? [],
        negativeKeywords: [],
        landingPageIntentNotes: [],
      },
      tiktok: {
        creatorAngles: [],
        trendHooks: [],
        shortVideoConcepts: [],
      },
      email: {
        segmentIdeas: [],
        subjectLineAngles: adCopy.variants.map((v) => v.headline),
        personalizationNotes: [],
      },
    },
    researchSummary: {
      primaryInsight: adCopy.campaignName,
      whyNow: "",
      competitorBlindSpot: "",
      positioningStatement: adCopy.campaignName,
    },
    sources: [],
    confidence: { score: 0.75, strengths: [], risks: [], needsHumanReview: [] },
  };
}

function buildPitchBrief(adCopy: DealAdCopy): DealPitchBrief {
  const first = adCopy.variants[0];
  return {
    dealId: "",
    packageId: "",
    generatedAtIso: adCopy.generatedAtIso,
    generator: "gpt",
    tripSummary: first?.headline ?? adCopy.campaignName,
    audienceStatement: adCopy.targetAudienceTag,
    primaryHook: first?.headline ?? "",
    curatedReason: first?.variantLabel ?? "",
    sellingFacts: [
      first?.bodyCopy.slice(0, 120) ?? "",
      first?.pricingDisclaimers.slice(0, 120) ?? "",
      first?.callToAction ?? "",
    ] as [string, string, string],
    researchRationale: `Assembled from ad copy ${adCopy.id}`,
    aiTrace: adCopy.aiTrace,
  };
}

function buildMediaPlan(): DealMediaPlan {
  return {
    dealId: "",
    packageId: "",
    generatedAtIso: new Date().toISOString(),
    generator: "deterministic_scaffold",
    visualDirection: [],
    imageSlots: [],
    shortVideoConcepts: [],
    requiredSourceAssets: [],
    readiness: "waived_text_only",
  };
}

function buildPackaging(facts: CuratedDealCruiseFacts, copy: DealCopyPackage): CuratedDealPackaging {
  return {
    headline: copy.headlineOptions[0] ?? facts.title,
    shortSummary: copy.shortTileCopy ?? `${facts.nights}-night ${facts.itineraryName}`,
    highlights: copy.whyThisTrip,
    destinationNotes: facts.portsOfCall.slice(0, 4),
    bestFor: copy.offerLines.map((o) => o.text).slice(0, 4),
  };
}

function buildScoring(deal: Partial<CuratedOdysseusDeal>): CuratedDealScoring {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (deal.angleResearch) { score += 20; reasons.push("Has angle research."); }
  if (deal.targetingDemographic) { score += 20; reasons.push("Has targeting demographic."); }
  if (deal.pitchBrief) { score += 10; reasons.push("Has pitch brief."); }
  if (deal.copyPackage) { score += 20; reasons.push("Has copy package."); }
  if (deal.adStructure) { score += 10; reasons.push("Has ad structure."); }
  if (deal.mediaPlan) { score += 10; reasons.push("Has media plan."); }
  if (deal.linkHealth?.status === "valid") { score += 10; reasons.push("Link health valid."); }
  else { warnings.push(`Link health is "${deal.linkHealth?.status ?? "unknown"}".`); }

  return { score, reasons, warnings };
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
 * Assemble a CuratedOdysseusDeal from a resolved manifest + its ad copy.
 * Pure — no AI calls, no fs, no browser.
 */
export function assembleCuratedDealFromManifest(
  input: AssembleFromManifestInput
): CuratedOdysseusDeal {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const manifest = input.manifest;
  // Honor the operator's chosen final ad: promote it to the primary slot so the
  // deal-page headline/hero/pitch come from the selected variant.
  const adCopy = withSelectedVariantPrimary(input.adCopy);
  const resolved = manifest.resolvedPackage;

  if (!resolved) {
    throw new Error(
      `Manifest ${manifest.id} has no resolvedPackage. Run Step 4 · Resolve first.`
    );
  }

  const dealId = resolved.packageId;
  const packageId = resolved.packageId;
  const siid = resolved.siid;
  const briefId = manifest.assembleDraft.suggestedBriefId;

  const cruiseFacts = buildCruiseFacts(manifest);
  const copyPackage = buildCopyPackage(adCopy);
  copyPackage.dealId = dealId;
  copyPackage.packageId = packageId;

  const adStructure = buildAdStructure(adCopy);
  adStructure.dealId = dealId;
  adStructure.packageId = packageId;

  const angleResearch = buildAngleResearch(manifest);
  const targetingDemographic = buildTargetingDemographic(adCopy);
  targetingDemographic.dealId = dealId;
  targetingDemographic.packageId = packageId;

  const pitchBrief = buildPitchBrief(adCopy);
  pitchBrief.dealId = dealId;
  pitchBrief.packageId = packageId;

  const mediaPlan = buildMediaPlan();
  mediaPlan.dealId = dealId;
  mediaPlan.packageId = packageId;

  const packageMatch = {
    confidence: resolved.confidence,
    reasons: resolved.reasons,
  };

  const partial: Partial<CuratedOdysseusDeal> = {
    packageId,
    linkHealth: resolved.linkHealth ?? {
      status: "unknown",
      failureReason: "Resolved package link not yet validated.",
    },
    packageMatch,
    angleResearch,
    targetingDemographic,
    pitchBrief,
    copyPackage,
    adStructure,
    mediaPlan,
  };

  const gates = evaluateApprovalGates(partial, { textOnlyLaunchWaived: false });
  const packaging = buildPackaging(cruiseFacts, copyPackage);

  return {
    id: dealId,
    status: "needs_review",
    source: "odysseus_curated_retail",
    briefId,
    capturedAtIso: generatedAtIso,
    // Expiration is non-optional: default to exactly 90 days from assembly when the
    // manifest does not carry an operator-chosen cutoff.
    expiresOnIso: manifest.expiresOnIso?.trim() || defaultDealExpiresOnIso(generatedAtIso),
    packageId,
    siid,
    bookingUrl: resolved.bookingUrl ?? `https://bookings.cbagenttools.com/swift/cruise/package/${packageId}?siid=${siid}&lang=1`,
    bookingUrlSource: resolved.bookingUrl ? "share_button" : "constructed_package_url",
    linkHealth: partial.linkHealth!,
    packageMatch,
    cruiseFacts,
    scoring: buildScoring(partial),
    packaging,
    promoApplicability: manifest.appliedPromos,
    angleResearch,
    targetingDemographic,
    pitchBrief,
    copyPackage,
    adStructure,
    mediaPlan,
    operatorApproval: initialApprovalState(dealId, gates, generatedAtIso),
    agentOnlyNotes: copyPackage.agentOnlyNotes,
  };
}
