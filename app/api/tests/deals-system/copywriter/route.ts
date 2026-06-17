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
  listDealTripManifests,
  loadDealAdCopyCache,
  loadDealDiscoveryIdeasCache,
  loadDealUnifiedManifestsCache,
  removeDealAdCopy,
  saveDealAdCopyCache,
  saveDealUnifiedManifestsCache,
  selectDealAdCopyVariant,
  upsertDealAdCopy,
  upsertDealUnifiedManifest,
  type DealAdCopy,
  type DealTripManifest,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  manifestId?: unknown;
  variantCount?: unknown;
  adCopyId?: unknown;
  variantIndex?: unknown;
}

async function loadManifests(): Promise<DealTripManifest[]> {
  try {
    return await listDealTripManifests();
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
  const blocked = blockInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    manifests: await loadManifests(),
    adCopies: loadAdCopies(),
  });
}

/** DELETE ?id=<adCopyId> — prune an unwanted ad copy from the cache. */
export async function DELETE(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  try {
    const cache = removeDealAdCopy(loadDealAdCopyCache(), id);
    saveDealAdCopyCache(cache);
    return NextResponse.json({ ok: true, adCopies: cache.adCopies });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
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

  // Record the operator's chosen final ad variant. No AI; just persists the pick
  // so downstream assembly (Step 5) promotes it to the deal-page headline/hero.
  if (body.action === "select") {
    const adCopyId = typeof body.adCopyId === "string" ? body.adCopyId.trim() : "";
    const variantIndex = Number(body.variantIndex);
    if (!adCopyId) {
      return NextResponse.json({ ok: false, error: "adCopyId is required." }, { status: 400 });
    }
    if (!Number.isInteger(variantIndex)) {
      return NextResponse.json(
        { ok: false, error: "variantIndex must be an integer." },
        { status: 400 }
      );
    }
    try {
      const cache = selectDealAdCopyVariant(loadDealAdCopyCache(), adCopyId, variantIndex);
      saveDealAdCopyCache(cache);
      return NextResponse.json({
        ok: true,
        adCopy: cache.adCopies.find((a) => a.id === adCopyId),
        adCopies: cache.adCopies,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
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

  const tripManifest = (await loadManifests()).find((m) => m.id === manifestId);
  if (!tripManifest) {
    return NextResponse.json(
      { ok: false, error: `No trip manifest found with id "${manifestId}".` },
      { status: 404 }
    );
  }

  if (!tripManifest.resolvedPackage) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This manifest has no resolvedPackage — it is not tied to one real cruise yet. " +
          "Resolve it in Trip Manifestation (Step 2) before writing ad copy.",
      },
      { status: 409 }
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
