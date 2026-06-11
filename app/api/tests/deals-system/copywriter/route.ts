/**
 * Copywriter route (deal workflow step 3).
 *
 * GET  -> { ok, manifests, adCopies } — trip manifests to pick from + existing ad copy.
 * POST { action: "write", manifestId, variantCount? } -> auto-assemble the unified
 *        manifest (angle + trip manifest), persist it, run the copywriter, persist the
 *        ad copy, return it. Unify is plumbing, not an operator step.
 *
 * Safety: the unified manifest is stitched deterministically (no AI); the copywriter
 * is the only AI call. No browser, no booking, no publish.
 */

import { NextResponse } from "next/server";

import {
  assembleDealUnifiedManifest,
  generateDealAdCopy,
  loadDealAdCopyCache,
  loadDealDiscoveryIdeasCache,
  loadDealTripManifestsCache,
  loadDealUnifiedManifestsCache,
  saveDealAdCopyCache,
  saveDealUnifiedManifestsCache,
  upsertDealAdCopy,
  upsertDealUnifiedManifest,
  type DealAdCopy,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  manifestId?: unknown;
  variantCount?: unknown;
}

function loadManifests(): DealTripManifest[] {
  try {
    return loadDealTripManifestsCache().manifests;
  } catch {
    return [];
  }
}

function loadAdCopies(): DealAdCopy[] {
  try {
    return loadDealAdCopyCache().adCopies;
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    manifests: loadManifests(),
    adCopies: loadAdCopies(),
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action !== "write") {
    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(body.action)}` },
      { status: 400 }
    );
  }

  const manifestId = typeof body.manifestId === "string" ? body.manifestId.trim() : "";
  if (!manifestId) {
    return NextResponse.json({ ok: false, error: "manifestId is required." }, { status: 400 });
  }

  const tripManifest = loadManifests().find((m) => m.id === manifestId);
  if (!tripManifest) {
    return NextResponse.json(
      { ok: false, error: `No trip manifest found with id "${manifestId}".` },
      { status: 404 }
    );
  }

  let angle;
  try {
    angle = loadDealDiscoveryIdeasCache().ideas.find((a) => a.id === tripManifest.sourceAngleId);
  } catch {
    angle = undefined;
  }
  if (!angle) {
    return NextResponse.json(
      {
        ok: false,
        error: `Source discovery angle "${tripManifest.sourceAngleId}" not found — cannot build the unified manifest.`,
      },
      { status: 409 }
    );
  }

  try {
    // (1) deterministic unify — persist the artifact for traceability.
    const unified = assembleDealUnifiedManifest(angle, tripManifest);
    saveDealUnifiedManifestsCache(
      upsertDealUnifiedManifest(loadDealUnifiedManifestsCache(), unified)
    );

    // (2) copywriter.
    const variantCount = Number(body.variantCount);
    const { adCopy, rejectedPromoIds } = await generateDealAdCopy({
      unifiedManifest: unified,
      variantCount: Number.isFinite(variantCount) && variantCount > 0 ? variantCount : undefined,
    });

    const cache = upsertDealAdCopy(loadDealAdCopyCache(), adCopy);
    saveDealAdCopyCache(cache);

    return NextResponse.json({
      ok: true,
      unifiedManifest: unified,
      adCopy,
      rejectedPromoIds,
      adCopies: cache.adCopies,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
