/**
 * Funnel Synthesis route (deal workflow step 5).
 *
 * GET  -> { ok, adCopies, manifests, syntheses } — ad copies to synthesize from,
 *         their source manifests (for ship/destination image queries), and existing
 *         syntheses.
 *
 * POST { action: "synthesize", adCopyId, variantIndex?, sourceImages? }
 *   -> run the CRO funnel split (landing page + carousel). If `sourceImages` is true
 *      (default), also SERP-search ship/destination images and attach them as
 *      candidates. Persist + return the synthesis.
 *
 * POST { action: "search_images", synthesisId, category? }
 *   -> SERP-search more candidates for an existing synthesis. With `category`, refresh
 *      just that section (hero/cabins/lounges/atrium/dining/excursions/destination);
 *      without it, re-search the whole diversified pool. Merge (de-duped) + persist.
 *
 * POST { action: "select_images", synthesisId, galleryIds?, heroImageId?, segmentImageIds? }
 *   -> persist the operator's curated image set. No AI.
 *
 * POST { action: "generate_variation", synthesisId, candidateId, direction, mode?, aspect? }
 *   -> GPT Image 2 variation of an existing candidate, inserted as a NEW candidate
 *      beside its source. Never replaces the source or any hero/gallery/segment
 *      assignment — promotion stays an explicit select_images gesture.
 *
 * POST { action: "discard_variation", synthesisId, candidateId }
 *   -> remove a generated variation. Refuses while it is in use on the page.
 *
 * Safety: AI calls are the synthesis and (operator-triggered, per-image) variation
 * generation; image search hits SerpAPI but downloads no bytes. No booking/publish.
 */

import { NextResponse } from "next/server";

import {
  addDealImageVariation,
  applyDealFunnelImageSelection,
  assembleDealPageFacts,
  DEAL_IMAGE_CATEGORIES,
  DEAL_IMAGE_VARIATION_ASPECTS,
  generateDealFunnelSynthesis,
  generateDealImageVariation,
  getDealFunnelSynthesis,
  listDealFunnelSyntheses,
  listDealTripManifests,
  listPromoRecords,
  loadDealAdCopyCache,
  removeDealImageVariation,
  searchDealImagesAllCategories,
  searchDealImagesByCategory,
  upsertDealFunnelSynthesisRecord,
  type CbPromoIntelligenceRecord,
  type DealAdCopy,
  type DealFunnelSynthesis,
  type DealImageCategory,
  type DealImageVariationAspect,
  type DealTripManifest,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  adCopyId?: unknown;
  variantIndex?: unknown;
  sourceImages?: unknown;
  synthesisId?: unknown;
  category?: unknown;
  galleryIds?: unknown;
  heroImageId?: unknown;
  segmentImageIds?: unknown;
  candidateId?: unknown;
  direction?: unknown;
  mode?: unknown;
  aspect?: unknown;
}

function parseCategory(value: unknown): DealImageCategory | undefined {
  return typeof value === "string" && (DEAL_IMAGE_CATEGORIES as readonly string[]).includes(value)
    ? (value as DealImageCategory)
    : undefined;
}

function loadAdCopies(): DealAdCopy[] {
  try {
    return loadDealAdCopyCache().adCopies;
  } catch {
    return [];
  }
}

async function loadManifests(): Promise<DealTripManifest[]> {
  try {
    return await listDealTripManifests();
  } catch {
    return [];
  }
}

async function loadSyntheses(): Promise<DealFunnelSynthesis[]> {
  try {
    return await listDealFunnelSyntheses({ fresh: true });
  } catch {
    return [];
  }
}

/** Find the trip manifest behind an ad copy (via unified-${manifestId}). */
async function manifestForAdCopy(adCopy: DealAdCopy): Promise<DealTripManifest | undefined> {
  const manifestId = adCopy.sourceUnifiedManifestId.replace(/^unified-/, "");
  return (await loadManifests()).find((m) => m.id === manifestId);
}

async function loadPromoRecords(): Promise<CbPromoIntelligenceRecord[]> {
  try {
    return await listPromoRecords();
  } catch {
    return [];
  }
}

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const adCopies = loadAdCopies();
  const promoRecords = await loadPromoRecords();
  // The COMPLETE public-safe cruise facts per ad copy (ship/date/itinerary/stops/
  // pricing/promos) so the lab can hand a self-sufficient payload to Claude Design.
  const dealFacts: Record<string, ReturnType<typeof assembleDealPageFacts>> = {};
  for (const adCopy of adCopies) {
    const manifest = await manifestForAdCopy(adCopy);
    if (manifest) {
      dealFacts[adCopy.id] = assembleDealPageFacts(manifest, promoRecords);
    }
  }
  return NextResponse.json({
    ok: true,
    adCopies,
    manifests: await loadManifests(),
    syntheses: await loadSyntheses(),
    dealFacts,
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

  // ── synthesize ──────────────────────────────────────────────────────────────
  if (action === "synthesize") {
    const adCopyId = typeof body.adCopyId === "string" ? body.adCopyId.trim() : "";
    if (!adCopyId) {
      return NextResponse.json({ ok: false, error: "adCopyId is required." }, { status: 400 });
    }
    const adCopy = loadAdCopies().find((a) => a.id === adCopyId);
    if (!adCopy) {
      return NextResponse.json(
        { ok: false, error: `No ad copy found with id "${adCopyId}".` },
        { status: 404 }
      );
    }

    const manifest = await manifestForAdCopy(adCopy);
    const variantIndex = Number(body.variantIndex);
    const wantImages = body.sourceImages !== false;

    try {
      // Optional: source a DIVERSIFIED SERP pool — one search per image category
      // (hero / cabins / lounges / atrium / dining / excursions / destination) so
      // each landing section has relevant, on-topic photos to pick from.
      let candidates;
      if (wantImages && manifest) {
        try {
          const search = await searchDealImagesAllCategories({
            cruiseLine: manifest.assembleDraft.cruiseLine,
            shipClassHint: manifest.assembleDraft.shipClassHint,
            destination: manifest.assembleDraft.destination,
          });
          candidates = search.candidates;
        } catch {
          // Image sourcing is best-effort; the synthesis still proceeds text-only.
          candidates = [];
        }
      }

      const { synthesis } = await generateDealFunnelSynthesis({
        adCopy,
        variantIndex: Number.isInteger(variantIndex) ? variantIndex : undefined,
        candidates,
        sailingAngleTitle: manifest?.sailingAngleTitle,
        dealId: manifest?.resolvedPackage?.packageId,
        destinationLabel: manifest?.assembleDraft.itineraryName ?? manifest?.assembleDraft.destination,
        nights: manifest?.resolvedPackage?.nights ?? manifest?.assembleDraft.nights,
      });

      await upsertDealFunnelSynthesisRecord(synthesis);

      return NextResponse.json({ ok: true, synthesis, syntheses: await loadSyntheses() });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── search_images ─────────────────────────────────────────────────────────────
  if (action === "search_images") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    const existing = (await loadSyntheses()).find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    const adCopy = loadAdCopies().find((a) => a.id === existing.sourceAdCopyId);
    const manifest = adCopy ? await manifestForAdCopy(adCopy) : undefined;
    if (!manifest) {
      return NextResponse.json(
        { ok: false, error: "Source manifest not found — cannot build an image query." },
        { status: 409 }
      );
    }
    // Optional: a single category to refresh; otherwise re-search the whole pool.
    const category = parseCategory(body.category);
    const queryInput = {
      cruiseLine: manifest.assembleDraft.cruiseLine,
      shipClassHint: manifest.assembleDraft.shipClassHint,
      destination: manifest.assembleDraft.destination,
    };

    try {
      const newCandidates = category
        ? (await searchDealImagesByCategory(queryInput, category)).candidates
        : (await searchDealImagesAllCategories(queryInput)).candidates;
      // Merge, de-duping by image url.
      const seen = new Set(existing.candidates.map((c) => c.imageUrl));
      const merged = [
        ...existing.candidates,
        ...newCandidates.filter((c) => !seen.has(c.imageUrl)),
      ];
      const updated: DealFunnelSynthesis = { ...existing, candidates: merged };
      await upsertDealFunnelSynthesisRecord(updated);
      return NextResponse.json({ ok: true, synthesis: updated, category: category ?? "all" });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── select_images ─────────────────────────────────────────────────────────────
  if (action === "select_images") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    try {
      const synthesis = await getDealFunnelSynthesis(synthesisId, { fresh: true });
      if (!synthesis) {
        return NextResponse.json(
          { ok: false, error: `No synthesis found with id "${synthesisId}".` },
          { status: 404 }
        );
      }
      const updated = applyDealFunnelImageSelection(synthesis, {
        galleryIds: Array.isArray(body.galleryIds)
          ? (body.galleryIds as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        heroImageId: typeof body.heroImageId === "string" ? body.heroImageId : undefined,
        segmentImageIds:
          body.segmentImageIds && typeof body.segmentImageIds === "object"
            ? (body.segmentImageIds as Record<string, string>)
            : undefined,
      });
      await upsertDealFunnelSynthesisRecord(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  // ── generate_variation ──────────────────────────────────────────────────────
  //
  // Produces a NEW candidate from an existing one. Never touches galleryIds,
  // heroImageId, or segment assignments — the operator promotes the result with
  // the normal select_images gestures after inspecting it.
  if (action === "generate_variation") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    const direction = typeof body.direction === "string" ? body.direction.trim() : "";
    const mode = body.mode === "new_variation" ? "new_variation" : "edit_current";
    const aspect: DealImageVariationAspect =
      typeof body.aspect === "string" && body.aspect in DEAL_IMAGE_VARIATION_ASPECTS
        ? (body.aspect as DealImageVariationAspect)
        : "landscape";

    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
    }
    if (!direction) {
      return NextResponse.json(
        { ok: false, error: "A transformation direction is required." },
        { status: 400 }
      );
    }

    const existing = await getDealFunnelSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }

    try {
      const variation = await generateDealImageVariation({
        synthesis: existing,
        sourceCandidateId: candidateId,
        direction,
        mode,
        aspect,
      });
      // Generation takes ~30-60s. Re-read before merging so a concurrent
      // curation change (gallery pick, hero swap) made while this was in flight
      // isn't rolled back by a stale snapshot.
      const latest = (await getDealFunnelSynthesis(synthesisId)) ?? existing;
      const updated = addDealImageVariation(latest, variation);
      await upsertDealFunnelSynthesisRecord(updated);
      return NextResponse.json({ ok: true, synthesis: updated, variation });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── discard_variation ───────────────────────────────────────────────────────
  if (action === "discard_variation") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    if (!synthesisId || !candidateId) {
      return NextResponse.json(
        { ok: false, error: "synthesisId and candidateId are required." },
        { status: 400 }
      );
    }
    const existing = await getDealFunnelSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated = removeDealImageVariation(existing, candidateId);
      await upsertDealFunnelSynthesisRecord(updated);
      return NextResponse.json({ ok: true, synthesis: updated });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
