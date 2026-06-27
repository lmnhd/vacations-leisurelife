/**
 * Shared client-side event poster for public Deal page analytics — used by
 * both `DealViewBeacon` (deal_page_view / deal_engaged) and `DealCtaActions`
 * (book_now_click). Centralized so every Deal event uses the same
 * survives-navigation delivery: `navigator.sendBeacon` first, falling back
 * to `fetch` with `keepalive: true` (required because the primary CTA opens
 * the booking URL in the same tick via `target="_blank"`, which would abort
 * a plain fetch before it completes).
 */

export type DealAnalyticsEvent = "deal_page_view" | "deal_engaged" | "book_now_click";

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

export function postDealEvent(dealId: string, eventType: DealAnalyticsEvent) {
  const payload = JSON.stringify({ ...captureDealAttribution(), eventType });
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
