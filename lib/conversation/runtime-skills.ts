/**
 * RuntimeAgentSkill registry - versioned behavior packs for one job each.
 *
 * These are guest-facing application prompt assets (content lives under
 * lib/chat/prompt-data/runtime-skills/). They are NOT the repository
 * automation skills under .github/skills/, which must never be loaded into
 * a guest conversation.
 *
 * The registry is the only place a skill can come from: callers reference
 * skills by stable ID, never by file path.
 */

import type { ConversationChannel, ConversationMode } from "./launch-envelope";

export interface RuntimeAgentSkill {
  /** Stable identifier, e.g. "public_cruise_concierge_v1". */
  skillId: string;
  /** Monotonic content version for this skill id. */
  version: number;
  /** Human label used in the trace window. */
  label: string;
  /** Markdown instruction asset, relative to lib/chat/prompt-data/. */
  instructionRef: string;
  /**
   * Response contract the assembler appends verbatim. Kept short: the
   * deterministic server enforces the real rules; this aligns the model.
   */
  responseContract: string[];
  /** Modes in which this skill may be active. */
  allowedModes: ConversationMode[];
  /** Skill ids this skill may transition to (subject to policy checks). */
  allowedTransitions: string[];
  /** Maximum tool surface. Actual policy intersects with mode + channel + auth. */
  maxToolIds: string[];
  /** Subject reference this skill requires to activate. */
  requiredSubject: "none" | "dealId" | "campaignSlug";
}

const SHARED_TRUTHFULNESS_CONTRACT: string[] = [
  "Never state a price, cabin, availability, save, transfer, or handoff as successful until the corresponding tool has returned a verified successful result.",
  "Always attach the evidence date or freshness label when quoting a price or availability.",
  "If a tool fails or times out, say so plainly and offer the next safe step. Do not invent a substitute answer.",
  "Never ask for or repeat payment details, passport numbers, dates of birth, or other sensitive personal data in this channel.",
];

const REGISTRY: Record<string, RuntimeAgentSkill> = {
  public_cruise_concierge_v1: {
    skillId: "public_cruise_concierge_v1",
    version: 1,
    label: "Cruise Concierge (public showcase)",
    instructionRef: "runtime-skills/public-cruise-concierge-v1.md",
    responseContract: [
      ...SHARED_TRUTHFULNESS_CONTRACT,
      "This is a clearly disclosed demo: preferences, trip history, and booking drafts are synthetic. Say so whenever a visitor could reasonably mistake them for real records.",
      "Any booking or payment step is a simulation and must be described as one.",
    ],
    allowedModes: ["showcase"],
    allowedTransitions: ["human_help_handoff_v1"],
    maxToolIds: [
      "cruise_brothers_knowledge",
      "cruise_brothers_scraper",
      "odysseus_search",
      "pricing_comparator",
      "showcase_preferences_read",
      "showcase_preferences_save",
      "showcase_trip_history",
      "showcase_booking_draft_prepare",
      "showcase_payment_handoff_simulated",
      "request_human_help",
    ],
    requiredSubject: "none",
  },

  deal_booking_completion_v1: {
    skillId: "deal_booking_completion_v1",
    version: 1,
    label: "Deal booking completion",
    instructionRef: "runtime-skills/deal-booking-completion-v1.md",
    responseContract: [
      ...SHARED_TRUTHFULNESS_CONTRACT,
      "You assist with completing the one authorized Deal booking draft in your context snapshot. You never create campaigns, publish anything, or discuss operator tooling.",
      "You may propose Tier A values only (first name, email, phone, guest count, broad ages). Every proposal must be confirmed by the guest in the visual confirmation card before it is saved; on the telephone, by explicit verbal confirmation.",
      "Legal names, dates of birth, addresses, documents, and payment always go through the secure forms or the official supplier surface - never through this conversation.",
    ],
    allowedModes: ["deal_booking"],
    allowedTransitions: ["human_help_handoff_v1"],
    maxToolIds: [
      "cruise_brothers_knowledge",
      "pricing_comparator",
      "booking_field_propose",
      "booking_progress_read",
      "request_human_help",
      "transfer_phone_call",
    ],
    requiredSubject: "dealId",
  },

  campaign_landing_chat_v1: {
    skillId: "campaign_landing_chat_v1",
    version: 1,
    label: "Campaign landing chat",
    instructionRef: "runtime-skills/campaign-landing-chat-v1.md",
    responseContract: [
      ...SHARED_TRUTHFULNESS_CONTRACT,
      "Ground every campaign fact in the context snapshot. If the snapshot lacks an answer, say you are not sure and offer the human-help path.",
      "You never take booking actions from a campaign page; you may explain how the waitlist and booking flow work.",
    ],
    allowedModes: ["campaign_landing"],
    allowedTransitions: ["human_help_handoff_v1"],
    maxToolIds: [
      "cruise_brothers_knowledge",
      "request_human_help",
    ],
    requiredSubject: "campaignSlug",
  },

  active_voyage_support_v1: {
    skillId: "active_voyage_support_v1",
    version: 1,
    label: "Active voyage support",
    instructionRef: "runtime-skills/active-voyage-support-v1.md",
    responseContract: [
      ...SHARED_TRUTHFULNESS_CONTRACT,
      "Read-only itinerary and help scope: you explain, you do not change bookings or reservations.",
    ],
    allowedModes: ["guest_support"],
    allowedTransitions: ["human_help_handoff_v1"],
    maxToolIds: [
      "cruise_brothers_knowledge",
      "request_human_help",
      "transfer_phone_call",
    ],
    requiredSubject: "none",
  },

  human_help_handoff_v1: {
    skillId: "human_help_handoff_v1",
    version: 1,
    label: "Human help handoff",
    instructionRef: "runtime-skills/human-help-handoff-v1.md",
    responseContract: [
      ...SHARED_TRUTHFULNESS_CONTRACT,
      "Your one job is connecting the guest to a person. Only claim a help request or call transfer happened after the tool confirms it. If it fails, say so and offer the fallback.",
    ],
    allowedModes: ["showcase", "deal_booking", "campaign_landing", "guest_support"],
    allowedTransitions: [
      "public_cruise_concierge_v1",
      "deal_booking_completion_v1",
      "campaign_landing_chat_v1",
      "active_voyage_support_v1",
    ],
    maxToolIds: ["request_human_help", "transfer_phone_call"],
    requiredSubject: "none",
  },
};

export function getRuntimeSkill(skillId: string): RuntimeAgentSkill | null {
  const skill = REGISTRY[skillId];
  return skill ?? null;
}

export function listRuntimeSkillIds(): string[] {
  return Object.keys(REGISTRY);
}
