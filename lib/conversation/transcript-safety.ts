/**
 * Transcript safety for voice channels.
 *
 * Reuses the existing Booking Assistant classifier (deterministic keyword +
 * Luhn checks, no regex per AI_POLICY.md) so voice and text apply exactly the
 * same rule. Payment content is never stored, never echoed, and never sent
 * onward - only a content-free security event survives.
 */

import { redactConversationText } from "@/lib/booking-assistant/redaction";

import { emitTraceEvent } from "./trace-events";
import type { ConversationChannel } from "./launch-envelope";

export type TranscriptDisposition = "accepted" | "suppressed";

export interface TranscriptSafetyResult {
  disposition: TranscriptDisposition;
  /** Safe to display and persist. Empty when suppressed. */
  text: string;
  /** Shown in place of suppressed content. */
  placeholder?: string;
  /** True when the assistant must warn the guest not to speak payment data. */
  requiresPaymentWarning: boolean;
}

export const PAYMENT_WARNING_TEXT =
  "Please don't say card or payment details - I can't take them here. Payment always happens on the cruise line's own secure checkout.";

export function screenTranscript(
  conversationId: string,
  channel: ConversationChannel,
  rawText: string
): TranscriptSafetyResult {
  const result = redactConversationText(rawText);

  if (result.disposition === "discarded") {
    emitTraceEvent(conversationId, {
      severity: "warning",
      category: "safety",
      event: "safety.payment_content_suppressed",
      correlationId: conversationId,
      channel,
      // Content-free: the classification only, never the text or any digits.
      detail: { classification: "payment_content", action: "discarded", tier: "D" },
    });
    return {
      disposition: "suppressed",
      text: "",
      placeholder: "[payment details detected - not recorded]",
      requiresPaymentWarning: true,
    };
  }

  if (result.disposition === "quarantined") {
    emitTraceEvent(conversationId, {
      severity: "warning",
      category: "safety",
      event: "safety.restricted_content_suppressed",
      correlationId: conversationId,
      channel,
      detail: { classification: "restricted_identity", action: "quarantined", tier: "C" },
    });
    return {
      disposition: "suppressed",
      text: "",
      placeholder: "[sensitive traveler detail provided - not recorded]",
      requiresPaymentWarning: false,
    };
  }

  return {
    disposition: "accepted",
    text: result.sanitizedText ?? "",
    requiresPaymentWarning: false,
  };
}
