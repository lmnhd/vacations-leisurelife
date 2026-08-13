/**
 * Session launcher - turns a validated launch envelope into a live
 * conversation plus a transport credential.
 *
 * This is the ONE path that creates a browser Realtime session. It resolves
 * authorization, skill, context snapshot, and tool policy on the server, and
 * mints an ephemeral client secret. A standard OpenAI API key never reaches
 * the browser.
 */

import { getPilotFlowDefinition } from "@/lib/booking-assistant/flow-definition";

import {
  validateLaunchEnvelope,
  type ConversationLaunchEnvelope,
} from "./launch-envelope";
import { selectInitialSkill } from "./skill-transition-policy";
import { buildContextSnapshot } from "./context-providers";
import { assembleAgentConfiguration, type AgentConfiguration } from "./agent-config-assembler";
import { createShowcaseProfile } from "./showcase-fixtures";
import { createConversation, attachTransportSession } from "./conversation-registry";
import { emitTraceEvent } from "./trace-events";
import type { ToolAuthorizationLevel } from "./tool-policy";
import {
  defaultProfileForChannel,
  resolveRealtimeModel,
  REALTIME_VOICE,
} from "./voice-model-policy";

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export interface LaunchResult {
  status: number;
  body: {
    conversationId?: string;
    clientSecret?: string;
    expiresAt?: number;
    modelLabel?: string;
    sessionProfile?: string;
    skillId?: string;
    skillVersion?: number;
    snapshotVersion?: number;
    demoMode?: boolean;
    error?: string;
  };
}

export interface LaunchInput {
  raw: unknown;
  /** Resolved by the route from the guest session cookie, never from the body. */
  authorization: ToolAuthorizationLevel;
  bookingDraftId?: string;
  personId?: string;
  /** Set false in tests to skip the network call to OpenAI. */
  mintClientSecret?: boolean;
}

export async function launchVoiceConversation(input: LaunchInput): Promise<LaunchResult> {
  const validation = validateLaunchEnvelope(input.raw);
  if (!validation.ok) {
    return { status: 400, body: { error: validation.reason } };
  }
  const envelope = validation.envelope;

  if (envelope.channel === "text") {
    return { status: 400, body: { error: "text_channel_uses_chat_route" } };
  }

  // Deal booking mode requires a real authorized guest session for that draft.
  if (envelope.mode === "deal_booking" && input.authorization !== "authorized_guest") {
    return { status: 403, body: { error: "deal_booking_requires_authorized_guest" } };
  }

  const skillSelection = selectInitialSkill({ envelope, authorization: input.authorization });

  const showcaseProfile =
    envelope.mode === "showcase" ? createShowcaseProfile() : undefined;

  const snapshot = await buildContextSnapshot({
    envelope,
    showcaseProfile,
    bookingDraft: null,
  });

  const sessionProfile = envelope.sessionProfile ?? defaultProfileForChannel(envelope.channel);

  const conversation = createConversation({
    envelope,
    authorization: input.authorization,
    skillId: skillSelection.skillId,
    skillVersion: skillSelection.version,
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.version,
    allowedToolIds: [],
    sessionProfile,
    showcaseProfile,
    bookingDraftId: input.bookingDraftId,
    personId: input.personId,
  });

  const config = await assembleAgentConfiguration({
    conversationId: conversation.conversationId,
    channel: envelope.channel,
    mode: envelope.mode,
    authorization: input.authorization,
    skillId: skillSelection.skillId,
    snapshot,
    sessionProfile,
  });

  conversation.allowedToolIds = config.allowedToolIds;

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "transport",
    event: "conversation.created",
    correlationId: conversation.conversationId,
    channel: envelope.channel,
    detail: {
      mode: envelope.mode,
      source: envelope.source,
      sessionProfile,
    },
  });

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "skill",
    event: "skill.selected",
    correlationId: conversation.conversationId,
    channel: envelope.channel,
    skillId: config.skillId,
    skillVersion: config.skillVersion,
    detail: {
      reason: skillSelection.reason,
      hintOverridden: skillSelection.hintOverridden,
    },
  });

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "context",
    event: "context.snapshot_built",
    correlationId: conversation.conversationId,
    channel: envelope.channel,
    skillId: config.skillId,
    skillVersion: config.skillVersion,
    detail: {
      snapshotId: snapshot.snapshotId,
      snapshotVersion: snapshot.version,
      subjectType: snapshot.subjectType,
      snapshotChars: config.diagnostics.snapshotChars,
      includedSections: config.diagnostics.includedSectionKeys.length,
      droppedSections: config.diagnostics.droppedSectionKeys.length,
      provenanceCount: snapshot.provenance.length,
      evidenceGapCount: snapshot.evidenceGaps.length,
    },
  });

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "tools",
    event: "tools.policy_resolved",
    correlationId: conversation.conversationId,
    channel: envelope.channel,
    skillId: config.skillId,
    skillVersion: config.skillVersion,
    detail: {
      allowedCount: config.allowedToolIds.length,
      deniedCount: config.deniedToolIds.length,
    },
  });

  const model = resolveRealtimeModel(sessionProfile);

  if (input.mintClientSecret === false) {
    return {
      status: 200,
      body: {
        conversationId: conversation.conversationId,
        modelLabel: model.label,
        sessionProfile,
        skillId: config.skillId,
        skillVersion: config.skillVersion,
        snapshotVersion: snapshot.version,
        demoMode: envelope.mode === "showcase",
      },
    };
  }

  const secret = await mintEphemeralClientSecret(config, model.apiId);
  if (!secret.ok) {
    emitTraceEvent(conversation.conversationId, {
      severity: "error",
      category: "errors",
      event: "transport.client_secret_failed",
      correlationId: conversation.conversationId,
      channel: envelope.channel,
      detail: { reason: secret.reason },
    });
    return { status: secret.status, body: { error: secret.reason } };
  }

  if (secret.transportSessionId) {
    attachTransportSession(
      conversation.conversationId,
      secret.transportSessionId,
      envelope.channel
    );
  }

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "transport",
    event: "transport.client_secret_issued",
    correlationId: conversation.conversationId,
    channel: envelope.channel,
    detail: { modelLabel: model.label, sessionProfile },
  });

  return {
    status: 200,
    body: {
      conversationId: conversation.conversationId,
      clientSecret: secret.clientSecret,
      expiresAt: secret.expiresAt,
      modelLabel: model.label,
      sessionProfile,
      skillId: config.skillId,
      skillVersion: config.skillVersion,
      snapshotVersion: snapshot.version,
      demoMode: envelope.mode === "showcase",
    },
  };
}

type MintResult =
  | {
      ok: true;
      clientSecret: string;
      expiresAt?: number;
      transportSessionId?: string;
    }
  | { ok: false; status: number; reason: string };

/**
 * Current GA contract: POST /v1/realtime/client_secrets with a nested
 * `session` object. The returned `value` is the short-lived secret the
 * browser uses for the SDP exchange against /v1/realtime/calls.
 */
async function mintEphemeralClientSecret(
  config: AgentConfiguration,
  modelApiId: string
): Promise<MintResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, reason: "openai_api_key_not_configured" };
  }

  const response = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: modelApiId,
        instructions: config.instructions,
        tools: config.tools,
        tool_choice: "auto",
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: {
              type: "semantic_vad",
              interrupt_response: true,
            },
          },
          output: { voice: REALTIME_VOICE },
        },
      },
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 401 ? 500 : response.status,
      reason: `realtime_client_secret_error_${response.status}`,
    };
  }

  const payload = (await response.json()) as {
    value?: string;
    expires_at?: number;
    session?: { id?: string };
  };

  if (!payload.value) {
    return { ok: false, status: 502, reason: "realtime_client_secret_missing_value" };
  }

  return {
    ok: true,
    clientSecret: payload.value,
    expiresAt: payload.expires_at,
    transportSessionId: payload.session?.id,
  };
}

/** Exposed for the booking-assistant integration and tests. */
export function bookingFlowVersionLabel(): string {
  const flow = getPilotFlowDefinition();
  return `${flow.flowId} v${flow.version}`;
}

export type { ConversationLaunchEnvelope };
