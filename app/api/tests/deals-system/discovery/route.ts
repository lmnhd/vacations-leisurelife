/**
 * Deal Discovery entry-point route (workflow step 1 — INVENTORY-FIRST).
 *
 * GET  -> { ok, researchStatus, ideas } — saved-research status + cached ideas.
 * POST { action: "generate", count? } -> Step 1A: run the operator Deep Cruise
 *        Search sweep over live Odysseus inventory and SELECT the top real,
 *        bookable "excellent deals" by objective deal-quality signals. Step 1B:
 *        for each selected deal, ask the model to re-form the best-fitting niche
 *        from saved research onto THAT real cruise (match-or-discard). Matched
 *        angles — grounded on real ship/sail facts by construction — are cached;
 *        deals with no honest niche fit are HELD (reported, not cached).
 *
 * The ship now comes first: an angle cannot exist without a real cruise. The old
 * "invent an angle, then hunt for a ship to fit it" path (and its season-midpoint
 * grounding) is gone — that inversion is what made "nothing in inventory matches
 * this angle" structural.
 *
 * Safety: never runs Gemini/Perplexity (saved research is operator-produced via
 * the Group pipeline; we only read it). The sweep is read-only Odysseus search
 * (operator-run session) — never books, holds, or publishes. Niche re-forming is
 * AI-only and hard-fails with a clear error when no saved research exists.
 */

import { NextResponse } from "next/server";

import {
  getSavedDiscoveryResearchStatus,
  loadDealDiscoveryIdeasCache,
  reformNicheForDeal,
  removeDealDiscoveryIdea,
  saveDealDiscoveryIdeasCache,
  upsertDealDiscoveryIdea,
  type DealDiscoveryIdea,
} from "@/lib/cb/deals-system";
import { runDeepCruiseSearch } from "@/lib/cb/deals-system/deep-cruise-search-runner";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  count?: unknown;
}

function loadIdeas(): DealDiscoveryIdea[] {
  try {
    return loadDealDiscoveryIdeasCache().ideas;
  } catch {
    return [];
  }
}

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    researchStatus: getSavedDiscoveryResearchStatus(),
    ideas: loadIdeas(),
  });
}

/** DELETE ?id=<ideaId> — prune an unwanted discovery angle from the cache. */
export async function DELETE(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  try {
    const cache = removeDealDiscoveryIdea(loadDealDiscoveryIdeasCache(), id);
    saveDealDiscoveryIdeasCache(cache);
    return NextResponse.json({ ok: true, ideas: cache.ideas });
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

  const action = typeof body.action === "string" ? body.action : undefined;
  if (action !== "generate") {
    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(action)}` },
      { status: 400 }
    );
  }

  const count = Number(body.count);
  const selectCount = Number.isFinite(count) && count > 0 ? Math.min(count, 12) : 5;
  try {
    let cache = loadDealDiscoveryIdeasCache();

    // STEP 1A — Deep Cruise Search: pull a broad sweep of REAL inventory and
    // select the top excellent deals by objective deal-quality signals. We over-
    // pull selectCount so that, after match-or-discard, we can still surface
    // enough angles even when some strong deals find no honest niche fit.
    const search = await runDeepCruiseSearch({ selectCount: Math.max(selectCount * 2, selectCount + 3) });
    if (!search.ok || !search.result) {
      return NextResponse.json(
        {
          ok: false,
          error: search.error ?? "Deep cruise search failed.",
          hint: "The operator Odysseus session must be live (run the deep-cruise-search sweep manually to diagnose).",
        },
        { status: 502 }
      );
    }

    // Skip deals already turned into a cached angle (idempotent re-runs).
    const cachedPackageIds = new Set(cache.ideas.map((i) => i.groundedCandidate.packageId));
    const freshDeals = search.result.selected.filter((d) => !cachedPackageIds.has(d.packageId));

    // STEP 1B — Match & Re-Form Niche onto each real deal (match-or-discard).
    // Track niches already used (seeded from the cache, grown per match) so the
    // batch covers varied audiences instead of stamping one niche on every voyage.
    const ideas: DealDiscoveryIdea[] = [];
    const held: Array<{ isolatedNiche: string; sailingAngleTitle: string; reason: string }> = [];
    const usedNiches = cache.ideas.map((i) => i.isolatedNiche);
    for (const deal of freshDeals) {
      if (ideas.length >= selectCount) break;
      const outcome = await reformNicheForDeal(deal, { usedNiches: [...usedNiches] });
      if (outcome.status === "matched") {
        ideas.push(outcome.idea);
        usedNiches.push(outcome.idea.isolatedNiche);
      } else {
        held.push({
          isolatedNiche: deal.cruiseLine ?? "—",
          sailingAngleTitle: deal.cruiseName,
          reason: `strong deal held (no niche fit) — ${outcome.reason}`,
        });
      }
    }

    for (const idea of ideas) {
      cache = upsertDealDiscoveryIdea(cache, idea);
    }
    if (ideas.length > 0) {
      saveDealDiscoveryIdeasCache(cache);
    }

    return NextResponse.json({
      ok: true,
      generated: ideas.length,
      dealsConsidered: search.result.selected.length,
      heldCount: held.length,
      skipped: held.length,
      skippedDetail: held,
      // "exhausted" no longer means "no inventory" — it means every fresh strong
      // deal was held for lack of an honest niche fit (refresh research to go deeper).
      exhausted: ideas.length === 0 && freshDeals.length > 0,
      ideas,
      researchStatus: getSavedDiscoveryResearchStatus(),
      allIdeas: cache.ideas,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingResearch = message.includes("No saved discovery research");
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: missingResearch
          ? "Run Group discovery research first (POST /api/groups/discovery/research)."
          : undefined,
      },
      { status: missingResearch ? 412 : 500 }
    );
  }
}
