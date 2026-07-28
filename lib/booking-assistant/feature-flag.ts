/**
 * Server-side on/off decision for the Booking Assistant backend.
 *
 * This gates the /deals/[id]/book page and the guest save/signal/resume APIs
 * via BOOKING_ASSISTANT_ENABLED, so the whole backend turns on and off
 * atomically. It falls back to the public mirror so a config that only set
 * NEXT_PUBLIC_BOOKING_ASSISTANT_ENABLED still works.
 *
 * Note: the landing-page "Book now" CTA does NOT consult a flag — it always
 * links to /deals/[id]/book. The old external booking links are permanently
 * retired (see components/cb/deal-cta-actions.tsx).
 */
export function isBookingAssistantServerEnabled(): boolean {
  return (
    process.env.BOOKING_ASSISTANT_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_BOOKING_ASSISTANT_ENABLED === "true"
  );
}
