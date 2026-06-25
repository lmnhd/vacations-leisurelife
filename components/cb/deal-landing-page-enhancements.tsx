"use client";

/**
 * Progressive enhancements for the premium Deal Page (design parity):
 *  - Google fonts (Cormorant Garamond + Source Sans 3) preconnect + stylesheet.
 *  - Section reveal: fade-up 600ms cubic-bezier(0.22,1,0.36,1) on [data-reveal]
 *    blocks below the fold. Visible fallback (no JS / no IntersectionObserver =
 *    everything visible), so SSR content is never hidden.
 * Kept separate from the server component so the page body stays server-rendered.
 */

import { useEffect } from "react";

export function DealLandingPageEnhancements({
  dealId,
}: {
  dealId: string;
}) {
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

  // Section reveal — below-fold only, safe visible fallback.
  //
  // Robustness (the body must NEVER stay invisible): SSR renders every block
  // visible. We only hide a block to animate it in, and we guarantee three escape
  // hatches so a block can never get stuck hidden:
  //   1. Measure AFTER a paint (rAF) so layout/scroll is settled. On a Next soft
  //      navigation the effect fires before the new page scrolls to top; measuring
  //      a frame later avoids mis-hiding on-screen blocks (the "blank until refresh"
  //      bug).
  //   2. A hard safety timeout force-reveals everything after 1.2s no matter what
  //      the observer does.
  //   3. The observer reveals on intersection as the user scrolls.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;

    const reveal = (el: HTMLElement) => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0px)";
    };

    // No IntersectionObserver -> leave everything visible (original fallback).
    if (!("IntersectionObserver" in window)) {
      els.forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    let safety: number | undefined;
    // Defer setup until after the first paint so getBoundingClientRect() reflects
    // the settled layout/scroll position of the freshly navigated page.
    const raf = window.requestAnimationFrame(() => {
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        // Already in (or near) view -> never hide it.
        if (r.top < window.innerHeight * 0.85) {
          reveal(el);
          return;
        }
        el.style.opacity = "0";
        el.style.transform = "translateY(20px)";
        el.style.transition =
          "opacity 600ms cubic-bezier(0.22,1,0.36,1), transform 600ms cubic-bezier(0.22,1,0.36,1)";
        io.observe(el);
      });
      // Last-resort: reveal everything still hidden after a short delay, so no
      // block can ever be stranded invisible (e.g. if a scroll event is missed).
      safety = window.setTimeout(() => els.forEach(reveal), 1200);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (safety !== undefined) window.clearTimeout(safety);
      io.disconnect();
    };
    // Re-run per deal: on a soft navigation between deal pages this component can
    // stay mounted while only props change, so keying on dealId ensures the new
    // page's [data-reveal] blocks get wired up (otherwise they'd never reveal).
  }, [dealId]);

  return null;
}
