/**
 * Lightweight runtime validators for Deals System cache payloads.
 *
 * Dependency-free structural checks (no zod) so they can run in scripts, the
 * Next runtime, and the Phase 1 test alike. Each validator returns the parsed,
 * typed payload or a list of human-readable errors — it does not throw.
 */

import type { CbPromoIntelligenceCache } from "./promo-intelligence-types";
import type { CuratedOdysseusDealsCache, CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealDiscoveryIdeasCache, DealDiscoveryIdea } from "./deal-discovery-types";
import type { DealTripManifestsCache, DealTripManifest } from "./deal-trip-manifest-types";
import type { DealUnifiedManifestsCache, DealUnifiedManifest } from "./deal-unified-manifest-types";
import type { DealAdCopyCache, DealAdCopy } from "./deal-ad-copy-types";
import type { DealFunnelSynthesisCache, DealFunnelSynthesis } from "./deal-page-design-types";
import type { DealMetaAdSynthesisCache, DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import { isDealMetaAdStylePresetId } from "./deal-meta-ad-style-presets";
import type { DealMetaDistributionCache, DealMetaDistribution } from "./deal-meta-distribution-types";
import type { DealGoogleAdsSynthesisCache, DealGoogleAdsSynthesis } from "./deal-google-ads-synthesis-types";
import type {
  DealGoogleAdsDistributionCache,
  DealGoogleAdsDistribution,
} from "./deal-google-ads-distribution-types";
import type { LinkBrokerCache, LinkBrokerRecord } from "./link-broker-types";
import type { AgentCallbackRequestsCache } from "./callback-request-types";

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function checkBase(
  value: unknown,
  expectedArrayKey: string,
  errors: string[]
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push("payload is not an object");
    return false;
  }
  if (value.version !== 1) {
    errors.push(`version must be 1, got ${String(value.version)}`);
  }
  if (!isIsoDate(value.generatedAtIso)) {
    errors.push("generatedAtIso must be an ISO date string");
  }
  if (!Array.isArray(value[expectedArrayKey])) {
    errors.push(`${expectedArrayKey} must be an array`);
  }
  return true;
}

export function validatePromoIntelligenceCache(
  value: unknown
): ValidationResult<CbPromoIntelligenceCache> {
  const errors: string[] = [];
  if (!checkBase(value, "records", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (v.sourceUrl !== "https://www.cbagenttools.com/marketing/todaysview/") {
    errors.push("sourceUrl must be the CB Today's View URL");
  }
  if (!isRecord(v.diagnostics)) {
    errors.push("diagnostics must be an object");
  }
  if (Array.isArray(v.records)) {
    v.records.forEach((rec, i) => {
      if (!isRecord(rec)) {
        errors.push(`records[${i}] is not an object`);
        return;
      }
      if (typeof rec.id !== "string" || !rec.id) errors.push(`records[${i}].id missing`);
      if (rec.source !== "cb_agent_tools_todays_view") {
        errors.push(`records[${i}].source must be cb_agent_tools_todays_view`);
      }
      if (typeof rec.title !== "string") errors.push(`records[${i}].title missing`);
      if (!isRecord(rec.extracted)) errors.push(`records[${i}].extracted missing`);
      if (!isRecord(rec.marketingUse)) errors.push(`records[${i}].marketingUse missing`);
    });
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as CbPromoIntelligenceCache, errors }
    : { ok: false, errors };
}

function validateCuratedDeal(deal: unknown, i: number, errors: string[]): void {
  if (!isRecord(deal)) {
    errors.push(`deals[${i}] is not an object`);
    return;
  }
  const d = deal as Partial<CuratedOdysseusDeal>;
  if (typeof d.id !== "string" || !d.id) errors.push(`deals[${i}].id missing`);
  if (!["bookable", "needs_review", "expired"].includes(String(d.status))) {
    errors.push(`deals[${i}].status invalid: ${String(d.status)}`);
  }
  if (d.source !== "odysseus_curated_retail") {
    errors.push(`deals[${i}].source must be odysseus_curated_retail`);
  }
  if (typeof d.packageId !== "string") errors.push(`deals[${i}].packageId missing`);
  if (typeof d.siid !== "string") errors.push(`deals[${i}].siid missing`);
  if (typeof d.bookingUrl !== "string") errors.push(`deals[${i}].bookingUrl missing`);
  if (!isRecord(d.linkHealth)) errors.push(`deals[${i}].linkHealth missing`);

  // Publishing gate (baseline rule 2): a "bookable" deal must carry valid link health.
  if (d.status === "bookable" && isRecord(d.linkHealth) && d.linkHealth.status !== "valid") {
    errors.push(
      `deals[${i}] is "bookable" but linkHealth.status is "${String(
        d.linkHealth.status
      )}" — only valid link health may publish`
    );
  }

  // Approval gate (Phase 9A): a "bookable" deal must also be operator-approved.
  // A valid booking link alone is never enough to publish.
  if (d.status === "bookable") {
    const approval = d.operatorApproval;
    if (!isRecord(approval) || approval.status !== "approved") {
      errors.push(
        `deals[${i}] is "bookable" but operatorApproval.status is "${String(
          isRecord(approval) ? approval.status : "missing"
        )}" — only operator-approved Deals may publish`
      );
    }
  }
}

export function validateCuratedDealsCache(
  value: unknown
): ValidationResult<CuratedOdysseusDealsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "deals", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.briefs)) errors.push("briefs must be an array");
  if (Array.isArray(v.deals)) {
    v.deals.forEach((deal, i) => validateCuratedDeal(deal, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as CuratedOdysseusDealsCache, errors }
    : { ok: false, errors };
}

function validateLinkBrokerRecord(rec: unknown, i: number, errors: string[]): void {
  if (!isRecord(rec)) {
    errors.push(`records[${i}] is not an object`);
    return;
  }
  const r = rec as Partial<LinkBrokerRecord>;
  if (typeof r.id !== "string" || !r.id) errors.push(`records[${i}].id missing`);
  if (typeof r.packageId !== "string") errors.push(`records[${i}].packageId missing`);
  if (typeof r.siid !== "string") errors.push(`records[${i}].siid missing`);
  const classes = ["package_entry", "prepared_details", "captured_clone", "captured_cabin"];
  if (!classes.includes(String(r.linkClass))) {
    errors.push(`records[${i}].linkClass invalid: ${String(r.linkClass)}`);
  }
  if (typeof r.url !== "string") errors.push(`records[${i}].url missing`);
  if (!isRecord(r.health)) errors.push(`records[${i}].health missing`);
  if (!isRecord(r.parameterSummary)) {
    errors.push(`records[${i}].parameterSummary missing`);
  }
  // Portal-generated tokens must never be claimed for a synthesized class.
  const summary = r.parameterSummary;
  if (isRecord(summary)) {
    if (summary.hasCloneBookingToken === true && r.linkClass !== "captured_clone") {
      errors.push(
        `records[${i}] carries a clone booking token but is not captured_clone`
      );
    }
    if (summary.hasBookingReference === true && r.linkClass !== "captured_cabin") {
      errors.push(
        `records[${i}] carries a booking reference but is not captured_cabin`
      );
    }
  }
}

export function validateLinkBrokerCache(
  value: unknown
): ValidationResult<LinkBrokerCache> {
  const errors: string[] = [];
  if (!checkBase(value, "records", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.records)) {
    v.records.forEach((rec, i) => validateLinkBrokerRecord(rec, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as LinkBrokerCache, errors }
    : { ok: false, errors };
}

export function validateCallbackRequestsCache(
  value: unknown
): ValidationResult<AgentCallbackRequestsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "requests", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.requests)) {
    v.requests.forEach((req, i) => {
      if (!isRecord(req)) {
        errors.push(`requests[${i}] is not an object`);
        return;
      }
      if (typeof req.id !== "string" || !req.id) errors.push(`requests[${i}].id missing`);
      if (!["new", "assigned", "contacted", "closed"].includes(String(req.status))) {
        errors.push(`requests[${i}].status invalid: ${String(req.status)}`);
      }
      if (!isRecord(req.visitor)) errors.push(`requests[${i}].visitor missing`);
      if (!isRecord(req.deal)) errors.push(`requests[${i}].deal missing`);
    });
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as AgentCallbackRequestsCache, errors }
    : { ok: false, errors };
}

function validateDealDiscoveryIdea(idea: unknown, i: number, errors: string[]): void {
  if (!isRecord(idea)) {
    errors.push(`ideas[${i}] is not an object`);
    return;
  }
  const x = idea as Partial<DealDiscoveryIdea>;
  if (typeof x.id !== "string" || !x.id) errors.push(`ideas[${i}].id missing`);
  if (x.generator !== "gpt") errors.push(`ideas[${i}].generator must be "gpt"`);
  if (!isIsoDate(x.generatedAtIso)) errors.push(`ideas[${i}].generatedAtIso must be an ISO date`);
  if (typeof x.isolatedNiche !== "string" || !x.isolatedNiche) {
    errors.push(`ideas[${i}].isolatedNiche missing`);
  }
  if (x.researchRationale !== undefined && typeof x.researchRationale !== "string") {
    errors.push(`ideas[${i}].researchRationale must be a string when present`);
  }
  if (x.successLogic !== undefined && typeof x.successLogic !== "string") {
    errors.push(`ideas[${i}].successLogic must be a string when present`);
  }
  if (x.audienceSignals !== undefined && (!Array.isArray(x.audienceSignals) || x.audienceSignals.length === 0)) {
    errors.push(`ideas[${i}].audienceSignals must be a non-empty array when present`);
  }
  if (!isRecord(x.sailingAngleProfile)) {
    errors.push(`ideas[${i}].sailingAngleProfile missing`);
    return;
  }
  const p = x.sailingAngleProfile as Record<string, unknown>;
  for (const key of [
    "sailingAngleTitle",
    "theCorePitch",
    "visualAnchor",
    "targetAudienceDescriptor",
    "destinationAndTimeOfYearHints",
    "onboardAssetRequirements",
  ]) {
    if (typeof p[key] !== "string" || !(p[key] as string)) {
      errors.push(`ideas[${i}].sailingAngleProfile.${key} missing`);
    }
  }
  if (!Array.isArray(p.relevantKeywords) || p.relevantKeywords.length === 0) {
    errors.push(`ideas[${i}].sailingAngleProfile.relevantKeywords must be a non-empty array`);
  }
}

export function validateDealDiscoveryIdeasCache(
  value: unknown
): ValidationResult<DealDiscoveryIdeasCache> {
  const errors: string[] = [];
  if (!checkBase(value, "ideas", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.ideas)) {
    v.ideas.forEach((idea, i) => validateDealDiscoveryIdea(idea, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealDiscoveryIdeasCache, errors }
    : { ok: false, errors };
}

function validateDealTripManifest(manifest: unknown, i: number, errors: string[]): void {
  if (!isRecord(manifest)) {
    errors.push(`manifests[${i}] is not an object`);
    return;
  }
  const m = manifest as Partial<DealTripManifest>;
  if (typeof m.id !== "string" || !m.id) errors.push(`manifests[${i}].id missing`);
  if (m.generator !== "gpt") errors.push(`manifests[${i}].generator must be "gpt"`);
  if (!isIsoDate(m.generatedAtIso)) errors.push(`manifests[${i}].generatedAtIso must be an ISO date`);
  if (typeof m.sourceAngleId !== "string" || !m.sourceAngleId) {
    errors.push(`manifests[${i}].sourceAngleId missing`);
  }
  if (!isRecord(m.assembleDraft)) {
    errors.push(`manifests[${i}].assembleDraft missing`);
  } else {
    const d = m.assembleDraft as Record<string, unknown>;
    for (const key of ["cruiseLine", "itineraryName", "destination", "suggestedDealId", "suggestedBriefId"]) {
      if (typeof d[key] !== "string" || !(d[key] as string)) {
        errors.push(`manifests[${i}].assembleDraft.${key} missing`);
      }
    }
    if (!isRecord(d.sailWindow)) errors.push(`manifests[${i}].assembleDraft.sailWindow missing`);
    // Guard the no-fabrication rule: live-resolved fields must never be present.
    for (const forbidden of ["packageId", "shipName", "siid", "bookingUrl"]) {
      if (forbidden in d && d[forbidden]) {
        errors.push(
          `manifests[${i}].assembleDraft must not carry "${forbidden}" — it is resolved by operator lookup, not the model`
        );
      }
    }
  }
  if (!Array.isArray(m.appliedPromos)) errors.push(`manifests[${i}].appliedPromos must be an array`);
  if (!isRecord(m.lookupQuery)) errors.push(`manifests[${i}].lookupQuery missing`);
  // Step 4 — Resolve: optional, but when present it must carry operator provenance.
  if (m.resolvedPackage !== undefined) {
    if (!isRecord(m.resolvedPackage)) {
      errors.push(`manifests[${i}].resolvedPackage must be an object`);
    } else {
      const r = m.resolvedPackage as Record<string, unknown>;
      if (r.source !== "operator_package_lookup") {
        errors.push(
          `manifests[${i}].resolvedPackage.source must be "operator_package_lookup" — only the operator-run lookup may resolve a package`
        );
      }
      for (const key of ["packageId", "cruiseName", "sailDateIso", "siid"]) {
        if (typeof r[key] !== "string" || !(r[key] as string)) {
          errors.push(`manifests[${i}].resolvedPackage.${key} missing`);
        }
      }
      if (!isIsoDate(r.resolvedAtIso)) {
        errors.push(`manifests[${i}].resolvedPackage.resolvedAtIso must be an ISO date`);
      }
      if (typeof r.confidence !== "number") {
        errors.push(`manifests[${i}].resolvedPackage.confidence must be a number`);
      }
    }
  }
}

export function validateDealTripManifestsCache(
  value: unknown
): ValidationResult<DealTripManifestsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "manifests", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.manifests)) {
    v.manifests.forEach((m, i) => validateDealTripManifest(m, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealTripManifestsCache, errors }
    : { ok: false, errors };
}

function validateDealUnifiedManifest(manifest: unknown, i: number, errors: string[]): void {
  if (!isRecord(manifest)) {
    errors.push(`manifests[${i}] is not an object`);
    return;
  }
  const m = manifest as Partial<DealUnifiedManifest>;
  if (typeof m.id !== "string" || !m.id) errors.push(`manifests[${i}].id missing`);
  if (!isIsoDate(m.generatedAtIso)) errors.push(`manifests[${i}].generatedAtIso must be an ISO date`);
  if (typeof m.sourceAngleId !== "string") errors.push(`manifests[${i}].sourceAngleId missing`);
  if (typeof m.sourceManifestId !== "string") errors.push(`manifests[${i}].sourceManifestId missing`);
  if (!isRecord(m.creativeBrief) || !isRecord((m.creativeBrief as Record<string, unknown>).angle)) {
    errors.push(`manifests[${i}].creativeBrief.angle missing`);
  }
  if (!isRecord(m.inventoryManifest) || !isRecord((m.inventoryManifest as Record<string, unknown>).assembleDraft)) {
    errors.push(`manifests[${i}].inventoryManifest.assembleDraft missing`);
  } else {
    const inventory = m.inventoryManifest as Record<string, unknown>;
    if (
      inventory.promotionBriefs !== undefined &&
      !Array.isArray(inventory.promotionBriefs)
    ) {
      errors.push(`manifests[${i}].inventoryManifest.promotionBriefs must be an array`);
    }
  }
}

export function validateDealUnifiedManifestsCache(
  value: unknown
): ValidationResult<DealUnifiedManifestsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "manifests", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.manifests)) {
    v.manifests.forEach((m, i) => validateDealUnifiedManifest(m, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealUnifiedManifestsCache, errors }
    : { ok: false, errors };
}

function validateDealAdCopy(adCopy: unknown, i: number, errors: string[]): void {
  if (!isRecord(adCopy)) {
    errors.push(`adCopies[${i}] is not an object`);
    return;
  }
  const a = adCopy as Partial<DealAdCopy>;
  if (typeof a.id !== "string" || !a.id) errors.push(`adCopies[${i}].id missing`);
  if (a.generator !== "gpt" && a.generator !== "operator_curated") {
    errors.push(`adCopies[${i}].generator must be "gpt" or "operator_curated"`);
  }
  if (!isIsoDate(a.generatedAtIso)) errors.push(`adCopies[${i}].generatedAtIso must be an ISO date`);
  if (typeof a.sourceUnifiedManifestId !== "string") errors.push(`adCopies[${i}].sourceUnifiedManifestId missing`);
  if (!Array.isArray(a.variants) || a.variants.length === 0) {
    errors.push(`adCopies[${i}].variants must be a non-empty array`);
    return;
  }
  if (a.selectedVariantIndex !== undefined) {
    if (
      typeof a.selectedVariantIndex !== "number" ||
      !Number.isInteger(a.selectedVariantIndex) ||
      a.selectedVariantIndex < 0 ||
      a.selectedVariantIndex >= a.variants.length
    ) {
      errors.push(
        `adCopies[${i}].selectedVariantIndex must be an integer in [0, ${a.variants.length - 1}]`
      );
    }
  }
  a.variants.forEach((variant, vi) => {
    if (!isRecord(variant)) {
      errors.push(`adCopies[${i}].variants[${vi}] is not an object`);
      return;
    }
    for (const key of ["headline", "bodyCopy", "callToAction"]) {
      if (typeof variant[key] !== "string" || !(variant[key] as string)) {
        errors.push(`adCopies[${i}].variants[${vi}].${key} missing`);
      }
    }
  });
}

export function validateDealAdCopyCache(value: unknown): ValidationResult<DealAdCopyCache> {
  const errors: string[] = [];
  if (!checkBase(value, "adCopies", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.adCopies)) {
    v.adCopies.forEach((a, i) => validateDealAdCopy(a, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealAdCopyCache, errors }
    : { ok: false, errors };
}

function validateDealFunnelSynthesis(s: unknown, i: number, errors: string[]): void {
  if (!isRecord(s)) {
    errors.push(`syntheses[${i}] is not an object`);
    return;
  }
  const f = s as Partial<DealFunnelSynthesis>;
  if (typeof f.id !== "string" || !f.id) errors.push(`syntheses[${i}].id missing`);
  if (f.generator !== "gpt") errors.push(`syntheses[${i}].generator must be "gpt"`);
  if (!isIsoDate(f.generatedAtIso)) errors.push(`syntheses[${i}].generatedAtIso must be an ISO date`);
  if (typeof f.sourceAdCopyId !== "string") errors.push(`syntheses[${i}].sourceAdCopyId missing`);

  if (!isRecord(f.landingPage)) {
    errors.push(`syntheses[${i}].landingPage missing`);
  } else if (!Array.isArray(f.landingPage.segments) || f.landingPage.segments.length === 0) {
    errors.push(`syntheses[${i}].landingPage.segments must be a non-empty array`);
  }

  if (!isRecord(f.carousel)) {
    errors.push(`syntheses[${i}].carousel missing`);
  } else if (!Array.isArray(f.carousel.cards) || f.carousel.cards.length === 0) {
    errors.push(`syntheses[${i}].carousel.cards must be a non-empty array`);
  }

  if (!Array.isArray(f.candidates)) errors.push(`syntheses[${i}].candidates must be an array`);
  if (!Array.isArray(f.galleryIds)) errors.push(`syntheses[${i}].galleryIds must be an array`);
}

export function validateDealFunnelSynthesisCache(
  value: unknown
): ValidationResult<DealFunnelSynthesisCache> {
  const errors: string[] = [];
  if (!checkBase(value, "syntheses", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.syntheses)) {
    v.syntheses.forEach((s, i) => validateDealFunnelSynthesis(s, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealFunnelSynthesisCache, errors }
    : { ok: false, errors };
}

function validateDealMetaAdSynthesis(s: unknown, i: number, errors: string[]): void {
  if (!isRecord(s)) {
    errors.push(`syntheses[${i}] is not an object`);
    return;
  }
  const m = s as Partial<DealMetaAdSynthesis>;
  if (typeof m.id !== "string" || !m.id) errors.push(`syntheses[${i}].id missing`);
  if (!isIsoDate(m.generatedAtIso)) errors.push(`syntheses[${i}].generatedAtIso must be an ISO date`);
  if (typeof m.sourceFunnelSynthesisId !== "string" || !m.sourceFunnelSynthesisId) {
    errors.push(`syntheses[${i}].sourceFunnelSynthesisId missing`);
  }
  if (typeof m.promptTemplate !== "string" || !m.promptTemplate) {
    errors.push(`syntheses[${i}].promptTemplate missing`);
  }
  if (
    m.recommendedStyleId !== undefined &&
    !isDealMetaAdStylePresetId(m.recommendedStyleId)
  ) {
    errors.push(`syntheses[${i}].recommendedStyleId invalid`);
  }
  if (
    m.selectedStyleId !== undefined &&
    !isDealMetaAdStylePresetId(m.selectedStyleId)
  ) {
    errors.push(`syntheses[${i}].selectedStyleId invalid`);
  }
  if (
    m.styleSelectionSource !== undefined &&
    !["ai_recommended", "operator", "fallback"].includes(
      m.styleSelectionSource
    )
  ) {
    errors.push(`syntheses[${i}].styleSelectionSource invalid`);
  }
  if (
    m.styleSelectedAtIso !== undefined &&
    !isIsoDate(m.styleSelectedAtIso)
  ) {
    errors.push(`syntheses[${i}].styleSelectedAtIso must be an ISO date`);
  }
  if (m.styleRecommendation !== undefined) {
    if (!isRecord(m.styleRecommendation)) {
      errors.push(`syntheses[${i}].styleRecommendation must be an object`);
    } else {
      const recommendation = m.styleRecommendation;
      if (!isDealMetaAdStylePresetId(recommendation.recommendedStyleId)) {
        errors.push(
          `syntheses[${i}].styleRecommendation.recommendedStyleId invalid`
        );
      }
      if (
        typeof recommendation.rationale !== "string" ||
        !recommendation.rationale.trim()
      ) {
        errors.push(
          `syntheses[${i}].styleRecommendation.rationale missing`
        );
      }
      if (
        !["high", "medium", "low"].includes(
          String(recommendation.confidence)
        )
      ) {
        errors.push(
          `syntheses[${i}].styleRecommendation.confidence invalid`
        );
      }
      if (!isIsoDate(recommendation.generatedAtIso)) {
        errors.push(
          `syntheses[${i}].styleRecommendation.generatedAtIso must be an ISO date`
        );
      }
      if (recommendation.modelTask !== "decision") {
        errors.push(
          `syntheses[${i}].styleRecommendation.modelTask invalid`
        );
      }
    }
  }
  if (!Array.isArray(m.cards) || m.cards.length === 0) {
    errors.push(`syntheses[${i}].cards must be a non-empty array`);
  } else {
    m.cards.forEach((card, j) => {
      if (!isRecord(card)) {
        errors.push(`syntheses[${i}].cards[${j}] is not an object`);
        return;
      }
      if (typeof card.cardIndex !== "number") errors.push(`syntheses[${i}].cards[${j}].cardIndex missing`);
      if (typeof card.headline !== "string") errors.push(`syntheses[${i}].cards[${j}].headline missing`);
      if (typeof card.primaryText !== "string") errors.push(`syntheses[${i}].cards[${j}].primaryText missing`);
      if (!["pending", "generating", "ready", "error"].includes(String(card.status))) {
        errors.push(`syntheses[${i}].cards[${j}].status invalid: ${String(card.status)}`);
      }
      if (card.references !== undefined) {
        if (!Array.isArray(card.references)) {
          errors.push(`syntheses[${i}].cards[${j}].references must be an array`);
        } else {
          card.references.forEach((reference, k) =>
            validateDealMetaImageReference(
              reference,
              `syntheses[${i}].cards[${j}].references[${k}]`,
              errors
            )
          );
        }
      }
    });
  }
  if (m.shipIdentityReference !== undefined) {
    validateDealMetaImageReference(
      m.shipIdentityReference,
      `syntheses[${i}].shipIdentityReference`,
      errors
    );
  }
}

const DEAL_META_REFERENCE_ROLES = [
  "ship_identity",
  "destination_truth",
  "composition",
  "style",
  "object",
];

const DEAL_META_REFERENCE_SOURCES = [
  "funnel_candidate",
  "card_history",
  "operator_upload",
  "url_import",
];

/**
 * Reference records are optional everywhere (legacy syntheses have none), but a
 * present one must be well-formed: a reference with no usable assetUrl would
 * fail at generation time, long after the operator attached it.
 */
function validateDealMetaImageReference(
  reference: unknown,
  path: string,
  errors: string[]
): void {
  if (!isRecord(reference)) {
    errors.push(`${path} is not an object`);
    return;
  }
  if (typeof reference.id !== "string" || !reference.id.trim()) {
    errors.push(`${path}.id missing`);
  }
  if (typeof reference.assetUrl !== "string" || !reference.assetUrl.trim()) {
    errors.push(`${path}.assetUrl missing`);
  }
  if (!DEAL_META_REFERENCE_ROLES.includes(String(reference.role))) {
    errors.push(`${path}.role invalid: ${String(reference.role)}`);
  }
  if (!DEAL_META_REFERENCE_SOURCES.includes(String(reference.source))) {
    errors.push(`${path}.source invalid: ${String(reference.source)}`);
  }
  if (!isIsoDate(reference.addedAtIso)) {
    errors.push(`${path}.addedAtIso must be an ISO date`);
  }
}

export function validateDealMetaAdSynthesisCache(
  value: unknown
): ValidationResult<DealMetaAdSynthesisCache> {
  const errors: string[] = [];
  if (!checkBase(value, "syntheses", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.syntheses)) {
    v.syntheses.forEach((s, i) => validateDealMetaAdSynthesis(s, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealMetaAdSynthesisCache, errors }
    : { ok: false, errors };
}

function validateDealMetaDistribution(d: unknown, i: number, errors: string[]): void {
  if (!isRecord(d)) {
    errors.push(`distributions[${i}] is not an object`);
    return;
  }
  const m = d as Partial<DealMetaDistribution>;
  if (typeof m.id !== "string" || !m.id) errors.push(`distributions[${i}].id missing`);
  if (typeof m.dealId !== "string" || !m.dealId) errors.push(`distributions[${i}].dealId missing`);
  if (typeof m.sourceMetaAdSynthesisId !== "string" || !m.sourceMetaAdSynthesisId) {
    errors.push(`distributions[${i}].sourceMetaAdSynthesisId missing`);
  }
  if (!isIsoDate(m.generatedAtIso)) errors.push(`distributions[${i}].generatedAtIso must be an ISO date`);
  if (!["simulate", "live", "organic_page_only"].includes(String(m.mode))) {
    errors.push(`distributions[${i}].mode invalid: ${String(m.mode)}`);
  }
  if (!["planned", "dispatched", "error"].includes(String(m.status))) {
    errors.push(`distributions[${i}].status invalid: ${String(m.status)}`);
  }
  if (!isRecord(m.plan)) errors.push(`distributions[${i}].plan missing`);
  if (!Array.isArray(m.notes)) errors.push(`distributions[${i}].notes must be an array`);
}

export function validateDealMetaDistributionCache(
  value: unknown
): ValidationResult<DealMetaDistributionCache> {
  const errors: string[] = [];
  if (!checkBase(value, "distributions", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.distributions)) {
    v.distributions.forEach((d, i) => validateDealMetaDistribution(d, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealMetaDistributionCache, errors }
    : { ok: false, errors };
}

function validateDealGoogleAdsImage(asset: unknown, i: number, errors: string[]): void {
  if (!isRecord(asset)) {
    errors.push(`images[${i}] is not an object`);
    return;
  }
  if (!["landscape_1_91x1", "square_1x1"].includes(String(asset.aspect))) {
    errors.push(`images[${i}].aspect invalid: ${String(asset.aspect)}`);
  }
  if (!["pending", "generating", "ready", "error"].includes(String(asset.status))) {
    errors.push(`images[${i}].status invalid: ${String(asset.status)}`);
  }
}

function validateDealGoogleAdsSynthesis(s: unknown, i: number, errors: string[]): void {
  if (!isRecord(s)) {
    errors.push(`syntheses[${i}] is not an object`);
    return;
  }
  const m = s as Partial<DealGoogleAdsSynthesis>;
  if (typeof m.id !== "string" || !m.id) errors.push(`syntheses[${i}].id missing`);
  if (!isIsoDate(m.generatedAtIso)) errors.push(`syntheses[${i}].generatedAtIso must be an ISO date`);
  if (typeof m.sourceFunnelSynthesisId !== "string" || !m.sourceFunnelSynthesisId) {
    errors.push(`syntheses[${i}].sourceFunnelSynthesisId missing`);
  }
  if (typeof m.businessName !== "string" || !m.businessName) {
    errors.push(`syntheses[${i}].businessName missing`);
  }
  if (typeof m.headline !== "string" || !m.headline) errors.push(`syntheses[${i}].headline missing`);
  if (typeof m.longHeadline !== "string" || !m.longHeadline) {
    errors.push(`syntheses[${i}].longHeadline missing`);
  }
  if (typeof m.description !== "string" || !m.description) {
    errors.push(`syntheses[${i}].description missing`);
  }
  if (typeof m.promptTemplate !== "string" || !m.promptTemplate) {
    errors.push(`syntheses[${i}].promptTemplate missing`);
  }
  if (!Array.isArray(m.images) || m.images.length !== 2) {
    errors.push(`syntheses[${i}].images must be an array of exactly 2 entries`);
  } else {
    m.images.forEach((asset, j) => validateDealGoogleAdsImage(asset, j, errors));
  }
  // Optional for backward compatibility with syntheses cached before this field
  // existed; loadDealGoogleAdsSynthesisCache defaults it to [] when absent.
  if (m.operatorPlacements !== undefined && !Array.isArray(m.operatorPlacements)) {
    errors.push(`syntheses[${i}].operatorPlacements must be an array when present`);
  }
}

export function validateDealGoogleAdsSynthesisCache(
  value: unknown
): ValidationResult<DealGoogleAdsSynthesisCache> {
  const errors: string[] = [];
  if (!checkBase(value, "syntheses", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.syntheses)) {
    v.syntheses.forEach((s, i) => validateDealGoogleAdsSynthesis(s, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealGoogleAdsSynthesisCache, errors }
    : { ok: false, errors };
}

function validateDealGoogleAdsDistribution(d: unknown, i: number, errors: string[]): void {
  if (!isRecord(d)) {
    errors.push(`distributions[${i}] is not an object`);
    return;
  }
  const m = d as Partial<DealGoogleAdsDistribution>;
  if (typeof m.id !== "string" || !m.id) errors.push(`distributions[${i}].id missing`);
  if (typeof m.dealId !== "string" || !m.dealId) errors.push(`distributions[${i}].dealId missing`);
  if (typeof m.sourceGoogleAdsSynthesisId !== "string" || !m.sourceGoogleAdsSynthesisId) {
    errors.push(`distributions[${i}].sourceGoogleAdsSynthesisId missing`);
  }
  if (!isIsoDate(m.generatedAtIso)) errors.push(`distributions[${i}].generatedAtIso must be an ISO date`);
  if (!["simulate", "live"].includes(String(m.mode))) {
    errors.push(`distributions[${i}].mode invalid: ${String(m.mode)}`);
  }
  if (!["planned", "dispatched", "error"].includes(String(m.status))) {
    errors.push(`distributions[${i}].status invalid: ${String(m.status)}`);
  }
  if (!isRecord(m.plan)) errors.push(`distributions[${i}].plan missing`);
  if (!Array.isArray(m.notes)) errors.push(`distributions[${i}].notes must be an array`);
}

export function validateDealGoogleAdsDistributionCache(
  value: unknown
): ValidationResult<DealGoogleAdsDistributionCache> {
  const errors: string[] = [];
  if (!checkBase(value, "distributions", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.distributions)) {
    v.distributions.forEach((d, i) => validateDealGoogleAdsDistribution(d, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as DealGoogleAdsDistributionCache, errors }
    : { ok: false, errors };
}
