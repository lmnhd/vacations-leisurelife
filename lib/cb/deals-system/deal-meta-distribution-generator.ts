/**
 * Deal Meta Distribution generator/dispatcher (Step 9).
 *
 * Builds an Instagram Graph carousel + Facebook link-ad carousel from a Step 8
 * Meta Ad Synthesis's ready cards, mirroring the group campaign system's
 * dispatchMetaAdsLive / dispatchInstagramGraphLive carousel pattern:
 *
 *   - planDealMetaDistribution: pure preview (no Graph API calls). Resolves
 *     the deal's targetingDemographic into Meta interests (best-effort —
 *     network errors degrade to an empty/static targeting preview rather
 *     than failing the plan).
 *   - dispatchDealMetaDistribution: "simulate" returns the plan only.
 *     "live" creates a new Campaign + Ad Set (PAUSED), uploads each card
 *     image to get an image hash, creates a Facebook carousel link ad
 *     (child_attachments), and creates an Instagram Graph carousel
 *     (per-card child containers + CAROUSEL parent), publishing it.
 */

import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import type {
  DealMetaDistribution,
  DealMetaDistributionCard,
  DealMetaDistributionMode,
  DealMetaDistributionPlan,
  DealMetaDistributionTargetingPreview,
} from "./deal-meta-distribution-types";
import {
  createMetaAdSet,
  createMetaCampaign,
  estimateMetaAudienceSize,
  getMetaAdsConfig,
  buildMetaAdsReviewUrl,
  META_GRAPH_VERSION,
  publishFacebookPagePost,
  searchMetaAdBehaviors,
  type MetaAdsConfig,
} from "@/lib/integrations/meta-ads";
import {
  buildDealAudienceCellMatrix,
  decomposeDealAudienceCellsWithAI,
  type DealAudienceCellDependencies,
} from "./deal-audience-cell-generator";
import type {
  DealAudienceCellMatrix,
} from "./deal-audience-cell-types";
import {
  appendInterestAtoms,
  isGenericTerm,
  MAX_INTEREST_QUERIES,
  normalizeTerm,
  pushUnique,
  resolveInterestQueries,
  resolveMetaParentNodesForNiche,
} from "@/lib/campaigns/distribution/platforms/meta-ads/interest-resolution-core";

function getSiteBaseUrl(): string {
  let configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.leisurelifeinteractive.net";
  try {
    const parsed = new URL(configured);
    if (parsed.hostname === "leisurelifeinteractive.net") {
      parsed.hostname = "www.leisurelifeinteractive.net";
      configured = parsed.toString();
    }
  } catch {
    // Leave a non-URL development value unchanged; callers will surface it.
  }
  while (configured.endsWith("/")) {
    configured = configured.slice(0, -1);
  }
  return configured;
}

function getMetaDailyBudgetCents(): number {
  const raw = process.env.META_DAILY_BUDGET_CENTS?.trim();
  if (!raw) return 500;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 100 ? 500 : parsed;
}

function buildMetaAdSetWindow(): { startTime: string; endTime: string } {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

const DEAL_META_TRAVEL_PARENT_QUERIES = [
  "Cruise Critic",
  "Luxury travel",
  "Travel + Leisure",
  "Conde Nast Traveler",
  "All-inclusive resort",
  "Travel Agents and Booking",
  "Adventure travel",
  "Caribbean",
];
const DEAL_META_INTEREST_QUERY_LIMIT = 18;
const DEAL_META_ALLOWED_TRAVEL_INTEREST_NAMES = [
  "Travel + Leisure",
  "Conde Nast Traveler",
  "Oceania Cruises",
  "Celebrity Cruises",
  "Royal Caribbean",
  "Royal Caribbean International",
  "Allure of the Seas",
  "Cruise Critic",
  "Luxury Travel",
  "Adventure travel",
  "Travel content and inspiration",
  "Travel attractions and activities",
  "All-inclusive resort",
  "FineDiningLovers",
  "Travel Agents and Booking",
  "Cruises",
];

/**
 * Names the anti-generic interest filter must let through for THIS deal:
 * the static travel-media allowlist plus the deal's own cruise line, ship,
 * and ports (both "Labadee, Haiti" and "Labadee" forms). Without this, a
 * line the static list predates (e.g. Disney Cruise Line) can never resolve
 * as an intent signal.
 */
export function buildDealAllowedInterestNames(deal: CuratedOdysseusDeal): string[] {
  const names: string[] = [...DEAL_META_ALLOWED_TRAVEL_INTEREST_NAMES];
  const push = (value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length > 0 && !names.some((existing) => normalizeTerm(existing) === normalizeTerm(trimmed))) {
      names.push(trimmed);
    }
  };
  push(deal.cruiseFacts.cruiseLine);
  push(deal.cruiseFacts.shipName);
  for (const port of deal.cruiseFacts.portsOfCall) {
    push(port);
    const commaIndex = port.indexOf(",");
    if (commaIndex > 0) push(port.slice(0, commaIndex));
  }
  return names;
}

const DEAL_META_CRUISE_LINE_INTERESTS = [
  { name: "Oceania Cruises", lineTokens: ["oceania"] },
  { name: "Celebrity Cruises", lineTokens: ["celebrity"] },
  { name: "Royal Caribbean", lineTokens: ["royal caribbean"] },
  { name: "Royal Caribbean International", lineTokens: ["royal caribbean"] },
];

const META_REGION_KEYS = new Map<string, string>([
  ["US-FL", "3843"],
]);

function pushKnownMetaQuery(target: string[], candidate: string, max: number): boolean {
  const normalized = normalizeTerm(candidate);
  if (!normalized || target.some((existing) => normalizeTerm(existing) === normalized) || target.length >= max) {
    return false;
  }
  target.push(candidate.trim());
  return true;
}

function isDealCompatibleMetaInterest(deal: CuratedOdysseusDeal, candidate: string): boolean {
  const normalizedCandidate = normalizeTerm(candidate);
  if (!normalizedCandidate) return false;

  const lineText = normalizeTerm(`${deal.cruiseFacts.cruiseLine} ${deal.cruiseFacts.shipName}`);
  for (const knownLine of DEAL_META_CRUISE_LINE_INTERESTS) {
    if (normalizeTerm(knownLine.name) !== normalizedCandidate) continue;
    return knownLine.lineTokens.some((token) => lineText.includes(token));
  }

  return true;
}

function pushDealAwareMetaQuery(
  deal: CuratedOdysseusDeal,
  target: string[],
  candidate: string,
  max: number
): boolean {
  if (!isDealCompatibleMetaInterest(deal, candidate)) return false;
  return pushKnownMetaQuery(target, candidate, max);
}

function dealSignalText(deal: CuratedOdysseusDeal, synthesis?: DealMetaAdSynthesis): string {
  return [
    deal.packaging.headline,
    deal.packaging.shortSummary,
    ...deal.packaging.highlights,
    ...deal.packaging.bestFor,
    deal.campaignStrategy?.campaignAngle,
    deal.campaignStrategy?.targetAudience,
    ...(deal.campaignStrategy?.targetingKeywords ?? []),
    ...(deal.targetingDemographic?.channelTargeting.meta.interestClusters ?? []),
    ...(deal.targetingDemographic?.channelTargeting.meta.creativeHooks ?? []),
    ...(deal.targetingDemographic?.nicheKeywords.lifestyle ?? []),
    ...(synthesis?.cards ?? []).flatMap((card) => [card.headline, card.primaryText]),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function buildDealIntentQueries(deal: CuratedOdysseusDeal, synthesis?: DealMetaAdSynthesis): string[] {
  const signalText = dealSignalText(deal, synthesis);
  const queries: string[] = [];

  if (
    signalText.includes("nov") ||
    signalText.includes("fall") ||
    signalText.includes("autumn") ||
    signalText.includes("hurricane") ||
    signalText.includes("holiday")
  ) {
    pushDealAwareMetaQuery(deal, queries, "Travel + Leisure", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Conde Nast Traveler", DEAL_META_INTEREST_QUERY_LIMIT);
  }

  if (
    signalText.includes("crowd") ||
    signalText.includes("1,200") ||
    signalText.includes("1200") ||
    signalText.includes("small ship") ||
    signalText.includes("room to breathe")
  ) {
    pushDealAwareMetaQuery(deal, queries, "Oceania Cruises", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Cruise Critic", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Luxury Travel", DEAL_META_INTEREST_QUERY_LIMIT);
  }

  if (
    signalText.includes("included") ||
    signalText.includes("inclusive") ||
    signalText.includes("no surcharge") ||
    signalText.includes("dining") ||
    signalText.includes("nickel-and-dime")
  ) {
    pushDealAwareMetaQuery(deal, queries, "All-inclusive resort", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "FineDiningLovers", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Travel Agents and Booking", DEAL_META_INTEREST_QUERY_LIMIT);
  }

  if (
    signalText.includes("unique") ||
    signalText.includes("itinerary") ||
    signalText.includes("route") ||
    signalText.includes("abc islands") ||
    signalText.includes("actually on the map")
  ) {
    pushDealAwareMetaQuery(deal, queries, "Adventure travel", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Travel content and inspiration", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Travel attractions and activities", DEAL_META_INTEREST_QUERY_LIMIT);
  }

  if (
    signalText.includes("family") ||
    signalText.includes("kids") ||
    signalText.includes("grandparents") ||
    signalText.includes("school") ||
    signalText.includes("waterpark") ||
    signalText.includes("perfect day") ||
    signalText.includes("cococay")
  ) {
    pushDealAwareMetaQuery(deal, queries, "Royal Caribbean", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Cruises", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Caribbean", DEAL_META_INTEREST_QUERY_LIMIT);
    pushDealAwareMetaQuery(deal, queries, "Travel attractions and activities", DEAL_META_INTEREST_QUERY_LIMIT);
  }

  return queries;
}

function buildDealTravelParentQueries(deal: CuratedOdysseusDeal, synthesis?: DealMetaAdSynthesis): string[] {
  const queries: string[] = [];
  for (const query of buildDealIntentQueries(deal, synthesis)) {
    pushDealAwareMetaQuery(deal, queries, query, DEAL_META_INTEREST_QUERY_LIMIT);
  }
  pushDealAwareMetaQuery(deal, queries, deal.cruiseFacts.cruiseLine, DEAL_META_INTEREST_QUERY_LIMIT);
  pushDealAwareMetaQuery(deal, queries, deal.cruiseFacts.shipName, DEAL_META_INTEREST_QUERY_LIMIT);
  for (const port of deal.cruiseFacts.portsOfCall) {
    pushDealAwareMetaQuery(deal, queries, port, DEAL_META_INTEREST_QUERY_LIMIT);
  }
  for (const query of DEAL_META_TRAVEL_PARENT_QUERIES) {
    pushDealAwareMetaQuery(deal, queries, query, DEAL_META_INTEREST_QUERY_LIMIT);
  }
  return queries;
}

function inferDealAgeMin(deal: CuratedOdysseusDeal): number | undefined {
  const audienceText = [
    deal.campaignStrategy?.targetAudience,
    deal.targetingDemographic?.primaryAudience.label,
    deal.targetingDemographic?.primaryAudience.description,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  if (
    audienceText.includes("50") ||
    audienceText.includes("60") ||
    audienceText.includes("70") ||
    audienceText.includes("retire") ||
    audienceText.includes("seasoned cruiser")
  ) {
    return 45;
  }

  return undefined;
}

function buildDealGeoLocations(deal: CuratedOdysseusDeal): Record<string, unknown> {
  const geographicRestriction = deal.campaignStrategy?.metaGeographicRestriction;
  const geoLocations: Record<string, unknown> = geographicRestriction
    ? {
        regions: [
          {
            key: META_REGION_KEYS.get(
              `${geographicRestriction.countryCode}-${geographicRestriction.regionCode}`
            ),
          },
        ],
      }
    : { countries: ["US"] };

  if (geographicRestriction) {
    const regionKey = (geoLocations.regions as Array<{ key?: string }>)[0]?.key;
    if (!regionKey) {
      throw new Error(
        `No verified Meta region key is configured for ${geographicRestriction.countryCode}-${geographicRestriction.regionCode}. Refusing nationwide fallback.`
      );
    }
  }

  return geoLocations;
}

function buildDealMetaTargetingBase(deal: CuratedOdysseusDeal): Record<string, unknown> {
  const geoLocations = buildDealGeoLocations(deal);

  const targeting: Record<string, unknown> = {
    geo_locations: geoLocations,
    targeting_automation: {
      advantage_audience: 1,
      individual_setting: { age: 1 },
    },
  };
  const ageMin = inferDealAgeMin(deal);
  if (ageMin) {
    targeting.age_min = ageMin;
  }
  return targeting;
}

function geographicRestrictionPreview(
  deal: CuratedOdysseusDeal
): DealMetaDistributionTargetingPreview["geographicRestriction"] {
  const restriction = deal.campaignStrategy?.metaGeographicRestriction;
  return restriction
    ? {
        ...restriction,
        strict: true,
      }
    : undefined;
}

function withoutAgeSuggestion(targeting: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...targeting };
  delete next.age_min;
  delete next.age_max;
  const automation = next.targeting_automation;
  if (automation && typeof automation === "object" && !Array.isArray(automation)) {
    const automationRecord = { ...(automation as Record<string, unknown>) };
    delete automationRecord.individual_setting;
    next.targeting_automation = automationRecord;
  }
  return next;
}

async function createDealMetaAdSetWithAgeRetry(
  config: MetaAdsConfig,
  input: {
    name: string;
    campaignId: string;
    targeting: Record<string, unknown>;
    dailyBudgetCents: number;
    startTime: string;
    endTime: string;
  },
  notes: string[]
): Promise<string> {
  try {
    return await createMetaAdSet(config, {
      ...input,
      status: "PAUSED",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!reason.includes("1870188") || input.targeting.age_min === undefined) {
      throw error;
    }
    notes.push(
      `meta_age_suggestion_retry=${reason}`,
      "meta_age_suggestion_removed=Meta rejected age_min with Advantage+ audience; retried without age_min."
    );
    return createMetaAdSet(config, {
      ...input,
      targeting: withoutAgeSuggestion(input.targeting),
      status: "PAUSED",
    });
  }
}

/**
 * Build the deal's interest query list: niche interestClusters first (the
 * highest-signal, most specific terms), then AI-resolved broad "parent node"
 * categories (verified Meta taxonomy names) so the ad set stays deliverable
 * even when hyper-niche terms like "Ironsworn Starforged" don't resolve,
 * then secondary nicheKeywords/creativeHooks/behaviorSignals atoms.
 */
async function buildDealInterestQueries(
  deal: CuratedOdysseusDeal,
  synthesis: DealMetaAdSynthesis | undefined,
  resolveParentNodes: (nicheContext: string, seeds: string[]) => Promise<string[]>
): Promise<{ queries: string[]; parentNodes: string[] }> {
  const meta = deal.targetingDemographic?.channelTargeting.meta;
  const nicheKeywords = deal.targetingDemographic?.nicheKeywords;
  const primaryAudience = deal.targetingDemographic?.primaryAudience;

  const seedKeywords = (meta?.interestClusters ?? [])
    .map(normalizeTerm)
    .filter((term) => term.length > 0 && !isGenericTerm(term) && isDealCompatibleMetaInterest(deal, term));

  // Reserve room in the MAX_INTEREST_QUERIES budget for AI-resolved parent
  // nodes — they're the deliverability fallback for hyper-niche clusters
  // (e.g. "Ironsworn Starforged") that rarely resolve verbatim, so they must
  // not get crowded out by a long interestClusters list.
  const seedBudget = Math.max(1, MAX_INTEREST_QUERIES - 6);
  const queries: string[] = [];
  for (const seed of seedKeywords) {
    pushUnique(queries, seed, seedBudget);
  }

  const travelParentQueries = buildDealTravelParentQueries(deal, synthesis);
  for (const parent of travelParentQueries) {
    pushDealAwareMetaQuery(deal, queries, parent, MAX_INTEREST_QUERIES);
  }

  const nicheContext = [
    deal.cruiseFacts?.title,
    ...seedKeywords,
    ...(meta?.creativeHooks ?? []),
    primaryAudience?.label,
    primaryAudience?.description,
    ...(primaryAudience?.emotionalDrivers ?? []),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 10)
    .join("\n");

  const parentNodes = (await resolveParentNodes(nicheContext, seedKeywords))
    .map(normalizeTerm)
    .filter((n) => n.length > 0 && !isGenericTerm(n));

  for (const parent of parentNodes) {
    pushUnique(queries, parent, MAX_INTEREST_QUERIES);
  }

  // Backfill any unused budget with the remaining niche seeds.
  for (const seed of seedKeywords) {
    pushUnique(queries, seed, MAX_INTEREST_QUERIES);
  }

  appendInterestAtoms(queries, meta?.behaviorSignals ?? [], MAX_INTEREST_QUERIES);
  appendInterestAtoms(queries, meta?.creativeHooks ?? [], MAX_INTEREST_QUERIES);
  appendInterestAtoms(queries, nicheKeywords?.lifestyle ?? [], MAX_INTEREST_QUERIES);
  appendInterestAtoms(queries, nicheKeywords?.shipExperience ?? [], MAX_INTEREST_QUERIES);
  appendInterestAtoms(queries, nicheKeywords?.amenities ?? [], MAX_INTEREST_QUERIES);
  appendInterestAtoms(queries, nicheKeywords?.trendSignals ?? [], MAX_INTEREST_QUERIES);

  return { queries, parentNodes: [...travelParentQueries, ...parentNodes] };
}

/**
 * Resolve a deal's targetingDemographic Meta interest clusters into Graph API
 * interest ids, mirroring the group campaign system's synthesizeMetaTargeting
 * pipeline: denylist-filtered niche atoms, AI-resolved broad "parent node"
 * categories as a deliverability fallback, and scored multi-candidate
 * resolution with caching. Best-effort: a search failure for one query is
 * dropped into unresolvedQueries rather than aborting the whole plan.
 */
async function resolveDealMetaTargeting(
  deal: CuratedOdysseusDeal,
  synthesis: DealMetaAdSynthesis,
  config: MetaAdsConfig | null
): Promise<DealMetaDistributionTargetingPreview> {
  const rawInterestClusters = deal.targetingDemographic?.channelTargeting.meta.interestClusters ?? [];
  const warnings: string[] = [];
  const geographicRestriction = geographicRestrictionPreview(deal);
  if (geographicRestriction) {
    warnings.push(
      `Strict Meta location control: ${geographicRestriction.regionName}, ${geographicRestriction.countryCode}. Advantage+ must not expand beyond this location. Meta location is not proof of residency.`
    );
  }

  if (rawInterestClusters.length === 0) {
    warnings.push("Deal has no targetingDemographic.channelTargeting.meta.interestClusters; using static ad set fallback.");
    return {
      interestQueries: [],
      resolvedInterests: [],
      unresolvedQueries: [],
      targeting: buildDealMetaTargetingBase(deal),
      adSetMode: "static_fallback",
      geographicRestriction,
      warnings,
    };
  }

  const { queries: interestQueries, parentNodes } = await buildDealInterestQueries(
    deal,
    synthesis,
    resolveMetaParentNodesForNiche
  );

  if (!config) {
    warnings.push("Meta Ads is not configured (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID); cannot resolve interests.");
    return {
      interestQueries,
      resolvedInterests: [],
      unresolvedQueries: interestQueries,
      targeting: buildDealMetaTargetingBase(deal),
      adSetMode: "static_fallback",
      geographicRestriction,
      warnings,
    };
  }

  const resolution = await resolveInterestQueries(config, interestQueries, {
    allowGenericInterestNames: buildDealAllowedInterestNames(deal),
  });
  warnings.push(...resolution.warnings);
  if (parentNodes.length > 0) {
    warnings.push(`AI query-expansion candidates (${parentNodes.length}): ${parentNodes.join(", ")}`);
  }

  const resolvedInterests = resolution.resolvedInterests.filter((interest) =>
    isDealCompatibleMetaInterest(deal, interest.name)
  );
  const droppedResolvedInterests = resolution.resolvedInterests.filter(
    (interest) => !isDealCompatibleMetaInterest(deal, interest.name)
  );
  if (droppedResolvedInterests.length > 0) {
    warnings.push(
      `Dropped cross-campaign Meta interests for ${deal.cruiseFacts.cruiseLine}: ${droppedResolvedInterests
        .map((interest) => interest.name)
        .join(", ")}`
    );
  }

  if (resolvedInterests.length === 0) {
    warnings.push("No Meta interests resolved; using static ad set fallback.");
    return {
      interestQueries,
      resolvedInterests,
      unresolvedQueries: resolution.unresolvedQueries,
      targeting: buildDealMetaTargetingBase(deal),
      adSetMode: "static_fallback",
      geographicRestriction,
      warnings,
    };
  }

  const targeting = buildDealMetaTargetingBase(deal);
  targeting.flexible_spec = [
    { interests: resolvedInterests.map((i) => ({ id: i.id, name: i.name })) },
  ];

  return {
    interestQueries,
    resolvedInterests,
    unresolvedQueries: resolution.unresolvedQueries,
    targeting,
    adSetMode: "dynamic",
    geographicRestriction,
    warnings,
  };
}

/**
 * Build the deal's audience precision matrix: AI persona decomposition,
 * AND-layered per-cell targeting specs, and reach-estimate validation.
 * Best-effort — every Meta dependency degrades to warnings, and the caller
 * treats a thrown error as "no matrix" so the legacy path keeps working.
 */
async function buildDealAudienceMatrixForPlan(
  deal: CuratedOdysseusDeal,
  synthesis: DealMetaAdSynthesis,
  config: MetaAdsConfig | null
): Promise<DealAudienceCellMatrix | undefined> {
  if (!deal.targetingDemographic) return undefined;

  const deps: DealAudienceCellDependencies = {
    // Without Meta credentials nothing can resolve to interest ids, so skip
    // the AI decision call and let the matrix fall back to deterministic
    // blueprints (keeps offline plan builds free and reproducible).
    decompose: config ? decomposeDealAudienceCellsWithAI : async () => [],
    resolveInterests: async (queries) => {
      if (queries.length === 0) {
        return { entries: [], unresolvedQueries: [], warnings: [] };
      }
      const resolution = await resolveInterestQueries(config ?? undefined, queries, {
        allowGenericInterestNames: buildDealAllowedInterestNames(deal),
      });
      return {
        entries: resolution.resolvedInterests.map((interest) => ({
          id: interest.id,
          name: interest.name,
          type: "interests" as const,
          sourceQuery: interest.sourceQuery,
        })),
        unresolvedQueries: resolution.unresolvedQueries,
        warnings: resolution.warnings,
      };
    },
    resolveBehavior: async (hint) => {
      if (!config) return null;
      const behaviors = await searchMetaAdBehaviors(config.accessToken, hint, 6);
      const top = behaviors[0];
      return top ? { id: top.id, name: top.name, type: "behaviors" as const, sourceQuery: hint } : null;
    },
    estimateReach: async (targeting) => (config ? estimateMetaAudienceSize(config, targeting) : null),
    isCompatibleInterest: (name) => isDealCompatibleMetaInterest(deal, name),
    geoLocations: buildDealGeoLocations(deal),
  };

  return buildDealAudienceCellMatrix(deal, synthesis, deps);
}

/**
 * Turn resolved persona intent layers into one prospecting audience.
 *
 * Persona cells remain useful creative hypotheses, but dispatching several
 * overlapping Florida ad sets fragments learning and multiplies spend. The
 * consolidated ad set therefore uses the verified cruise-intent interests as
 * Advantage+ suggestions while preserving the Deal's hard geographic control.
 */
export function consolidateDealMetaProspectingTargeting(
  deal: CuratedOdysseusDeal,
  preview: DealMetaDistributionTargetingPreview,
  audienceMatrix: DealAudienceCellMatrix
): DealMetaDistributionTargetingPreview {
  const seenIds = new Set<string>();
  const intentEntries: Array<{
    id: string;
    name: string;
    sourceQuery: string;
  }> = [];

  for (const cell of audienceMatrix.cells) {
    if (!cell.dispatchable) continue;
    const intentQueryKeys = new Set(
      cell.blueprint.intentInterests.map((query) => normalizeTerm(query))
    );
    for (const layer of cell.layers) {
      for (const entry of layer.entries) {
        const belongsToIntentLayer =
          layer.role === "intent" || intentQueryKeys.has(normalizeTerm(entry.sourceQuery));
        if (!belongsToIntentLayer || entry.type !== "interests" || seenIds.has(entry.id)) continue;
        seenIds.add(entry.id);
        intentEntries.push({
          id: entry.id,
          name: entry.name,
          sourceQuery: entry.sourceQuery,
        });
      }
    }
  }

  if (intentEntries.length === 0) {
    return {
      ...preview,
      warnings: [
        ...preview.warnings,
        "Persona hypotheses produced no verified intent interests; keeping the combined targeting fallback.",
      ],
    };
  }

  const targeting = buildDealMetaTargetingBase(deal);
  targeting.flexible_spec = [
    {
      interests: intentEntries.map((entry) => ({ id: entry.id, name: entry.name })),
    },
  ];

  return {
    ...preview,
    interestQueries: intentEntries.map((entry) => entry.sourceQuery),
    resolvedInterests: intentEntries,
    targeting,
    adSetMode: "dynamic",
    warnings: [
      ...preview.warnings,
      `Consolidated ${audienceMatrix.cells.length} persona hypotheses into one Advantage+ prospecting audience using ${intentEntries.length} verified cruise-intent suggestion${intentEntries.length === 1 ? "" : "s"}. Persona distinctions remain creative tests, not separate ad sets.`,
    ],
  };
}

/**
 * Build the distribution plan for a meta ad synthesis: destination URL,
 * caption, ready carousel cards, resolved Meta targeting, and the audience
 * precision matrix. Pure preview — makes Graph API calls only for read-only
 * interest/behavior search and reach estimates, and degrades gracefully if
 * Meta Ads isn't configured.
 */
export async function planDealMetaDistribution(
  synthesis: DealMetaAdSynthesis,
  deal: CuratedOdysseusDeal
): Promise<DealMetaDistributionPlan> {
  const readyCards = synthesis.cards.filter((c) => c.status === "ready" && c.imageUrl);
  const cards: DealMetaDistributionCard[] = readyCards.map((c) => ({
    cardIndex: c.cardIndex,
    headline: c.headline,
    primaryText: c.primaryText,
    imageUrl: c.imageUrl as string,
  }));

  const destinationUrl = `${getSiteBaseUrl()}/deals/${encodeURIComponent(synthesis.dealId)}`;
  const captionSections: string[] = [];
  const seenCaptionSections = new Set<string>();
  for (const card of cards) {
    const section = card.primaryText.trim();
    if (section.length === 0 || seenCaptionSections.has(section)) continue;
    seenCaptionSections.add(section);
    captionSections.push(section);
  }
  const caption =
    captionSections.length > 0
      ? captionSections.join("\n\n")
      : synthesis.sailingAngleTitle;

  const config = getMetaAdsConfig();
  let targeting = await resolveDealMetaTargeting(deal, synthesis, config);

  let audienceMatrix: DealAudienceCellMatrix | undefined;
  try {
    audienceMatrix = await buildDealAudienceMatrixForPlan(deal, synthesis, config);
    if (audienceMatrix) {
      targeting = consolidateDealMetaProspectingTargeting(deal, targeting, audienceMatrix);
    }
  } catch (error) {
    targeting.warnings.push(
      `Audience precision matrix unavailable (${error instanceof Error ? error.message : String(error)}); falling back to combined targeting.`
    );
  }

  return {
    dealId: synthesis.dealId,
    destinationUrl,
    caption,
    cards,
    targeting,
    ...(audienceMatrix ? { audienceMatrix } : {}),
    campaignName: `[DRAFT] Deal ${synthesis.dealId} — ${synthesis.sailingAngleTitle}`,
    adSetName: `[DRAFT] Deal ${synthesis.dealId} Audience`,
    creativeName: `deal-${synthesis.dealId}-${synthesis.id}-carousel`,
    adName: `deal-${synthesis.dealId}-${synthesis.id}`,
  };
}

/**
 * A saved Step 9 plan remains reviewable only while it points at the exact
 * ready card set currently selected in Step 8. Copy or image changes require
 * the operator to build and review a new plan before distribution.
 */
export function doesDealMetaDistributionPlanMatchSynthesis(
  plan: DealMetaDistributionPlan,
  synthesis: DealMetaAdSynthesis
): boolean {
  if (plan.dealId !== synthesis.dealId) return false;

  const readyCards = synthesis.cards.filter((card) => card.status === "ready" && card.imageUrl);
  if (plan.cards.length !== readyCards.length) return false;

  return readyCards.every((card) => {
    const plannedCard = plan.cards.find((candidate) => candidate.cardIndex === card.cardIndex);
    return (
      plannedCard?.headline === card.headline &&
      plannedCard.primaryText === card.primaryText &&
      plannedCard.imageUrl === card.imageUrl
    );
  });
}

async function postMetaGraphForm<TResponse>(
  path: string,
  accessToken: string,
  form: Record<string, string>
): Promise<TResponse> {
  const formData = new URLSearchParams({ access_token: accessToken });
  for (const [key, value] of Object.entries(form)) {
    formData.append(key, value);
  }

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : JSON.stringify(payload);
    throw new Error(`Meta Graph API error (${path}): ${message}`);
  }
  return payload as TResponse;
}

async function uploadMetaImageHash(imageUrl: string, adAccountId: string, accessToken: string): Promise<string> {
  const fetchResponse = await fetch(imageUrl);
  if (!fetchResponse.ok) {
    throw new Error(`Failed to download image for Meta upload: ${fetchResponse.statusText}`);
  }
  const blob = await fetchResponse.blob();
  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("filename", blob, "ad_image.png");

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/act_${adAccountId}/adimages`, {
    method: "POST",
    body: formData as unknown as BodyInit,
  });

  const payload = (await response.json()) as { images?: Record<string, { hash?: string }> };
  if (!response.ok) {
    throw new Error(`Meta Image Upload Error: ${JSON.stringify(payload)}`);
  }
  const imageHash = payload.images?.["ad_image.png"]?.hash;
  if (!imageHash) {
    throw new Error("Meta API did not return an image hash");
  }
  return imageHash;
}

async function createInstagramGraphContainer(
  igUserId: string,
  accessToken: string,
  form: Record<string, string>
): Promise<string> {
  const response = await postMetaGraphForm<{ id?: string }>(`${igUserId}/media`, accessToken, form);
  if (!response.id) {
    throw new Error("Instagram Graph API did not return a media container id");
  }
  return response.id;
}

async function publishInstagramGraphContainer(igUserId: string, accessToken: string, creationId: string): Promise<string> {
  const response = await postMetaGraphForm<{ id?: string }>(`${igUserId}/media_publish`, accessToken, {
    creation_id: creationId,
  });
  if (!response.id) {
    throw new Error("Instagram Graph API did not return a published media id");
  }
  return response.id;
}

/**
 * Dispatch a distribution plan. "simulate" returns a "planned" record without
 * touching the Graph API (besides the read-only interest search already done
 * by planDealMetaDistribution). "live" creates the campaign/ad set, Facebook
 * carousel ad, and Instagram carousel post — all PAUSED/draft where Meta
 * allows it.
 */
export async function dispatchDealMetaDistribution(
  synthesis: DealMetaAdSynthesis,
  plan: DealMetaDistributionPlan,
  mode: DealMetaDistributionMode
): Promise<DealMetaDistribution> {
  const geographicRestriction = plan.targeting.geographicRestriction;
  if (geographicRestriction) {
    const expectedRegionKey = META_REGION_KEYS.get(
      `${geographicRestriction.countryCode}-${geographicRestriction.regionCode}`
    );
    const assertStrictGeo = (targetingSpec: Record<string, unknown>, scope: string): void => {
      const geoLocations = targetingSpec.geo_locations;
      const geoRecord =
        geoLocations && typeof geoLocations === "object" && !Array.isArray(geoLocations)
          ? (geoLocations as Record<string, unknown>)
          : {};
      const regions = Array.isArray(geoRecord.regions) ? geoRecord.regions : [];
      const hasExpectedRegion = regions.some(
        (region) =>
          region &&
          typeof region === "object" &&
          !Array.isArray(region) &&
          (region as Record<string, unknown>).key === expectedRegionKey
      );
      const hasCountryFallback = Array.isArray(geoRecord.countries) && geoRecord.countries.length > 0;
      if (!expectedRegionKey || !hasExpectedRegion || hasCountryFallback) {
        throw new Error(
          `Strict Meta geographic restriction for ${geographicRestriction.regionName} is missing or broadened (${scope}). Refusing distribution.`
        );
      }
    };
    assertStrictGeo(plan.targeting.targeting, "combined targeting");
    for (const cell of plan.audienceMatrix?.cells ?? []) {
      if (cell.dispatchable) {
        assertStrictGeo(cell.targeting, `audience cell ${cell.blueprint.cellId}`);
      }
    }
  }

  const base: DealMetaDistribution = {
    id: synthesis.id,
    dealId: synthesis.dealId,
    sourceMetaAdSynthesisId: synthesis.id,
    generatedAtIso: new Date().toISOString(),
    mode,
    status: "planned",
    plan,
    notes: [],
  };

  if (mode === "simulate") {
    const cellNotes = (plan.audienceMatrix?.cells ?? []).map((cell) => {
      const reach = cell.reach
        ? `${cell.reach.usersLowerBound?.toLocaleString("en-US") ?? "?"}-${cell.reach.usersUpperBound?.toLocaleString("en-US") ?? "?"} (${cell.reach.verdict})`
        : "no estimate";
      return `audience_cell=${cell.blueprint.cellId} precision=${cell.blueprint.precision} layers=${cell.layers.length} dispatchable=${cell.dispatchable} reach=${reach}`;
    });
    return {
      ...base,
      notes: [
        `simulated_at=${new Date().toISOString()}`,
        `cards=${plan.cards.length}`,
        `ad_set_mode=${plan.targeting.adSetMode}`,
        ...(plan.audienceMatrix
          ? [`audience_matrix_source=${plan.audienceMatrix.source}`, ...cellNotes]
          : []),
        ...plan.targeting.warnings.map((w) => `targeting_warning=${w}`),
      ],
    };
  }

  if (mode === "organic_page_only") {
    const config = getMetaAdsConfig();
    if (!config) {
      return {
        ...base,
        status: "error",
        error: "Missing META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, or META_PAGE_ID.",
      };
    }
    if (plan.cards.length === 0) {
      return {
        ...base,
        status: "error",
        error: "No ready carousel cards to publish. Generate at least one card image first.",
      };
    }

    try {
      const result = await publishFacebookPagePost(config, {
        message: `${plan.caption}

${plan.destinationUrl}`.trim(),
        imageUrls: plan.cards.map((card) => card.imageUrl),
        imageUrl: plan.cards[0]?.imageUrl,
        published: true,
      });

      return {
        ...base,
        status: "dispatched",
        facebookPagePostId: result.postId,
        notes: [
          `facebook_page_id=${config.pageId}`,
          `facebook_page_post_id=${result.postId}`,
          `facebook_page_published=${result.published}`,
          `facebook_page_media_type=${plan.cards.length > 1 ? "multi_image" : "single_image"}`,
          `facebook_page_card_count=${plan.cards.length}`,
          `facebook_page_destination_url=${plan.destinationUrl}`,
          `facebook_page_dispatched_at=${new Date().toISOString()}`,
        ],
      };
    } catch (error: unknown) {
      return {
        ...base,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── live ─────────────────────────────────────────────────────────────────
  const config = getMetaAdsConfig();
  if (!config) {
    return {
      ...base,
      status: "error",
      error: "Missing META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, or META_PAGE_ID.",
    };
  }
  if (plan.cards.length === 0) {
    return {
      ...base,
      status: "error",
      error: "No ready carousel cards to dispatch. Generate images for at least one card first.",
    };
  }

  const notes: string[] = [];
  let metaCampaignId: string | undefined;
  let metaAdSetId: string | undefined;
  let metaAdSetMode: "dynamic" | "static_fallback" = plan.targeting.adSetMode;

  try {
    if (plan.targeting.adSetMode === "dynamic") {
      const adSetWindow = buildMetaAdSetWindow();
      try {
        metaCampaignId = await createMetaCampaign(config, { name: plan.campaignName });
        metaAdSetId = await createDealMetaAdSetWithAgeRetry(config, {
          name: plan.adSetName,
          campaignId: metaCampaignId,
          targeting: plan.targeting.targeting,
          dailyBudgetCents: getMetaDailyBudgetCents(),
          startTime: adSetWindow.startTime,
          endTime: adSetWindow.endTime,
        }, notes);
        notes.push(
          "prospecting_structure=One consolidated paused ad set; persona hypotheses remain creative tests.",
          "prospecting_optimization=OUTCOME_TRAFFIC with LANDING_PAGE_VIEWS. Do not describe landing-page-view results as proven booking conversions."
        );
      } catch (campaignError: unknown) {
        const reason = campaignError instanceof Error ? campaignError.message : String(campaignError);
        metaCampaignId = undefined;
        metaAdSetId = undefined;
        throw new Error(
          `Dynamic Deal campaign/ad set creation failed. Deal Meta dispatch does not reuse META_AD_SET_ID because archived fallback ad sets reject new ads. Reason: ${reason}`
        );
      }
    } else {
      throw new Error(
        "No Meta interests resolved. Deal Meta dispatch requires a fresh dynamic ad set and will not reuse META_AD_SET_ID."
      );
    }

    // Upload each card image once; reuse the hash for both the Facebook
    // carousel attachments and as a fallback if the Instagram child container
    // creation needs re-attempting.
    const imageHashes: string[] = [];
    for (const card of plan.cards) {
      const hash = await uploadMetaImageHash(card.imageUrl, config.adAccountId, config.accessToken);
      imageHashes.push(hash);
    }

    // Facebook carousel link ad: one adcreative with child_attachments, one
    // paused ad.
    const childAttachments = plan.cards.map((card, idx) => ({
      link: plan.destinationUrl,
      name: card.headline,
      description: card.primaryText,
      image_hash: imageHashes[idx],
      call_to_action: {
        type: "LEARN_MORE",
        value: { link: plan.destinationUrl },
      },
    }));

    const objectStorySpec = {
      page_id: config.pageId,
      link_data: {
        link: plan.destinationUrl,
        message: plan.caption,
        child_attachments: childAttachments,
        multi_share_end_card: false,
        call_to_action: {
          type: "LEARN_MORE",
          value: { link: plan.destinationUrl },
        },
      },
      ...(config.instagramActorId ? { instagram_actor_id: config.instagramActorId } : {}),
    };

    const creativeResponse = await postMetaGraphForm<{ id: string }>(
      `act_${config.adAccountId}/adcreatives`,
      config.accessToken,
      {
        name: plan.creativeName,
        object_story_spec: JSON.stringify(objectStorySpec),
      }
    );

    if (!metaAdSetId) {
      throw new Error("No ad set id available for ad creation.");
    }

    const adResponse = await postMetaGraphForm<{ id: string }>(`act_${config.adAccountId}/ads`, config.accessToken, {
      name: plan.adName,
      adset_id: metaAdSetId,
      creative: JSON.stringify({ creative_id: creativeResponse.id }),
      status: "PAUSED",
    });
    const primaryAdId = adResponse.id;

    const reviewUrl = buildMetaAdsReviewUrl(config.adAccountId, primaryAdId);

    notes.push(
      `meta_ad_account_id=${config.adAccountId}`,
      ...(metaCampaignId ? [`meta_campaign_id=${metaCampaignId}`] : []),
      `meta_ad_set_id=${metaAdSetId}`,
      `meta_ad_set_mode=${metaAdSetMode}`,
      `meta_ad_creative_id=${creativeResponse.id}`,
      `meta_ad_id=${primaryAdId}`,
      `meta_review_url=${reviewUrl}`,
      `meta_dispatched_at=${new Date().toISOString()}`
    );

    // Instagram Graph carousel: one child container per card + one CAROUSEL
    // parent, then publish.
    let instagramCarouselContainerId: string | undefined;
    let instagramMediaId: string | undefined;
    const igUserId = config.instagramActorId?.trim();
    if (igUserId) {
      try {
        const childIds: string[] = [];
        for (const card of plan.cards) {
          const childId = await createInstagramGraphContainer(igUserId, config.accessToken, {
            image_url: card.imageUrl,
            is_carousel_item: "true",
          });
          childIds.push(childId);
        }

        instagramCarouselContainerId = await createInstagramGraphContainer(igUserId, config.accessToken, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: plan.caption,
        });

        instagramMediaId = await publishInstagramGraphContainer(igUserId, config.accessToken, instagramCarouselContainerId);

        notes.push(
          `instagram_graph_user_id=${igUserId}`,
          `instagram_graph_creation_id=${instagramCarouselContainerId}`,
          `instagram_graph_media_id=${instagramMediaId}`
        );
      } catch (igError: unknown) {
        notes.push(`instagram_graph_failed=${igError instanceof Error ? igError.message : String(igError)}`);
      }
    } else {
      notes.push("instagram_graph_skipped=META_INSTAGRAM_ACTOR_ID not configured.");
    }

    return {
      ...base,
      status: "dispatched",
      metaCampaignId,
      metaAdSetId,
      metaAdSetMode,
      facebookCreativeId: creativeResponse.id,
      facebookAdId: primaryAdId,
      instagramCarouselContainerId,
      instagramMediaId,
      reviewUrl,
      notes,
    };
  } catch (error: unknown) {
    return {
      ...base,
      status: "error",
      metaCampaignId,
      metaAdSetId,
      metaAdSetMode,
      notes,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
