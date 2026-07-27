"use client";

/**
 * Fires the `booking_portal_entered` milestone when the guest lands on the
 * booking portal route — once per browser session per deal, same delivery
 * contract as `DealViewBeacon` (best-effort, never disturbs the experience).
 */

import { useEffect } from "react";

import { postBookingPortalEntered } from "@/components/cb/deal-analytics";

export function BookingPortalBeacon({ dealId }: { dealId: string }) {
  useEffect(() => {
    postBookingPortalEntered(dealId);
  }, [dealId]);
  return null;
}
