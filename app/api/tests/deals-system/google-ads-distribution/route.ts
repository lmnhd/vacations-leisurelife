/**
 * Google Ads Distribution route (deal workflow step 10).
 *
 * GET ?synthesisId=...
 *   -> { ok, synthesis, distribution } — the Google Ads synthesis (Step 9)
 *      and any existing distribution record for it.
 *
 * POST { action: "plan", synthesisId }
 *   -> build a fresh DealGoogleAdsDistributionPlan (final url, ad text
 *      fields, both ready image urls, adapted targeting) without dispatching.
 *
 * POST { action: "dispatch", synthesisId, mode: "simulate" | "live" }
 *   -> build the plan and dispatch it. "simulate" persists a "planned"
 *      record without calling the Google Ads API. "live" creates a paused
 *      Campaign + Budget + Ad Group + Responsive Display Ad with targeting
 *      criteria, then verifies the readback.
 */

import { NextResponse } from "next/server";

import {
  dispatchDealGoogleAdsDistribution,
  getCuratedDeal,
  loadDealGoogleAdsSynthesisCache,
  loadDealGoogleAdsDistributionCache,
  planDealGoogleAdsDistribution,
  saveDealGoogleAdsDistributionCache,
  upsertDealGoogleAdsDistribution,
  type DealGoogleAdsSynthesis,
  type DealGoogleAdsDistributionMode,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  action?: unknown;
  synthesisId?: unknown;
  mode?: unknown;
}

function findSynthesis(synthesisId: string): DealGoogleAdsSynthesis | null {
  try {
    return loadDealGoogleAdsSynthesisCache().syntheses.find((s) => s.id === synthesisId) ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const synthesisId = url.searchParams.get("synthesisId")?.trim() ?? "";
  if (!synthesisId) {
    return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
  }

  const synthesis = findSynthesis(synthesisId);
  if (!synthesis) {
    return NextResponse.json({ ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` }, { status: 404 });
  }

  const distribution = loadDealGoogleAdsDistributionCache().distributions.find((d) => d.id === synthesisId) ?? null;
  return NextResponse.json({ ok: true, synthesis, distribution });
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
  const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
  if (!synthesisId) {
    return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
  }

  const synthesis = findSynthesis(synthesisId);
  if (!synthesis) {
    return NextResponse.json({ ok: false, error: `No Google Ads synthesis found with id "${synthesisId}".` }, { status: 404 });
  }

  const deal = await getCuratedDeal(synthesis.dealId);
  if (!deal) {
    return NextResponse.json({ ok: false, error: `No curated deal found with id "${synthesis.dealId}".` }, { status: 404 });
  }

  // ── plan ─────────────────────────────────────────────────────────────────
  if (action === "plan") {
    try {
      const plan = planDealGoogleAdsDistribution(synthesis, deal);
      return NextResponse.json({ ok: true, plan });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── dispatch ─────────────────────────────────────────────────────────────
  if (action === "dispatch") {
    const mode: DealGoogleAdsDistributionMode = body.mode === "live" ? "live" : "simulate";
    try {
      const plan = planDealGoogleAdsDistribution(synthesis, deal);
      const distribution = await dispatchDealGoogleAdsDistribution(synthesis, plan, mode);
      const cache = upsertDealGoogleAdsDistribution(loadDealGoogleAdsDistributionCache(), distribution);
      saveDealGoogleAdsDistributionCache(cache);
      return NextResponse.json({ ok: true, distribution });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
