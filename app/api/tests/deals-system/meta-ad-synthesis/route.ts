/**
 * Meta Ad Synthesis route (deal workflow step 8).
 *
 * GET  -> { ok, funnelSyntheses, syntheses } — Step 7 funnel syntheses (source
 *         of the Meta carousel copy) and existing meta ad syntheses.
 *
 * POST { action: "init", funnelSynthesisId }
 *   -> build (or reset) a meta ad synthesis from a funnel synthesis's carousel
 *      cards, seeded with the default editable prompt template. Persist + return.
 *
 * POST { action: "update_prompt", synthesisId, promptTemplate }
 *   -> save the operator's edited prompt template. No AI.
 *
 * POST { action: "generate_image", synthesisId, cardIndex }
 *   -> interpolate the template for this card and generate its image with
 *      gpt-image-2. Persist + return.
 */

import { NextResponse } from "next/server";

import {
  buildDealMetaAdSynthesis,
  generateDealMetaAdCardImage,
  listDealFunnelSyntheses,
  loadDealMetaAdSynthesisCache,
  revertDealMetaAdCardImage,
  saveDealMetaAdSynthesisCache,
  upsertDealMetaAdSynthesis,
  upsertDealMetaAdSynthesisRecord,
  type DealFunnelSynthesis,
  type DealMetaAdSynthesis,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

/**
 * Mirror every write into the Dynamo store (deals-dynamo-store.ts) alongside the
 * local JSON cache, matching the funnel-synthesis route's pattern — production
 * (/deals/[id]) reads Dynamo only, so a synthesis never reaches real visitors
 * until it's mirrored here. Best-effort: a Dynamo failure must never block the
 * operator's local-cache workflow.
 */
async function mirrorToDynamo(synthesis: DealMetaAdSynthesis): Promise<void> {
  try {
    await upsertDealMetaAdSynthesisRecord(synthesis);
  } catch (error) {
    console.error("[meta-ad-synthesis] Failed to mirror synthesis to Dynamo:", error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  action?: unknown;
  funnelSynthesisId?: unknown;
  synthesisId?: unknown;
  promptTemplate?: unknown;
  cardIndex?: unknown;
  promptSuffix?: unknown;
  historyIndex?: unknown;
}

async function loadFunnelSyntheses(): Promise<DealFunnelSynthesis[]> {
  try {
    return await listDealFunnelSyntheses();
  } catch {
    return [];
  }
}

function loadSyntheses(): DealMetaAdSynthesis[] {
  try {
    return loadDealMetaAdSynthesisCache().syntheses;
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

    try {
      const synthesis = buildDealMetaAdSynthesis(funnelSynthesis);
      const cache = upsertDealMetaAdSynthesis(loadDealMetaAdSynthesisCache(), synthesis);
      saveDealMetaAdSynthesisCache(cache);
      await mirrorToDynamo(synthesis);
      return NextResponse.json({ ok: true, synthesis, syntheses: cache.syntheses });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── update_prompt ────────────────────────────────────────────────────────────
  if (action === "update_prompt") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const promptTemplate = typeof body.promptTemplate === "string" ? body.promptTemplate : "";
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!promptTemplate.trim()) {
      return NextResponse.json({ ok: false, error: "promptTemplate is required." }, { status: 400 });
    }
    const cache = loadDealMetaAdSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealMetaAdSynthesis = { ...existing, promptTemplate };
      const nextCache = upsertDealMetaAdSynthesis(cache, updated);
      saveDealMetaAdSynthesisCache(nextCache);
      await mirrorToDynamo(updated);
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
    const cardIndex = Number(body.cardIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json({ ok: false, error: "cardIndex must be a non-negative integer." }, { status: 400 });
    }
    const cache = loadDealMetaAdSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    if (!existing.cards.some((c) => c.cardIndex === cardIndex)) {
      return NextResponse.json(
        { ok: false, error: `No card with index ${cardIndex} in synthesis "${synthesisId}".` },
        { status: 404 }
      );
    }

    // Generation is slow (tens of seconds); re-read the cache just before
    // merging so a parallel "generate all" doesn't clobber sibling cards'
    // updates written while this request was in flight.
    const existingSynthesis = existing;
    function mergeCardIntoLatest(card: DealMetaAdSynthesis["cards"][number]): DealMetaAdSynthesis {
      const latestCache = loadDealMetaAdSynthesisCache();
      const latest = latestCache.syntheses.find((s) => s.id === synthesisId) ?? existingSynthesis;
      const synthesis: DealMetaAdSynthesis = {
        ...latest,
        cards: latest.cards.map((c) => (c.cardIndex === cardIndex ? card : c)),
      };
      saveDealMetaAdSynthesisCache(upsertDealMetaAdSynthesis(latestCache, synthesis));
      return synthesis;
    }

    const promptSuffix = typeof body.promptSuffix === "string" ? body.promptSuffix : undefined;

    try {
      const updatedCard = await generateDealMetaAdCardImage(existing, cardIndex, promptSuffix);
      const synthesis = mergeCardIntoLatest(updatedCard);
      await mirrorToDynamo(synthesis);
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      // Persist the error onto the card so the operator sees it without losing
      // the rest of the synthesis (other cards' images stay intact).
      const failedCard: DealMetaAdSynthesis["cards"][number] = {
        ...existing.cards.find((c) => c.cardIndex === cardIndex)!,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      let synthesis: DealMetaAdSynthesis = {
        ...existing,
        cards: existing.cards.map((c) => (c.cardIndex === cardIndex ? failedCard : c)),
      };
      try {
        synthesis = mergeCardIntoLatest(failedCard);
        await mirrorToDynamo(synthesis);
      } catch {
        // best-effort persistence of the error state
      }
      return NextResponse.json(
        { ok: false, error: failedCard.error, synthesis },
        { status: 500 }
      );
    }
  }

  // ── revert_image ─────────────────────────────────────────────────────────────
  if (action === "revert_image") {
    const synthesisId = typeof body.synthesisId === "string" ? body.synthesisId.trim() : "";
    const cardIndex = Number(body.cardIndex);
    const historyIndex = Number(body.historyIndex);
    if (!synthesisId) {
      return NextResponse.json({ ok: false, error: "synthesisId is required." }, { status: 400 });
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return NextResponse.json({ ok: false, error: "cardIndex must be a non-negative integer." }, { status: 400 });
    }
    if (!Number.isInteger(historyIndex) || historyIndex < 0) {
      return NextResponse.json({ ok: false, error: "historyIndex must be a non-negative integer." }, { status: 400 });
    }
    const cache = loadDealMetaAdSynthesisCache();
    const existing = cache.syntheses.find((s) => s.id === synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const revertedCard = revertDealMetaAdCardImage(existing, cardIndex, historyIndex);
      const synthesis: DealMetaAdSynthesis = {
        ...existing,
        cards: existing.cards.map((c) => (c.cardIndex === cardIndex ? revertedCard : c)),
      };
      saveDealMetaAdSynthesisCache(upsertDealMetaAdSynthesis(cache, synthesis));
      await mirrorToDynamo(synthesis);
      return NextResponse.json({ ok: true, synthesis });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
