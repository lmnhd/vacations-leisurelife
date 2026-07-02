/**
 * Deal Campaign data contracts (Phase 9A / Phase 9B).
 *
 * Stage order:
 *   1. research        → DealAngleResearch       (analyst voice, internal)
 *   2. targeting       → DealTargetingDemographic (analyst voice, internal)
 *   3. pitch           → DealPitchBrief           (customer voice, editorial decision)
 *   4. copy            → DealCopyPackage          (sourced from pitch brief, visitor-safe)
 *   5. ad_structure    → DealAdStructure          (campaign structure)
 *   6. media           → DealMediaPlan            (visual concepts)
 *   7. approval        → DealApprovalState        (homepage gate)
 *
 * The pitch brief (step 3) is the explicit research-to-copy boundary introduced
 * in Phase 9B. Research fields are analyst voice; the pitch brief transforms
 * them into four customer-voice decisions before any public copy is written.
 * DealCopyPackage must be generated from a DealPitchBrief, not directly from
 * DealAngleResearch strings.
 */

/**
 * Provenance for an AI-generated stage. Captured on every gateway-backed
 * generation so the operator can inspect exactly what prompt was sent and what
 * the model returned (Visual Verification foundational principle). Optional so
 * that pre-AI cached records remain valid.
 */
export interface DealAiGenerationTrace {
  /** Resolved provider model id the gateway actually used. */
  model: string;
  /** Full prompt sent to the model (system + user), for operator inspection. */
  promptSent: string;
  /** Raw structured object the model returned, JSON-stringified. */
  rawResponse: string;
  /** Wall-clock latency of the gateway call, in milliseconds. */
  latencyMs: number;
  generatedAtIso: string;
}

/**
 * The editorial decision layer between research and copy (Phase 9B).
 *
 * Research output is analyst voice — what is interesting about this trip and why.
 * The pitch brief transforms that into four customer-voice decisions that copy
 * generation then builds from. Every field except researchRationale must read as
 * something a customer would encounter, not an operator note.
 *
 * researchRationale is INTERNAL ONLY: it records what research drove these
 * decisions and must never appear in any public page field or projection.
 */
export interface DealPitchBrief {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  /** "deterministic_scaffold" | "gpt" — how this draft was produced. */
  generator: "deterministic_scaffold" | "gpt";
  /** One sentence a customer reads. No analyst language. */
  tripSummary: string;
  /** Primary audience stated as a person, not a targeting category. */
  audienceStatement: string;
  /** The single best reason to care. Not a perk list. */
  primaryHook: string;
  /** Why this feels selected for them, not broadcast to everyone. */
  curatedReason: string;
  /** Three short, qualified, public-safe selling facts. Each stands alone. */
  sellingFacts: [string, string, string];
  /**
   * Internal-only rationale: which research insights drove these decisions.
   * NEVER surfaces in any public field, projection, or visitor-facing copy.
   */
  researchRationale: string;
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}

/**
 * Operator-selected campaign hook/state saved on the Deal record.
 *
 * This is the persisted version of the workbench's campaign angle / target
 * audience / visual angle / keyword inputs. It lets the operator lock the
 * campaign promise in DynamoDB and reload it in the UI instead of treating it
 * as ephemeral form state.
 */
export interface DealCampaignStrategy {
  campaignAngle: string;
  targetAudience: string;
  visualAngle: string;
  targetingKeywords: string[];
  savedAtIso: string;
}

/** A single CTA option surfaced publicly on a Deal page. */
export type DealCtaKind = "book_now" | "email_link" | "request_callback";

export interface DealCtaCopy {
  kind: DealCtaKind;
  label: string;
  supportingText: string;
}

export interface DealCopyOfferLine {
  /** Public-safe text, already qualified ("may include", "ask our agent"). */
  text: string;
  /** Promo record this claim was derived from, when applicable. */
  promoRecordId?: string;
  /** True when the line needs a live-pricing/availability qualifier. */
  needsQualifier: boolean;
}

export interface DealCopyPackage {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  /** "deterministic_scaffold" | "gpt" — how this draft was produced. */
  generator: "deterministic_scaffold" | "gpt";
  headlineOptions: string[];
  shortTileCopy: string;
  heroCopy: string;
  whyThisTrip: string[];
  offerLines: DealCopyOfferLine[];
  ctaCopy: DealCtaCopy[];
  /** Phrases flagged as risky for public use; must be resolved before approval. */
  publicCopyRedFlags: string[];
  /** Internal-only notes that must never reach public Deal fields. */
  agentOnlyNotes: string[];
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}

export interface DealAdChannelPlan {
  channel: "meta" | "google" | "tiktok" | "email";
  primaryAngle: string;
  hooks: string[];
  proofPoints: string[];
  notes: string[];
}

export interface DealAdStructure {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  generator: "deterministic_scaffold" | "gpt";
  campaignThesis: string;
  channels: DealAdChannelPlan[];
  nicheKeywords: string[];
  trendKeywords: string[];
  negativeKeywords: string[];
  creativeHypotheses: string[];
  offerProofPoints: string[];
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}

export interface DealMediaImageSlot {
  slot: string;
  purpose: string;
  visualConceptPrompt: string;
  requiredSourceAssets: string[];
}

export interface DealMediaVideoConcept {
  concept: string;
  hook: string;
  shots: string[];
}

export type DealMediaReadiness =
  | "not_started"
  | "concepts_ready"
  | "assets_in_progress"
  | "ready"
  | "waived_text_only";

export interface DealMediaPlan {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  generator: "deterministic_scaffold" | "gpt";
  visualDirection: string[];
  imageSlots: DealMediaImageSlot[];
  shortVideoConcepts: DealMediaVideoConcept[];
  requiredSourceAssets: string[];
  readiness: DealMediaReadiness;
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}

export type DealApprovalStatus = "draft" | "needs_review" | "approved" | "rejected";

/** One automated readiness gate evaluated during assembly/approval. */
export interface DealApprovalGate {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  /** When true, a failing gate blocks approval (vs. an advisory warning). */
  blocking: boolean;
}

export interface DealApprovalState {
  dealId: string;
  status: DealApprovalStatus;
  updatedAtIso: string;
  /** Who/what last changed the status. Operator runs set "operator". */
  decidedBy: "operator" | "system";
  /** Operator-supplied note on the decision. */
  decisionNote?: string;
  /** True when the operator approves a launch with no media/creative yet. */
  textOnlyLaunchWaived: boolean;
  gates: DealApprovalGate[];
}
