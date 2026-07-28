/**
 * Single source of truth for the Booking Assistant on/off decision.
 *
 * There are two environment variables by necessity, not by choice:
 *
 *   - BOOKING_ASSISTANT_ENABLED            (server-only) — the canonical flag.
 *       Gates the /deals/[id]/book page and every guest save/signal/resume API,
 *       so the whole backend turns on and off atomically.
 *
 *   - NEXT_PUBLIC_BOOKING_ASSISTANT_ENABLED (client-visible mirror)
 *       The landing-page "Book now" CTA renders in a client component, which
 *       cannot read a server-only var, so it reads this public mirror instead.
 *
 * The two MUST be set to the same value on every environment (local + Vercel):
 * if the CTA is on but the server flag is off, the button links to a /book route
 * that 404s. Both readers live here so that contract is stated once and both
 * sides derive from the same helpers, rather than open-coding `process.env`
 * checks that can silently drift.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build time — changing one on Vercel needs
 * a fresh build to take effect.
 */

/**
 * Server-side truth. Prefer the canonical server flag; fall back to the public
 * mirror so a config that only set the public var still works. Use this in
 * server components, route handlers, and anywhere with access to server env.
 */
export function isBookingAssistantServerEnabled(): boolean {
  return (
    process.env.BOOKING_ASSISTANT_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_BOOKING_ASSISTANT_ENABLED === "true"
  );
}

/**
 * Client-safe truth for the "Book now" CTA. Reads only the public mirror (the
 * server flag is not present in the browser bundle) and additionally treats
 * local dev as enabled for convenience, so the assistant is reachable on
 * localhost without setting any flag.
 */
export function isBookingAssistantCtaEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_BOOKING_ASSISTANT_ENABLED === "true" ||
    process.env.NODE_ENV === "development"
  );
}
