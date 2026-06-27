"use client";

import { useEffect } from "react";

import { postDealEvent } from "./deal-analytics";

/**
 * Fire-and-forget reach/engagement beacon for a public Deal page — the Deals
 * analog of the campaign landing beacon in `guest-portal.tsx`. Records:
 *   - `deal_page_view`: once per browser session (sessionStorage-guarded)
 *   - `deal_engaged`:    once per browser, persisted forever (localStorage)
 *
 * Attribution (utm/click ids/referrer + a stable per-session id) is captured
 * client-side and POSTed to `/api/deals/[id]/track` via the shared
 * `postDealEvent` helper (also used by DealCtaActions for book_now_click).
 * Analytics must never disturb the page, so every storage/network op fails
 * silently.
 */

const VIEW_KEY_PREFIX = "lll-deal-view:";
const ENGAGED_KEY_PREFIX = "lll-deal-engaged:";

// Raw reach: once per browser session.
function trackView(dealId: string) {
  const key = `${VIEW_KEY_PREFIX}${dealId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // storage blocked — still record once for this mount
  }
  postDealEvent(dealId, "deal_page_view");
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
  postDealEvent(dealId, "deal_engaged");
}

export function DealViewBeacon({ dealId }: { dealId: string }) {
  useEffect(() => {
    trackView(dealId);
    trackEngaged(dealId);
  }, [dealId]);

  return null;
}
