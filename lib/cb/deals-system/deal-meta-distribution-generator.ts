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
  getMetaAdsConfig,
  buildMetaAdsReviewUrl,
  type MetaAdsConfig,
} from "@/lib/integrations/meta-ads";
import {
  appendInterestAtoms,
  isGenericTerm,
  MAX_INTEREST_QUERIES,
  normalizeTerm,
  pushUnique,
  resolveInterestQueries,
  resolveMetaParentNodesForNiche,
} from "@/lib/campaigns/distribution/platforms/meta-ads/interest-resolution-core";

const GRAPH_VERSION = "v22.0";

function getSiteBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://leisurelifeinteractive.net";
  return configured.replace(/\/$/, "");
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

/**
 * Build the deal's interest query list: niche interestClusters first (the
 * highest-signal, most specific terms), then AI-resolved broad "parent node"
 * categories (verified Meta taxonomy names) so the ad set stays deliverable
 * even when hyper-niche terms like "Ironsworn Starforged" don't resolve,
 * then secondary nicheKeywords/creativeHooks/behaviorSignals atoms.
 */
async function buildDealInterestQueries(
  deal: CuratedOdysseusDeal,
  resolveParentNodes: (nicheContext: string, seeds: string[]) => Promise<string[]>
): Promise<{ queries: string[]; parentNodes: string[] }> {
  const meta = deal.targetingDemographic?.channelTargeting.meta;
  const nicheKeywords = deal.targetingDemographic?.nicheKeywords;
  const primaryAudience = deal.targetingDemographic?.primaryAudience;

  const seedKeywords = (meta?.interestClusters ?? [])
    .map(normalizeTerm)
    .filter((term) => term.length > 0 && !isGenericTerm(term));

  // Reserve room in the MAX_INTEREST_QUERIES budget for AI-resolved parent
  // nodes — they're the deliverability fallback for hyper-niche clusters
  // (e.g. "Ironsworn Starforged") that rarely resolve verbatim, so they must
  // not get crowded out by a long interestClusters list.
  const seedBudget = Math.max(1, MAX_INTEREST_QUERIES - 6);
  const queries: string[] = [];
  for (const seed of seedKeywords) {
    pushUnique(queries, seed, seedBudget);
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

  return { queries, parentNodes };
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
  config: MetaAdsConfig | null
): Promise<DealMetaDistributionTargetingPreview> {
  const rawInterestClusters = deal.targetingDemographic?.channelTargeting.meta.interestClusters ?? [];
  const warnings: string[] = [];

  if (rawInterestClusters.length === 0) {
    warnings.push("Deal has no targetingDemographic.channelTargeting.meta.interestClusters; using static ad set fallback.");
    return {
      interestQueries: [],
      resolvedInterests: [],
      unresolvedQueries: [],
      targeting: { geo_locations: { countries: ["US"] } },
      adSetMode: "static_fallback",
      warnings,
    };
  }

  const { queries: interestQueries, parentNodes } = await buildDealInterestQueries(deal, resolveMetaParentNodesForNiche);

  if (!config) {
    warnings.push("Meta Ads is not configured (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID); cannot resolve interests.");
    return {
      interestQueries,
      resolvedInterests: [],
      unresolvedQueries: interestQueries,
      targeting: { geo_locations: { countries: ["US"] } },
      adSetMode: "static_fallback",
      warnings,
    };
  }

  const resolution = await resolveInterestQueries(config, interestQueries);
  warnings.push(...resolution.warnings);
  if (parentNodes.length > 0) {
    warnings.push(`AI-resolved parent nodes (${parentNodes.length}): ${parentNodes.join(", ")}`);
  }

  if (resolution.resolvedInterests.length === 0) {
    warnings.push("No Meta interests resolved; using static ad set fallback.");
    return {
      interestQueries,
      resolvedInterests: resolution.resolvedInterests,
      unresolvedQueries: resolution.unresolvedQueries,
      targeting: { geo_locations: { countries: ["US"] } },
      adSetMode: "static_fallback",
      warnings,
    };
  }

  return {
    interestQueries,
    resolvedInterests: resolution.resolvedInterests,
    unresolvedQueries: resolution.unresolvedQueries,
    targeting: {
      geo_locations: { countries: ["US"] },
      flexible_spec: [{ interests: resolution.resolvedInterests.map((i) => ({ id: i.id, name: i.name })) }],
    },
    adSetMode: "dynamic",
    warnings,
  };
}

/**
 * Build the distribution plan for a meta ad synthesis: destination URL,
 * caption, ready carousel cards, and resolved Meta targeting. Pure preview —
 * makes Graph API calls only to resolve interest ids (read-only search), and
 * degrades gracefully if Meta Ads isn't configured.
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
  const caption = cards[0]?.primaryText ?? synthesis.sailingAngleTitle;

  const config = getMetaAdsConfig();
  const targeting = await resolveDealMetaTargeting(deal, config);

  return {
    dealId: synthesis.dealId,
    destinationUrl,
    caption,
    cards,
    targeting,
    campaignName: `[DRAFT] Deal ${synthesis.dealId} — ${synthesis.sailingAngleTitle}`,
    adSetName: `[DRAFT] Deal ${synthesis.dealId} Audience`,
    creativeName: `deal-${synthesis.dealId}-${synthesis.id}-carousel`,
    adName: `deal-${synthesis.dealId}-${synthesis.id}`,
  };
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

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
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

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/act_${adAccountId}/adimages`, {
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
    return {
      ...base,
      notes: [
        `simulated_at=${new Date().toISOString()}`,
        `cards=${plan.cards.length}`,
        `ad_set_mode=${plan.targeting.adSetMode}`,
        ...plan.targeting.warnings.map((w) => `targeting_warning=${w}`),
      ],
    };
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
        metaAdSetId = await createMetaAdSet(config, {
          name: plan.adSetName,
          campaignId: metaCampaignId,
          targeting: plan.targeting.targeting,
          dailyBudgetCents: getMetaDailyBudgetCents(),
          startTime: adSetWindow.startTime,
          endTime: adSetWindow.endTime,
          status: "PAUSED",
        });
      } catch (campaignError: unknown) {
        const reason = campaignError instanceof Error ? campaignError.message : String(campaignError);
        metaCampaignId = undefined;
        metaAdSetId = undefined;
        if (config.adSetId) {
          metaAdSetId = config.adSetId;
          metaAdSetMode = "static_fallback";
          notes.push(`dynamic_campaign_failed=${reason}`, "ad_set_mode=static_fallback");
        } else {
          throw new Error(`Dynamic campaign creation failed and META_AD_SET_ID fallback is not configured. Reason: ${reason}`);
        }
      }
    } else if (config.adSetId) {
      metaAdSetId = config.adSetId;
      notes.push("ad_set_mode=static_fallback");
    } else {
      throw new Error("No Meta interests resolved and META_AD_SET_ID fallback is not configured.");
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

    const reviewUrl = buildMetaAdsReviewUrl(config.adAccountId, adResponse.id);

    notes.push(
      `meta_ad_account_id=${config.adAccountId}`,
      ...(metaCampaignId ? [`meta_campaign_id=${metaCampaignId}`] : []),
      `meta_ad_set_id=${metaAdSetId}`,
      `meta_ad_set_mode=${metaAdSetMode}`,
      `meta_ad_creative_id=${creativeResponse.id}`,
      `meta_ad_id=${adResponse.id}`,
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
      facebookAdId: adResponse.id,
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
