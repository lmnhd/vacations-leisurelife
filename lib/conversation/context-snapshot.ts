/**
 * ConversationContextSnapshot - the bounded, typed, guest-safe projection a
 * context provider produces from the complete authorized source records.
 *
 * The snapshot is a projection, never a second source of truth: durable
 * business state stays in the Deal and Booking Assistant stores. Every
 * snapshot carries provenance, source versions, freshness, evidence gaps,
 * and an explicit exclusion statement so audits can verify what the model
 * was and was not shown.
 */

import type { ConversationMode } from "./launch-envelope";

export type SnapshotSubjectType =
  | "synthetic_showcase"
  | "deal_booking"
  | "campaign_landing"
  | "guest_support";

export interface SnapshotProvenanceEntry {
  /** e.g. "public_deal_page", "booking_draft", "synthetic_fixture" */
  source: string;
  /** Opaque record identifier; never a secret. */
  recordId?: string;
  /** Source record version when the store tracks one. */
  version?: string;
}

export interface SnapshotFreshnessEntry {
  /** What the freshness statement covers, e.g. "price_basis". */
  subject: string;
  capturedAtIso?: string;
  label: string;
}

/**
 * One renderable fact section. Sections are rendered in order until the
 * size budget is exhausted; lower-priority sections are dropped whole (a
 * deterministic, auditable truncation - never mid-sentence).
 */
export interface SnapshotSection {
  key: string;
  /** 1 = must keep; larger numbers dropped first. */
  priority: number;
  lines: string[];
}

export interface ConversationContextSnapshot {
  snapshotId: string;
  /** Increments every rebuild/refresh within a conversation. */
  version: number;
  mode: ConversationMode;
  subjectType: SnapshotSubjectType;
  builtAtIso: string;
  sections: SnapshotSection[];
  provenance: SnapshotProvenanceEntry[];
  freshness: SnapshotFreshnessEntry[];
  /** Known unknowns the agent must not fill by guessing. */
  evidenceGaps: string[];
  /**
   * Categories deliberately excluded from model context. Stated explicitly
   * so tests and audits can assert the boundary.
   */
  excludedCategories: string[];
  /** Rendered character count (computed by renderSnapshot). */
  renderedChars: number;
}

export const SNAPSHOT_MAX_CHARS = 6000;

export const STANDARD_EXCLUDED_CATEGORIES: string[] = [
  "operator_only_notes",
  "credentials_and_secrets",
  "commission_internals",
  "ad_distribution_controls",
  "tier_b_values",
  "tier_c_values",
  "payment_data",
  "unrelated_guest_records",
  "unrelated_campaign_records",
];

/**
 * Renders the snapshot to the bounded text block embedded in agent
 * instructions. Deterministic: sections sorted by priority then original
 * order, dropped whole when the budget would overflow.
 */
export function renderSnapshot(snapshot: ConversationContextSnapshot): {
  text: string;
  includedSectionKeys: string[];
  droppedSectionKeys: string[];
} {
  const ordered = snapshot.sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) =>
      a.section.priority === b.section.priority
        ? a.index - b.index
        : a.section.priority - b.section.priority
    );

  const included: string[] = [];
  const dropped: string[] = [];
  const blocks: string[] = [];
  let used = 0;

  for (const { section } of ordered) {
    const block = [`[${section.key}]`, ...section.lines].join("\n");
    if (used + block.length + 2 > SNAPSHOT_MAX_CHARS) {
      dropped.push(section.key);
      continue;
    }
    used += block.length + 2;
    included.push(section.key);
    blocks.push(block);
  }

  const gapLines =
    snapshot.evidenceGaps.length > 0
      ? ["[evidence_gaps]", ...snapshot.evidenceGaps.map((gap) => `- ${gap}`)]
      : [];
  const freshnessLines =
    snapshot.freshness.length > 0
      ? [
          "[freshness]",
          ...snapshot.freshness.map(
            (entry) =>
              `- ${entry.subject}: ${entry.label}${entry.capturedAtIso ? ` (captured ${entry.capturedAtIso})` : ""}`
          ),
        ]
      : [];

  const text = [...blocks, freshnessLines.join("\n"), gapLines.join("\n")]
    .filter((block) => block.length > 0)
    .join("\n\n");

  return { text, includedSectionKeys: included, droppedSectionKeys: dropped };
}
