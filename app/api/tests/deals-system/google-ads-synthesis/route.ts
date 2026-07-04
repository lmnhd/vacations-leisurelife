/**
 * Google Ads Synthesis route (deal workflow step 9).
 *
 * GET  -> { ok, funnelSyntheses, syntheses } — Step 7 funnel syntheses (source
 *         of the lead carousel card's copy) and existing Google Ads syntheses.
 *
 * POST { action: "init", funnelSynthesisId, force? }
 *   -> if a synthesis already exists for this funnel, return it UNCHANGED
 *      (loading the page must never silently wipe generated images,
 *      operator-edited fields, or operatorPlacements). Only builds a fresh
 *      synthesis from the funnel's lead carousel card when none exists yet,
 *      or when force: true is explicitly passed (intentional "start over").
 *
 * POST { action: "update_fields", synthesisId, businessName?, headline?,
 *         longHeadline?, description?, promptTemplate? }
 *   -> save the operator's edits to any of the text fields / prompt template.
 *      No AI. Any omitted field is left unchanged.
 *
 * POST { action: "generate_image", synthesisId, aspect, promptSuffix? }
 *   -> interpolate the template and generate this aspect slot's image with
 *      gpt-image-2. Persist + return. aspect is "landscape_1_91x1" | "square_1x1".
 *
 * POST { action: "revert_image", synthesisId, aspect, historyIndex }
 *   -> restore an aspect slot's image from its previousImages history.
 *
 * POST { action: "use_gallery_image", synthesisId, aspect, candidateId }
 *   -> assign a real photo from the source funnel synthesis's curated gallery
 *      to this aspect slot instead of generating one. No AI. Rejects any
 *      candidateId not present in the funnel's galleryIds. The slot's prior
 *      image (generated or gallery) is pushed onto previousImages for revert.
 *
 * POST { action: "search_communities", synthesisId, niche }
 *   -> real SerpAPI web search (reddit/youtube/forum queries) for the given
 *      niche text. Returns raw candidates for the operator to review — does
 *      NOT persist anything. No AI; never invents a placement.
 *
 * POST { action: "add_placement", synthesisId, url }
 *   -> append a single operator-picked URL to operatorPlacements. No AI.
 *
 * POST { action: "remove_placement", synthesisId, url }
 *   -> remove a URL from operatorPlacements. No AI.
 */

import { NextResponse } from "next/server";

import {
  buildDealGoogleAdsSynthesis,
  generateDealGoogleAdsImage,
  listDealFunnelSyntheses,
  loadDealGoogleAdsSynthesisCache,
  revertDealGoogleAdsImage,
  saveDealGoogleAdsSynthesisCache,
  searchDealCommunityPlacementsAllPlatforms,
  upsertDealGoogleAdsSynthesis,
  useDealGoogleAdsGalleryImage,
  type DealFunnelSynthesis,
  type DealGoogleAdsSynthesis,
} from "@/lib/cb/deals-system";
import {
  sanitizeGoogleAdsText,
  type DealGoogleAdsImageAspect,
} from "@/lib/cb/deals-system/deal-google-ads-synthesis-types";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  funnelSynthesisId?: unknown;
  synthesisId?: unknown;
  businessName?: unknown;
  headline?: unknown;
  longHeadline?: unknown;
  description?: unknown;
  promptTemplate?: unknown;
  aspect?: unknown;
  promptSuffix?: unknown;
  historyIndex?: unknown;
  candidateId?: unknown;
  niche?: unknown;
  url?: unknown;
  force?: unknown;
}

function isValidAspect(value: unknown): value is DealGoogleAdsImageAspect {
  return value === "landscape_1_91x1" || value === "square_1x1";
}

async function loadFunnelSyntheses(): Promise<DealFunnelSynthesis[]> {
  try {
    return await listDealFunnelSyntheses();
  } catch {
    return [];
  }
}

function loadSyntheses(): DealGoogleAdsSynthesis[] {
  try {
    return loadDealGoogleAdsSynthesisCache().syntheses;
  } catch {
    return [];
  }
}

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    funnelSyntheses: await loadFunnelSyntheses(),
    syntheses: loadSyntheses(),
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

    const force = body.force === true;
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === funnelSynthesisId);
    if (existing && !force) {
      return NextResponse.json({ ok: true, synthesis: existing, syntheses: cache.syntheses });
    }

    try {
      const synthesis = buildDealGoogleAdsSynthesis(funnelSynthesis);
      const nextCache = upsertDealGoogleAdsSynthesis(cache, synthesis);
      saveDealGoogleAdsSynthesisCache(nextCache);
      return NextResponse.json({ ok: true, synthesis, syntheses: nextCache.syntheses });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── update_fields ────────────────────────────────────────────────────────────
  if (action === "update_fields") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealGoogleAdsSynthesis = {
        ...existing,
        businessName: typeof body.businessName === "string" ? sanitizeGoogleAdsText(body.businessName) : existing.businessName,
        headline: typeof body.headline === "string" ? sanitizeGoogleAdsText(body.headline) : existing.headline,
        longHeadline: typeof body.longHeadline === "string" ? sanitizeGoogleAdsText(body.longHeadline) : existing.longHeadline,
        description: typeof body.description === "string" ? sanitizeGoogleAdsText(body.description) : existing.description,
        promptTemplate:
          typeof body.promptTemplate === "string" ? sanitizeGoogleAdsText(body.promptTemplate) : existing.promptTemplate,
      };
      const nextCache = upsertDealGoogleAdsSynthesis(cache, updated);
      saveDealGoogleAdsSynthesisCache(nextCache);
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
    const aspect = body.aspect;
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!isValidAspect(aspect)) {
      return NextResponse.json(
        { ok: false, error: 'aspect must be "landscape_1_91x1" or "square_1x1".' },
        { status: 400 }
      );
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    if (!existing.images.some((img) => img.aspect === aspect)) {
      return NextResponse.json(
        { ok: false, error: `No image slot "${aspect}" in synthesis "${synthesisId}".` },
        { status: 404 }
      );
    }

    // Generation is slow (tens of seconds); re-read the cache just before
    // merging so a parallel "generate both" doesn't clobber the sibling
    // slot's update written while this request was in flight.
    const existingSynthesis = existing;
    function mergeImageIntoLatest(
      asset: DealGoogleAdsSynthesis["images"][number]
    ): DealGoogleAdsSynthesis {
      const latestCache = loadDealGoogleAdsSynthesisCache();
      const latest = latestCache.syntheses.find((s) => s.id === synthesisId) ?? existingSynthesis;
      const synthesis: DealGoogleAdsSynthesis = {
        ...latest,
        images: latest.images.map((img) => (img.aspect === aspect ? asset : img)),
      };
      saveDealGoogleAdsSynthesisCache(upsertDealGoogleAdsSynthesis(latestCache, synthesis));
      return synthesis;
    }

    const promptSuffix = typeof body.promptSuffix === "string" ? body.promptSuffix : undefined;

    try {
      const updatedAsset = await generateDealGoogleAdsImage(existing, aspect, promptSuffix);
      const synthesis = mergeImageIntoLatest(updatedAsset);
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      // Persist the error onto the slot so the operator sees it without
      // losing the rest of the synthesis (other slot's image stays intact).
      const failedAsset: DealGoogleAdsSynthesis["images"][number] = {
        ...existing.images.find((img) => img.aspect === aspect)!,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      let synthesis: DealGoogleAdsSynthesis = {
        ...existing,
        images: existing.images.map((img) => (img.aspect === aspect ? failedAsset : img)),
      };
      try {
        synthesis = mergeImageIntoLatest(failedAsset);
      } catch {
        // best-effort persistence of the error state
      }
      return NextResponse.json(
        { ok: false, error: failedAsset.error, synthesis },
        { status: 500 }
      );
    }
  }

  // ── revert_image ─────────────────────────────────────────────────────────────
  if (action === "revert_image") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const aspect = body.aspect;
    const historyIndex = Number(body.historyIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!isValidAspect(aspect)) {
      return NextResponse.json(
        { ok: false, error: 'aspect must be "landscape_1_91x1" or "square_1x1".' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(historyIndex) || historyIndex < 0) {
      return NextResponse.json({ ok: false, error: "historyIndex must be a non-negative integer." }, { status: 400 });
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const revertedAsset = revertDealGoogleAdsImage(existing, aspect, historyIndex);
      const synthesis: DealGoogleAdsSynthesis = {
        ...existing,
        images: existing.images.map((img) => (img.aspect === aspect ? revertedAsset : img)),
      };
      saveDealGoogleAdsSynthesisCache(upsertDealGoogleAdsSynthesis(cache, synthesis));
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  // ── use_gallery_image ────────────────────────────────────────────────────────
  if (action === "use_gallery_image") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const aspect = body.aspect;
    const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!isValidAspect(aspect)) {
      return NextResponse.json(
        { ok: false, error: 'aspect must be "landscape_1_91x1" or "square_1x1".' },
        { status: 400 }
      );
    }
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    const funnelSynthesis = (await loadFunnelSyntheses()).find(
      (s) => s.id === existing.sourceFunnelSynthesisId
    );
    if (!funnelSynthesis) {
      return NextResponse.json(
        { ok: false, error: `No source funnel synthesis found for "${existing.sourceFunnelSynthesisId}".` },
        { status: 404 }
      );
    }
    const candidate = funnelSynthesis.candidates.find(
      (c) => c.id === candidateId && funnelSynthesis.galleryIds.includes(c.id)
    );
    if (!candidate) {
      return NextResponse.json(
        { ok: false, error: `"${candidateId}" is not in this deal's curated gallery.` },
        { status: 400 }
      );
    }
    try {
      const updatedAsset = useDealGoogleAdsGalleryImage(existing, aspect, candidate.imageUrl);
      const synthesis: DealGoogleAdsSynthesis = {
        ...existing,
        images: existing.images.map((img) => (img.aspect === aspect ? updatedAsset : img)),
      };
      saveDealGoogleAdsSynthesisCache(upsertDealGoogleAdsSynthesis(cache, synthesis));
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  // ── search_communities ───────────────────────────────────────────────────────
  if (action === "search_communities") {
    const niche = typeof body.niche === "string" ? body.niche.trim() : "";
    if (!niche) {
      return NextResponse.json({ ok: false, error: "niche is required." }, { status: 400 });
    }
    try {
      const result = await searchDealCommunityPlacementsAllPlatforms(niche);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── add_placement ────────────────────────────────────────────────────────────
  if (action === "add_placement") {
    const synthesisId2 = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!synthesisId2) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ ok: false, error: "url is required." }, { status: 400 });
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId2);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId2}".` },
        { status: 404 }
      );
    }
    const synthesis: DealGoogleAdsSynthesis = {
      ...existing,
      operatorPlacements: existing.operatorPlacements.includes(url)
        ? existing.operatorPlacements
        : [...existing.operatorPlacements, url],
    };
    saveDealGoogleAdsSynthesisCache(upsertDealGoogleAdsSynthesis(cache, synthesis));
    return NextResponse.json({ ok: true, synthesis });
  }

  // ── remove_placement ─────────────────────────────────────────────────────────
  if (action === "remove_placement") {
    const synthesisId2 = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!synthesisId2) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    const cache = loadDealGoogleAdsSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId2);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No Google Ads synthesis found with id "${synthesisId2}".` },
        { status: 404 }
      );
    }
    const synthesis: DealGoogleAdsSynthesis = {
      ...existing,
      operatorPlacements: existing.operatorPlacements.filter((p) => p !== url),
    };
    saveDealGoogleAdsSynthesisCache(upsertDealGoogleAdsSynthesis(cache, synthesis));
    return NextResponse.json({ ok: true, synthesis });
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
