"use client";

import type { RateQualificationClaim } from "@/lib/booking-assistant/types";

/**
 * Client-side helper for calling the guest booking assistant APIs.
 * Used by the booking flow experience to persist drafts to real DynamoDB
 * instead of sessionStorage only.
 */

export interface GuestSaveRequest {
  draftId: string;
  personId: string;
  dealSnapshot: {
    dealId: string;
    packageId: string;
    siid: string;
    cruiseLine: string;
    ship: string;
    sailingDateIso: string;
    nights: number;
    departurePort: string;
    itineraryLabel: string;
    dealAngle: string;
    priceDisplay: string;
    currency: string;
    taxFeeBasis: string;
    priceCapturedAtIso: string;
    sourceBookingUrl: string;
    linkHealthState: "healthy" | "broken" | "unknown";
  };
  contact: {
    firstName: string;
    email: string;
    phoneE164: string;
    preferredChannel: "email" | "phone" | "sms";
    emailVerified: boolean;
    phoneVerified: boolean;
    transactionalEmailConsent: boolean;
    callbackConsent: boolean;
    smsConsent: boolean;
    marketingConsent: boolean;
  };
  initialStatus: string;
  travelers?: GuestTravelerPayload[];
  cabin?: GuestCabinPayload;
  decisions?: {
    travelInsuranceDecision?: string;
    passengerDataReviewConfirmed?: boolean;
    packetStorageConsent?: boolean;
  };
}

export interface GuestTravelerPayload {
  travelerId: string;
  isPrimary: boolean;
  classification: "adult" | "minor";
  title?: string;
  supplierGender?: string;
  legalFirstName?: string;
  legalMiddleName?: string;
  legalLastName?: string;
  legalSuffix?: string;
  dateOfBirth?: string;
  ageAtSailing?: number;
  nationality?: string;
  residencyCountry?: string;
  residencyStateProvince?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  email?: string;
  phone?: string;
  accessibilityNeeds?: string;
  dietaryNeeds?: string;
  rateQualificationClaims: RateQualificationClaim[];
  fieldStatuses: Record<string, unknown>;
}

export interface GuestCabinPayload {
  cabinId: string;
  assignedTravelerIds: string[];
  categoryPreference?: string;
  cabinPreference?: string;
  accessibilityRequirement?: string;
  qualifyingTravelerIds: string[];
  rateCandidates: never[];
}

export interface GuestSaveResponse {
  draftId: string;
  version: number;
  createdAtIso: string;
  fallbackCallKey: {
    rawKey: string;
    normalizedKey: string;
    keyVersion: number;
  };
}

export interface GuestSignalResponse {
  outcome: "call_signaled" | "no_agents";
  newVersion: number;
  callAttemptId?: string;
  signalExpiresAtIso?: string;
}

export interface GuestSignalCancelResponse {
  newVersion: number;
}

export interface GuestReviewReadyResponse {
  newVersion: number;
}

export interface GuestConfirmFieldResponse {
  newVersion: number;
  revision: number;
  confirmedAtIso: string;
}

export interface GuestContinueLaterResponse {
  newVersion: number;
  programId: string;
  nextReminderAtIso: string;
  resumeExpiresAtIso: string;
  notificationAccepted: boolean;
}

export interface NoAgentsChoiceResponse {
  newVersion: number;
  notificationAccepted: boolean;
}

export interface GuestHelpResponse {
  newVersion: number;
}

type ApiResult<T> = { success: true; result: T } | { success: false; error: string };

async function callApi<T>(url: string, options?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, options);
    const data = await res.json() as ApiResult<T>;
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function saveDraft(req: GuestSaveRequest): Promise<ApiResult<GuestSaveResponse>> {
  return callApi<GuestSaveResponse>("/api/booking-assistant/guest/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function signalCallIntent(
  draftId: string,
  expectedVersion: number
): Promise<ApiResult<GuestSignalResponse>> {
  return callApi<GuestSignalResponse>("/api/booking-assistant/guest/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion }),
  });
}

export async function requestBookingCallback(
  draftId: string,
  expectedVersion: number,
  input: {
    preference: "as_soon_as_available" | "preferred_window";
    windowStartIso?: string;
    windowEndIso?: string;
    timeZone: string;
  }
): Promise<ApiResult<NoAgentsChoiceResponse>> {
  return callApi<NoAgentsChoiceResponse>("/api/booking-assistant/guest/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion, ...input }),
  });
}

export async function requestHumanHelp(
  draftId: string,
  expectedVersion: number,
  taskId?: string
): Promise<ApiResult<GuestHelpResponse>> {
  return callApi<GuestHelpResponse>("/api/booking-assistant/guest/help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion, taskId }),
  });
}

export async function chooseNoAgentsTryLater(
  draftId: string,
  expectedVersion: number
): Promise<ApiResult<NoAgentsChoiceResponse>> {
  return callApi<NoAgentsChoiceResponse>("/api/booking-assistant/guest/no-agents-try-later", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion }),
  });
}

/** Server counterpart of the flow's "Cancel and go back" — see cancelCallIntent
 * in guest-service.ts for why the client-side reset alone isn't sufficient. */
export async function cancelCallIntentSignal(
  draftId: string,
  expectedVersion: number
): Promise<ApiResult<GuestSignalCancelResponse>> {
  return callApi<GuestSignalCancelResponse>("/api/booking-assistant/guest/signal-cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion }),
  });
}

export async function markReviewReady(
  draftId: string,
  expectedVersion: number,
  payload?: {
    travelers?: GuestTravelerPayload[];
    cabin?: GuestCabinPayload;
    decisions?: {
      travelInsuranceDecision?: string;
      passengerDataReviewConfirmed?: boolean;
      packetStorageConsent?: boolean;
    };
  }
): Promise<ApiResult<GuestReviewReadyResponse>> {
  return callApi<GuestReviewReadyResponse>("/api/booking-assistant/guest/review-ready", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion, ...payload }),
  });
}

export async function resumeDraft(
  draftId: string
): Promise<ApiResult<{ draft: Record<string, unknown> }>> {
  return callApi<{ draft: Record<string, unknown> }>(
    `/api/booking-assistant/guest/resume/${encodeURIComponent(draftId)}`
  );
}

export async function resumeCurrentDraft(): Promise<ApiResult<{
  draft: {
    metadata: {
      bookingDraftId: string;
      version: number;
      status: string;
      nextTaskId?: string;
      resumeTaskId?: string;
    };
  };
  fields: Record<string, { value: unknown }>;
  fallbackCallKey: string | null;
}>> {
  return callApi("/api/booking-assistant/guest/current", {
    cache: "no-store",
  });
}

export async function confirmDraftField(
  draftId: string,
  expectedVersion: number,
  fieldId: string,
  value: unknown,
  nextTaskId: string,
  completionPct: number,
  idempotencyKey: string
): Promise<ApiResult<GuestConfirmFieldResponse>> {
  return callApi<GuestConfirmFieldResponse>("/api/booking-assistant/guest/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      expectedVersion,
      fieldId,
      value,
      nextTaskId,
      completionPct,
      idempotencyKey,
    }),
  });
}

export async function continueDraftLater(
  draftId: string,
  expectedVersion: number,
  resumeTaskId: string,
  nextTaskIdValue: string,
  idempotencyKey: string
): Promise<ApiResult<GuestContinueLaterResponse>> {
  return callApi<GuestContinueLaterResponse>("/api/booking-assistant/guest/continue-later", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      expectedVersion,
      resumeTaskId,
      nextTaskId: nextTaskIdValue,
      idempotencyKey,
    }),
  });
}

// ── Ask-a-question assistant ─────────────────────────────────────────────────

/** Approved cruise facts sent so the assistant answers grounded, not invented. */
export interface AssistantDealFacts {
  line?: string;
  ship?: string;
  title?: string;
  nights?: number;
  sailDateLabel?: string;
  departure?: string;
  itinerary?: string;
  priceBasis?: string;
}

interface AssistantSuccess {
  success: true;
  answer: string;
}
interface AssistantFailure {
  success: false;
  error: string;
}

/**
 * Ask the real booking assistant a free-text question about this cruise or how
 * booking works. Returns a grounded answer, or an on-brand error message the
 * caller can show verbatim.
 */
export async function askBookingQuestion(
  dealId: string,
  question: string,
  deal?: AssistantDealFacts
): Promise<AssistantSuccess | AssistantFailure> {
  let sessionId: string | undefined;
  try {
    const { getDealSessionId } = await import("@/components/cb/deal-analytics");
    sessionId = getDealSessionId();
  } catch {
    // Session id is best-effort; the route still rate-limits by IP without it.
  }
  try {
    const res = await fetch(`/api/deals/${encodeURIComponent(dealId)}/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, deal, sessionId }),
    });
    const data = (await res.json()) as AssistantSuccess | AssistantFailure;
    return data;
  } catch {
    return {
      success: false,
      error:
        "I couldn't reach the assistant just now. You can try again, or a booking agent will happily answer when you connect.",
    };
  }
}
