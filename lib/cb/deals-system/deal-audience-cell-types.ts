/**
 * Deal Audience Precision Cells (Step 9 targeting contracts).
 *
 * A "cell" is one precise, independently dispatchable audience hypothesis for
 * a deal. Instead of flattening every targeting signal into a single OR bucket
 * of Meta interests, a cell intersects layered signals:
 *
 *   identity layer (who they are)  AND  intent layer (travel purchase intent)
 *
 * Each layer is a separate flexible_spec entry, which Meta treats as an AND
 * between OR groups. Cells also carry Meta exclusions (from the deal's
 * exclusion keywords), an optional age band, and a precision mode that
 * controls whether Advantage+ audience expansion is allowed.
 *
 * Live dispatch creates one PAUSED ad set per cell under the same campaign so
 * Meta's own delivery data reveals which audience hypothesis actually
 * converts.
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
  /** Interest queries to exclude (wrong-fit audiences, e.g. budget seekers on a luxury deal). */
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
  exclusions: DealAudienceCellResolvedEntry[];
  /** Full Meta ad set targeting spec for this cell. */
  targeting: Record<string, unknown>;
  reach?: DealAudienceCellReachEstimate;
  /** True when AND layers were merged into one OR layer to regain deliverability. */
  relaxed: boolean;
  /** False when the cell resolved no usable layers and must not be dispatched. */
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

/** Per-cell live dispatch outcome (one paused ad set + ad per cell). */
export interface DealAudienceCellDispatch {
  cellId: string;
  label: string;
  metaAdSetId?: string;
  facebookAdId?: string;
  error?: string;
}
