"use client";

import { useEffect } from "react";

export function BookingAssistantViewport({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    const siteFooter = document.querySelector("footer");
    const footerWasHidden = siteFooter instanceof HTMLElement ? siteFooter.hidden : false;
    const footerAriaHidden = siteFooter ? siteFooter.getAttribute("aria-hidden") : null;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    if (siteFooter instanceof HTMLElement) {
      siteFooter.hidden = true;
      siteFooter.setAttribute("aria-hidden", "true");
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      if (siteFooter instanceof HTMLElement) {
        siteFooter.hidden = footerWasHidden;
        if (footerAriaHidden === null) {
          siteFooter.removeAttribute("aria-hidden");
        } else {
          siteFooter.setAttribute("aria-hidden", footerAriaHidden);
        }
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      data-booking-assistant-viewport
      style={{ height: "100dvh", background: "#F5EFE6" }}
    >
      <div className="mx-auto h-full w-full max-w-[480px] overflow-hidden bg-[#F5EFE6]">
        {children}
      </div>
    </div>
  );
}
