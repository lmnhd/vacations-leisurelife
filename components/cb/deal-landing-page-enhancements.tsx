"use client";

/**
 * Progressive enhancements for the premium Deal Page (design parity):
 *  - Google fonts (Cormorant Garamond + Source Sans 3) preconnect + stylesheet.
 *  - Section reveal: fade-up 600ms cubic-bezier(0.22,1,0.36,1) on [data-reveal]
 *    blocks below the fold. Visible fallback (no JS / no IntersectionObserver =
 *    everything visible), so SSR content is never hidden.
 *  - Sticky mobile CTA bar (< 820px): from-price (resolved) or "Confirmed at
 *    booking" (draft) + the primary CTA. Rendered client-side so it only appears
 *    on mobile and never duplicates in SSR markup.
 *
 * Kept separate from the server component so the page body stays server-rendered.
 */

import { useEffect, useState } from "react";

export function DealLandingPageEnhancements({
  fromPriceLabel,
  ctaLabel,
  bookingUrl,
}: {
  fromPriceLabel?: string;
  ctaLabel: string;
  bookingUrl: string;
}) {
  const [isMobile, setIsMobile] = useState(false);

  // Inject Google fonts once.
  useEffect(() => {
    const id = "deal-page-fonts";
    if (document.getElementById(id)) return;
    const pre1 = document.createElement("link");
    pre1.rel = "preconnect";
    pre1.href = "https://fonts.googleapis.com";
    const pre2 = document.createElement("link");
    pre2.rel = "preconnect";
    pre2.href = "https://fonts.gstatic.com";
    pre2.crossOrigin = "anonymous";
    const sheet = document.createElement("link");
    sheet.id = id;
    sheet.rel = "stylesheet";
    sheet.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600&display=swap";
    document.head.append(pre1, pre2, sheet);
  }, []);

  // Track the mobile breakpoint for the sticky CTA bar.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Section reveal — below-fold only, safe visible fallback.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window) || els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0px)";
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = "1";
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.85) return; // already in view — never hide
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition =
        "opacity 600ms cubic-bezier(0.22,1,0.36,1), transform 600ms cubic-bezier(0.22,1,0.36,1)";
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  if (!isMobile) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid #E8E1D5",
        padding: "12px 16px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5B6873" }}>
          {fromPriceLabel ? "From" : "Fares"}
        </span>
        <span style={{ fontSize: fromPriceLabel ? 17 : 15, fontWeight: 600, color: "#0F3042" }}>
          {fromPriceLabel ? `${fromPriceLabel} / person` : "Confirmed at booking"}
        </span>
      </div>
      <a
        href={bookingUrl || "#pricing"}
        target={bookingUrl ? "_blank" : undefined}
        rel={bookingUrl ? "noreferrer" : undefined}
        style={{
          display: "inline-block",
          background: "#0F3042",
          color: "#FAF7F2",
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          padding: "14px 22px",
          borderRadius: 3,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {ctaLabel}
      </a>
    </div>
  );
}
