/**
 * Meta Distribution route (deal workflow step 9).
 *
 * GET ?synthesisId=...
 *   -> { ok, synthesis, distribution } — the meta ad synthesis (Step 8) and
 *      any existing distribution record for it.
 *
 * POST { action: "plan", synthesisId }
 *   -> build a fresh DealMetaDistributionPlan (destination url, caption,
 *      ready cards, resolved Meta targeting) without dispatching.
 *
 * POST { action: "dispatch", synthesisId, mode: "simulate" | "live" }
 *   -> build the plan and dispatch it. "simulate" persists a "planned"
 *      record without calling the Graph API (besides read-only interest
 *      search). "live" creates a paused Meta Campaign + Ad Set, a Facebook
 *      carousel ad, and an Instagram Graph carousel post.
 */

import { NextResponse } from "next/server";

import {
  dispatchDealMetaDistribution,
  getCuratedDeal,
  loadDealMetaAdSynthesisCache,
  loadDealMetaDistributionCache,
  planDealMetaDistribution,
  saveDealMetaDistributionCache,
  upsertDealMetaDistribution,
  type DealMetaAdSynthesis,
  type DealMetaDistributionMode,
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

function findSynthesis(synthesisId: string): DealMetaAdSynthesis | null {
  try {
    return loadDealMetaAdSynthesisCache().syntheses.find((s) => s.id === synthesisId) ?? null;
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
    return NextResponse.json({ ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` }, { status: 404 });
  }

  const distribution = loadDealMetaDistributionCache().distributions.find((d) => d.id === synthesisId) ?? null;
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
    return NextResponse.json({ ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` }, { status: 404 });
  }

  const deal = await getCuratedDeal(synthesis.dealId);
  if (!deal) {
    return NextResponse.json({ ok: false, error: `No curated deal found with id "${synthesis.dealId}".` }, { status: 404 });
  }

  // ── plan ─────────────────────────────────────────────────────────────────
  if (action === "plan") {
    try {
      const plan = await planDealMetaDistribution(synthesis, deal);
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
    const mode: DealMetaDistributionMode = body.mode === "live" ? "live" : "simulate";
    try {
      const plan = await planDealMetaDistribution(synthesis, deal);
      const distribution = await dispatchDealMetaDistribution(synthesis, plan, mode);
      const cache = upsertDealMetaDistribution(loadDealMetaDistributionCache(), distribution);
      saveDealMetaDistributionCache(cache);
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
