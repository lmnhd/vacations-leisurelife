import type { Metadata } from "next";

import { BookingAssistantLab } from "./booking-assistant-lab";

export const metadata: Metadata = {
  title: "Booking Assistant - Interaction Flow Lab",
  robots: { index: false, follow: false },
};

/**
 * Phase 1 Interaction Flow Lab for the Deal Booking Assistant
 * (BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md). Fully mocked - no durable
 * storage, no Odysseus, no LLM, no real PII.
 */
export default function BookingAssistantLabPage() {
  return <BookingAssistantLab />;
}
