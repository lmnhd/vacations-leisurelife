/**
 * POST /api/deals/callback-request (Phase 11)
 *
 * A visitor requests an agent callback for a specific Curated Deal. The route:
 *   1. Validates the deal exists and is eligible.
 *   2. Writes an AgentCallbackRequest record to deal-callback-requests-cache.json.
 *   3. Sends a Pushover admin notification.
 *
 * Email delivery and the operator dashboard land in Phase 12/13.
 *
 * Input:
 *   { dealId: string, name?: string, email?: string, phone?: string, notes?: string }
 *
 * Output:
 *   { ok: true, requestId: string } | { ok: false, error: string }
 *
 * At least one contact field (email or phone) is required. The Pushover message
 * includes supplied contact details so the operator can call back immediately.
 */

import { NextResponse } from "next/server";

import { appendCallbackRequest } from "@/lib/cb/deals-system/callback-request-store";
import type { AgentCallbackRequest } from "@/lib/cb/deals-system/callback-request-types";
import { appendDealEvent } from "@/lib/cb/deals-system/deal-events-store";
import { getPublicDealPageById } from "@/lib/cb/deals-system/public-deals";
import { sendAdminPushNotification } from "@/lib/pushover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  dealId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

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

  const name = str(body.name);
  const email = str(body.email);
  const phone = str(body.phone);
  const notes = str(body.notes);

  if (!email && !phone) {
    return NextResponse.json(
      { ok: false, error: "At least one contact method (email or phone) is required." },
      { status: 400 }
    );
  }

  const deal = await getPublicDealPageById(dealId);
  if (!deal) {
    return NextResponse.json({ ok: false, error: "Deal not found or not available." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const requestId = `cbr-${dealId}-${Date.now()}`;

  const callbackRequest: AgentCallbackRequest = {
    id: requestId,
    createdAtIso: nowIso,
    status: "new",
    ctaSource: "request_callback",
    visitor: {
      name,
      email,
      phone,
      notes,
    },
    deal: {
      dealId,
      dealTitle: deal.title,
      cruiseLine: deal.facts.cruiseLine,
      shipName: deal.facts.shipName,
      sailDateIso: deal.facts.sailDateLabel,
    },
    linkHealthStatus: "valid",
    brokerLinkUrl: deal.bookingUrl,
    routing: {
      emailNotified: false,
      dashboardQueued: true,
    },
    statusHistory: [
      { status: "new", changedAtIso: nowIso },
    ],
  };

  await appendCallbackRequest(callbackRequest);

  // Record the contact action on the deal's activity timeline (best-effort).
  await appendDealEvent({
    dealId,
    eventType: "callback_requested",
    attribution: {},
    email,
    metadata: { ctaSource: "request_callback", ...(phone ? { hasPhone: "true" } : {}) },
  });

  const emailLine = email ? `Email: ${email}` : "Email: not provided";
  const phoneLine = phone ? `Phone: ${phone}` : "Phone: not provided";
  const nameLine = name ? `Name: ${name}` : "Name: not provided";
  try {
    await sendAdminPushNotification(
      `Callback request - ${deal.title}\n${nameLine}\n${emailLine}\n${phoneLine}\nDeal: ${dealId}`,
      {
        priority: "1",
        title: "Leisure Life Callback Request",
        url: deal.bookingUrl,
        urlTitle: "Open booking link",
      }
    );
  } catch (error) {
    console.error("[CALLBACK_PUSHOVER_ERROR]", error);
  }

  return NextResponse.json({ ok: true, requestId });
}
