/**
 * GET /api/tests/deals-system/deal-activity?dealId=...
 *
 * Operator-only. Returns the activity summary + recent event timeline for one
 * Deal so the workbench can show per-deal reach and contact actions — the
 * Deals-side analog of the campaign conversion dashboard's traffic/funnel read.
 *
 * Output: { ok: true, summary: DealActivitySummary, events: DealEvent[] }
 *       | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";

import {
  computeDealActivitySummary,
  computeDealBookingFunnel,
  computeDealBookingLeads,
  computeDealDailyActivity,
  listDealEvents,
} from "@/lib/cb/deals-system/deal-events-store";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_EVENT_LIMIT = 150;

export async function GET(request: NextRequest) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const dealId = request.nextUrl.searchParams.get("dealId")?.trim();
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "dealId is required." }, { status: 400 });
  }

  const events = await listDealEvents(dealId);
  const summary = computeDealActivitySummary(dealId, events);
  const daily = computeDealDailyActivity(events);
  const bookingFunnel = computeDealBookingFunnel(events);
  const bookingLeads = computeDealBookingLeads(events);

  // Most-recent-first, capped — the timeline is a glance, not an export.
  const recent = [...events].reverse().slice(0, RECENT_EVENT_LIMIT);

  return NextResponse.json({
    ok: true,
    summary,
    daily,
    bookingFunnel,
    bookingLeads,
    events: recent,
  });
}
