/**
 * Call admission and correlation policy.
 *
 * Two rules dominate this file:
 *
 *  1. Caller ID never authenticates anybody. A phone number is supporting
 *     evidence at most. Attaching a private booking draft requires an
 *     approved short-lived call-intent correlation the guest created in an
 *     authorized web session.
 *  2. An unrecognized caller is not a failure. They get the anonymous
 *     concierge, which answers public questions and can offer a secure web
 *     continuation, but can never read a draft or trip history.
 */

export type CallAdmission =
  | { decision: "accept"; mode: "anonymous_concierge" | "correlated_resume"; reason: string }
  | { decision: "reject"; statusCode: number; reason: string };

export interface CallIntentRecord {
  /** Short-lived code the guest received in their authorized web session. */
  code: string;
  conversationId: string;
  bookingDraftId: string;
  dealId: string;
  expiresAtMs: number;
  consumed: boolean;
}

export interface AdmissionInput {
  callId: string;
  fromUri: string | null;
  /** Number of calls already active. */
  activeCalls: number;
  maxConcurrentCalls: number;
  /** Result of a spoken/DTMF call-intent code, when the caller supplies one. */
  correlation?: CallIntentRecord | null;
  nowMs: number;
}

/** SIP 486 Busy Here - the correct rejection when we are at capacity. */
const SIP_BUSY = 486;
/** SIP 503 Service Unavailable - configuration or dependency failure. */
const SIP_UNAVAILABLE = 503;

export function admitCall(input: AdmissionInput): CallAdmission {
  if (input.activeCalls >= input.maxConcurrentCalls) {
    return {
      decision: "reject",
      statusCode: SIP_BUSY,
      reason: "at_concurrent_call_capacity",
    };
  }

  // Correlation is evaluated only when the caller actually presents a code.
  // Its ABSENCE is normal and yields the anonymous concierge.
  if (input.correlation) {
    const valid = isCorrelationUsable(input.correlation, input.nowMs);
    if (valid.usable) {
      return {
        decision: "accept",
        mode: "correlated_resume",
        reason: "valid_call_intent_correlation",
      };
    }
    // An expired or consumed code does not end the call: the caller simply
    // continues anonymously and can request a fresh secure continuation.
    return {
      decision: "accept",
      mode: "anonymous_concierge",
      reason: `correlation_rejected:${valid.reason}`,
    };
  }

  return {
    decision: "accept",
    mode: "anonymous_concierge",
    reason: input.fromUri ? "no_correlation_presented" : "no_caller_id",
  };
}

export function isCorrelationUsable(
  record: CallIntentRecord,
  nowMs: number
): { usable: true } | { usable: false; reason: string } {
  if (record.consumed) return { usable: false, reason: "already_consumed" };
  if (record.expiresAtMs <= nowMs) return { usable: false, reason: "expired" };
  return { usable: true };
}

/**
 * Caller ID alone must never bind a draft. This helper exists so the rule is
 * expressed once, is testable, and cannot be quietly bypassed by a future
 * caller-ID lookup shortcut.
 */
export function canBindDraftFromCallerIdAlone(): false {
  return false;
}

export interface BusinessHoursConfig {
  startHour: number;
  endHour: number;
  timeZone: string;
}

/**
 * Business-hours check used to decide whether a human transfer is even
 * offerable. Outside hours the agent still helps; it just does not promise
 * a person.
 */
export function isWithinBusinessHours(
  config: BusinessHoursConfig,
  now: Date = new Date()
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone,
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(formatter.format(now));
  if (!Number.isFinite(hour)) return false;
  return hour >= config.startHour && hour < config.endHour;
}

export type TransferAvailability =
  | { available: true; target: string }
  | { available: false; reason: string };

export function resolveTransferTarget(
  configuredNumber: string | undefined,
  withinBusinessHours: boolean
): TransferAvailability {
  if (!configuredNumber) {
    return { available: false, reason: "no_transfer_destination_configured" };
  }
  if (!withinBusinessHours) {
    return { available: false, reason: "outside_business_hours" };
  }
  return { available: true, target: `tel:${configuredNumber}` };
}

/**
 * Emergency language handling. A caller in distress must be pointed at real
 * emergency services immediately; the agent never tries to handle it.
 */
const EMERGENCY_PHRASES: string[] = [
  "call 911",
  "emergency",
  "heart attack",
  "someone is hurt",
  "i am having chest pain",
  "medical emergency",
  "man overboard",
];

export function detectsEmergencyLanguage(transcript: string): boolean {
  const normalized = transcript.toLowerCase();
  return EMERGENCY_PHRASES.some((phrase) => normalized.includes(phrase));
}

export const EMERGENCY_RESPONSE_TEXT =
  "If this is an emergency, please hang up and dial 911 now, or contact the ship's medical center directly if you are on board. I am not able to help with emergencies.";

export const AI_DISCLOSURE_TEXT =
  "Hi, you have reached Leisure Life Cruises. I am an AI assistant, and this call is not recorded. I can help with cruise questions or get you to a person. How can I help?";
