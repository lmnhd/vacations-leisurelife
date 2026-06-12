/**
 * Deal Discovery entry-point route (workflow step 1).
 *
 * GET  -> { ok, researchStatus, ideas } — saved-research status + cached ideas.
 * POST { action: "generate", count? } -> generate retail package ideas from the
 *        last saved Group discovery research, upsert into the deal-discovery cache,
 *        return the new ideas.
 *
 * Safety: this never runs Gemini/Perplexity (saved research is operator-produced
 * via the Group pipeline; we only read it). It never books, holds, or publishes.
 * Idea generation is AI-only and hard-fails with a clear error when no saved
 * research exists.
 */

import { NextResponse } from "next/server";

import {
  generateDealDiscoveryIdeas,
  getSavedDiscoveryResearchStatus,
  loadDealDiscoveryIdeasCache,
  removeDealDiscoveryIdea,
  saveDealDiscoveryIdeasCache,
  upsertDealDiscoveryIdea,
  type DealDiscoveryIdea,
} from "@/lib/cb/deals-system";

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
  return NextResponse.json({
    ok: true,
    researchStatus: getSavedDiscoveryResearchStatus(),
    ideas: loadIdeas(),
  });
}

/** DELETE ?id=<ideaId> — prune an unwanted discovery angle from the cache. */
export async function DELETE(request: Request) {
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
  try {
    let cache = loadDealDiscoveryIdeasCache();

    const { ideas, skipped, exhausted } = await generateDealDiscoveryIdeas({
      count: Number.isFinite(count) && count > 0 ? count : undefined,
      existingAngles: cache.ideas,
    });

    for (const idea of ideas) {
      cache = upsertDealDiscoveryIdea(cache, idea);
    }
    if (ideas.length > 0) {
      saveDealDiscoveryIdeasCache(cache);
    }

    return NextResponse.json({
      ok: true,
      generated: ideas.length,
      skipped: skipped.length,
      skippedDetail: skipped,
      exhausted,
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
