/**
 * Tool policy - the intersection of skill, mode, channel, and authorization.
 *
 * This is the only place that decides which tool IDs a conversation may
 * dispatch. The resolved allowlist is persisted with the conversation, and
 * every dispatch is checked against the persisted list - never against a
 * client-supplied tool ID or a list recomputed from client input.
 */

import type { ConversationChannel, ConversationMode } from "./launch-envelope";
import { getRuntimeSkill } from "./runtime-skills";

export type ToolAuthorizationLevel =
  /** Anonymous public visitor (showcase, campaign page, cold telephone call). */
  | "public"
  /** Guest holding a valid booking-assistant session for a specific draft. */
  | "authorized_guest";

export interface ToolPolicyInput {
  skillId: string;
  mode: ConversationMode;
  channel: ConversationChannel;
  authorization: ToolAuthorizationLevel;
}

export interface ToolPolicyDecision {
  allowedToolIds: string[];
  /** Tool IDs the skill could expose but this context denies, with reasons. */
  deniedToolIds: { toolId: string; reason: string }[];
}

/** Tools that mutate or read an authorized guest's real booking state. */
const REQUIRES_AUTHORIZED_GUEST: string[] = [
  "booking_field_propose",
  "booking_progress_read",
];

/** Tools that only make sense on a live telephone call. */
const TELEPHONE_ONLY: string[] = ["transfer_phone_call"];

/**
 * Tools permanently forbidden to guest conversations regardless of skill.
 * Listed explicitly so an accidental registry edit still cannot expose them.
 */
export const NEVER_GUEST_EXPOSED: string[] = [
  "cruise_groups_manager",
  "package_builder",
  "deal_campaign_generation",
  "deal_publication",
  "meta_distribution",
  "google_ads_distribution",
  "operator_approval",
  "odysseus_mutate",
  "cabin_hold",
  "reservation_submit",
  "payment_entry",
];

export function resolveToolPolicy(input: ToolPolicyInput): ToolPolicyDecision {
  const skill = getRuntimeSkill(input.skillId);
  if (!skill) {
    return { allowedToolIds: [], deniedToolIds: [] };
  }

  const allowed: string[] = [];
  const denied: { toolId: string; reason: string }[] = [];

  for (const toolId of skill.maxToolIds) {
    if (NEVER_GUEST_EXPOSED.includes(toolId)) {
      denied.push({ toolId, reason: "never_guest_exposed" });
      continue;
    }

    if (REQUIRES_AUTHORIZED_GUEST.includes(toolId) && input.authorization !== "authorized_guest") {
      denied.push({ toolId, reason: "requires_authorized_guest" });
      continue;
    }

    if (TELEPHONE_ONLY.includes(toolId) && input.channel !== "telephone") {
      denied.push({ toolId, reason: "telephone_channel_only" });
      continue;
    }

    // Showcase-only synthetic tools never appear outside showcase mode, and
    // real-guest modes never see them (they would fabricate trip history).
    if (toolId.startsWith("showcase_") && input.mode !== "showcase") {
      denied.push({ toolId, reason: "showcase_mode_only" });
      continue;
    }

    allowed.push(toolId);
  }

  return { allowedToolIds: allowed, deniedToolIds: denied };
}

/**
 * Authoritative dispatch gate. Callers pass the tool ID the model requested
 * and the allowlist persisted on the conversation.
 */
export function isToolDispatchAllowed(
  toolId: string,
  persistedAllowlist: string[]
): boolean {
  if (NEVER_GUEST_EXPOSED.includes(toolId)) return false;
  return persistedAllowlist.includes(toolId);
}
