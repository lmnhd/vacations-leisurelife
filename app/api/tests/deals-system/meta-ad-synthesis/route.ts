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
 *
 * Storage: DynamoDB (deals-dynamo-store) is the primary source of truth. The
 * same store feeds public /deals/[id]. Successful writes are also mirrored into
 * the local JSON cache so operator-only test routes can keep working through
 * temporary Dynamo/DNS outages.
 */

import { NextResponse } from "next/server";

import {
  buildDealMetaAdSynthesis,
  generateDealMetaAdCardImage,
  getDealMetaAdSynthesis,
  loadDealMetaAdSynthesisCache,
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
  revertDealMetaAdCardImage,
  saveDealMetaAdSynthesisCache,
  upsertDealMetaAdSynthesisRecord,
  upsertDealMetaAdSynthesis,
  type DealFunnelSynthesis,
  type DealMetaAdSynthesis,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

function mergeExistingGeneratedCards(
  fresh: DealMetaAdSynthesis,
  existing?: DealMetaAdSynthesis
): DealMetaAdSynthesis {
  if (!existing) return fresh;

  return {
    ...fresh,
    generatedAtIso: existing.generatedAtIso,
    promptTemplate: existing.promptTemplate || fresh.promptTemplate,
    cards: fresh.cards.map((freshCard) => {
      const existingCard = existing.cards.find((card) => card.cardIndex === freshCard.cardIndex);
      if (
        !existingCard ||
        existingCard.headline !== freshCard.headline ||
        existingCard.primaryText !== freshCard.primaryText ||
        !existingCard.imageUrl
      ) {
        return freshCard;
      }

      return {
        ...freshCard,
        status: existingCard.status,
        imageUrl: existingCard.imageUrl,
        generator: existingCard.generator,
        promptUsed: existingCard.promptUsed,
        generatedAtIso: existingCard.generatedAtIso,
        error: existingCard.error,
        previousImages: existingCard.previousImages,
      };
    }),
  };
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

async function loadSyntheses(): Promise<DealMetaAdSynthesis[]> {
  try {
    return await listDealMetaAdSyntheses();
  } catch {
    return loadDealMetaAdSynthesisCache().syntheses;
  }
}

async function saveMetaAdSynthesis(synthesis: DealMetaAdSynthesis): Promise<void> {
  await upsertDealMetaAdSynthesisRecord(synthesis);
  try {
    const cache = upsertDealMetaAdSynthesis(loadDealMetaAdSynthesisCache(), synthesis);
    saveDealMetaAdSynthesisCache(cache);
  } catch {
    // The Dynamo write is authoritative; local mirroring is only a workbench
    // fallback for temporary Dynamo/DNS outages.
  }
}

async function findMetaAdSynthesis(synthesisId: string): Promise<DealMetaAdSynthesis | null> {
  try {
    const synthesis = await getDealMetaAdSynthesis(synthesisId);
    if (synthesis) return synthesis;
  } catch {
    // Fall through to local mirror.
  }
  return loadDealMetaAdSynthesisCache().syntheses.find((synthesis) => synthesis.id === synthesisId) ?? null;
}

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    funnelSyntheses: await loadFunnelSyntheses(),
    syntheses: await loadSyntheses(),
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
      const existing = (await findMetaAdSynthesis(funnelSynthesis.id)) ?? undefined;
      const synthesis = mergeExistingGeneratedCards(buildDealMetaAdSynthesis(funnelSynthesis), existing);
      await saveMetaAdSynthesis(synthesis);
      return NextResponse.json({ ok: true, synthesis, syntheses: await loadSyntheses() });
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
    const existing = await findMetaAdSynthesis(synthesisId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `No meta ad synthesis found with id "${synthesisId}".` },
        { status: 404 }
      );
    }
    try {
      const updated: DealMetaAdSynthesis = { ...existing, promptTemplate };
      await saveMetaAdSynthesis(updated);
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
    const existing = await findMetaAdSynthesis(synthesisId);
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

    // Generation is slow (tens of seconds); re-read the record just before
    // merging so a parallel "generate all" doesn't clobber sibling cards'
    // updates written while this request was in flight.
    const existingSynthesis = existing;
    async function mergeCardIntoLatest(
      card: DealMetaAdSynthesis["cards"][number]
    ): Promise<DealMetaAdSynthesis> {
      const latest = (await findMetaAdSynthesis(synthesisId)) ?? existingSynthesis;
      const synthesis: DealMetaAdSynthesis = {
        ...latest,
        cards: latest.cards.map((c) => (c.cardIndex === cardIndex ? card : c)),
      };
      await saveMetaAdSynthesis(synthesis);
      return synthesis;
    }

    const promptSuffix = typeof body.promptSuffix === "string" ? body.promptSuffix : undefined;

    try {
      const updatedCard = await generateDealMetaAdCardImage(existing, cardIndex, promptSuffix);
      const synthesis = await mergeCardIntoLatest(updatedCard);
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
        synthesis = await mergeCardIntoLatest(failedCard);
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
    const existing = await findMetaAdSynthesis(synthesisId);
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
      await saveMetaAdSynthesis(synthesis);
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
