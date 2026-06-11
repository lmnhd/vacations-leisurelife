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
 * At least one contact field (email or phone) is required. Phone is redacted from
 * the Pushover message body; it is stored in the cache for the operator only.
 */

import * as fs from "node:fs";

import { NextResponse } from "next/server";

import { DEALS_CACHE_PATHS, emptyCallbackRequestsCache } from "@/lib/cb/deals-system/caches";
import type {
  AgentCallbackRequest,
  AgentCallbackRequestsCache,
} from "@/lib/cb/deals-system/callback-request-types";
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

function loadCallbackCache(): AgentCallbackRequestsCache {
  const path = DEALS_CACHE_PATHS.callbackRequests;
  if (!fs.existsSync(path)) return emptyCallbackRequestsCache();
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as AgentCallbackRequestsCache;
  } catch {
    return emptyCallbackRequestsCache();
  }
}

function saveCallbackCache(cache: AgentCallbackRequestsCache): void {
  fs.writeFileSync(
    DEALS_CACHE_PATHS.callbackRequests,
    `${JSON.stringify(cache, null, 2)}\n`,
    "utf8"
  );
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
      crispNotified: false,
    },
    statusHistory: [
      { status: "new", changedAtIso: nowIso },
    ],
  };

  const cache = loadCallbackCache();
  cache.requests.push(callbackRequest);
  cache.generatedAtIso = nowIso;
  saveCallbackCache(cache);

  // Pushover notification — phone is omitted from the message body.
  const contactLine = email ? `Email: ${email}` : "No email provided";
  const nameLine = name ? `Name: ${name}` : "Name not provided";
  void sendAdminPushNotification(
    `Callback request — ${deal.title}\n${nameLine}\n${contactLine}\nDeal: ${dealId}`
  );

  return NextResponse.json({ ok: true, requestId });
}
