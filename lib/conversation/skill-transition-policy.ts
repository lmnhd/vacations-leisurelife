/**
 * SkillTransitionPolicy - deterministic approval of skill changes.
 *
 * The model may REQUEST a transition (it is one of the structured outputs it
 * can emit). It can never activate one: only this policy, running on the
 * server against the current mode, authorization, and subject references,
 * decides. On denial the current skill stays active and the assistant offers
 * the permitted alternative.
 */

import type { ConversationLaunchEnvelope, ConversationMode } from "./launch-envelope";
import { SOURCE_TO_INITIAL_SKILL } from "./launch-envelope";
import { getRuntimeSkill } from "./runtime-skills";
import type { ToolAuthorizationLevel } from "./tool-policy";

export interface SkillSelectionInput {
  envelope: ConversationLaunchEnvelope;
  authorization: ToolAuthorizationLevel;
}

export interface SkillSelectionResult {
  skillId: string;
  version: number;
  /** True when a client hint was ignored, for the trace window. */
  hintOverridden: boolean;
  reason: string;
}

/**
 * The source route selects the initial skill deterministically. A client's
 * `requestedSkillId` is honored only when it is registered, legal for the
 * mode, and its required subject reference is present.
 */
export function selectInitialSkill(input: SkillSelectionInput): SkillSelectionResult {
  const routeSkillId = SOURCE_TO_INITIAL_SKILL[input.envelope.source];
  const routeSkill = getRuntimeSkill(routeSkillId);

  const hint = input.envelope.requestedSkillId;
  if (hint && hint !== routeSkillId) {
    const hinted = getRuntimeSkill(hint);
    const legal =
      hinted !== null &&
      hinted.allowedModes.includes(input.envelope.mode) &&
      hasRequiredSubject(hinted.requiredSubject, input.envelope);
    if (legal && hinted) {
      return {
        skillId: hinted.skillId,
        version: hinted.version,
        hintOverridden: false,
        reason: "client_hint_accepted",
      };
    }
    return {
      skillId: routeSkillId,
      version: routeSkill ? routeSkill.version : 1,
      hintOverridden: true,
      reason: "client_hint_rejected_route_default_used",
    };
  }

  return {
    skillId: routeSkillId,
    version: routeSkill ? routeSkill.version : 1,
    hintOverridden: false,
    reason: "route_default",
  };
}

export interface TransitionRequest {
  currentSkillId: string;
  requestedSkillId: string;
  mode: ConversationMode;
  authorization: ToolAuthorizationLevel;
  envelope: ConversationLaunchEnvelope;
}

export type TransitionDecision =
  | { approved: true; skillId: string; version: number }
  | { approved: false; reason: string; keepSkillId: string };

export function evaluateSkillTransition(request: TransitionRequest): TransitionDecision {
  const current = getRuntimeSkill(request.currentSkillId);
  if (!current) {
    return {
      approved: false,
      reason: "current_skill_unknown",
      keepSkillId: request.currentSkillId,
    };
  }

  if (request.requestedSkillId === request.currentSkillId) {
    return { approved: false, reason: "already_active", keepSkillId: current.skillId };
  }

  const target = getRuntimeSkill(request.requestedSkillId);
  if (!target) {
    return { approved: false, reason: "unknown_skill", keepSkillId: current.skillId };
  }

  if (!current.allowedTransitions.includes(target.skillId)) {
    return { approved: false, reason: "transition_not_allowed", keepSkillId: current.skillId };
  }

  if (!target.allowedModes.includes(request.mode)) {
    return { approved: false, reason: "mode_not_allowed", keepSkillId: current.skillId };
  }

  if (!hasRequiredSubject(target.requiredSubject, request.envelope)) {
    return { approved: false, reason: "missing_required_subject", keepSkillId: current.skillId };
  }

  if (
    target.skillId === "deal_booking_completion_v1" &&
    request.authorization !== "authorized_guest"
  ) {
    return { approved: false, reason: "requires_authorized_guest", keepSkillId: current.skillId };
  }

  return { approved: true, skillId: target.skillId, version: target.version };
}

function hasRequiredSubject(
  requiredSubject: "none" | "dealId" | "campaignSlug",
  envelope: ConversationLaunchEnvelope
): boolean {
  if (requiredSubject === "none") return true;
  if (requiredSubject === "dealId") return Boolean(envelope.subjectRefs.dealId);
  return Boolean(envelope.subjectRefs.campaignSlug);
}
