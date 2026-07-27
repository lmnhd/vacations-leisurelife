"use client";

import type { CSSProperties } from "react";

import { ExternalLink } from "lucide-react";

import { postDealEvent } from "./deal-analytics";

const palette = {
  cream: "#F5EFE6",
  navy: "#0F3042",
} as const;

type Tone = "hero" | "light" | "dark" | "mobile";

interface DealCtaActionsProps {
  dealId: string;
  bookingUrl: string;
  primaryLabel: string;
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
  bookingUrl,
  primaryLabel,
  tone = "light",
  align = "left",
}: DealCtaActionsProps) {
  const useDevelopmentBookingAssistant = process.env.NODE_ENV === "development";
  const primaryHref = useDevelopmentBookingAssistant
    ? `/deals/${dealId}/book`
    : bookingUrl || "#pricing";
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
        target={!useDevelopmentBookingAssistant && bookingUrl ? "_blank" : undefined}
        rel={!useDevelopmentBookingAssistant && bookingUrl ? "noreferrer" : undefined}
        onClick={() => postDealEvent(dealId, "book_now_click")}
        style={{ ...buttonStyle(tone), width: isMobile ? "100%" : undefined }}
      >
        <ExternalLink size={16} aria-hidden="true" />
        {useDevelopmentBookingAssistant ? "Start booking" : primaryLabel}
      </a>
    </div>
  );
}
