/**
 * Server-controlled Realtime model + voice resolution.
 *
 * Model ids never appear in UI hooks or route handlers: they are resolved
 * here from the LLM gateway registry by task, honoring the AI_POLICY mandate
 * that raw provider ids live only in the gateway.
 */

import { getModelConfig, modelForTask, ModelName } from "@/lib/ai/llm-gateway/models";

export type SessionProfile = "quality" | "fast";

export interface ResolvedRealtimeModel {
  profile: SessionProfile;
  /** Raw provider model id, resolved from the gateway registry. */
  apiId: string;
  /** Safe label for the "How this works" panel and trace window. */
  label: string;
}

export function resolveRealtimeModel(profile: SessionProfile): ResolvedRealtimeModel {
  const modelName: ModelName = modelForTask(
    profile === "fast" ? "voice_realtime_fast" : "voice_realtime"
  );
  const config = getModelConfig(modelName);
  if (!config.apiId) {
    // A Realtime profile with no provider id is a registry defect, not a
    // runtime condition to paper over with a hardcoded model string.
    throw new Error(`[voice] Realtime model ${modelName} has no apiId in the gateway registry`);
  }
  return {
    profile,
    apiId: config.apiId,
    label: profile === "fast" ? "Realtime (fast profile)" : "Realtime (quality profile)",
  };
}

/**
 * The default profile is server policy, not a client choice. Telephone
 * defaults to the fast profile: phone audio is narrowband and latency
 * dominates perceived quality on a call.
 */
export function defaultProfileForChannel(
  channel: "text" | "browser_voice" | "telephone"
): SessionProfile {
  return channel === "telephone" ? "fast" : "quality";
}

/** Approved Realtime voice. One value, used identically by every transport. */
export const REALTIME_VOICE = "marin";
