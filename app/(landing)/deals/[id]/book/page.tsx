import { notFound } from "next/navigation";

import {
  BookingFlowExperience,
  type BookingAssistantDealContext,
} from "@/app/(tests)/tests/deals-system/booking-assistant/booking-flow-experience";
import { getStoredCbDealDetailById } from "@/lib/cb/cb-deal-details";
import { getPublicDealPageById } from "@/lib/cb/deals-system/public-deals";
import { isBookingAssistantServerEnabled } from "@/lib/booking-assistant/feature-flag";
import { BookingAssistantViewport } from "./booking-assistant-viewport";
import { BookingPortalBeacon } from "./booking-portal-beacon";

export const dynamic = "force-dynamic";

/**
 * The booking portal is live wherever the booking assistant feature is enabled
 * (`BOOKING_ASSISTANT_ENABLED=true`) — the same flag that gates the guest
 * save/signal/resume APIs this flow depends on, so the whole feature turns on
 * and off atomically. When the flag is off the page 404s, matching those APIs.
 * The enable decision is centralized in lib/booking-assistant/feature-flag so
 * this gate and the landing-page "Book now" CTA can't drift apart.
 */

export default async function DealBookingAssistantPage({
  params,
}: {
  params: Promise<{ id?: string | string[] }>;
}) {
  if (!isBookingAssistantServerEnabled()) {
    notFound();
  }

  const resolvedParams = await params;
  const id = Array.isArray(resolvedParams.id)
    ? resolvedParams.id.join("/")
    : resolvedParams.id;
  if (!id) notFound();

  const curated = await getPublicDealPageById(id);
  if (curated) {
    const deal: BookingAssistantDealContext = {
      dealId: curated.id,
      packageId: curated.id,
      siid: "",
      line: curated.facts.cruiseLine,
      ship: curated.facts.shipName,
      title: curated.title,
      nights: curated.facts.nights,
      sailDateIso: curated.facts.sailDateLabel,
      sailDateLabel: curated.facts.sailDateLabel,
      departure: curated.facts.departurePort ?? "Departure confirmed with agent",
      itinerary: curated.facts.destination,
      priceBasis: curated.facts.priceFromLabel ?? "Price confirmed with agent",
      sourceBookingUrl: curated.bookingUrl,
      // Operator-selected campaign hero, laid faintly behind the whole flow so a
      // returning guest is reminded which trip this is. Prefer the rich design
      // page's hero, fall back to the tile/summary hero the homepage already uses.
      heroImageUrl: curated.designPage?.hero.imageUrl ?? curated.heroImageSrc,
    };
    return (
      <BookingAssistantViewport>
        <BookingPortalBeacon dealId={curated.id} />
        <BookingFlowExperience deal={deal} />
      </BookingAssistantViewport>
    );
  }

  const legacy = await getStoredCbDealDetailById(id);
  if (!legacy || !legacy.booking.bookingUrl) notFound();

  const deal: BookingAssistantDealContext = {
    dealId: id,
    packageId: id,
    siid: "",
    line: "Cruise Brothers",
    ship: legacy.cruiseFacts.shipName ?? "Ship confirmed with agent",
    title: legacy.display.title,
    nights: 0,
    sailDateIso: legacy.cruiseFacts.sailDateLabel ?? "",
    sailDateLabel: legacy.cruiseFacts.sailDateLabel ?? "Sailing date confirmed with agent",
    departure: legacy.cruiseFacts.destination,
    itinerary: legacy.cruiseFacts.destination,
    priceBasis: legacy.cruiseFacts.priceFromLabel ?? "Price confirmed with agent",
    sourceBookingUrl: legacy.booking.bookingUrl,
  };
  return (
    <BookingAssistantViewport>
      <BookingPortalBeacon dealId={id} />
      <BookingFlowExperience deal={deal} />
    </BookingAssistantViewport>
  );
}
