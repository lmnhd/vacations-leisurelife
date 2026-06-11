/**
 * Deal booking-link email delivery (Phase 12).
 *
 * Sends a prepared booking link to a visitor via Klaviyo: upserts a profile by
 * email, then tracks the "LLL Deal Link Requested" event. A Klaviyo flow bound
 * to that metric owns the actual email template and copy.
 *
 * The event carries everything PHASED_IMPLEMENTATION_PLAN.md Phase 12 calls
 * for: deal title, ship/date summary, the prepared booking link, and a
 * pricing/availability caveat. Failures are surfaced to the caller — the route
 * must not report success on a failed Klaviyo call.
 */

import { trackKlaviyoEvent, upsertKlaviyoProfile } from "@/lib/integrations/klaviyo";
import type { PublicDealPage } from "./public-deal-projection";

export const DEAL_LINK_REQUESTED_METRIC = "LLL Deal Link Requested";

export const DEAL_LINK_AVAILABILITY_CAVEAT =
  "Prices, taxes, fees, cabin categories, and promotions can change inside the booking portal. Confirm live details before final booking.";

export interface SendDealLinkEmailResult {
  delivered: boolean;
  error?: string;
}

/**
 * Sends the booking link for a public Deal to the given email address via
 * Klaviyo. Returns `delivered: false` (with `error`) on any failure so the
 * caller can avoid claiming a silent send.
 */
export async function sendDealLinkEmail(
  deal: PublicDealPage,
  email: string
): Promise<SendDealLinkEmailResult> {
  try {
    await upsertKlaviyoProfile({ email });

    await trackKlaviyoEvent({
      email,
      eventName: DEAL_LINK_REQUESTED_METRIC,
      properties: {
        deal_id: deal.id,
        deal_title: deal.title,
        ship_name: deal.facts.shipName,
        cruise_line: deal.facts.cruiseLine,
        destination: deal.facts.destination,
        sail_date: deal.facts.sailDateLabel,
        price_from_label: deal.facts.priceFromLabel,
        booking_link_url: deal.bookingUrl,
        deal_page_url: `/deals/${deal.id}`,
        availability_caveat: DEAL_LINK_AVAILABILITY_CAVEAT,
      },
    });

    return { delivered: true };
  } catch (error) {
    return { delivered: false, error: error instanceof Error ? error.message : String(error) };
  }
}
