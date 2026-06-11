/**
 * Trip Manifestation route (deal workflow step 2).
 *
 * GET  -> { ok, angles, manifests } — cached discovery angles to pick from + manifests.
 * POST { action: "manifest", angleId } -> correlate the selected angle + raw promo
 *        intelligence into a DealTripManifest, upsert into the manifest cache, return
 *        the manifest + prefilter diagnostics.
 *
 * Safety: never runs the CB/Odysseus browser. The manifest fills SOURCE & ASSEMBLE
 * EXCEPT packageId/shipName/siid/bookingUrl; it emits a lookupQuery the operator
 * runs via Package Lookup. AI-only/hard-fail through the gateway.
 */

import { readFileSync } from "node:fs";

import { NextResponse } from "next/server";

import {
  DEALS_CACHE_PATHS,
  generateDealTripManifest,
  loadDealDiscoveryIdeasCache,
  loadDealTripManifestsCache,
  saveDealTripManifestsCache,
  upsertDealTripManifest,
  validatePromoIntelligenceCache,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  angleId?: unknown;
}

function loadAngles(): DealDiscoveryIdea[] {
  try {
    return loadDealDiscoveryIdeasCache().ideas;
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
  return NextResponse.json({
    ok: true,
    angles: loadAngles(),
    manifests: loadManifests(),
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action !== "manifest") {
    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(body.action)}` },
      { status: 400 }
    );
  }

  const angleId = typeof body.angleId === "string" ? body.angleId.trim() : "";
  if (!angleId) {
    return NextResponse.json({ ok: false, error: "angleId is required." }, { status: 400 });
  }

  const angle = loadAngles().find((a) => a.id === angleId);
  if (!angle) {
    return NextResponse.json(
      { ok: false, error: `No discovery angle found with id "${angleId}".` },
      { status: 404 }
    );
  }

  try {
    const { manifest, prefilter, rejectedPromoIds } = await generateDealTripManifest({
      angle,
      promoRecords: loadPromoRecords(),
    });

    const cache = upsertDealTripManifest(loadDealTripManifestsCache(), manifest);
    saveDealTripManifestsCache(cache);

    return NextResponse.json({
      ok: true,
      manifest,
      prefilter,
      rejectedPromoIds,
      manifests: cache.manifests,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
