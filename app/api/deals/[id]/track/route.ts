/**
 * POST /api/deals/[id]/track
 *
 * Anonymous reach/engagement beacon for a public Deal page — the Deals-side
 * analog of `/api/groups/campaign/[slug]/analytics/page-view`. Records a
 * `deal_page_view`, `deal_engaged`, or `book_now_click` event against the deal's
 * events partition so the operator dashboard can show per-deal traffic. Also
 * carries the booking portal's client-side milestones: `booking_portal_entered`
 * (anonymous), `booking_self_serve_opened` (anonymous — the guest took the
 * direct-booking exit rather than the assisted flow, so they never create a
 * draft and would otherwise be invisible), and `booking_contact_captured`
 * (guest-supplied name+email, so the dashboard can surface partial leads who
 * never completed a server save).
 *
 * Only publicly eligible Deals are tracked (isPublicDealAvailableById gates on
 * bookable + approved + valid link). Tracking is best-effort and never fails
 * the request.
 *
 * Input:  { eventType?: 'deal_page_view'|'deal_engaged'|'book_now_click',
 *           attribution: {...}, metadata?: {...} }
 * Output: { success: true, tracked: boolean, eventId?: string, reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { normalizeAttribution } from "@/lib/campaigns/lead-attribution";
import { appendDealEvent } from "@/lib/cb/deals-system/deal-events-store";
import { isPublicDealAvailableById } from "@/lib/cb/deals-system/public-deals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AttributionSchema = z.object({
  sourceChannel: z.string().trim().optional(),
  provider: z.string().trim().optional(),
  providerDraftType: z.string().trim().optional(),
  providerCampaignId: z.string().trim().optional(),
  providerAdGroupId: z.string().trim().optional(),
  providerAdId: z.string().trim().optional(),
  providerLeadId: z.string().trim().optional(),
  landingPath: z.string().trim().optional(),
  referrer: z.string().trim().optional(),
  utmSource: z.string().trim().optional(),
  utmMedium: z.string().trim().optional(),
  utmCampaign: z.string().trim().optional(),
  utmContent: z.string().trim().optional(),
  utmTerm: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
});

const TrackSchema = z.object({
  attribution: AttributionSchema.optional(),
  metadata: z.record(z.string().trim(), z.string().trim()).optional(),
  eventType: z
    .enum([
      "deal_page_view",
      "deal_engaged",
      "book_now_click",
      "booking_portal_entered",
      "booking_self_serve_opened",
      "booking_contact_captured",
    ])
    .optional(),
  /** Only honored for booking_contact_captured — the guest supplied it in the flow. */
  email: z.string().trim().email().max(254).optional(),
});

function truncate(value: string | null, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Deal id is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = TrackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid track payload.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Only publicly eligible deals are trackable — keeps the events partition
  // clean of noise from non-public ids.
  const isPublicDeal = await isPublicDealAvailableById(id);
  if (!isPublicDeal) {
    return NextResponse.json({ success: true, tracked: false, reason: "deal_not_public" });
  }

  const attribution = normalizeAttribution(parsed.data.attribution ?? {});
  const userAgent = truncate(request.headers.get("user-agent"), 180);
  const eventType = parsed.data.eventType ?? "deal_page_view";
  const isBookingEvent =
    eventType === "booking_portal_entered" ||
    eventType === "booking_self_serve_opened" ||
    eventType === "booking_contact_captured";
  const metadata = {
    ...(parsed.data.metadata ?? {}),
    eventFamily: isBookingEvent ? "booking_flow" : "deal_traffic",
    ...(userAgent ? { userAgent } : {}),
  };

  const NOTES: Record<string, string> = {
    deal_engaged: "Anonymous one-time deal engagement.",
    book_now_click: "Visitor clicked the booking handoff.",
    booking_portal_entered: "Guest entered the booking portal.",
    booking_self_serve_opened: "Guest opened the direct booking link instead of the assisted flow.",
    booking_contact_captured: "Guest confirmed contact details in the booking flow.",
  };

  const event = await appendDealEvent({
    dealId: id,
    eventType,
    attribution,
    metadata,
    email: eventType === "booking_contact_captured" ? parsed.data.email : undefined,
    notes: NOTES[eventType] ?? "Anonymous deal page view.",
  });

  return NextResponse.json({ success: true, tracked: Boolean(event), eventId: event?.eventId });
}
