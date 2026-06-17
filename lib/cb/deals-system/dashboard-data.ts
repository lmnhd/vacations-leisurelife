import fs from "fs/promises";

import {
  DEALS_CACHE_PATHS,
  emptyCallbackRequestsCache,
  emptyLinkBrokerCache,
} from "./caches";
import type { AgentCallbackRequestsCache } from "./callback-request-types";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { LinkBrokerCache } from "./link-broker-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import {
  validateCallbackRequestsCache,
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

export interface DealsSystemPhaseStatus {
  phase: string;
  name: string;
  status: "complete" | "foundation" | "pending" | "blocked";
  evidence: string;
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
  pitchPrimaryHook?: string;
  pitchTripSummary?: string;
  pitchGenerator?: string;
  hasCopyPackage: boolean;
  hasAdStructure: boolean;
  hasMediaPlan: boolean;
  mediaReadiness: string;
  publicCopyRedFlags: string[];
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
  phases: DealsSystemPhaseStatus[];
  promoRecords: DealsSystemPromoSummary[];
  /** Lightweight {id,title} list for attaching promos in the assembly form. */
  promoOptions: Array<{ id: string; title: string; vendor: string }>;
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

function summarizeDeal(deal: CuratedOdysseusDeal): DealsSystemCuratedDealSummary {
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
    pitchPrimaryHook: deal.pitchBrief?.primaryHook,
    pitchTripSummary: deal.pitchBrief?.tripSummary,
    pitchGenerator: deal.pitchBrief?.generator,
    hasCopyPackage: Boolean(deal.copyPackage),
    hasAdStructure: Boolean(deal.adStructure),
    hasMediaPlan: Boolean(deal.mediaPlan),
    mediaReadiness: deal.mediaPlan?.readiness ?? "not_started",
    publicCopyRedFlags: deal.copyPackage?.publicCopyRedFlags ?? [],
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
  cache: AgentCallbackRequestsCache
): DealsSystemCallbackRequestSummary[] {
  return cache.requests.map((request) => ({
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
      request.routing.crispNotified ? "crisp" : undefined,
    ].filter((value): value is string => Boolean(value)),
    statusHistory: request.statusHistory.map((entry) => ({ ...entry })),
  }));
}

function buildPhases(
  promoRecords: CbPromoIntelligenceRecord[],
  curatedDeals: CuratedOdysseusDeal[],
  linkCache: LinkBrokerCache,
  callbackCache: AgentCallbackRequestsCache
): DealsSystemPhaseStatus[] {
  const publishableDeals = curatedDeals.filter(isDealHomepageEligible).length;
  const dealsInDevelopment = curatedDeals.filter(
    (deal) => deal.copyPackage || deal.adStructure || deal.mediaPlan
  ).length;
  const validLinks = linkCache.records.filter((record) => record.health.status === "valid").length;
  const extractionSucceeded = promoRecords.filter(
    (record) => record.diagnostics.status === "succeeded"
  ).length;
  return [
    {
      phase: "0-1",
      name: "Guardrails and schemas",
      status: "complete",
      evidence:
        "Cache contracts and validators are available for promo, curated deal, Link Broker, and callback resources.",
    },
    {
      phase: "2-3",
      name: "Link Broker backbone",
      status: linkCache.records.length > 0 ? "complete" : "pending",
      evidence: `${linkCache.records.length} cached link record(s), ${validLinks} currently valid.`,
    },
    {
      phase: "4-5",
      name: "Promo intelligence",
      status: promoRecords.length > 0 ? "complete" : "pending",
      evidence: `${promoRecords.length} promo record(s), ${extractionSucceeded} extracted successfully.`,
    },
    {
      phase: "5A",
      name: "Retail discovery adapter",
      status: "foundation",
      evidence:
        "Group Discovery research can be adapted into retail Deal angle inputs without creating Group campaigns.",
    },
    {
      phase: "6",
      name: "Package lookup",
      status: linkCache.records.length > 0 ? "foundation" : "pending",
      evidence:
        "Lookup outputs can now feed Link Broker records; live operator runs still determine current CB/Odysseus state.",
    },
    {
      phase: "7-8",
      name: "Trip research and targeting",
      status: curatedDeals.some((deal) => deal.angleResearch || deal.targetingDemographic)
        ? "complete"
        : "foundation",
      evidence:
        "Research and Targeting-Demographic contracts exist; curated package resources are not yet attached to real Deals.",
    },
    {
      phase: "9",
      name: "Curated Deal assembly",
      status:
        publishableDeals > 0 ? "complete" : dealsInDevelopment > 0 ? "foundation" : "pending",
      evidence: `${dealsInDevelopment} Deal(s) in development, ${publishableDeals} publishable. A Deal must be bookable, link-valid, AND operator-approved before homepage use.`,
    },
    {
      phase: "9A",
      name: "Campaign workbench",
      status: dealsInDevelopment > 0 ? "complete" : "foundation",
      evidence:
        "Research, copy, ad structure, media plan, and the operator approval gate run as independent, rerunnable stages in this workbench.",
    },
    {
      phase: "10",
      name: "Homepage Deals integration",
      status: publishableDeals > 0 ? "foundation" : "blocked",
      evidence:
        publishableDeals > 0
          ? "Publishable Deals exist for rendering work."
          : "Blocked by publishing gate: no bookable Deal with valid link health yet.",
    },
    {
      phase: "13",
      name: "CTA operations",
      status: callbackCache.requests.length > 0 ? "complete" : "foundation",
      evidence:
        callbackCache.requests.length > 0
          ? `${callbackCache.requests.length} callback request(s) currently cached. The operator workbench shows visitor contact info and supports marking requests contacted/closed.`
          : "Book now, Email me the booking link, and Request an agent callback are wired up. No callback requests have arrived yet.",
    },
  ];
}

export async function getDealsSystemDashboardData(): Promise<DealsSystemDashboardData> {
  const [linkRead, callbackRead, promoRecords, curatedDeals] = await Promise.all([
    readCache("linkBroker", "Link Broker", emptyLinkBrokerCache(), validateLinkBrokerCache),
    readCache(
      "callbackRequests",
      "Agent Callback Requests",
      emptyCallbackRequestsCache(),
      validateCallbackRequestsCache
    ),
    listPromoRecords().catch(() => []),
    listCuratedDeals().catch(() => []),
  ]);

  const linkCache = cacheValue(linkRead, emptyLinkBrokerCache());
  const callbackCache = cacheValue(callbackRead, emptyCallbackRequestsCache());
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
      callbackRequests: callbackCache.requests.length,
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
        key: callbackRead.key,
        label: callbackRead.label,
        path: callbackRead.path,
        exists: callbackRead.exists,
        modifiedAtIso: callbackRead.modifiedAtIso,
        ok: callbackRead.validation.ok,
        errors: callbackRead.validation.errors,
      },
    ],
    phases: buildPhases(promoRecords, curatedDeals, linkCache, callbackCache),
    promoRecords: promoRecords.map(summarizePromo),
    promoOptions: promoRecords.map((record) => ({
      id: record.id,
      title: record.title,
      vendor: record.vendor,
    })),
    curatedDeals: curatedDeals.map(summarizeDeal),
    linkBrokerRecords: summarizeLinkBroker(linkCache),
    callbackRequests: summarizeCallbacks(callbackCache),
    nextActions: [
      "Assemble real Curated Deals from package lookup + Link Broker output + promo applicability.",
      "Attach package-specific Trip Research and Targeting-Demographic resources.",
      "Validate Link Broker health before any Deal can publish to the homepage.",
      "Configure a Klaviyo flow for the \"LLL Deal Link Requested\" metric so email-link delivery is observable end-to-end.",
    ],
  };
}
