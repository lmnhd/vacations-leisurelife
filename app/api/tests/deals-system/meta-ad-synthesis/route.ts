/**
 * Meta Ad Synthesis route (deal workflow step 8).
 *
 * GET  -> { ok, funnelSyntheses, syntheses } — Step 7 funnel syntheses (source
 *         of the Meta carousel copy) and existing meta ad syntheses.
 *
 * POST { action: "init", funnelSynthesisId }
 *   -> build (or reset) a meta ad synthesis from a funnel synthesis's carousel
 *      cards, seeded with the default editable prompt template. Persist + return.
 *
 * POST { action: "update_prompt", synthesisId, promptTemplate }
 *   -> save the operator's edited prompt template. No AI.
 *
 * POST { action: "update_style", synthesisId, selectedStyleId }
 *   -> save an operator style selection. No image generation.
 *
 * POST { action: "recommend_style", synthesisId }
 *   -> refresh the AI recommendation without changing the active style.
 *
 * POST { action: "generate_image", synthesisId, cardIndex }
 *   -> interpolate the template for this card and generate its image with
 *      gpt-image-2. Persist + return.
 *
 * Storage: DynamoDB (deals-dynamo-store) is the primary source of truth. The
 * same store feeds public /deals/[id]. Successful writes are also mirrored into
 * the local JSON cache so operator-only test routes can keep working through
 * temporary Dynamo/DNS outages.
 */

import { NextResponse } from "next/server";

import {
  buildDealMetaAdSynthesis,
  generateDealMetaAdCardImage,
  getDealMetaAdSynthesis,
  isDealMetaAdStylePresetId,
  listCuratedDeals,
  loadCuratedDealsCache,
  loadDealAdCopyCache,
  loadDealMetaAdSynthesisCache,
  loadDealUnifiedManifestsCache,
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
  recommendDealMetaAdStyle,
  revertDealMetaAdCardImage,
  saveDealMetaAdSynthesisCache,
  selectedDealMetaAdStyleId,
  upsertDealMetaAdSynthesisRecord,
  upsertDealMetaAdSynthesis,
  type CuratedOdysseusDeal,
  type DealFunnelSynthesis,
  type DealMetaAdSynthesis,
  type DealMetaAdStyleRecommendation,
  type DealMetaAdStylePresetId,
  type DealMetaStyleDecisionContext,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

function mergeExistingGeneratedCards(
  fresh: DealMetaAdSynthesis,
  existing?: DealMetaAdSynthesis
): DealMetaAdSynthesis {
  if (!existing) return fresh;
  const adoptsFreshRecommendation =
    !existing.styleRecommendation && Boolean(fresh.styleRecommendation);
  const keepsOperatorSelection =
    existing.styleSelectionSource === "operator";

  return {
    ...fresh,
    generatedAtIso: existing.generatedAtIso,
    promptTemplate: existing.promptTemplate || fresh.promptTemplate,
    recommendedStyleId: adoptsFreshRecommendation
      ? fresh.recommendedStyleId
      : existing.recommendedStyleId ?? fresh.recommendedStyleId,
    selectedStyleId:
      adoptsFreshRecommendation && !keepsOperatorSelection
        ? fresh.selectedStyleId
        : existing.selectedStyleId ?? fresh.selectedStyleId,
    styleRecommendation: adoptsFreshRecommendation
      ? fresh.styleRecommendation
      : existing.styleRecommendation ?? fresh.styleRecommendation,
    styleSelectionSource:
      adoptsFreshRecommendation && !keepsOperatorSelection
        ? fresh.styleSelectionSource
        : existing.styleSelectionSource ?? fresh.styleSelectionSource,
    styleSelectedAtIso:
      adoptsFreshRecommendation && !keepsOperatorSelection
        ? fresh.styleSelectedAtIso
        : existing.styleSelectedAtIso ?? fresh.styleSelectedAtIso,
    styleRecommendationWarning: adoptsFreshRecommendation
      ? fresh.styleRecommendationWarning
      : existing.styleRecommendationWarning ??
        fresh.styleRecommendationWarning,
    cards: fresh.cards.map((freshCard) => {
      const existingCard = existing.cards.find((card) => card.cardIndex === freshCard.cardIndex);
      const imageDirection = existingCard?.imageDirection;
      if (
        !existingCard ||
        existingCard.headline !== freshCard.headline ||
        existingCard.primaryText !== freshCard.primaryText ||
        !existingCard.imageUrl
      ) {
        return { ...freshCard, imageDirection };
      }

      return {
        ...freshCard,
        imageDirection,
        status: existingCard.status,
        imageUrl: existingCard.imageUrl,
        generator: existingCard.generator,
        promptUsed: existingCard.promptUsed,
        generatedAtIso: existingCard.generatedAtIso,
        error: existingCard.error,
        previousImages: existingCard.previousImages,
      };
    }),
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  funnelSynthesisId?: unknown;
  synthesisId?: unknown;
  promptTemplate?: unknown;
  imageDirection?: unknown;
  cardIndex?: unknown;
  promptSuffix?: unknown;
  historyIndex?: unknown;
  selectedStyleId?: unknown;
  useRecommendation?: unknown;
}

async function loadFunnelSyntheses(): Promise<DealFunnelSynthesis[]> {
  try {
    return await listDealFunnelSyntheses();
  } catch {
    return [];
  }
}

async function loadSyntheses(): Promise<DealMetaAdSynthesis[]> {
  try {
    return await listDealMetaAdSyntheses();
  } catch {
    return loadDealMetaAdSynthesisCache().syntheses;
  }
}

async function loadCuratedDealRecords(): Promise<CuratedOdysseusDeal[]> {
  try {
    return await listCuratedDeals();
  } catch {
    try {
      return loadCuratedDealsCache().deals;
    } catch {
      return [];
    }
  }
}

function recentStyleIds(
  syntheses: DealMetaAdSynthesis[],
  excludedId: string
): DealMetaAdStylePresetId[] {
  return syntheses
    .filter((synthesis) => synthesis.id !== excludedId)
    .sort((a, b) => {
      const aTime = Date.parse(a.styleSelectedAtIso ?? a.generatedAtIso);
      const bTime = Date.parse(b.styleSelectedAtIso ?? b.generatedAtIso);
      return bTime - aTime;
    })
    .slice(0, 5)
    .map(selectedDealMetaAdStyleId);
}

async function buildStyleDecisionContext(
  funnelSynthesis: DealFunnelSynthesis
): Promise<DealMetaStyleDecisionContext> {
  const [curatedDeals, syntheses] = await Promise.all([
    loadCuratedDealRecords(),
    loadSyntheses(),
  ]);
  const deal = curatedDeals.find(
    (candidate) =>
      candidate.id === funnelSynthesis.dealId ||
      candidate.packageId === funnelSynthesis.dealId
  );

  let unified;
  try {
    const adCopy = loadDealAdCopyCache().adCopies.find(
      (candidate) => candidate.id === funnelSynthesis.sourceAdCopyId
    );
    unified = adCopy
      ? loadDealUnifiedManifestsCache().manifests.find(
          (candidate) => candidate.id === adCopy.sourceUnifiedManifestId
        )
      : undefined;
  } catch {
    unified = undefined;
  }

  const campaignStrategy = deal?.campaignStrategy;
  const angle = unified?.creativeBrief.angle;
  const promotionSummaries =
    unified?.inventoryManifest.promotionBriefs
      .map((promotion) => promotion.visitorFriendlySummary.trim())
      .filter(Boolean) ?? [];
  const targetingKeywords = [
    ...(campaignStrategy?.targetingKeywords ?? []),
    ...(angle?.relevantKeywords ?? []),
  ].filter((keyword, index, values) => values.indexOf(keyword) === index);

  return {
    dealId: funnelSynthesis.dealId,
    sailingAngleTitle: funnelSynthesis.sailingAngleTitle,
    campaignAngle: campaignStrategy?.campaignAngle ?? angle?.theCorePitch,
    visualAngle: campaignStrategy?.visualAngle ?? angle?.visualAnchor,
    targetAudience:
      campaignStrategy?.targetAudience ??
      angle?.targetAudienceDescriptor ??
      deal?.targetingDemographic?.primaryAudience.description,
    targetingKeywords,
    cruiseLine:
      deal?.cruiseFacts.cruiseLine ??
      unified?.inventoryManifest.assembleDraft.cruiseLine,
    shipName: deal?.cruiseFacts.shipName,
    destination:
      deal?.cruiseFacts.itineraryName ??
      unified?.inventoryManifest.assembleDraft.destination,
    nights:
      deal?.cruiseFacts.nights ??
      unified?.inventoryManifest.assembleDraft.nights,
    itinerarySummary:
      deal?.cruiseFacts.portsOfCall.join(", ") ||
      unified?.inventoryManifest.assembleDraft.portsOfCall.join(", "),
    publicPromotionSummary:
      promotionSummaries.length > 0
        ? promotionSummaries.join(" ")
        : undefined,
    cards: funnelSynthesis.carousel.cards.map((card, cardIndex) => ({
      cardIndex,
      headline: card.headline,
      primaryText: card.primaryText,
    })),
    recentStyleIds: recentStyleIds(syntheses, funnelSynthesis.id),
  };
}

async function recommendStyleForFunnel(
  funnelSynthesis: DealFunnelSynthesis
): Promise<DealMetaAdStyleRecommendation> {
  return recommendDealMetaAdStyle(
    await buildStyleDecisionContext(funnelSynthesis)
  );
}

async function saveMetaAdSynthesis(synthesis: DealMetaAdSynthesis): Promise<void> {
  await upsertDealMetaAdSynthesisRecord(synthesis);
  try {
    const cache = upsertDealMetaAdSynthesis(loadDealMetaAdSynthesisCache(), synthesis);
    saveDealMetaAdSynthesisCache(cache);
  } catch {
    // The Dynamo write is authoritative; local mirroring is only a workbench
    // fallback for temporary Dynamo/DNS outages.
  }
}

async function findMetaAdSynthesis(synthesisId: string): Promise<DealMetaAdSynthesis | null> {
  try {
    const synthesis = await getDealMetaAdSynthesis(synthesisId);
    if (synthesis) return synthesis;
  } catch {
    // Fall through to local mirror.
  }
  return loadDealMetaAdSynthesisCache().syntheses.find((synthesis) => synthesis.id === synthesisId) ?? null;
}

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    funnelSyntheses: await loadFunnelSyntheses(),
    syntheses: await loadSyntheses(),
  });
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  // ── init ─────────────────────────────────────────────────────────────────────
  if (action === "init") {
    const funnelSynthesisId =
      typeof body.funnelSynthesisId === "string" ? body.funnelSynthesisId.trim() : "";
    if (!funnelSynthesisId) {
      return NextResponse.json(
        { ok: false, error: "funnelSynthesisId is required." },
        { status: 400 }
      );
    }
    const funnelSynthesis = (await loadFunnelSyntheses()).find((s) => s.id === funnelSynthesisId);
    if (!funnelSynthesis) {
      return NextResponse.json(
        { ok: false, error: `No funnel synthesis found with id "${funnelSynthesisId}".` },
        { status: 404 }
      );
    }

    try {
      const existing = (await findMetaAdSynthesis(funnelSynthesis.id)) ?? undefined;
      let styleRecommendation = existing?.styleRecommendation;
      let styleRecommendationWarning: string | undefined;
      if (!styleRecommendation) {
        try {
          styleRecommendation = await recommendStyleForFunnel(funnelSynthesis);
        } catch (error) {
          styleRecommendationWarning =
            error instanceof Error ? error.message : String(error);
        }
      }
      const fresh = buildDealMetaAdSynthesis(funnelSynthesis, {
        styleRecommendation,
        styleRecommendationWarning,
      });
      const synthesis = mergeExistingGeneratedCards(fresh, existing);
      await saveMetaAdSynthesis(synthesis);
      return NextResponse.json({ ok: true, synthesis, syntheses: await loadSyntheses() });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // -- update_style ----------------------------------------------------------
  if (action === "update_style") {
    const synthesisId =
      typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json(
        { ok: false, error: "synthesisId is required." },
        { status: 400 }
      );
    }
    if (!isDealMetaAdStylePresetId(body.selectedStyleId)) {
      return NextResponse.json(
        { ok: false, error: "selectedStyleId is invalid." },
        { status: 400 }
      );
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: `No meta ad synthesis found with id "${synthesisId}".`,
        },
        { status: 404 }
      );
    }

    const useRecommendation =
      body.useRecommendation === true &&
      body.selectedStyleId === existing.recommendedStyleId;
    const updated: DealMetaAdSynthesis = {
      ...existing,
      selectedStyleId: body.selectedStyleId,
      styleSelectionSource: useRecommendation
        ? "ai_recommended"
        : "operator",
      styleSelectedAtIso: new Date().toISOString(),
    };
    try {
      await saveMetaAdSynthesis(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // -- recommend_style -------------------------------------------------------
  if (action === "recommend_style") {
    const synthesisId =
      typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json(
        { ok: false, error: "synthesisId is required." },
        { status: 400 }
      );
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: `No meta ad synthesis found with id "${synthesisId}".`,
        },
        { status: 404 }
      );
    }
    const funnelSynthesis = (await loadFunnelSyntheses()).find(
      (candidate) => candidate.id === existing.sourceFunnelSynthesisId
    );
    if (!funnelSynthesis) {
      return NextResponse.json(
        { ok: false, error: "Source funnel synthesis not found." },
        { status: 404 }
      );
    }

    try {
      const styleRecommendation =
        await recommendStyleForFunnel(funnelSynthesis);
      const updated: DealMetaAdSynthesis = {
        ...existing,
        recommendedStyleId: styleRecommendation.recommendedStyleId,
        styleRecommendation,
        styleRecommendationWarning: undefined,
      };
      await saveMetaAdSynthesis(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── update_prompt ────────────────────────────────────────────────────────────
  if (action === "update_prompt") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const promptTemplate = typeof body.promptTemplate === "string" ? body.promptTemplate : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!promptTemplate.trim()) {
      return NextResponse.json({ ok: false, error: "promptTemplate is required." }, { status: 400 });
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealMetaAdSynthesis = { ...existing, promptTemplate };
      await saveMetaAdSynthesis(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── update_card_direction ───────────────────────────────────────────────────
  if (action === "update_card_direction") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const cardIndex = Number(body.cardIndex);
    const imageDirection = typeof body.imageDirection === "string" ? body.imageDirection.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json({ ok: false, error: "cardIndex must be a non-negative integer." }, { status: 400 });
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    if (!existing.cards.some((card) => card.cardIndex === cardIndex)) {
      return NextResponse.json(
        { ok: false, error: `No card with index ${cardIndex} in synthesis "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealMetaAdSynthesis = {
        ...existing,
        cards: existing.cards.map((card) =>
          card.cardIndex === cardIndex
            ? { ...card, imageDirection: imageDirection || undefined }
            : card
        ),
      };
      await saveMetaAdSynthesis(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── generate_image ───────────────────────────────────────────────────────────
  if (action === "generate_image") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const cardIndex = Number(body.cardIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json({ ok: false, error: "cardIndex must be a non-negative integer." }, { status: 400 });
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    if (!existing.cards.some((c) => c.cardIndex === cardIndex)) {
      return NextResponse.json(
        { ok: false, error: `No card with index ${cardIndex} in synthesis "${synthesisId}".` },
        { status: 404 }
      );
    }

    // Generation is slow (tens of seconds); re-read the record just before
    // merging so a parallel "generate all" doesn't clobber sibling cards'
    // updates written while this request was in flight.
    const existingSynthesis = existing;
    async function mergeCardIntoLatest(
      card: DealMetaAdSynthesis["cards"][number]
    ): Promise<DealMetaAdSynthesis> {
      const latest = (await findMetaAdSynthesis(synthesisId)) ?? existingSynthesis;
      const synthesis: DealMetaAdSynthesis = {
        ...latest,
        cards: latest.cards.map((c) => (c.cardIndex === cardIndex ? card : c)),
      };
      await saveMetaAdSynthesis(synthesis);
      return synthesis;
    }

    const promptSuffix = typeof body.promptSuffix === "string" ? body.promptSuffix : undefined;

    try {
      const updatedCard = await generateDealMetaAdCardImage(existing, cardIndex, promptSuffix);
      const synthesis = await mergeCardIntoLatest(updatedCard);
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      // Persist the error onto the card so the operator sees it without losing
      // the rest of the synthesis (other cards' images stay intact).
      const failedCard: DealMetaAdSynthesis["cards"][number] = {
        ...existing.cards.find((c) => c.cardIndex === cardIndex)!,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      let synthesis: DealMetaAdSynthesis = {
        ...existing,
        cards: existing.cards.map((c) => (c.cardIndex === cardIndex ? failedCard : c)),
      };
      try {
        synthesis = await mergeCardIntoLatest(failedCard);
      } catch {
        // best-effort persistence of the error state
      }
      return NextResponse.json(
        { ok: false, error: failedCard.error, synthesis },
        { status: 500 }
      );
    }
  }

  // ── revert_image ─────────────────────────────────────────────────────────────
  if (action === "revert_image") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const cardIndex = Number(body.cardIndex);
    const historyIndex = Number(body.historyIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json({ ok: false, error: "cardIndex must be a non-negative integer." }, { status: 400 });
    }
    if (!Number.isInteger(historyIndex) || historyIndex < 0) {
      return NextResponse.json({ ok: false, error: "historyIndex must be a non-negative integer." }, { status: 400 });
    }
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const revertedCard = revertDealMetaAdCardImage(existing, cardIndex, historyIndex);
      const synthesis: DealMetaAdSynthesis = {
        ...existing,
        cards: existing.cards.map((c) => (c.cardIndex === cardIndex ? revertedCard : c)),
      };
      await saveMetaAdSynthesis(synthesis);
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
