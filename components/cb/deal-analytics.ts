/**
 * Shared client-side event poster for public Deal page analytics — used by
 * both `DealViewBeacon` (deal_page_view / deal_engaged) and `DealCtaActions`
 * (book_now_click). Centralized so every Deal event uses the same
 * survives-navigation delivery: `navigator.sendBeacon` first, falling back
 * to `fetch` with `keepalive: true` (required because the primary CTA opens
 * the booking URL in the same tick via `target="_blank"`, which would abort
 * a plain fetch before it completes).
 */

export type DealAnalyticsEvent =
  | "deal_page_view"
  | "deal_engaged"
  | "book_now_click"
  | "booking_portal_entered"
  | "booking_self_serve_opened"
  | "booking_contact_captured";

const SESSION_KEY = "lll-deal-analytics-session";

function fallbackUuid(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID?.() ?? fallbackUuid();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID?.() ?? fallbackUuid();
  }
}

/** The visitor's analytics session id — shared with the booking assistant so
 *  rate limiting can key on the same session as the rest of deal analytics. */
export function getDealSessionId(): string {
  return getOrCreateSessionId();
}

export function captureDealAttribution() {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source") ?? "";
  const utmMedium = params.get("utm_medium") ?? "";
  const fbclid = params.get("fbclid");
  const gclid = params.get("gclid");

  const provider =
    fbclid || /facebook|instagram|meta/i.test(utmSource)
      ? "meta"
      : gclid || /google/i.test(utmSource)
        ? "google"
        : undefined;
  const sourceChannel = fbclid ? "meta_paid" : gclid ? "google_paid" : undefined;

  return {
    attribution: {
      sourceChannel,
      provider,
      landingPath: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || undefined,
      utmSource: utmSource || undefined,
      utmMedium: utmMedium || undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      utmContent: params.get("utm_content") ?? undefined,
      utmTerm: params.get("utm_term") ?? undefined,
      sessionId: getOrCreateSessionId(),
    },
    metadata: {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      clickIdProvider: fbclid ? "meta" : gclid ? "google" : "",
    },
  };
}

export function postDealEvent(
  dealId: string,
  eventType: DealAnalyticsEvent,
  extras?: { email?: string; metadata?: Record<string, string> }
) {
  const base = captureDealAttribution();
  const payload = JSON.stringify({
    ...base,
    metadata: { ...base.metadata, ...(extras?.metadata ?? {}) },
    ...(extras?.email ? { email: extras.email } : {}),
    eventType,
  });
  const endpoint = `/api/deals/${encodeURIComponent(dealId)}/track`;

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(endpoint, blob)) return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics must never disturb the deal experience.
  });
}

/**
 * Booking-portal entry beacon — once per browser session per deal, mirroring
 * the deal_engaged one-shot pattern.
 */
export function postBookingPortalEntered(dealId: string) {
  const guardKey = `lll-booking-portal-entered-${dealId}`;
  try {
    if (sessionStorage.getItem(guardKey)) return;
    sessionStorage.setItem(guardKey, new Date().toISOString());
  } catch {
    // Storage unavailable — still record the entry.
  }
  postDealEvent(dealId, "booking_portal_entered");
}

/**
 * The guest chose to book and pay themselves on the Cruise Brothers page rather
 * than run the assisted flow. They never create a draft, so this beacon is the
 * only trace they leave — without it a self-serve booker is indistinguishable
 * from someone who entered the portal and bounced. Anonymous (no contact has
 * been collected at this point) and fired once per session per deal, matching
 * the portal-entry guard. Delivery relies on the sendBeacon/keepalive path
 * above because the link opens a new tab in the same tick.
 */
export function postBookingSelfServeOpened(dealId: string) {
  const guardKey = `lll-booking-self-serve-opened-${dealId}`;
  try {
    if (sessionStorage.getItem(guardKey)) return;
    sessionStorage.setItem(guardKey, new Date().toISOString());
  } catch {
    // Storage unavailable — still record the exit.
  }
  postDealEvent(dealId, "booking_self_serve_opened");
}

/**
 * Partial-lead capture: fired the moment the guest confirms their email in the
 * booking flow — BEFORE the phone-gated server save — so a guest who bails
 * mid-flow still shows up (name + email) in the dashboard's booking leads.
 */
export function postBookingContactCaptured(
  dealId: string,
  contact: { email: string; firstName?: string }
) {
  postDealEvent(dealId, "booking_contact_captured", {
    email: contact.email,
    metadata: contact.firstName ? { guestFirstName: contact.firstName } : undefined,
  });
}
