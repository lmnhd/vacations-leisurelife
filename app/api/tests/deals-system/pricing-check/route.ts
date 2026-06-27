/**
 * Deal cabin-pricing drift check + one-tier-at-a-time correction.
 *
 * Cabin pricing is captured ONCE at resolve time (Step 4) and frozen onto a
 * Deal's cruiseFacts.cabinPrices forever after — there is no live re-fetch
 * when the public /deals/[id] page renders, so a published Deal's displayed
 * price can silently drift from CB Agent Tools' live booking page.
 *
 * This scrapes the live cabin-tier prices directly off the Deal's own
 * bookingUrl — the exact page a guest sees, not a re-derived search result.
 * An earlier version ran a fresh Odysseus search and matched by packageId,
 * but Odysseus can re-index/re-rate a sailing under a NEW packageId between
 * searches (the same physical cruise, different id), which made comparisons
 * unreliable and occasionally impossible. Reading the booking page directly
 * sidesteps that: there's no id to match, only the page the deal already
 * points at.
 *
 * POST { action: "list" }
 *   -> { ok, deals: [{ id, label, hasStoredPricing }] } — every published deal,
 *      for the operator to pick from.
 *
 * POST { action: "check", dealId }
 *   -> scrapes the deal's bookingUrl for the live "Pricing From" cabin-tier
 *      block and reports each tier's stored vs. live price. NEVER WRITES.
 *
 * POST { action: "apply", dealId, tier, livePrice, currencyCode }
 *   -> patches exactly the one cabin tier the operator clicked "Apply" on.
 *      Requires the operator to have already seen the check result for that
 *      tier — this route does not re-derive livePrice itself, it trusts the
 *      caller's number IS what "check" just reported (the client only ever
 *      sends back a number it rendered from a fresh check response).
 */

import * as fs from "fs";
import * as path from "path";

import { NextResponse } from "next/server";

import { getCuratedDeal, listCuratedDeals, upsertCuratedDealRecord } from "@/lib/cb/deals-system/deals-dynamo-store";
import { scrapeLiveBookingPagePricing } from "@/lib/cb/link-broker/browser-validate";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import type { CuratedDealCabinPrices, CuratedOdysseusDeal } from "@/lib/cb/deals-system/curated-deal-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PLAYWRIGHT_STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const REAL_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const CABIN_TIERS = ["inside", "outside", "balcony", "suite"] as const;
type CabinTier = (typeof CABIN_TIERS)[number];

function isCabinTier(value: unknown): value is CabinTier {
  return typeof value === "string" && (CABIN_TIERS as readonly string[]).includes(value);
}

interface Body {
  action?: unknown;
  dealId?: unknown;
  tier?: unknown;
  livePrice?: unknown;
  currencyCode?: unknown;
}

function dealLabel(deal: CuratedOdysseusDeal): string {
  const ship = deal.cruiseFacts.shipName ?? deal.cruiseFacts.cruiseLine ?? "?";
  return `${deal.id} — ${ship} — ${deal.cruiseFacts.itineraryName ?? "?"} — sail ${deal.cruiseFacts.sailDateIso ?? "?"}`;
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

  // ── list ─────────────────────────────────────────────────────────────────────
  if (action === "list") {
    try {
      const deals = await listCuratedDeals();
      return NextResponse.json({
        ok: true,
        deals: deals.map((deal) => ({
          id: deal.id,
          label: dealLabel(deal),
          hasStoredPricing: CABIN_TIERS.some((t) => typeof deal.cruiseFacts.cabinPrices[t] === "number"),
        })),
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  const dealId = typeof body.dealId === "string" ? body.dealId.trim() : "";
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "dealId is required." }, { status: 400 });
  }

  // ── check ────────────────────────────────────────────────────────────────────
  if (action === "check") {
    const deal = await getCuratedDeal(dealId);
    if (!deal) {
      return NextResponse.json({ ok: false, error: `No curated deal found with id "${dealId}".` }, { status: 404 });
    }
    if (!deal.bookingUrl) {
      return NextResponse.json({ ok: true, dealId, tiers: [], note: "This deal has no bookingUrl to scrape." });
    }

    try {
      const outcome = await scrapeLiveBookingPagePricing(deal.bookingUrl, {
        storageStatePath: fs.existsSync(PLAYWRIGHT_STATE_FILE) ? PLAYWRIGHT_STATE_FILE : undefined,
        executablePath: fs.existsSync(REAL_CHROME_PATH) ? REAL_CHROME_PATH : undefined,
      });

      if (!outcome.ok || !outcome.prices) {
        return NextResponse.json({
          ok: true,
          dealId,
          tiers: [],
          note: `Could not read live pricing from the booking page: ${outcome.failureReason ?? "unknown reason"}`,
        });
      }

      const tiers = CABIN_TIERS.map((tier) => {
        const stored = deal.cruiseFacts.cabinPrices[tier];
        const live = outcome.prices?.[tier];
        if (typeof stored !== "number" && typeof live !== "number") return null;
        const percentDelta =
          typeof stored === "number" && stored > 0 && typeof live === "number"
            ? ((live - stored) / stored) * 100
            : null;
        return {
          tier,
          stored: typeof stored === "number" ? stored : null,
          live: typeof live === "number" ? live : null,
          percentDelta,
          currencyCode: outcome.prices?.currencyCode ?? deal.cruiseFacts.cabinPrices.currencyCode,
        };
      }).filter((t): t is NonNullable<typeof t> => t !== null);

      return NextResponse.json({ ok: true, dealId, tiers });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // ── apply ────────────────────────────────────────────────────────────────────
  if (action === "apply") {
    const tier = body.tier;
    const livePrice = Number(body.livePrice);
    const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.trim() : undefined;

    if (!isCabinTier(tier)) {
      return NextResponse.json(
        { ok: false, error: 'tier must be one of "inside", "outside", "balcony", "suite".' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(livePrice) || livePrice <= 0) {
      return NextResponse.json({ ok: false, error: "livePrice must be a positive number." }, { status: 400 });
    }

    const deal = await getCuratedDeal(dealId);
    if (!deal) {
      return NextResponse.json({ ok: false, error: `No curated deal found with id "${dealId}".` }, { status: 404 });
    }

    const updatedCabinPrices: CuratedDealCabinPrices = {
      ...deal.cruiseFacts.cabinPrices,
      [tier]: livePrice,
      currencyCode: currencyCode || deal.cruiseFacts.cabinPrices.currencyCode,
    };
    const updatedDeal: CuratedOdysseusDeal = {
      ...deal,
      cruiseFacts: { ...deal.cruiseFacts, cabinPrices: updatedCabinPrices },
    };

    try {
      await upsertCuratedDealRecord(updatedDeal);
      return NextResponse.json({ ok: true, dealId, tier, livePrice, cabinPrices: updatedCabinPrices });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
