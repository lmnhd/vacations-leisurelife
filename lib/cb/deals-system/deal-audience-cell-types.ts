/**
 * Deal Audience Precision Cells (Step 9 targeting contracts).
 *
 * A "cell" is one creative audience hypothesis for a deal. Resolution checks
 * whether the persona has usable Meta signals, but live delivery consolidates
 * verified intent signals into one prospecting ad set to avoid fragmented
 * learning and multiplied ad-set budgets. A cell can still inspect layers:
 *
 *   identity layer (who they are)  AND  intent layer (travel purchase intent)
 *
 * Each layer is a separate diagnostic flexible_spec entry. Detailed-interest
 * exclusions are not sent to Meta; employee and customer suppression require
 * Custom Audiences. Age bands and precision remain creative/planning hints.
 */

export type DealAudienceCellPrecision = "strict" | "assisted";

/** One AI- (or fallback-) authored audience hypothesis before Meta resolution. */
export interface DealAudienceCellBlueprint {
  /** Stable slug derived from the label, e.g. "empty-nest-food-travelers". */
  cellId: string;
  label: string;
  /** Who this person is, in operator-facing language. */
  description: string;
  /** Why this cell should convert for this specific sailing. */
  rationale: string;
  /** Lifestyle/affinity interest queries describing who they are (non-travel). */
  identityInterests: string[];
  /** Travel/cruise purchase-intent interest queries. */
  intentInterests: string[];
  /** Legacy wrong-fit ideas. Never sent as detailed-interest exclusions. */
  exclusionInterests: string[];
  /** Meta behavior taxonomy hints, e.g. "Frequent travelers". */
  behaviorHints: string[];
  ageMin?: number;
  ageMax?: number;
  /**
   * "strict": Advantage+ audience expansion OFF, explicit age band honored.
   * "assisted": expansion ON (Meta may broaden delivery beyond the layers).
   */
  precision: DealAudienceCellPrecision;
}

export type DealAudienceCellLayerRole = "identity" | "intent" | "behavior";

export interface DealAudienceCellResolvedEntry {
  id: string;
  name: string;
  type: "interests" | "behaviors";
  sourceQuery: string;
}

/** One resolved AND layer of a cell's flexible_spec stack. */
export interface DealAudienceCellResolvedLayer {
  role: DealAudienceCellLayerRole;
  queries: string[];
  entries: DealAudienceCellResolvedEntry[];
  unresolvedQueries: string[];
}

export type DealAudienceCellReachVerdict =
  | "ok"
  | "too_narrow"
  | "too_broad"
  | "unknown";

export interface DealAudienceCellReachEstimate {
  estimateReady: boolean;
  usersLowerBound?: number;
  usersUpperBound?: number;
  verdict: DealAudienceCellReachVerdict;
}

/** A cell after Meta resolution: dispatch-ready targeting plus diagnostics. */
export interface DealAudienceCellPlan {
  blueprint: DealAudienceCellBlueprint;
  layers: DealAudienceCellResolvedLayer[];
  /** Legacy compatibility field. Empty because Meta detailed-interest exclusions are unsupported. */
  exclusions: DealAudienceCellResolvedEntry[];
  /** Full Meta ad set targeting spec for this cell. */
  targeting: Record<string, unknown>;
  reach?: DealAudienceCellReachEstimate;
  /** True when AND layers were merged into one OR layer to regain deliverability. */
  relaxed: boolean;
  /** False when the hypothesis resolved no usable layers for planning. */
  dispatchable: boolean;
  warnings: string[];
}

export type DealAudienceMatrixSource = "ai" | "fallback";

/** The full precision matrix for one deal's Step 9 distribution. */
export interface DealAudienceCellMatrix {
  dealId: string;
  generatedAtIso: string;
  source: DealAudienceMatrixSource;
  cells: DealAudienceCellPlan[];
  warnings: string[];
}

/** Legacy per-cell dispatch outcome retained for older distribution records. */
export interface DealAudienceCellDispatch {
  cellId: string;
  label: string;
  metaAdSetId?: string;
  facebookAdId?: string;
  error?: string;
}
