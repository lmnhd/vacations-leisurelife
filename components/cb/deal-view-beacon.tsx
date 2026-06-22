"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget reach/engagement beacon for a public Deal page — the Deals
 * analog of the campaign landing beacon in `guest-portal.tsx`. Records:
 *   - `deal_page_view`: once per browser session (sessionStorage-guarded)
 *   - `deal_engaged`:    once per browser, persisted forever (localStorage)
 *
 * Attribution (utm/click ids/referrer + a stable per-session id) is captured
 * client-side and POSTed to `/api/deals/[id]/track`. Analytics must never
 * disturb the page, so every storage/network op fails silently.
 */

const SESSION_KEY = "lll-deal-analytics-session";
const VIEW_KEY_PREFIX = "lll-deal-view:";
const ENGAGED_KEY_PREFIX = "lll-deal-engaged:";

type DealAnalyticsEvent = "deal_page_view" | "deal_engaged";

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

function captureAttribution() {
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

function postEvent(dealId: string, eventType: DealAnalyticsEvent) {
  const payload = JSON.stringify({ ...captureAttribution(), eventType });
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

// Raw reach: once per browser session.
function trackView(dealId: string) {
  const key = `${VIEW_KEY_PREFIX}${dealId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // storage blocked — still record once for this mount
  }
  postEvent(dealId, "deal_page_view");
}

// Qualified view: once per browser, persisted forever.
function trackEngaged(dealId: string) {
  const key = `${ENGAGED_KEY_PREFIX}${dealId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // storage blocked — still record once for this mount
  }
  postEvent(dealId, "deal_engaged");
}

export function DealViewBeacon({ dealId }: { dealId: string }) {
  useEffect(() => {
    trackView(dealId);
    trackEngaged(dealId);
  }, [dealId]);

  return null;
}
