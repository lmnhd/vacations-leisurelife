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
import { newReferenceId } from "@/lib/cb/deals-system/deal-meta-ad-references";
import type {
  DealMetaAdGenerationMode,
  DealMetaImageReference,
  DealMetaReferenceRole,
} from "@/lib/cb/deals-system/deal-meta-ad-synthesis-types";
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
    // Operator-curated and never derivable from the funnel — a re-init must not
    // silently discard the campaign's ship anchor.
    shipIdentityReference: existing.shipIdentityReference,
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
      // Reference selections survive a copy change for the same reason
      // imageDirection does: they are operator curation, not funnel-derived.
      const references = existingCard?.references;
      const disableShipAnchor = existingCard?.disableShipAnchor;
      if (
        !existingCard ||
        existingCard.headline !== freshCard.headline ||
        existingCard.primaryText !== freshCard.primaryText ||
        !existingCard.imageUrl
      ) {
        return { ...freshCard, imageDirection, references, disableShipAnchor };
      }

      return {
        ...freshCard,
        imageDirection,
        references,
        disableShipAnchor,
        status: existingCard.status,
        imageUrl: existingCard.imageUrl,
        generator: existingCard.generator,
        promptUsed: existingCard.promptUsed,
        generatedAtIso: existingCard.generatedAtIso,
        error: existingCard.error,
        previousImages: existingCard.previousImages,
        mode: existingCard.mode,
        derivedFromImageUrl: existingCard.derivedFromImageUrl,
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
  mode?: unknown;
  reference?: unknown;
  referenceId?: unknown;
  disableShipAnchor?: unknown;
}

const GENERATION_MODES: DealMetaAdGenerationMode[] = [
  "text_only",
  "new_variation",
  "edit_current",
];

function isGenerationMode(value: unknown): value is DealMetaAdGenerationMode {
  return typeof value === "string" && GENERATION_MODES.includes(value as DealMetaAdGenerationMode);
}

const REFERENCE_ROLES: DealMetaReferenceRole[] = [
  "ship_identity",
  "destination_truth",
  "composition",
  "style",
  "object",
];

/**
 * Validate an operator-supplied reference.
 *
 * Release 1 admits only already-owned, fetchable http(s) URLs (card history and
 * funnel candidates). Upload/url_import arrive in Release 2 behind the hardened
 * import path, so anything else is rejected here rather than reaching the image
 * API as an arbitrary URL.
 */
function parseReference(value: unknown): DealMetaImageReference | { error: string } {
  if (!value || typeof value !== "object") return { error: "reference must be an object." };
  const raw = value as Record<string, unknown>;

  const assetUrl = typeof raw.assetUrl === "string" ? raw.assetUrl.trim() : "";
  if (!assetUrl) return { error: "reference.assetUrl is required." };
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(assetUrl, "https://placeholder.invalid");
  } catch {
    return { error: "reference.assetUrl is not a valid URL." };
  }
  const isRelative = assetUrl.startsWith("/");
  if (!isRelative && parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { error: "reference.assetUrl must be an http(s) or app-relative URL." };
  }

  const role = raw.role;
  if (typeof role !== "string" || !REFERENCE_ROLES.includes(role as DealMetaReferenceRole)) {
    return { error: `reference.role must be one of: ${REFERENCE_ROLES.join(", ")}.` };
  }

  const source = raw.source;
  if (source !== "funnel_candidate" && source !== "card_history") {
    return {
      error:
        "reference.source must be funnel_candidate or card_history. Uploads and URL imports arrive in Release 2.",
    };
  }

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newReferenceId(),
    assetUrl,
    thumbnailUrl: typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : undefined,
    role: role as DealMetaReferenceRole,
    source,
    sourceCandidateId:
      typeof raw.sourceCandidateId === "string" ? raw.sourceCandidateId : undefined,
    sourceCardIndex:
      typeof raw.sourceCardIndex === "number" && Number.isInteger(raw.sourceCardIndex)
        ? raw.sourceCardIndex
        : undefined,
    originalSourceUrl:
      typeof raw.originalSourceUrl === "string" ? raw.originalSourceUrl : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    addedAtIso: new Date().toISOString(),
  };
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

  // ── set_ship_anchor / clear_ship_anchor ──────────────────────────────────────
  //
  // Both re-read the record immediately before writing, for the same reason
  // generate_image does: image generation takes tens of seconds, so a "generate
  // all 4" run can easily be in flight. Writing a whole synthesis built from a
  // stale snapshot would silently roll back sibling cards' results.
  if (action === "set_ship_anchor" || action === "clear_ship_anchor") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }

    let anchor: DealMetaImageReference | undefined;
    if (action === "set_ship_anchor") {
      const parsed = parseReference(body.reference);
      if ("error" in parsed) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      // The anchor's whole purpose is ship identity; accepting another role here
      // is what would let a destination photo become a ship-identity claim.
      if (parsed.role !== "ship_identity") {
        return NextResponse.json(
          { ok: false, error: "The ship anchor must use the ship_identity role." },
          { status: 400 }
        );
      }
      anchor = parsed;
    }

    const latest = await findMetaAdSynthesis(synthesisId);
    if (!latest) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealMetaAdSynthesis = { ...latest, shipIdentityReference: anchor };
      await saveMetaAdSynthesis(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── add_card_reference / remove_card_reference / set_card_anchor_opt_out ─────
  if (
    action === "add_card_reference" ||
    action === "remove_card_reference" ||
    action === "set_card_anchor_opt_out"
  ) {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const cardIndex = Number(body.cardIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json(
        { ok: false, error: "cardIndex must be a non-negative integer." },
        { status: 400 }
      );
    }

    let addition: DealMetaImageReference | undefined;
    if (action === "add_card_reference") {
      const parsed = parseReference(body.reference);
      if ("error" in parsed) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      addition = parsed;
    }

    const removalId =
      action === "remove_card_reference" && typeof body.referenceId === "string"
        ? body.referenceId.trim()
        : "";
    if (action === "remove_card_reference" && !removalId) {
      return NextResponse.json({ ok: false, error: "referenceId is required." }, { status: 400 });
    }

    const latest = await findMetaAdSynthesis(synthesisId);
    if (!latest) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    if (!latest.cards.some((card) => card.cardIndex === cardIndex)) {
      return NextResponse.json(
        { ok: false, error: `No card with index ${cardIndex} in synthesis "${synthesisId}".` },
        { status: 404 }
      );
    }

    try {
      const updated: DealMetaAdSynthesis = {
        ...latest,
        cards: latest.cards.map((card) => {
          if (card.cardIndex !== cardIndex) return card;
          if (action === "set_card_anchor_opt_out") {
            return { ...card, disableShipAnchor: body.disableShipAnchor === true };
          }
          const current = card.references ?? [];
          const references =
            action === "add_card_reference" && addition
              ? [...current.filter((r) => r.assetUrl !== addition.assetUrl), addition]
              : current.filter((r) => r.id !== removalId);
          return { ...card, references: references.length > 0 ? references : undefined };
        }),
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
    if (body.mode !== undefined && !isGenerationMode(body.mode)) {
      return NextResponse.json(
        { ok: false, error: `mode must be one of: ${GENERATION_MODES.join(", ")}.` },
        { status: 400 }
      );
    }
    const mode: DealMetaAdGenerationMode = isGenerationMode(body.mode) ? body.mode : "text_only";

    try {
      const updatedCard = await generateDealMetaAdCardImage(existing, cardIndex, {
        promptSuffix,
        mode,
      });
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
