"use client";

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
  newVersion: number;
  callAttemptId: string;
  signalExpiresAtIso: string;
}

export interface GuestReviewReadyResponse {
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

export async function markReviewReady(
  draftId: string,
  expectedVersion: number
): Promise<ApiResult<GuestReviewReadyResponse>> {
  return callApi<GuestReviewReadyResponse>("/api/booking-assistant/guest/review-ready", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, expectedVersion }),
  });
}

export async function resumeDraft(
  draftId: string
): Promise<ApiResult<{ draft: Record<string, unknown> }>> {
  return callApi<{ draft: Record<string, unknown> }>(
    `/api/booking-assistant/guest/resume/${encodeURIComponent(draftId)}`
  );
}
