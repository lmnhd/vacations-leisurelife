/**
 * POST /api/deals/link-request (Phase 11/12)
 *
 * A visitor wants the booking link for a specific Curated Deal. The route
 * always returns the booking URL so the CTA can open it immediately.
 *
 * When an email address is supplied, the route also sends the link via
 * Klaviyo (Phase 12): it upserts a profile and tracks the
 * "LLL Deal Link Requested" event, which a Klaviyo flow turns into the actual
 * email (deal title, ship/date summary, prepared link, availability caveat).
 * A failed email send does not fail the request — the URL is still returned —
 * but is reported via `emailDelivered`/`emailError` so the UI can be honest
 * about whether the email actually went out.
 *
 * Input:  { dealId: string, email?: string }
 * Output: { ok: true, url: string, emailDelivered?: boolean, emailError?: string }
 *       | { ok: false, error: string }
 *
 * Only eligible Deals (bookable + approved + valid link) can be looked up.
 * The route never exposes internal deal fields — only the booking URL.
 */

import { NextResponse } from "next/server";

import { sendDealLinkEmail } from "@/lib/cb/deals-system/deal-link-email";
import { getPublicDealPageById } from "@/lib/cb/deals-system/public-deals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  dealId?: unknown;
  email?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const dealId = str(body.dealId);
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "dealId is required." }, { status: 400 });
  }

  const email = str(body.email);
  if (email && !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ ok: false, error: "email is not a valid address." }, { status: 400 });
  }

  const deal = await getPublicDealPageById(dealId);
  if (!deal) {
    return NextResponse.json({ ok: false, error: "Deal not found or not available." }, { status: 404 });
  }

  if (!email) {
    return NextResponse.json({ ok: true, url: deal.bookingUrl });
  }

  const result = await sendDealLinkEmail(deal, email);
  return NextResponse.json({
    ok: true,
    url: deal.bookingUrl,
    emailDelivered: result.delivered,
    emailError: result.error,
  });
}
