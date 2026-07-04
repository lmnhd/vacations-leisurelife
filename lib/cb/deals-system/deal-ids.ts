/**
 * Canonical ID construction for EVERY deals-system entity.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────
 * The Odysseus packageId (e.g. "1543052") IS the dealId. It is the one stable,
 * guaranteed-unique key for a deal. Every derived entity id leads with it, then
 * appends a bounded human-readable slug for operator legibility:
 *
 *   dealId               1543052                      (= Odysseus packageId, verbatim)
 *   trip manifest        manifest-1543052-{slug}
 *   unified manifest     unified-manifest-1543052-{slug}   (unified- + manifest id)
 *   ad copy              adcopy-1543052-{slug}
 *   funnel synthesis     funnel-1543052-{slug}
 *   meta ad synthesis    = funnel id (1:1 with its funnel)
 *   google ads synthesis = funnel id (1:1 with its funnel)
 *
 * The dealId prefix — never the slug tail — is what makes an id unique. Slugs
 * are sliced to a fixed budget, so two deals with similar titles MUST still
 * differ by their leading dealId.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * Ids used to be built ad-hoc at each step: the discovery pipeline slugged
 * marketing titles (ignoring the real packageId it already had), agent seed
 * scripts hand-typed their own formats, and each downstream step re-slugged
 * its parent's id with an 80-char slice. Long campaign names truncated away
 * the disambiguating tail, and two different deals collapsed onto the same
 * DynamoDB partition key — silently overwriting each other and mixing deals
 * in the operator UI. Centralizing construction here makes that impossible.
 *
 * Agents and generators must NEVER hand-build an entity id. Import from here.
 */

/** Max characters for the human-readable slug tail (not counting the prefix). */
const SLUG_BUDGET = 80;

/** Lowercase, alnum-and-dash slug, sliced to the fixed budget. The ONLY
 * slugify the deals-system id scheme uses. */
export function slugifyIdPart(value: string, maxLen: number = SLUG_BUDGET): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
}

/** Compose `{prefix}-{dealId}` and, when a title yields a non-empty slug,
 * `-{slug}`. The dealId is included verbatim (never sliced). */
function composeId(prefix: string, dealId: string, title: string): string {
  const idPart = dealId.trim();
  if (!idPart) {
    throw new Error(`[deal-ids] Cannot build a "${prefix}-" id without a dealId.`);
  }
  const slug = slugifyIdPart(title);
  return `${prefix}-${idPart}${slug ? `-${slug}` : ""}`;
}

/** Trip manifest id: `manifest-{dealId}-{slug(title)}`. */
export function buildTripManifestId(dealId: string, sailingAngleTitle: string): string {
  return composeId("manifest", dealId, sailingAngleTitle);
}

/** Unified manifest id: `unified-{tripManifestId}`. */
export function buildUnifiedManifestId(tripManifestId: string): string {
  return `unified-${tripManifestId}`;
}

/** Ad copy id: `adcopy-{dealId}-{slug(campaignName)}`. */
export function buildDealAdCopyId(dealId: string, campaignName: string): string {
  return composeId("adcopy", dealId, campaignName);
}

/**
 * Funnel synthesis id: `funnel-{dealId}-{slug(campaignName)}`. This is THE
 * per-deal key that flows into the Meta/Google Ads syntheses (both reuse it
 * 1:1) and the Dynamo partition keys (SYNTHESIS#/METAADSYNTH#).
 */
export function buildFunnelSynthesisId(dealId: string, campaignName: string): string {
  return composeId("funnel", dealId, campaignName);
}

/**
 * Best-effort extraction of the numeric dealId embedded in a legacy id or
 * manifest slug (e.g. "manifest-workbench-...-1543052" → "1543052"). Used by
 * back-compat paths and migrations; new code should carry the dealId
 * explicitly instead of parsing it back out.
 */
export function extractNumericDealId(value: string): string | null {
  return value.match(/(\d{5,})(?:[^0-9]*)$/)?.[1] ?? null;
}
