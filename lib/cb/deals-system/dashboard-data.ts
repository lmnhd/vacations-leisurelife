import fs from "fs/promises";

import {
  DEALS_CACHE_PATHS,
  emptyLinkBrokerCache,
} from "./caches";
import { listAllCallbackRequests } from "./callback-request-store";
import type { AgentCallbackRequest } from "./callback-request-types";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { LinkBrokerCache } from "./link-broker-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import {
  validateLinkBrokerCache,
  type ValidationResult,
} from "./validate";
import {
  evaluateApprovalGates,
  isDealHomepageEligible,
} from "./curated-deal-assembly";
import { validatePitchBriefVoice } from "./ai-generators";
import type { DealAiGenerationTrace } from "./campaign-types";
import { getSavedDiscoveryResearchStatus } from "./discovery-research-source";
import { loadDealDiscoveryIdeasCache } from "./deal-discovery-cache";
import { loadDealAdCopyCache } from "./deal-ad-copy-cache";
import { listCuratedDeals, listDealTripManifests, listPromoRecords } from "./deals-dynamo-store";
import {
  computeDealActivitySummary,
  computeDealDailyActivity,
  lastNDailyBuckets,
  listDealEvents,
  type DealDailyActivityBucket,
} from "./deal-events-store";
import type { DealTripManifest } from "./deal-trip-manifest-types";

type CacheKey = keyof typeof DEALS_CACHE_PATHS;

interface CacheRead<T> {
  key: CacheKey;
  label: string;
  path: string;
  exists: boolean;
  modifiedAtIso?: string;
  validation: ValidationResult<T>;
}

export interface DealsSystemPromoSummary {
  id: string;
  title: string;
  vendor: string;
  detailUrl: string;
  bookingWindow: string;
  sailingWindow: string;
  offerTypes: string[];
  allowedClaims: string[];
  qualifierClaims: string[];
  cautionFlags: string[];
  suggestedAngles: string[];
  extractionStatus: string;
}

export interface DealsSystemApprovalGateSummary {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  blocking: boolean;
}

/** Per-stage AI provenance, surfaced so the operator can inspect the call. */
export interface DealsSystemStageAiTrace {
  stage: "research" | "targeting" | "pitch" | "copy" | "ad_structure" | "media";
  generator: string;
  model?: string;
  latencyMs?: number;
  promptSent?: string;
  rawResponse?: string;
}

export interface DealsSystemStageReviewSummary {
  title: string;
  generator?: string;
  bullets: string[];
  details: Array<{
    label: string;
    value: string;
  }>;
}

export interface DealsSystemCuratedDealSummary {
  id: string;
  title: string;
  status: string;
  packageId: string;
  siid: string;
  cruiseLine: string;
  shipName: string;
  sailDateIso: string;
  bookingUrl: string;
  linkHealth: string;
  publishable: boolean;
  approvalStatus: string;
  hasAngleResearch: boolean;
  hasTargetingDemographic: boolean;
  hasPitchBrief: boolean;
  hasCampaignStrategy: boolean;
  campaignAngle?: string;
  targetAudience?: string;
  visualAngle?: string;
  targetingKeywords: string[];
  campaignStrategySavedAtIso?: string;
  pitchPrimaryHook?: string;
  pitchTripSummary?: string;
  pitchGenerator?: string;
  hasCopyPackage: boolean;
  hasAdStructure: boolean;
  hasMediaPlan: boolean;
  mediaReadiness: string;
  publicCopyRedFlags: string[];
  stageReviews: {
    research?: DealsSystemStageReviewSummary;
    targeting?: DealsSystemStageReviewSummary;
    pitch?: DealsSystemStageReviewSummary;
    copy?: DealsSystemStageReviewSummary;
    adStructure?: DealsSystemStageReviewSummary;
    media?: DealsSystemStageReviewSummary;
  };
  /** Customer-voice warnings on the pitch brief (analyst-voice leaks). */
  pitchVoiceWarnings: string[];
  /** AI provenance for each generated stage, for the workbench debug panels. */
  aiTraces: DealsSystemStageAiTrace[];
  approvalGates: DealsSystemApprovalGateSummary[];
  blockingGateFailures: number;
  score: number;
  warnings: string[];
  pinned: boolean;
  hidden: boolean;
  agentOnlyNotes: string[];
  promoApplicabilityIds: string[];
  /** Reach + contact-action roll-up from the deal events partition. */
  activity: DealsSystemDealActivity;
}

export interface DealsSystemDealActivity {
  totalViews: number;
  uniqueSessions: number;
  engagedViews: number;
  bookNowClicks: number;
  linkRequests: number;
  callbackRequests: number;
  totalActions: number;
  bookingPortalEntries: number;
  bookingsConfirmed: number;
  lastActivityAtIso?: string;
  /** Last 14 UTC days (today inclusive, zero-filled) for the card sparkline. */
  daily14: DealDailyActivityBucket[];
}

export interface DealsSystemLinkBrokerSummary {
  id: string;
  packageId: string;
  siid: string;
  linkClass: string;
  source: string;
  health: string;
  updatedAtIso: string;
  cruiseLabel: string;
  parameterSummary: string[];
}

export interface DealsSystemCallbackRequestSummary {
  id: string;
  status: string;
  ctaSource: string;
  createdAtIso: string;
  dealId: string;
  dealTitle: string;
  cruiseLine?: string;
  shipName?: string;
  sailDateIso?: string;
  linkHealthStatus: string;
  brokerLinkUrl?: string;
  visitor: {
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  routing: string[];
  statusHistory: Array<{
    status: string;
    changedAtIso: string;
    note?: string;
  }>;
}

/** A discovery angle as a selectable bullet on the dashboard. */
export interface DealsSystemDiscoveryAngleSummary {
  id: string;
  sailingAngleTitle: string;
  isolatedNiche: string;
  /** True when this angle already has a Step 2 manifest. */
  hasManifest: boolean;
}

/** A trip manifest as a selectable bullet on the dashboard (Step 2 result). */
export interface DealsSystemManifestSummary {
  id: string;
  sailingAngleTitle: string;
  isolatedNiche: string;
  cruiseLine: string;
  destination: string;
  /** True when this manifest already has Step 3 ad copy. */
  hasAdCopy: boolean;
}

export interface DealsSystemDiscoverySummary {
  /** Whether saved Group discovery research exists to generate ideas from. */
  hasSavedResearch: boolean;
  /** ISO date the saved research was cached, if any. */
  researchCachedAt: string | null;
  /** How many retail package ideas are currently cached. */
  ideaCount: number;
  /** How many Step 2 trip manifests are currently cached. */
  manifestCount: number;
  /** How many Step 3 ad-copy records are currently cached. */
  adCopyCount: number;
  /** The cached discovery angles, as selectable bullets (newest-cached first). */
  angles: DealsSystemDiscoveryAngleSummary[];
  /** The cached trip manifests, as selectable bullets (Step 2 results). */
  manifests: DealsSystemManifestSummary[];
}

export interface DealsSystemDashboardData {
  readAtIso: string;
  discovery: DealsSystemDiscoverySummary;
  summary: {
    promoRecords: number;
    extractedPromos: number;
    curatedDeals: number;
    publishableDeals: number;
    linkBrokerRecords: number;
    validLinks: number;
    callbackRequests: number;
  };
  caches: Array<{
    key: string;
    label: string;
    path?: string;
    exists?: boolean;
    modifiedAtIso?: string;
    ok: boolean;
    errors: string[];
  }>;
  promoRecords: DealsSystemPromoSummary[];
  /** Lightweight {id,title} list for attaching promos in the assembly form. */
  promoOptions: Array<{ id: string; title: string; vendor: string; applicableMarkets: string[] }>;
  curatedDeals: DealsSystemCuratedDealSummary[];
  linkBrokerRecords: DealsSystemLinkBrokerSummary[];
  callbackRequests: DealsSystemCallbackRequestSummary[];
  nextActions: string[];
}

function formatWindow(value: { startsOn?: string; endsOn?: string; rawText: string }): string {
  if (value.startsOn || value.endsOn) {
    return `${value.startsOn ?? "?"} to ${value.endsOn ?? "?"}`;
  }
  return value.rawText || "Not captured";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readCache<T>(
  key: CacheKey,
  label: string,
  fallback: T,
  validate: (value: unknown) => ValidationResult<T>
): Promise<CacheRead<T>> {
  const path = DEALS_CACHE_PATHS[key];
  try {
    const [raw, stat] = await Promise.all([fs.readFile(path, "utf8"), fs.stat(path)]);
    const parsed = JSON.parse(raw) as unknown;
    return {
      key,
      label,
      path,
      exists: true,
      modifiedAtIso: stat.mtime.toISOString(),
      validation: validate(parsed),
    };
  } catch (error) {
    const enoent = error instanceof Error && "code" in error && error.code === "ENOENT";
    return {
      key,
      label,
      path,
      exists: false,
      validation: {
        ok: enoent,
        value: enoent ? fallback : undefined,
        errors: enoent ? [] : [errorMessage(error)],
      },
    };
  }
}

function cacheValue<T>(cache: CacheRead<T>, fallback: T): T {
  return cache.validation.value ?? fallback;
}

function summarizePromo(record: CbPromoIntelligenceRecord): DealsSystemPromoSummary {
  return {
    id: record.id,
    title: record.title,
    vendor: record.vendor,
    detailUrl: record.detailUrl,
    bookingWindow: formatWindow(record.bookingWindow),
    sailingWindow: formatWindow(record.sailingWindow),
    offerTypes: record.extracted.offerTypes,
    allowedClaims: record.marketingUse.publicClaimsAllowed.slice(0, 4),
    qualifierClaims: record.marketingUse.publicClaimsNeedsQualifier.slice(0, 3),
    cautionFlags: record.marketingUse.cautionFlags,
    suggestedAngles: record.marketingUse.suggestedAngles.slice(0, 4),
    extractionStatus: record.diagnostics.status,
  };
}

function traceSummary(
  stage: DealsSystemStageAiTrace["stage"],
  generator: string | undefined,
  trace: DealAiGenerationTrace | undefined
): DealsSystemStageAiTrace | undefined {
  if (!generator) return undefined;
  return {
    stage,
    generator,
    model: trace?.model,
    latencyMs: trace?.latencyMs,
    promptSent: trace?.promptSent,
    rawResponse: trace?.rawResponse,
  };
}

function joinList(values: string[] | undefined): string {
  return (values ?? []).filter(Boolean).join(", ");
}

function stageReviewSummaries(deal: CuratedOdysseusDeal): DealsSystemCuratedDealSummary["stageReviews"] {
  const research = deal.angleResearch
    ? {
        title: deal.angleResearch.recommendedPrimaryAngle.title,
        generator: deal.angleResearch.generator ?? "deterministic_scaffold",
        bullets: [
          deal.angleResearch.recommendedPrimaryAngle.publicCopyHook,
          deal.angleResearch.recommendedPrimaryAngle.whyThisFeelsExclusive,
          ...deal.angleResearch.destinationHooks.slice(0, 3),
        ].filter(Boolean),
        details: [
          { label: "Rationale", value: deal.angleResearch.recommendedPrimaryAngle.rationale },
          { label: "Audience angles", value: joinList(deal.angleResearch.nicheAudienceAngles.slice(0, 5)) },
          { label: "Guardrails", value: joinList(deal.angleResearch.factualGuardrails.slice(0, 4)) },
        ].filter((item) => item.value),
      }
    : undefined;

  const targeting = deal.targetingDemographic
    ? {
        title: deal.targetingDemographic.primaryAudience.label,
        generator: deal.targetingDemographic.generator ?? "deterministic_scaffold",
        bullets: [
          deal.targetingDemographic.primaryAudience.description,
          deal.targetingDemographic.primaryAudience.whyThisCruiseFits,
          ...deal.targetingDemographic.primaryAudience.emotionalDrivers.slice(0, 3),
        ].filter(Boolean),
        details: [
          { label: "Meta interests", value: joinList(deal.targetingDemographic.channelTargeting.meta.interestClusters.slice(0, 6)) },
          { label: "Google themes", value: joinList(deal.targetingDemographic.channelTargeting.google.searchThemes.slice(0, 6)) },
          { label: "Risks", value: joinList(deal.targetingDemographic.confidence.risks.slice(0, 4)) },
        ].filter((item) => item.value),
      }
    : undefined;

  const pitch = deal.pitchBrief
    ? {
        title: deal.pitchBrief.primaryHook,
        generator: deal.pitchBrief.generator,
        bullets: [
          deal.pitchBrief.tripSummary,
          deal.pitchBrief.audienceStatement,
          deal.pitchBrief.curatedReason,
          ...deal.pitchBrief.sellingFacts,
        ].filter(Boolean),
        details: [
          { label: "Internal rationale", value: deal.pitchBrief.researchRationale },
        ].filter((item) => item.value),
      }
    : undefined;

  const copy = deal.copyPackage
    ? {
        title: deal.copyPackage.shortTileCopy,
        generator: deal.copyPackage.generator,
        bullets: [
          ...deal.copyPackage.headlineOptions.slice(0, 3),
          deal.copyPackage.heroCopy,
          ...deal.copyPackage.whyThisTrip.slice(0, 3),
        ].filter(Boolean),
        details: [
          { label: "Offer lines", value: joinList(deal.copyPackage.offerLines.map((line) => line.text).slice(0, 4)) },
          { label: "CTA labels", value: joinList(deal.copyPackage.ctaCopy.map((cta) => cta.label)) },
          { label: "Red flags", value: joinList(deal.copyPackage.publicCopyRedFlags) },
        ].filter((item) => item.value),
      }
    : undefined;

  const adStructure = deal.adStructure
    ? {
        title: deal.adStructure.campaignThesis,
        generator: deal.adStructure.generator,
        bullets: [
          ...deal.adStructure.creativeHypotheses.slice(0, 3),
          ...deal.adStructure.channels.map((channel) => `${channel.channel}: ${channel.primaryAngle}`).slice(0, 4),
        ].filter(Boolean),
        details: [
          { label: "Niche keywords", value: joinList(deal.adStructure.nicheKeywords.slice(0, 8)) },
          { label: "Offer proof", value: joinList(deal.adStructure.offerProofPoints.slice(0, 4)) },
          { label: "Negative keywords", value: joinList(deal.adStructure.negativeKeywords.slice(0, 6)) },
        ].filter((item) => item.value),
      }
    : undefined;

  const media = deal.mediaPlan
    ? {
        title: `Media readiness: ${deal.mediaPlan.readiness}`,
        generator: deal.mediaPlan.generator,
        bullets: [
          ...deal.mediaPlan.visualDirection.slice(0, 4),
          ...deal.mediaPlan.shortVideoConcepts.map((concept) => `${concept.concept}: ${concept.hook}`).slice(0, 3),
        ].filter(Boolean),
        details: [
          { label: "Image slots", value: joinList(deal.mediaPlan.imageSlots.map((slot) => `${slot.slot}: ${slot.purpose}`)) },
          { label: "Required assets", value: joinList(deal.mediaPlan.requiredSourceAssets.slice(0, 8)) },
        ].filter((item) => item.value),
      }
    : undefined;

  return { research, targeting, pitch, copy, adStructure, media };
}

const EMPTY_DEAL_ACTIVITY: DealsSystemDealActivity = {
  daily14: [],
  totalViews: 0,
  uniqueSessions: 0,
  engagedViews: 0,
  bookNowClicks: 0,
  linkRequests: 0,
  callbackRequests: 0,
  totalActions: 0,
  bookingPortalEntries: 0,
  bookingsConfirmed: 0,
};

function summarizeDeal(
  deal: CuratedOdysseusDeal,
  activity: DealsSystemDealActivity = EMPTY_DEAL_ACTIVITY
): DealsSystemCuratedDealSummary {
  const gates =
    deal.operatorApproval?.gates ??
    evaluateApprovalGates(deal, {
      textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived,
    });
  const aiTraces = [
    traceSummary("research", deal.angleResearch?.generator, deal.angleResearch?.aiTrace),
    traceSummary("targeting", deal.targetingDemographic?.generator, deal.targetingDemographic?.aiTrace),
    traceSummary("pitch", deal.pitchBrief?.generator, deal.pitchBrief?.aiTrace),
    traceSummary("copy", deal.copyPackage?.generator, deal.copyPackage?.aiTrace),
    traceSummary("ad_structure", deal.adStructure?.generator, deal.adStructure?.aiTrace),
    traceSummary("media", deal.mediaPlan?.generator, deal.mediaPlan?.aiTrace),
  ].filter((t): t is DealsSystemStageAiTrace => Boolean(t));
  return {
    id: deal.id,
    title: deal.packaging.headline || deal.cruiseFacts.title,
    status: deal.status,
    packageId: deal.packageId,
    siid: deal.siid,
    cruiseLine: deal.cruiseFacts.cruiseLine,
    shipName: deal.cruiseFacts.shipName,
    sailDateIso: deal.cruiseFacts.sailDateIso,
    bookingUrl: deal.bookingUrl,
    linkHealth: deal.linkHealth.status,
    publishable: isDealHomepageEligible(deal),
    approvalStatus: deal.operatorApproval?.status ?? "none",
    hasAngleResearch: Boolean(deal.angleResearch),
    hasTargetingDemographic: Boolean(deal.targetingDemographic),
    hasPitchBrief: Boolean(deal.pitchBrief),
    hasCampaignStrategy: Boolean(deal.campaignStrategy),
    campaignAngle: deal.campaignStrategy?.campaignAngle,
    targetAudience: deal.campaignStrategy?.targetAudience,
    visualAngle: deal.campaignStrategy?.visualAngle,
    targetingKeywords: deal.campaignStrategy?.targetingKeywords ?? [],
    campaignStrategySavedAtIso: deal.campaignStrategy?.savedAtIso,
    pitchPrimaryHook: deal.pitchBrief?.primaryHook,
    pitchTripSummary: deal.pitchBrief?.tripSummary,
    pitchGenerator: deal.pitchBrief?.generator,
    hasCopyPackage: Boolean(deal.copyPackage),
    hasAdStructure: Boolean(deal.adStructure),
    hasMediaPlan: Boolean(deal.mediaPlan),
    mediaReadiness: deal.mediaPlan?.readiness ?? "not_started",
    publicCopyRedFlags: deal.copyPackage?.publicCopyRedFlags ?? [],
    stageReviews: stageReviewSummaries(deal),
    pitchVoiceWarnings: deal.pitchBrief ? validatePitchBriefVoice(deal.pitchBrief) : [],
    aiTraces,
    approvalGates: gates.map((gate) => ({
      id: gate.id,
      label: gate.label,
      passed: gate.passed,
      detail: gate.detail,
      blocking: gate.blocking,
    })),
    blockingGateFailures: gates.filter((gate) => gate.blocking && !gate.passed).length,
    score: deal.scoring.score,
    warnings: [...deal.scoring.warnings, deal.linkHealth.failureReason].filter(
      (value): value is string => Boolean(value)
    ),
    pinned: Boolean(deal.operatorVisibility?.pinned),
    hidden: Boolean(deal.operatorVisibility?.hidden),
    agentOnlyNotes: deal.agentOnlyNotes ?? [],
    promoApplicabilityIds: (deal.promoApplicability ?? []).map((promo) => promo.promoRecordId),
    activity,
  };
}

function summarizeLinkBroker(cache: LinkBrokerCache): DealsSystemLinkBrokerSummary[] {
  return cache.records.map((record) => {
    const fingerprint = record.cruiseFingerprint;
    const cruiseLabel = [
      fingerprint?.cruiseLine,
      fingerprint?.shipName,
      fingerprint?.itineraryName,
      fingerprint?.sailDateIso,
    ]
      .filter(Boolean)
      .join(" | ");
    const params = record.parameterSummary;
    return {
      id: record.id,
      packageId: record.packageId,
      siid: record.siid,
      linkClass: record.linkClass,
      source: record.source,
      health: record.health.status,
      updatedAtIso: record.updatedAtIso,
      cruiseLabel: cruiseLabel || "Package facts not captured",
      parameterSummary: [
        params.passengerCount ? `${params.passengerCount} passenger(s)` : undefined,
        params.ageCount ? `${params.ageCount} age value(s)` : undefined,
        params.state ? `state ${params.state}` : undefined,
        params.airportCode ? `airport ${params.airportCode}` : undefined,
        params.officeId ? `office ${params.officeId}` : undefined,
        params.hasPhone ? "phone included" : undefined,
        params.hasCloneBookingToken ? "clone token captured" : undefined,
        params.hasBookingReference ? "booking reference captured" : undefined,
      ].filter((value): value is string => Boolean(value)),
    };
  });
}

function summarizeCallbacks(
  requests: AgentCallbackRequest[]
): DealsSystemCallbackRequestSummary[] {
  return requests.map((request) => ({
    id: request.id,
    status: request.status,
    ctaSource: request.ctaSource,
    createdAtIso: request.createdAtIso,
    dealId: request.deal.dealId,
    dealTitle: request.deal.dealTitle,
    cruiseLine: request.deal.cruiseLine,
    shipName: request.deal.shipName,
    sailDateIso: request.deal.sailDateIso,
    linkHealthStatus: request.linkHealthStatus ?? "unknown",
    brokerLinkUrl: request.brokerLinkUrl,
    visitor: { ...request.visitor },
    routing: [
      request.routing.emailNotified ? "email" : undefined,
      request.routing.dashboardQueued ? "dashboard" : undefined,
    ].filter((value): value is string => Boolean(value)),
    statusHistory: request.statusHistory.map((entry) => ({ ...entry })),
  }));
}

export async function getDealsSystemDashboardData(): Promise<DealsSystemDashboardData> {
  const [linkRead, callbackRequests, promoRecords, curatedDeals] = await Promise.all([
    readCache("linkBroker", "Link Broker", emptyLinkBrokerCache(), validateLinkBrokerCache),
    listAllCallbackRequests().catch(() => [] as AgentCallbackRequest[]),
    listPromoRecords().catch(() => []),
    listCuratedDeals().catch(() => []),
  ]);

  const linkCache = cacheValue(linkRead, emptyLinkBrokerCache());
  const publishableDeals = curatedDeals.filter(isDealHomepageEligible);
  const extractedPromos = promoRecords.filter(
    (record) => record.diagnostics.status === "succeeded"
  ).length;

  const researchStatus = getSavedDiscoveryResearchStatus();
  let discoveryIdeas: ReturnType<typeof loadDealDiscoveryIdeasCache>["ideas"] = [];
  try {
    discoveryIdeas = loadDealDiscoveryIdeasCache().ideas;
  } catch {
    discoveryIdeas = [];
  }
  let manifests: DealTripManifest[] = [];
  try {
    manifests = await listDealTripManifests();
  } catch {
    manifests = [];
  }
  const manifestedAngleIds = new Set(manifests.map((m) => m.sourceAngleId));

  let adCopies: ReturnType<typeof loadDealAdCopyCache>["adCopies"] = [];
  try {
    adCopies = loadDealAdCopyCache().adCopies;
  } catch {
    adCopies = [];
  }
  // Ad copy points at the unified manifest id, which is `unified-<tripManifestId>`.
  const adCopiedManifestIds = new Set(
    adCopies.map((a) => a.sourceUnifiedManifestId.replace(/^unified-/, ""))
  );

  // Per-deal activity roll-up (reach + contact actions) from the events store.
  const dealActivityById = new Map<string, DealsSystemDealActivity>();
  await Promise.all(
    curatedDeals.map(async (deal) => {
      const events = await listDealEvents(deal.id);
      const s = computeDealActivitySummary(deal.id, events);
      dealActivityById.set(deal.id, {
        daily14: lastNDailyBuckets(computeDealDailyActivity(events), 14),
        totalViews: s.totalViews,
        uniqueSessions: s.uniqueSessions,
        engagedViews: s.engagedViews,
        bookNowClicks: s.bookNowClicks,
        linkRequests: s.linkRequests,
        callbackRequests: s.callbackRequests,
        totalActions: s.totalActions,
        bookingPortalEntries: s.bookingPortalEntries,
        bookingsConfirmed: s.bookingsConfirmed,
        lastActivityAtIso: s.lastActivityAtIso,
      });
    })
  );

  return {
    readAtIso: new Date().toISOString(),
    discovery: {
      hasSavedResearch: researchStatus.hasResearch,
      researchCachedAt: researchStatus.cachedAt,
      ideaCount: discoveryIdeas.length,
      manifestCount: manifests.length,
      adCopyCount: adCopies.length,
      angles: discoveryIdeas.map((idea) => ({
        id: idea.id,
        sailingAngleTitle: idea.sailingAngleProfile.sailingAngleTitle,
        isolatedNiche: idea.isolatedNiche,
        hasManifest: manifestedAngleIds.has(idea.id),
      })),
      manifests: manifests.map((m) => ({
        id: m.id,
        sailingAngleTitle: m.sailingAngleTitle,
        isolatedNiche: m.isolatedNiche,
        cruiseLine: m.assembleDraft.cruiseLine,
        destination: m.assembleDraft.destination,
        hasAdCopy: adCopiedManifestIds.has(m.id),
      })),
    },
    summary: {
      promoRecords: promoRecords.length,
      extractedPromos,
      curatedDeals: curatedDeals.length,
      publishableDeals: publishableDeals.length,
      linkBrokerRecords: linkCache.records.length,
      validLinks: linkCache.records.filter((record) => record.health.status === "valid").length,
      callbackRequests: callbackRequests.length,
    },
    caches: [
      {
        key: "promoRecords",
        label: "Promo Intelligence Records",
        ok: true,
        errors: [],
      },
      {
        key: "curatedDeals",
        label: "Curated Deals",
        ok: true,
        errors: [],
      },
      {
        key: linkRead.key,
        label: linkRead.label,
        path: linkRead.path,
        exists: linkRead.exists,
        modifiedAtIso: linkRead.modifiedAtIso,
        ok: linkRead.validation.ok,
        errors: linkRead.validation.errors,
      },
      {
        key: "callbackRequests",
        label: "Agent Callback Requests",
        ok: true,
        errors: [],
      },
    ],
    promoRecords: promoRecords.map(summarizePromo),
    promoOptions: promoRecords.map((record) => ({
      id: record.id,
      title: record.title,
      vendor: record.vendor,
      applicableMarkets: record.extracted.applicableMarkets,
    })),
    curatedDeals: curatedDeals.map((deal) =>
      summarizeDeal(deal, dealActivityById.get(deal.id) ?? EMPTY_DEAL_ACTIVITY)
    ),
    linkBrokerRecords: summarizeLinkBroker(linkCache),
    callbackRequests: summarizeCallbacks(callbackRequests),
    nextActions: [
      "Assemble real Curated Deals from package lookup + Link Broker output + promo applicability.",
      "Attach package-specific Trip Research and Targeting-Demographic resources.",
      "Validate Link Broker health before any Deal can publish to the homepage.",
      "Configure a Klaviyo flow for the \"LLL Deal Link Requested\" metric so email-link delivery is observable end-to-end.",
    ],
  };
}


