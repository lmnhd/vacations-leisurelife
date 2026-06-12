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
 * Safety: the only AI call is the synthesis; image search hits SerpAPI but downloads
 * no bytes. No booking/publish.
 */

import { NextResponse } from "next/server";

import { readFileSync } from "fs";

import {
  assembleDealPageFacts,
  DEAL_IMAGE_CATEGORIES,
  DEALS_CACHE_PATHS,
  generateDealFunnelSynthesis,
  loadDealAdCopyCache,
  loadDealFunnelSynthesisCache,
  loadDealTripManifestsCache,
  saveDealFunnelSynthesisCache,
  searchDealImagesAllCategories,
  searchDealImagesByCategory,
  setDealFunnelImageSelection,
  upsertDealFunnelSynthesis,
  validatePromoIntelligenceCache,
  type CbPromoIntelligenceRecord,
  type DealAdCopy,
  type DealFunnelSynthesis,
  type DealImageCategory,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

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

function loadManifests(): DealTripManifest[] {
  try {
    return loadDealTripManifestsCache().manifests;
  } catch {
    return [];
  }
}

function loadSyntheses(): DealFunnelSynthesis[] {
  try {
    return loadDealFunnelSynthesisCache().syntheses;
  } catch {
    return [];
  }
}

/** Find the trip manifest behind an ad copy (via unified-${manifestId}). */
function manifestForAdCopy(adCopy: DealAdCopy): DealTripManifest | undefined {
  const manifestId = adCopy.sourceUnifiedManifestId.replace(/^unified-/, "");
  return loadManifests().find((m) => m.id === manifestId);
}

function loadPromoRecords(): CbPromoIntelligenceRecord[] {
  try {
    const raw = readFileSync(DEALS_CACHE_PATHS.promoIntelligence, "utf8");
    const result = validatePromoIntelligenceCache(JSON.parse(raw) as unknown);
    return result.ok && result.value ? result.value.records : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const adCopies = loadAdCopies();
  const promoRecords = loadPromoRecords();
  // The COMPLETE public-safe cruise facts per ad copy (ship/date/itinerary/stops/
  // pricing/promos) so the lab can hand a self-sufficient payload to Claude Design.
  const dealFacts: Record<string, ReturnType<typeof assembleDealPageFacts>> = {};
  for (const adCopy of adCopies) {
    const manifest = manifestForAdCopy(adCopy);
    if (manifest) {
      dealFacts[adCopy.id] = assembleDealPageFacts(manifest, promoRecords);
    }
  }
  return NextResponse.json({
    ok: true,
    adCopies,
    manifests: loadManifests(),
    syntheses: loadSyntheses(),
    dealFacts,
  });
}

export async function POST(request: Request) {
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

    const manifest = manifestForAdCopy(adCopy);
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
      });

      const cache = upsertDealFunnelSynthesis(loadDealFunnelSynthesisCache(), synthesis);
      saveDealFunnelSynthesisCache(cache);

      return NextResponse.json({ ok: true, synthesis, syntheses: cache.syntheses });
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
    const existing = loadSyntheses().find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    const adCopy = loadAdCopies().find((a) => a.id === existing.sourceAdCopyId);
    const manifest = adCopy ? manifestForAdCopy(adCopy) : undefined;
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
      const cache = upsertDealFunnelSynthesis(loadDealFunnelSynthesisCache(), updated);
      saveDealFunnelSynthesisCache(cache);
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
      const cache = setDealFunnelImageSelection(loadDealFunnelSynthesisCache(), synthesisId, {
        galleryIds: Array.isArray(body.galleryIds)
          ? (body.galleryIds as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        heroImageId: typeof body.heroImageId === "string" ? body.heroImageId : undefined,
        segmentImageIds:
          body.segmentImageIds && typeof body.segmentImageIds === "object"
            ? (body.segmentImageIds as Record<string, string>)
            : undefined,
      });
      saveDealFunnelSynthesisCache(cache);
      return NextResponse.json({
        ok: true,
        synthesis: cache.syntheses.find((s) => s.id === synthesisId),
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
