/**
 * OpenAI webhook signature verification and idempotency.
 *
 * OpenAI signs webhooks with the standard webhooks scheme: the signed payload
 * is `${webhook-id}.${webhook-timestamp}.${body}`, HMAC-SHA256 with the
 * secret (base64 after the `whsec_` prefix), compared in constant time.
 *
 * No regex anywhere (AI_POLICY.md): header parsing uses split/startsWith.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookHeaders {
  webhookId?: string;
  webhookTimestamp?: string;
  webhookSignature?: string;
}

export type VerificationResult =
  | { valid: true; webhookId: string }
  | { valid: false; reason: string };

/** Reject timestamps outside this window to blunt replay attempts. */
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

export function verifyWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerificationResult {
  const { webhookId, webhookTimestamp, webhookSignature } = headers;

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { valid: false, reason: "missing_signature_headers" };
  }
  if (!secret) {
    return { valid: false, reason: "webhook_secret_not_configured" };
  }

  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { valid: false, reason: "timestamp_outside_tolerance" };
  }

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");

  const expected = createHmac("sha256", key)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
    .digest("base64");

  // The header may carry several space-separated versioned signatures,
  // each formatted as `v1,<base64>`. Any one valid signature is enough.
  for (const candidate of webhookSignature.split(" ")) {
    const commaIndex = candidate.indexOf(",");
    const value = commaIndex >= 0 ? candidate.slice(commaIndex + 1) : candidate;
    if (constantTimeEquals(value, expected)) {
      return { valid: true, webhookId };
    }
  }

  return { valid: false, reason: "signature_mismatch" };
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Webhook idempotency. OpenAI may retry a delivery; accepting the same call
 * twice would create two agent sessions on one phone call.
 */
export class WebhookDeduplicator {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = 10 * 60 * 1000) {}

  /** Returns true the first time an id is seen, false for any repeat. */
  claim(webhookId: string, nowMs: number = Date.now()): boolean {
    this.prune(nowMs);
    if (this.seen.has(webhookId)) return false;
    this.seen.set(webhookId, nowMs + this.ttlMs);
    return true;
  }

  private prune(nowMs: number): void {
    for (const [id, expiresAt] of this.seen.entries()) {
      if (expiresAt <= nowMs) this.seen.delete(id);
    }
  }
}

export interface IncomingCallEvent {
  webhookId: string;
  callId: string;
  fromUri: string | null;
  toUri: string | null;
}

/**
 * Parses a `realtime.call.incoming` payload. Returns null for any other
 * event type so unrelated webhooks are acknowledged without action.
 */
export function parseIncomingCall(rawBody: string): IncomingCallEvent | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload["type"] !== "realtime.call.incoming") return null;

  const data = payload["data"];
  if (!data || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;

  const callId = typeof dataRecord["call_id"] === "string" ? dataRecord["call_id"] : null;
  if (!callId) return null;

  const headers = Array.isArray(dataRecord["sip_headers"])
    ? (dataRecord["sip_headers"] as unknown[])
    : [];

  return {
    webhookId: typeof payload["id"] === "string" ? payload["id"] : "",
    callId,
    fromUri: findSipHeader(headers, "From"),
    toUri: findSipHeader(headers, "To"),
  };
}

function findSipHeader(headers: unknown[], name: string): string | null {
  for (const header of headers) {
    if (!header || typeof header !== "object") continue;
    const record = header as Record<string, unknown>;
    if (record["name"] === name && typeof record["value"] === "string") {
      return record["value"];
    }
  }
  return null;
}
