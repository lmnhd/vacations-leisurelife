/**
 * Deal Audience Precision Cell generator (Step 9).
 *
 * Turns a deal's targeting research into 2-4 precise, independently
 * dispatchable Meta audience cells:
 *
 *   1. An LLM Gateway "decision" call decomposes the deal's
 *      targetingDemographic + campaign copy into audience hypotheses, each
 *      with an identity layer (who they are), an intent layer (travel
 *      purchase intent), exclusions, behavior hints, and an age band.
 *   2. Each layer resolves to Meta interest/behavior ids separately, then
 *      stacks as its own flexible_spec entry - a true AND intersection,
 *      unlike the legacy single OR bucket.
 *   3. Each cell's full spec is validated against Meta's delivery_estimate
 *      edge. Undeliverably narrow cells get one relaxation pass (AND layers
 *      merged into one OR layer) before being flagged.
 *
 * All Meta-touching dependencies are injected so the module stays pure and
 * offline-testable; the Step 9 distribution generator wires the real
 * implementations.
 */

import { z } from "zod";

import { generateStructuredObject, modelForTask } from "@/lib/ai/llm-gateway";
import {
  explodeInterestSegments,
  normalizeTerm,
} from "@/lib/campaigns/distribution/platforms/meta-ads/interest-resolution-core";
import type { MetaAudienceEstimate } from "@/lib/integrations/meta-ads";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import type {
  DealAudienceCellBlueprint,
  DealAudienceCellMatrix,
  DealAudienceCellPlan,
  DealAudienceCellResolvedEntry,
  DealAudienceCellResolvedLayer,
  DealAudienceCellReachEstimate,
} from "./deal-audience-cell-types";

export const MAX_AUDIENCE_CELLS = 3;
/** Below this estimated monthly-active upper bound a cell is undeliverable. */
export const MIN_CELL_AUDIENCE_USERS = 150_000;
/** Above this estimated lower bound a cell has stopped being "precise". */
export const MAX_CELL_AUDIENCE_USERS = 15_000_000;

const SLUG_ALLOWED_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function slugifyAudienceCellLabel(label: string): string {
  let out = "";
  let pendingDash = false;
  for (const ch of label.toLowerCase()) {
    if (SLUG_ALLOWED_CHARS.includes(ch)) {
      if (pendingDash && out.length > 0) out += "-";
      out += ch;
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return out.length > 0 ? out.slice(0, 48) : "cell";
}

function uniqueTrimmed(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

const MAX_CELL_QUERY_WORDS = 4;
const MAX_CELL_QUERY_CHARS = 36;

/**
 * Reduce free-text targeting phrases to compact, Meta-searchable queries.
 * Workbench-seeded research often stores sentence-length audience prose;
 * feeding that to interest search invites junk fuzzy matches, so anything
 * longer than a short phrase is exploded into compact segments and the rest
 * is dropped.
 */
export function compactCellQueries(raw: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string): void => {
    const normalized = normalizeTerm(value);
    if (!normalized || seen.has(normalized)) return;
    const wordCount = normalized.split(" ").filter(Boolean).length;
    if (wordCount === 0 || wordCount > MAX_CELL_QUERY_WORDS) return;
    if (normalized.length > MAX_CELL_QUERY_CHARS) return;
    seen.add(normalized);
    out.push(normalized);
  };

  for (const value of raw) {
    if (out.length >= max) break;
    const normalized = normalizeTerm(value);
    const wordCount = normalized.split(" ").filter(Boolean).length;
    if (wordCount > 0 && wordCount <= MAX_CELL_QUERY_WORDS && normalized.length <= MAX_CELL_QUERY_CHARS) {
      push(value);
      continue;
    }
    for (const segment of explodeInterestSegments(value)) {
      push(segment);
      if (out.length >= max) break;
    }
  }
  return out.slice(0, max);
}

const AFFINITY_MIN_TOKEN_LENGTH = 4;

function affinityTokens(value: string): string[] {
  return normalizeTerm(value)
    .split(" ")
    .filter((token) => token.length >= AFFINITY_MIN_TOKEN_LENGTH);
}

function squashedForm(value: string): string {
  return normalizeTerm(value).split(" ").join("");
}

/**
 * True when a resolved Meta name plausibly relates to the query that produced
 * it. Meta's fuzzy interest search can map a long phrase to something absurd
 * ("Who Wants to Be a Millionaire?", "Flower"); requiring a shared meaningful
 * token in either direction keeps those out of precision cells.
 */
export function hasQueryNameAffinity(query: string, name: string): boolean {
  const squashedName = squashedForm(name);
  const squashedQuery = squashedForm(query);
  if (!squashedName || !squashedQuery) return false;
  for (const token of affinityTokens(query)) {
    if (squashedName.includes(token)) return true;
  }
  for (const token of affinityTokens(name)) {
    if (squashedQuery.includes(token)) return true;
  }
  return false;
}

function filterEntriesByAffinity(
  entries: DealAudienceCellResolvedEntry[],
  warnings: string[]
): DealAudienceCellResolvedEntry[] {
  const kept: DealAudienceCellResolvedEntry[] = [];
  for (const entry of entries) {
    if (hasQueryNameAffinity(entry.sourceQuery, entry.name)) {
      kept.push(entry);
    } else {
      warnings.push(`Dropped low-affinity Meta match "${entry.name}" for query "${entry.sourceQuery}".`);
    }
  }
  return kept;
}

// ── AI decomposition ───────────────────────────────────────────────────────

const AudienceCellSchema = z.object({
  label: z.string().min(3).max(70).describe("Short operator-facing persona name"),
  description: z.string().min(10).describe("Who this person is, one or two sentences"),
  rationale: z.string().min(10).describe("Why this cell should convert for this exact sailing"),
  identityInterests: z
    .array(z.string())
    .min(2)
    .max(8)
    .describe("NON-travel lifestyle/affinity interests that exist in Meta's interest taxonomy and describe who this person is (e.g. 'Fine dining', 'Golf', 'Wine tasting')"),
  intentInterests: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Travel/cruise purchase-intent interests (e.g. cruise line names, 'Cruise Critic', destination affinities)"),
  exclusionInterests: z
    .array(z.string())
    .max(4)
    .describe("Legacy wrong-fit ideas for operator review. Return an empty array because Meta no longer accepts detailed-interest exclusions."),
  behaviorHints: z
    .array(z.string())
    .max(2)
    .describe("Meta behavior taxonomy names such as 'Frequent travelers' or 'Frequent international travelers'; empty when none apply"),
  // Strict structured-output providers require every property to be listed in
  // "required", so these are nullable instead of optional.
  ageMin: z.number().int().min(18).max(65).nullable().describe("Minimum age for this cell, or null when no age floor applies"),
  ageMax: z.number().int().min(18).max(65).nullable().describe("Maximum age for this cell, or null when no age ceiling applies"),
  precision: z
    .enum(["strict", "assisted"])
    .describe("'strict' = no Advantage+ expansion, honor the intersection exactly; 'assisted' = allow Meta to expand delivery"),
});

const AudienceCellDecompositionSchema = z.object({
  cells: z.array(AudienceCellSchema).min(2).max(4),
});

export interface DealAudienceDecompositionContext {
  dealId: string;
  headline: string;
  campaignAngle?: string;
  targetAudience?: string;
  cruiseLine: string;
  shipName: string;
  destination: string;
  nights?: number;
  primaryAudienceLabel?: string;
  primaryAudienceDescription?: string;
  emotionalDrivers: string[];
  secondaryAudiences: Array<{ label: string; description: string }>;
  lifestyleKeywords: string[];
  interestClusters: string[];
  exclusionKeywords: string[];
  cardCopy: Array<{ headline: string; primaryText: string }>;
}

export function buildDealAudienceDecompositionContext(
  deal: CuratedOdysseusDeal,
  synthesis?: DealMetaAdSynthesis
): DealAudienceDecompositionContext {
  const demographic = deal.targetingDemographic;
  return {
    dealId: deal.id,
    headline: deal.packaging.headline,
    campaignAngle: deal.campaignStrategy?.campaignAngle,
    targetAudience: deal.campaignStrategy?.targetAudience,
    cruiseLine: deal.cruiseFacts.cruiseLine,
    shipName: deal.cruiseFacts.shipName,
    destination: deal.cruiseFacts.itineraryName,
    nights: deal.cruiseFacts.nights,
    primaryAudienceLabel: demographic?.primaryAudience.label,
    primaryAudienceDescription: demographic?.primaryAudience.description,
    emotionalDrivers: demographic?.primaryAudience.emotionalDrivers ?? [],
    secondaryAudiences: (demographic?.secondaryAudiences ?? []).map((audience) => ({
      label: audience.label,
      description: audience.description,
    })),
    lifestyleKeywords: demographic?.nicheKeywords.lifestyle ?? [],
    interestClusters: demographic?.channelTargeting.meta.interestClusters ?? [],
    exclusionKeywords: demographic?.nicheKeywords.exclusionKeywords ?? [],
    cardCopy: (synthesis?.cards ?? []).map((card) => ({
      headline: card.headline,
      primaryText: card.primaryText,
    })),
  };
}

function describeDecompositionContext(context: DealAudienceDecompositionContext): string {
  const lines: string[] = [
    `Deal: ${context.headline}`,
    `Ship: ${context.shipName} (${context.cruiseLine})`,
    `Itinerary: ${context.destination}${context.nights ? `, ${context.nights} nights` : ""}`,
  ];
  if (context.campaignAngle) lines.push(`Campaign angle: ${context.campaignAngle}`);
  if (context.targetAudience) lines.push(`Stated target audience: ${context.targetAudience}`);
  if (context.primaryAudienceLabel) {
    lines.push(`Primary audience research: ${context.primaryAudienceLabel} - ${context.primaryAudienceDescription ?? ""}`);
  }
  for (const secondary of context.secondaryAudiences) {
    lines.push(`Secondary audience: ${secondary.label} - ${secondary.description}`);
  }
  if (context.emotionalDrivers.length > 0) {
    lines.push(`Emotional drivers: ${context.emotionalDrivers.join("; ")}`);
  }
  if (context.lifestyleKeywords.length > 0) {
    lines.push(`Lifestyle keywords: ${context.lifestyleKeywords.join(", ")}`);
  }
  if (context.interestClusters.length > 0) {
    lines.push(`Known Meta interest clusters: ${context.interestClusters.join(", ")}`);
  }
  if (context.exclusionKeywords.length > 0) {
    lines.push(`Exclusion keywords from research: ${context.exclusionKeywords.join(", ")}`);
  }
  for (const card of context.cardCopy) {
    lines.push(`Ad card: "${card.headline}" / ${card.primaryText}`);
  }
  return lines.join("\n");
}

/**
 * Default AI decomposer: one LLM Gateway "decision" call that returns 2-4
 * audience cell blueprints for the deal.
 */
export async function decomposeDealAudienceCellsWithAI(
  context: DealAudienceDecompositionContext
): Promise<DealAudienceCellBlueprint[]> {
  const { object } = await generateStructuredObject({
    // Persona decomposition is multi-step strategic generation, not a
    // short-answer pick, so it routes as "reasoning" rather than "decision"
    // (which resolves to a fast small model that times out on this shape).
    model: modelForTask("reasoning"),
    schema: AudienceCellDecompositionSchema,
    system: [
      "You are a Meta Ads audience-precision strategist for cruise campaigns.",
      "Decompose the campaign's audience research into 2-4 sharply distinct audience cells.",
      "Each cell must describe ONE coherent person, not a blend.",
      "identityInterests must be non-travel lifestyle affinities that plausibly exist in Meta's interest taxonomy - they say WHO the person is.",
      "intentInterests must be travel or cruise purchase-intent signals - the cruise line, competitor lines with similar guests, cruise media, or destination affinities.",
      "The two layers are intersected (AND), so each layer alone should be broad enough to matter and the intersection is what creates precision.",
      "Never put an interest for a cruise line that conflicts with the deal's actual cruise line experience tier.",
      "Always return an empty exclusionInterests array. Meta no longer accepts detailed-interest exclusions; employment and customer suppression require Custom Audiences.",
      "Prefer precision 'assisted' for prospecting so Meta can optimize within the campaign's hard location control. Use 'strict' only for a non-location business constraint that truly forbids expansion.",
      "Order cells from strongest to weakest conversion hypothesis.",
    ].join(" "),
    prompt: describeDecompositionContext(context),
    timeoutMs: 60_000,
  });

  return object.cells.map((cell) => {
    const ageMin = cell.ageMin ?? undefined;
    const rawAgeMax = cell.ageMax ?? undefined;
    const ageMax = rawAgeMax !== undefined && ageMin !== undefined && rawAgeMax < ageMin ? undefined : rawAgeMax;
    return {
      cellId: slugifyAudienceCellLabel(cell.label),
      label: cell.label.trim(),
      description: cell.description.trim(),
      rationale: cell.rationale.trim(),
      identityInterests: uniqueTrimmed(cell.identityInterests, 8),
      intentInterests: uniqueTrimmed(cell.intentInterests, 6),
      exclusionInterests: uniqueTrimmed(cell.exclusionInterests, 4),
      behaviorHints: uniqueTrimmed(cell.behaviorHints, 2),
      ...(ageMin !== undefined ? { ageMin } : {}),
      ...(ageMax !== undefined ? { ageMax } : {}),
      precision: cell.precision,
    };
  });
}

/**
 * Deterministic fallback blueprints built straight from the deal's
 * targetingDemographic when the AI decomposition is unavailable. Keeps the
 * persona-per-ad-set architecture working (in "assisted" mode) even offline.
 */
export function buildFallbackAudienceCellBlueprints(
  deal: CuratedOdysseusDeal
): DealAudienceCellBlueprint[] {
  const demographic = deal.targetingDemographic;
  if (!demographic) return [];

  const interestClusters = uniqueTrimmed(demographic.channelTargeting.meta.interestClusters, 6);
  const exclusions = uniqueTrimmed(demographic.nicheKeywords.exclusionKeywords, 4);
  const blueprints: DealAudienceCellBlueprint[] = [];

  const primaryIdentity = uniqueTrimmed(demographic.nicheKeywords.lifestyle, 6);
  if (primaryIdentity.length > 0 || interestClusters.length > 0) {
    blueprints.push({
      cellId: slugifyAudienceCellLabel(demographic.primaryAudience.label),
      label: demographic.primaryAudience.label,
      description: demographic.primaryAudience.description,
      rationale: demographic.primaryAudience.whyThisCruiseFits || "Primary researched audience for this deal.",
      identityInterests: primaryIdentity,
      intentInterests: interestClusters,
      exclusionInterests: exclusions,
      behaviorHints: [],
      precision: "assisted",
    });
  }

  for (const secondary of demographic.secondaryAudiences.slice(0, 2)) {
    const identity = uniqueTrimmed(secondary.targetingNotes, 6);
    if (identity.length === 0) continue;
    blueprints.push({
      cellId: slugifyAudienceCellLabel(secondary.label),
      label: secondary.label,
      description: secondary.description,
      rationale: secondary.whyThisCruiseFits,
      identityInterests: identity,
      intentInterests: interestClusters,
      exclusionInterests: exclusions,
      behaviorHints: [],
      precision: "assisted",
    });
  }

  return blueprints;
}

// ── Resolution + spec assembly ─────────────────────────────────────────────

export interface DealAudienceCellDependencies {
  /** Blueprint author. Defaults to the AI decomposer at the call site. */
  decompose: (context: DealAudienceDecompositionContext) => Promise<DealAudienceCellBlueprint[]>;
  /** Resolve interest queries to verified Meta interest ids. */
  resolveInterests: (queries: string[]) => Promise<{
    entries: DealAudienceCellResolvedEntry[];
    unresolvedQueries: string[];
    warnings: string[];
  }>;
  /** Resolve one behavior hint to a Meta behavior id, or null. */
  resolveBehavior: (hint: string) => Promise<DealAudienceCellResolvedEntry | null>;
  /** Estimate reachable audience for a full targeting spec, or null when unavailable. */
  estimateReach: (targeting: Record<string, unknown>) => Promise<MetaAudienceEstimate | null>;
  /** Deal-loyalty filter: false when an interest name belongs to a conflicting cruise product. */
  isCompatibleInterest: (name: string) => boolean;
  /** Geo portion of the spec (strict region restriction or country default). */
  geoLocations: Record<string, unknown>;
  nowIso?: string;
  maxCells?: number;
}

function buildCellTargeting(
  blueprint: DealAudienceCellBlueprint,
  layers: DealAudienceCellResolvedLayer[],
  geoLocations: Record<string, unknown>
): Record<string, unknown> {
  const strict = blueprint.precision === "strict";
  const targeting: Record<string, unknown> = {
    geo_locations: geoLocations,
    targeting_automation: strict
      ? { advantage_audience: 0 }
      : { advantage_audience: 1, individual_setting: { age: 1 } },
  };

  if (blueprint.ageMin !== undefined) targeting.age_min = blueprint.ageMin;
  if (blueprint.ageMax !== undefined && strict) targeting.age_max = blueprint.ageMax;

  const flexibleSpec: Array<Record<string, unknown>> = [];
  for (const layer of layers) {
    if (layer.entries.length === 0) continue;
    const interests = layer.entries.filter((entry) => entry.type === "interests");
    const behaviors = layer.entries.filter((entry) => entry.type === "behaviors");
    const spec: Record<string, unknown> = {};
    if (interests.length > 0) spec.interests = interests.map((entry) => ({ id: entry.id, name: entry.name }));
    if (behaviors.length > 0) spec.behaviors = behaviors.map((entry) => ({ id: entry.id, name: entry.name }));
    flexibleSpec.push(spec);
  }
  if (flexibleSpec.length > 0) targeting.flexible_spec = flexibleSpec;

  return targeting;
}

function mergeLayersForRelaxation(layers: DealAudienceCellResolvedLayer[]): DealAudienceCellResolvedLayer[] {
  const entries: DealAudienceCellResolvedEntry[] = [];
  const queries: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const layer of layers) {
    for (const entry of layer.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
    queries.push(...layer.queries);
    unresolved.push(...layer.unresolvedQueries);
  }
  return [{ role: "identity", queries, entries, unresolvedQueries: unresolved }];
}

function reachVerdict(estimate: MetaAudienceEstimate | null): DealAudienceCellReachEstimate | undefined {
  if (!estimate) return undefined;
  if (!estimate.estimateReady) {
    return { estimateReady: false, verdict: "unknown" };
  }
  const upper = estimate.usersUpperBound;
  const lower = estimate.usersLowerBound;
  let verdict: DealAudienceCellReachEstimate["verdict"] = "ok";
  if (upper !== undefined && upper < MIN_CELL_AUDIENCE_USERS) verdict = "too_narrow";
  else if (lower !== undefined && lower > MAX_CELL_AUDIENCE_USERS) verdict = "too_broad";
  return {
    estimateReady: true,
    ...(lower !== undefined ? { usersLowerBound: lower } : {}),
    ...(upper !== undefined ? { usersUpperBound: upper } : {}),
    verdict,
  };
}

async function resolveCellPlan(
  blueprint: DealAudienceCellBlueprint,
  deps: DealAudienceCellDependencies
): Promise<DealAudienceCellPlan> {
  const warnings: string[] = [];

  const compactIdentity = compactCellQueries(blueprint.identityInterests, 8);
  const compactIntent = compactCellQueries(blueprint.intentInterests, 6);
  const droppedByCompaction =
    blueprint.identityInterests.length + blueprint.intentInterests.length - compactIdentity.length - compactIntent.length;
  if (droppedByCompaction > 0) {
    warnings.push(
      `Compacted ${droppedByCompaction} free-text targeting phrase${droppedByCompaction === 1 ? "" : "s"} into Meta-searchable queries.`
    );
  }

  const compatibleIdentity = compactIdentity.filter(deps.isCompatibleInterest);
  const compatibleIntent = compactIntent.filter(deps.isCompatibleInterest);
  const droppedCount =
    compactIdentity.length - compatibleIdentity.length +
    (compactIntent.length - compatibleIntent.length);
  if (droppedCount > 0) {
    warnings.push(`Dropped ${droppedCount} interest quer${droppedCount === 1 ? "y" : "ies"} incompatible with this deal's cruise product.`);
  }

  const [identityResolution, intentResolution] = [
    await deps.resolveInterests(compatibleIdentity),
    await deps.resolveInterests(compatibleIntent),
  ];
  warnings.push(...identityResolution.warnings, ...intentResolution.warnings);

  const layers: DealAudienceCellResolvedLayer[] = [];
  const identityEntries = filterEntriesByAffinity(
    identityResolution.entries.filter((entry) => deps.isCompatibleInterest(entry.name)),
    warnings
  );
  const intentEntries = filterEntriesByAffinity(
    intentResolution.entries.filter((entry) => deps.isCompatibleInterest(entry.name)),
    warnings
  );
  if (identityEntries.length > 0) {
    layers.push({
      role: "identity",
      queries: compatibleIdentity,
      entries: identityEntries,
      unresolvedQueries: identityResolution.unresolvedQueries,
    });
  }
  if (intentEntries.length > 0) {
    layers.push({
      role: "intent",
      queries: compatibleIntent,
      entries: intentEntries,
      unresolvedQueries: intentResolution.unresolvedQueries,
    });
  }

  const behaviorEntries: DealAudienceCellResolvedEntry[] = [];
  for (const hint of blueprint.behaviorHints) {
    try {
      const behavior = await deps.resolveBehavior(hint);
      if (behavior && hasQueryNameAffinity(hint, behavior.name)) {
        behaviorEntries.push(behavior);
      } else if (behavior) {
        warnings.push(`Dropped low-affinity Meta behavior "${behavior.name}" for hint "${hint}".`);
      }
    } catch (error) {
      warnings.push(`Behavior lookup failed for "${hint}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (behaviorEntries.length > 0) {
    layers.push({
      role: "behavior",
      queries: blueprint.behaviorHints,
      entries: behaviorEntries,
      unresolvedQueries: [],
    });
  }

  const exclusions: DealAudienceCellResolvedEntry[] = [];
  if (blueprint.exclusionInterests.length > 0) {
    warnings.push(
      `Ignored ${blueprint.exclusionInterests.length} detailed-interest exclusion idea${blueprint.exclusionInterests.length === 1 ? "" : "s"}. Meta no longer accepts detailed-interest exclusions; use a Custom Audience exclusion for employees, existing customers, or other known people.`
    );
  }

  if (layers.length === 0) {
    return {
      blueprint,
      layers,
      exclusions,
      targeting: buildCellTargeting(blueprint, layers, deps.geoLocations),
      relaxed: false,
      dispatchable: false,
      warnings: [...warnings, "No targeting layer resolved to Meta ids; cell is not dispatchable."],
    };
  }
  if (layers.length === 1) {
    warnings.push("Only one layer resolved; this cell has no AND intersection and behaves like a broad interest bucket.");
  }

  let activeLayers = layers;
  let relaxed = false;
  let targeting = buildCellTargeting(blueprint, activeLayers, deps.geoLocations);
  let reach: DealAudienceCellReachEstimate | undefined;

  try {
    reach = reachVerdict(await deps.estimateReach(targeting));
  } catch (error) {
    warnings.push(`Reach estimate failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (reach?.verdict === "too_narrow" && activeLayers.length > 1) {
    activeLayers = mergeLayersForRelaxation(activeLayers);
    relaxed = true;
    targeting = buildCellTargeting(blueprint, activeLayers, deps.geoLocations);
    warnings.push(
      `Intersection audience was under ${MIN_CELL_AUDIENCE_USERS.toLocaleString("en-US")} users; relaxed AND layers into one OR group.`
    );
    try {
      reach = reachVerdict(await deps.estimateReach(targeting)) ?? reach;
    } catch (error) {
      warnings.push(`Reach re-estimate failed after relaxation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (reach?.verdict === "too_narrow") {
    warnings.push("Cell remains very narrow even after relaxation; expect slow, expensive delivery.");
  }
  if (reach?.verdict === "too_broad") {
    warnings.push("Cell audience is very broad; consider a tighter identity layer or a strict age band.");
  }

  return {
    blueprint,
    layers: activeLayers,
    exclusions,
    targeting,
    ...(reach ? { reach } : {}),
    relaxed,
    dispatchable: true,
    warnings,
  };
}

/**
 * Build the full audience precision matrix for a deal. Best-effort by design:
 * AI decomposition failures fall back to deterministic blueprints derived
 * from the deal's targetingDemographic, and Meta lookup failures degrade to
 * per-cell warnings instead of aborting the plan.
 */
export async function buildDealAudienceCellMatrix(
  deal: CuratedOdysseusDeal,
  synthesis: DealMetaAdSynthesis | undefined,
  deps: DealAudienceCellDependencies
): Promise<DealAudienceCellMatrix> {
  const warnings: string[] = [];
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const maxCells = deps.maxCells ?? MAX_AUDIENCE_CELLS;

  let blueprints: DealAudienceCellBlueprint[] = [];
  let source: DealAudienceCellMatrix["source"] = "ai";
  try {
    blueprints = await deps.decompose(buildDealAudienceDecompositionContext(deal, synthesis));
  } catch (error) {
    warnings.push(
      `AI audience decomposition failed (${error instanceof Error ? error.message : String(error)}); using fallback blueprints from targeting research.`
    );
  }
  if (blueprints.length === 0) {
    source = "fallback";
    blueprints = buildFallbackAudienceCellBlueprints(deal);
  }
  if (blueprints.length === 0) {
    warnings.push("No audience cell blueprints could be built; deal has no usable targeting research.");
    return { dealId: deal.id, generatedAtIso: nowIso, source, cells: [], warnings };
  }

  const seenCellIds = new Set<string>();
  const cells: DealAudienceCellPlan[] = [];
  for (const blueprint of blueprints.slice(0, maxCells)) {
    let cellId = blueprint.cellId;
    let suffix = 2;
    while (seenCellIds.has(cellId)) {
      cellId = `${blueprint.cellId}-${suffix}`;
      suffix += 1;
    }
    seenCellIds.add(cellId);
    cells.push(await resolveCellPlan({ ...blueprint, cellId }, deps));
  }

  if (!cells.some((cell) => cell.dispatchable)) {
    warnings.push("No audience cell is dispatchable; Step 9 will use the legacy combined targeting path.");
  }

  return { dealId: deal.id, generatedAtIso: nowIso, source, cells, warnings };
}
