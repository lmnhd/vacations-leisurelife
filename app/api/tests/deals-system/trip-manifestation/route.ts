/**
 * Trip Manifestation route (deal workflow step 2).
 *
 * GET  -> { ok, angles, manifests } — cached discovery angles to pick from + manifests.
 * POST { action: "manifest", angleId } -> correlate the selected angle (already
 *        grounded on a real Odysseus candidate at discovery time) + raw promo
 *        intelligence into a DealTripManifest, resolve the booking link for that
 *        exact package, upsert into the manifest cache, return the manifest.
 *
 * The angle's cruise line/ship/sail date/nights/ports are real, verified facts from
 * Discovery (angle.groundedCandidate) — this step never searches inventory or
 * fit-selects; it only writes marketing framing/promos and resolves the booking link
 * for the known packageId. AI draft is hard-fail through the gateway.
 */

import { NextResponse } from "next/server";

import {
  deleteDealTripManifestRecord,
  generateDealTripManifest,
  getDealTripManifest,
  listDealTripManifests,
  listPromoRecords,
  loadDealDiscoveryIdeasCache,
  upsertDealTripManifestRecord,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
  type DealTripManifest,
} from "@/lib/cb/deals-system";
import { resolveCandidateOntoManifest } from "@/lib/cb/deals-system/deal-package-resolution";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import type { RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  angleId?: unknown;
  manifestId?: unknown;
  candidate?: unknown;
}

/** Outcome of resolving a saved draft manifest against live Odysseus inventory. */
interface ResolutionOutcome {
  manifest: DealTripManifest;
  candidates: RankedPackageCandidate[];
  lookupStatus: "confident_match" | "ambiguous" | "no_match" | "lookup_failed";
  lookupDiagnostics: string[];
  fitRationale: string;
}

/**
 * RESOLUTION — the angle is ALREADY GROUNDED on a real, verified Odysseus
 * candidate (angle.groundedCandidate), so this no longer searches inventory,
 * fit-selects, or reframes. It resolves the booking link for that EXACT known
 * package via the link broker and stamps the resolution onto the manifest.
 *
 * Retryable: a wedged broker call leaves the draft intact for another attempt.
 */
async function resolveManifestAgainstInventory(
  angle: DealDiscoveryIdea,
  draftManifest: DealTripManifest
): Promise<ResolutionOutcome> {
  const g = angle.groundedCandidate;
  const candidate: RankedPackageCandidate = {
    packageId: g.packageId,
    cruiseCode: "",
    cruiseName: g.cruiseName,
    cruiseLine: g.cruiseLine,
    sailDateIso: g.sailDateIso,
    nights: g.nights ?? null,
    departurePortCode: g.departurePortCode,
    portsOfCall: g.portsOfCall,
    // Forward the itinerary id captured at grounding so resolveCandidateOntoManifest
    // can fetch the real day-by-day schedule. Absent on pre-existing angles (then the
    // resolve path keeps coarse ports — re-run discovery to capture it).
    itinerary: g.itineraryId ? { itineraryId: g.itineraryId } : undefined,
    confidence: g.confidence,
    reasons: g.reasons,
  };

  const { manifest, diagnostics } = await resolveCandidateOntoManifest(draftManifest, candidate);

  return {
    manifest,
    candidates: [candidate],
    lookupStatus: "confident_match",
    lookupDiagnostics: diagnostics,
    fitRationale: "Grounded at discovery time — no inventory search or fit-select needed.",
  };
}

function loadAngles(): DealDiscoveryIdea[] {
  try {
    return loadDealDiscoveryIdeasCache().ideas;
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

  return NextResponse.json({
    ok: true,
    angles: loadAngles(),
    manifests: await loadManifests(),
  });
}

/** DELETE ?id=<manifestId> — prune an unwanted trip manifest from the cache. */
export async function DELETE(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  try {
    await deleteDealTripManifestRecord(id);
    return NextResponse.json({ ok: true, manifests: await loadManifests() });
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

  // Operator picks one candidate from an ambiguous lookup. Builds the booking
  // link via the broker and stamps the full resolution onto the manifest — the
  // manifest is not usable downstream until this (or the auto-resolve below) runs.
  if (body.action === "resolve_candidate") {
    const manifestId = typeof body.manifestId === "string" ? body.manifestId.trim() : "";
    if (!manifestId) {
      return NextResponse.json({ ok: false, error: "manifestId is required." }, { status: 400 });
    }
    const manifest = await getDealTripManifest(manifestId);
    if (!manifest) {
      return NextResponse.json({ ok: false, error: `No manifest found with id "${manifestId}".` }, { status: 404 });
    }
    try {
      const { manifest: resolved, diagnostics } = await resolveCandidateOntoManifest(manifest, body.candidate);
      await upsertDealTripManifestRecord(resolved);
      return NextResponse.json({ ok: true, manifest: resolved, manifests: await loadManifests(), diagnostics });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  // ── DRAFT (AI only — no browser) ───────────────────────────────────────────
  // Generates the manifest (cruise line, destination, sail window, promos,
  // lookupQuery) and saves it UNRESOLVED. This is the paid AI work; it is now
  // separate from the slow/fragile Odysseus match so a wedged lookup can never
  // throw it away. Resolve it later via { action: "resolve", manifestId }.
  if (body.action === "draft") {
    const angle = resolveAngle(body);
    if ("error" in angle) {
      return NextResponse.json({ ok: false, error: angle.error }, { status: angle.status });
    }
    try {
      const { manifest, prefilter, rejectedPromoIds } = await generateDealTripManifest({
        angle: angle.value,
        promoRecords: await loadPromoRecords(),
      });
      await upsertDealTripManifestRecord(manifest);
      return NextResponse.json({
        ok: true,
        manifest,
        prefilter,
        rejectedPromoIds,
        manifests: await loadManifests(),
        lookupStatus: "draft",
        note: "Draft saved (unresolved). Run { action: \"resolve\", manifestId } to match live inventory.",
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── RESOLVE (browser only — retryable, no AI re-spend) ─────────────────────
  // Takes a SAVED draft manifest and matches it against live Odysseus inventory.
  // Safe to retry as many times as needed: it re-runs the lookup + the cheap
  // fit-select pass, NOT the expensive draft generation. If Odysseus is wedged
  // it returns lookup_failed and leaves the draft intact for another attempt.
  if (body.action === "resolve") {
    const manifestId = typeof body.manifestId === "string" ? body.manifestId.trim() : "";
    if (!manifestId) {
      return NextResponse.json({ ok: false, error: "manifestId is required." }, { status: 400 });
    }
    const draftManifest = await getDealTripManifest(manifestId);
    if (!draftManifest) {
      return NextResponse.json({ ok: false, error: `No manifest found with id "${manifestId}".` }, { status: 404 });
    }
    const angle = loadAngles().find((a) => a.id === draftManifest.sourceAngleId);
    if (!angle) {
      return NextResponse.json(
        { ok: false, error: `Source angle "${draftManifest.sourceAngleId}" for this manifest no longer exists.` },
        { status: 404 }
      );
    }
    try {
      const outcome = await resolveManifestAgainstInventory(angle, draftManifest);
      await upsertDealTripManifestRecord(outcome.manifest);
      return NextResponse.json({
        ok: true,
        manifest: outcome.manifest,
        manifests: await loadManifests(),
        lookupStatus: outcome.lookupStatus,
        candidates: outcome.candidates,
        lookupDiagnostics: outcome.lookupDiagnostics,
        fitRationale: outcome.fitRationale,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── MANIFEST (draft + resolve in one call — back-compat) ───────────────────
  if (body.action !== "manifest") {
    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(body.action)}` },
      { status: 400 }
    );
  }

  const angle = resolveAngle(body);
  if ("error" in angle) {
    return NextResponse.json({ ok: false, error: angle.error }, { status: angle.status });
  }

  try {
    const { manifest: draftManifest, prefilter, rejectedPromoIds } = await generateDealTripManifest({
      angle: angle.value,
      promoRecords: await loadPromoRecords(),
    });

    const outcome = await resolveManifestAgainstInventory(angle.value, draftManifest);

    await upsertDealTripManifestRecord(outcome.manifest);

    return NextResponse.json({
      ok: true,
      manifest: outcome.manifest,
      prefilter,
      rejectedPromoIds,
      manifests: await loadManifests(),
      lookupStatus: outcome.lookupStatus,
      candidates: outcome.candidates,
      lookupDiagnostics: outcome.lookupDiagnostics,
      fitRationale: outcome.fitRationale,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** Resolve the angle from an angleId body param, or a structured error. */
function resolveAngle(
  body: Body
): { value: DealDiscoveryIdea } | { error: string; status: number } {
  const angleId = typeof body.angleId === "string" ? body.angleId.trim() : "";
  if (!angleId) return { error: "angleId is required.", status: 400 };
  const angle = loadAngles().find((a) => a.id === angleId);
  if (!angle) return { error: `No discovery angle found with id "${angleId}".`, status: 404 };
  return { value: angle };
}
