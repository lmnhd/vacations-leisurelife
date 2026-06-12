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
  removeDealTripManifest,
  saveDealTripManifestsCache,
  upsertDealTripManifest,
  validatePromoIntelligenceCache,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
  type DealTripManifest,
} from "@/lib/cb/deals-system";
import {
  reconcileAssembleDraftWithResolved,
} from "@/lib/cb/deals-system/deal-package-resolver";
import {
  resolveCandidateOntoManifest,
  runOdysseusLookup,
} from "@/lib/cb/deals-system/deal-package-resolution";
import { selectBestFitCandidate } from "@/lib/cb/deals-system/deal-trip-manifest-generator";
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
 * INVENTORY-AWARE RESOLUTION (multi-line fallback) — the slow, browser-driven
 * half of Step 2, split out so it can run (and RETRY) independently of the paid
 * AI draft. Pure of cache I/O; the caller persists the result.
 *
 * 1. Try the draft's preferred cruise line's broad Odysseus search; if its
 *    allotment is empty, fall through to alternateCruiseLines IN ORDER until one
 *    returns a non-empty pool.
 * 2. AI fit-select picks the candidate that best embodies the angle, reframing
 *    copy when the fit is loose (fit-select always chooses one).
 * 3. Broker builds the booking link; factual fields reconcile from the real cruise.
 *
 * A wedged Odysseus session no longer throws away the AI draft — the draft is
 * already saved, and this just reports lookup_failed so the operator can retry.
 */
async function resolveManifestAgainstInventory(
  angle: DealDiscoveryIdea,
  draftManifest: DealTripManifest
): Promise<ResolutionOutcome> {
  let manifest = draftManifest;
  let candidates: RankedPackageCandidate[] = [];
  let lookupStatus: ResolutionOutcome["lookupStatus"] = "lookup_failed";
  const lookupDiagnostics: string[] = [];
  let fitRationale = "";
  let resolvedLookupQuery = draftManifest.lookupQuery;

  const candidateLines = [
    draftManifest.lookupQuery.line,
    ...(draftManifest.assembleDraft.alternateCruiseLines ?? []),
  ].filter((line, index, all) => line && all.indexOf(line) === index);

  for (const line of candidateLines) {
    const lookupQuery = { ...draftManifest.lookupQuery, line };
    const lookup = await runOdysseusLookup(lookupQuery);

    if (!lookup.ok || !lookup.result) {
      lookupDiagnostics.push(lookup.error ?? `Odysseus lookup failed for ${line}.`);
      continue;
    }

    lookupStatus = lookup.result.status;
    lookupDiagnostics.push(...lookup.result.diagnostics, ...lookup.diagnostics);

    if (lookup.result.candidates.length === 0) {
      lookupDiagnostics.push(`No candidates found for ${line}; trying next candidate line.`);
      continue;
    }

    candidates = lookup.result.candidates;
    resolvedLookupQuery = lookupQuery;
    break;
  }

  if (candidates.length > 0) {
    const { candidate: chosen, fitRationale: rationale, diagnostics: fitDiagnostics, reframe } =
      await selectBestFitCandidate({ angle, candidates });
    lookupDiagnostics.push(...fitDiagnostics);

    if (chosen) {
      fitRationale = rationale;
      const { manifest: resolved, diagnostics: resolveDiagnostics } =
        await resolveCandidateOntoManifest({ ...draftManifest, lookupQuery: resolvedLookupQuery }, chosen);
      manifest = reconcileAssembleDraftWithResolved(resolved, reframe);
      lookupDiagnostics.push(...resolveDiagnostics);
      lookupStatus = "confident_match";
    }
  }

  return { manifest, candidates, lookupStatus, lookupDiagnostics, fitRationale };
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

/** DELETE ?id=<manifestId> — prune an unwanted trip manifest from the cache. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  try {
    const cache = removeDealTripManifest(loadDealTripManifestsCache(), id);
    saveDealTripManifestsCache(cache);
    return NextResponse.json({ ok: true, manifests: cache.manifests });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const cache = loadDealTripManifestsCache();
    const manifest = cache.manifests.find((m) => m.id === manifestId);
    if (!manifest) {
      return NextResponse.json({ ok: false, error: `No manifest found with id "${manifestId}".` }, { status: 404 });
    }
    try {
      const { manifest: resolved, diagnostics } = await resolveCandidateOntoManifest(manifest, body.candidate);
      const next = upsertDealTripManifest(cache, resolved);
      saveDealTripManifestsCache(next);
      return NextResponse.json({ ok: true, manifest: resolved, manifests: next.manifests, diagnostics });
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
    const cache = loadDealTripManifestsCache();
    const draftManifest = cache.manifests.find((m) => m.id === manifestId);
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
      const next = upsertDealTripManifest(loadDealTripManifestsCache(), outcome.manifest);
      saveDealTripManifestsCache(next);
      return NextResponse.json({
        ok: true,
        manifest: outcome.manifest,
        manifests: next.manifests,
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
      promoRecords: loadPromoRecords(),
    });

    const outcome = await resolveManifestAgainstInventory(angle.value, draftManifest);

    const cache = upsertDealTripManifest(loadDealTripManifestsCache(), outcome.manifest);
    saveDealTripManifestsCache(cache);

    return NextResponse.json({
      ok: true,
      manifest: outcome.manifest,
      prefilter,
      rejectedPromoIds,
      manifests: cache.manifests,
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
