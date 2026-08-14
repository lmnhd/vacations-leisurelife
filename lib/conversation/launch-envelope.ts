/**
 * ConversationLaunchEnvelope - the only doorway into a conversation.
 *
 * Public clients (browser pages, the telephony control service) submit this
 * typed envelope. They may identify WHERE the conversation starts and WHICH
 * subject it concerns via opaque references, plus an optional resume
 * credential. They may never submit prompt text, skill file paths, tool
 * lists, or authoritative campaign/booking facts - the server resolves all
 * of that from its own stores.
 *
 * See .github/DOCS/Implementation/VOICE_ASSISTANT/VOICE_ASSISTANT_CANONICAL_PLAN.md
 */

import { z } from "zod/v3";

export type ConversationChannel = "text" | "browser_voice" | "telephone";
export type ConversationMode =
  | "showcase"
  | "deal_booking"
  | "campaign_landing"
  | "guest_support";
export type ConversationLaunchSource =
  | "voice_assistant"
  | "booking_assistant"
  | "campaign_page"
  | "telephone";

const SubjectRefsSchema = z
  .object({
    dealId: z.string().min(1).max(120).optional(),
    campaignSlug: z.string().min(1).max(160).optional(),
    bookingDraftId: z.string().min(1).max(120).optional(),
  })
  .strict();

/**
 * Strict schema: unknown keys are rejected so a client cannot smuggle
 * `instructions`, `contextBlock`, `tools`, or similar prototype-era fields.
 */
export const ConversationLaunchEnvelopeSchema = z
  .object({
    /** Omitted on first launch; present when resuming a known conversation. */
    conversationId: z.string().min(8).max(80).optional(),
    channel: z.enum(["text", "browser_voice", "telephone"]),
    mode: z.enum(["showcase", "deal_booking", "campaign_landing", "guest_support"]),
    source: z.enum(["voice_assistant", "booking_assistant", "campaign_page", "telephone"]),
    subjectRefs: SubjectRefsSchema.default({}),
    /** Routing hint only. Server policy makes the final skill selection. */
    requestedSkillId: z.string().min(1).max(80).optional(),
    /** Opaque resume credential (booking-assistant session, call-intent code). */
    resumeCredential: z.string().min(1).max(512).optional(),
    /** Server-controlled latency/cost profile hint; validated, never a model id. */
    sessionProfile: z.enum(["quality", "fast"]).optional(),
  })
  .strict();

export type ConversationLaunchEnvelope = z.infer<typeof ConversationLaunchEnvelopeSchema>;

export interface EnvelopeValidationFailure {
  ok: false;
  /** Safe, content-free reason suitable for a 400 response and trace event. */
  reason: string;
}

export interface EnvelopeValidationSuccess {
  ok: true;
  envelope: ConversationLaunchEnvelope;
}

export type EnvelopeValidationResult = EnvelopeValidationFailure | EnvelopeValidationSuccess;

/** Source routes deterministically select the initial skill (plan section 2.1). */
export const SOURCE_TO_INITIAL_SKILL: Record<ConversationLaunchSource, string> = {
  voice_assistant: "public_cruise_concierge_v1",
  booking_assistant: "deal_booking_completion_v1",
  campaign_page: "campaign_landing_chat_v1",
  telephone: "public_cruise_concierge_v1",
};

/** Modes each source may legitimately launch. */
const SOURCE_ALLOWED_MODES: Record<ConversationLaunchSource, ConversationMode[]> = {
  voice_assistant: ["showcase"],
  booking_assistant: ["deal_booking"],
  campaign_page: ["campaign_landing"],
  telephone: ["showcase", "deal_booking", "guest_support"],
};

export function validateLaunchEnvelope(raw: unknown): EnvelopeValidationResult {
  const parsed = ConversationLaunchEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join(".") : "envelope";
    return { ok: false, reason: `invalid_envelope:${where.length > 0 ? where : "shape"}` };
  }

  const envelope = parsed.data;

  if (!SOURCE_ALLOWED_MODES[envelope.source].includes(envelope.mode)) {
    return { ok: false, reason: `mode_not_allowed_for_source:${envelope.source}` };
  }

  if (envelope.mode === "deal_booking" && !envelope.subjectRefs.dealId) {
    return { ok: false, reason: "deal_booking_requires_dealId" };
  }

  if (envelope.mode === "campaign_landing" && !envelope.subjectRefs.campaignSlug) {
    return { ok: false, reason: "campaign_landing_requires_campaignSlug" };
  }

  // A booking draft may only be referenced together with its Deal, and never
  // from the anonymous showcase.
  if (envelope.subjectRefs.bookingDraftId && envelope.mode !== "deal_booking") {
    return { ok: false, reason: "bookingDraftId_requires_deal_booking_mode" };
  }

  return { ok: true, envelope };
}
