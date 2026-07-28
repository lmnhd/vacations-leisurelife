"use client";

import type { CSSProperties } from "react";

import { postDealEvent } from "./deal-analytics";

const palette = {
  cream: "#F5EFE6",
  navy: "#0F3042",
} as const;

type Tone = "hero" | "light" | "dark" | "mobile";

interface DealCtaActionsProps {
  dealId: string;
  /**
   * Legacy external booking URL. No longer used for routing — "Book now" always
   * goes to the in-house Booking Assistant (/deals/[id]/book). Kept as an
   * optional prop so existing callers compile without change; safe to drop
   * entirely once every caller stops passing it.
   */
  bookingUrl?: string;
  /** Button text. Defaults to the "Start Booking" theme. */
  primaryLabel?: string;
  tone?: Tone;
  align?: "left" | "center";
}

function buttonStyle(tone: Tone): CSSProperties {
  const onDark = tone === "hero" || tone === "dark";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: tone === "mobile" ? 44 : 58,
    borderRadius: 3,
    border: "1px solid transparent",
    background: onDark ? palette.cream : palette.navy,
    color: onDark ? palette.navy : palette.cream,
    fontWeight: 600,
    fontSize: tone === "mobile" ? 13 : 14,
    letterSpacing: tone === "mobile" ? "0.04em" : "0.06em",
    textTransform: "uppercase",
    padding: tone === "mobile" ? "12px 14px" : "17px 24px",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
  };
}

export function DealCtaActions({
  dealId,
  primaryLabel = "Start Booking",
  tone = "light",
  align = "left",
}: DealCtaActionsProps) {
  // "Book now" always routes to the in-house Booking Assistant. This is
  // unconditional on purpose: the old external Cruise Brothers booking links are
  // permanently retired, so there is no env flag or environment in which this
  // should point anywhere else. `primaryLabel` is still honored for the button
  // text; `bookingUrl` is intentionally ignored.
  const primaryHref = `/deals/${dealId}/book`;
  const isMobile = tone === "mobile";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "center" ? "center" : "flex-start",
        width: isMobile ? "100%" : undefined,
      }}
    >
      <a
        href={primaryHref}
        onClick={() => postDealEvent(dealId, "book_now_click")}
        style={{ ...buttonStyle(tone), width: isMobile ? "100%" : undefined }}
      >
        {primaryLabel}
      </a>
    </div>
  );
}
