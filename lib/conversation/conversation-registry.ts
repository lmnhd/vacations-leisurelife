/**
 * Conversation registry - one logical conversation across text, browser
 * voice, and telephone.
 *
 * A Realtime/SIP transport session has its own provider-side id; it MAPS to
 * the logical conversationId held here. The registry is the authority for:
 *   - the active skill id/version,
 *   - the active context snapshot id/version,
 *   - the resolved tool allowlist every dispatch is checked against,
 *   - the authorization level and subject binding.
 *
 * Storage note: this is an in-process registry with TTL, matching the demo's
 * session lifetime and cost controls. Durable booking state lives in the
 * Booking Assistant DynamoDB store; nothing here is a second source of truth.
 */

import { randomUUID } from "node:crypto";

import type {
  ConversationChannel,
  ConversationLaunchEnvelope,
  ConversationMode,
} from "./launch-envelope";
import type { ToolAuthorizationLevel } from "./tool-policy";
import type { ShowcaseProfile } from "./showcase-fixtures";

export interface TransportSessionBinding {
  /** Provider-side identifier (Realtime call id or SIP call id). */
  transportSessionId: string;
  channel: ConversationChannel;
  attachedAtIso: string;
}

export interface ConversationRecord {
  conversationId: string;
  createdAtIso: string;
  lastActivityAtIso: string;
  expiresAtMs: number;
  envelope: ConversationLaunchEnvelope;
  mode: ConversationMode;
  authorization: ToolAuthorizationLevel;
  skillId: string;
  skillVersion: number;
  snapshotId: string;
  snapshotVersion: number;
  allowedToolIds: string[];
  sessionProfile: "quality" | "fast";
  transports: TransportSessionBinding[];
  /** Session-scoped synthetic profile for showcase mode. */
  showcaseProfile?: ShowcaseProfile;
  /** Authorized booking draft binding, when in deal_booking mode. */
  bookingDraftId?: string;
  personId?: string;
  /** Rolling counters for cost and abuse controls. */
  toolCallCount: number;
  turnCount: number;
}

const CONVERSATION_TTL_MS = 45 * 60 * 1000;
const records = new Map<string, ConversationRecord>();
const transportIndex = new Map<string, string>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, record] of records.entries()) {
    if (record.expiresAtMs <= now) {
      records.delete(id);
      for (const transport of record.transports) {
        transportIndex.delete(transport.transportSessionId);
      }
    }
  }
}

export interface CreateConversationInput {
  envelope: ConversationLaunchEnvelope;
  authorization: ToolAuthorizationLevel;
  skillId: string;
  skillVersion: number;
  snapshotId: string;
  snapshotVersion: number;
  allowedToolIds: string[];
  sessionProfile: "quality" | "fast";
  showcaseProfile?: ShowcaseProfile;
  bookingDraftId?: string;
  personId?: string;
}

export function createConversation(input: CreateConversationInput): ConversationRecord {
  pruneExpired();
  const nowIso = new Date().toISOString();
  const record: ConversationRecord = {
    conversationId: input.envelope.conversationId ?? `conv_${randomUUID()}`,
    createdAtIso: nowIso,
    lastActivityAtIso: nowIso,
    expiresAtMs: Date.now() + CONVERSATION_TTL_MS,
    envelope: input.envelope,
    mode: input.envelope.mode,
    authorization: input.authorization,
    skillId: input.skillId,
    skillVersion: input.skillVersion,
    snapshotId: input.snapshotId,
    snapshotVersion: input.snapshotVersion,
    allowedToolIds: input.allowedToolIds,
    sessionProfile: input.sessionProfile,
    transports: [],
    showcaseProfile: input.showcaseProfile,
    bookingDraftId: input.bookingDraftId,
    personId: input.personId,
    toolCallCount: 0,
    turnCount: 0,
  };
  records.set(record.conversationId, record);
  return record;
}

export function getConversation(conversationId: string): ConversationRecord | null {
  pruneExpired();
  return records.get(conversationId) ?? null;
}

export function getConversationByTransport(
  transportSessionId: string
): ConversationRecord | null {
  pruneExpired();
  const conversationId = transportIndex.get(transportSessionId);
  if (!conversationId) return null;
  return records.get(conversationId) ?? null;
}

export function attachTransportSession(
  conversationId: string,
  transportSessionId: string,
  channel: ConversationChannel
): boolean {
  const record = records.get(conversationId);
  if (!record) return false;
  if (!record.transports.some((t) => t.transportSessionId === transportSessionId)) {
    record.transports.push({
      transportSessionId,
      channel,
      attachedAtIso: new Date().toISOString(),
    });
    transportIndex.set(transportSessionId, conversationId);
  }
  touch(record);
  return true;
}

export interface ConversationUpdate {
  skillId?: string;
  skillVersion?: number;
  snapshotId?: string;
  snapshotVersion?: number;
  allowedToolIds?: string[];
  showcaseProfile?: ShowcaseProfile;
  bookingDraftId?: string;
  personId?: string;
  authorization?: ToolAuthorizationLevel;
}

export function updateConversation(
  conversationId: string,
  update: ConversationUpdate
): ConversationRecord | null {
  const record = records.get(conversationId);
  if (!record) return null;
  if (update.skillId !== undefined) record.skillId = update.skillId;
  if (update.skillVersion !== undefined) record.skillVersion = update.skillVersion;
  if (update.snapshotId !== undefined) record.snapshotId = update.snapshotId;
  if (update.snapshotVersion !== undefined) record.snapshotVersion = update.snapshotVersion;
  if (update.allowedToolIds !== undefined) record.allowedToolIds = update.allowedToolIds;
  if (update.showcaseProfile !== undefined) record.showcaseProfile = update.showcaseProfile;
  if (update.bookingDraftId !== undefined) record.bookingDraftId = update.bookingDraftId;
  if (update.personId !== undefined) record.personId = update.personId;
  if (update.authorization !== undefined) record.authorization = update.authorization;
  touch(record);
  return record;
}

export function recordToolCall(conversationId: string): number {
  const record = records.get(conversationId);
  if (!record) return 0;
  record.toolCallCount += 1;
  touch(record);
  return record.toolCallCount;
}

export function recordTurn(conversationId: string): number {
  const record = records.get(conversationId);
  if (!record) return 0;
  record.turnCount += 1;
  touch(record);
  return record.turnCount;
}

export function endConversation(conversationId: string): void {
  const record = records.get(conversationId);
  if (!record) return;
  for (const transport of record.transports) {
    transportIndex.delete(transport.transportSessionId);
  }
  records.delete(conversationId);
}

function touch(record: ConversationRecord): void {
  record.lastActivityAtIso = new Date().toISOString();
  record.expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
}
