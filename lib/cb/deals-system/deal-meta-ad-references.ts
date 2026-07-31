/**
 * Reference-pack resolution for Deal Meta Ad Synthesis (Step 8).
 *
 * Decides WHICH reference images a given generation sends, in WHAT order, and
 * what the prompt says about them. Kept separate from the generator so the
 * ordering rules are unit-testable without touching the image API.
 */

import {
  DEAL_META_REFERENCE_ROLE_INTENT,
  type DealMetaAdCard,
  type DealMetaAdGenerationMode,
  type DealMetaAdSynthesis,
  type DealMetaImageReference,
  type DealMetaReferenceRole,
} from "./deal-meta-ad-synthesis-types";

/**
 * Role precedence within a card's own references. Identity and place come
 * before aesthetics so that when the model weighs earlier parts more heavily,
 * the things that must stay *true* outrank the things that are only taste.
 */
const ROLE_ORDER: DealMetaReferenceRole[] = [
  "ship_identity",
  "destination_truth",
  "object",
  "composition",
  "style",
];

function byRoleThenOperatorOrder(
  a: DealMetaImageReference,
  b: DealMetaImageReference
): number {
  const roleDelta = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  if (roleDelta !== 0) return roleDelta;
  return Date.parse(a.addedAtIso || "") - Date.parse(b.addedAtIso || "");
}

/**
 * The ordered reference list for one generation.
 *
 * Order is deterministic and matters — the API treats the leading `image[]`
 * part as the primary image:
 *   1. the card's current image, for `edit_current`
 *   2. card-level references, by role then operator order
 *   3. the campaign ship anchor, unless this card opted out
 *
 * The anchor is placed last and de-duplicated so an explicit card-level
 * ship_identity choice wins over the campaign default.
 */
export function resolveDealMetaAdReferences(
  synthesis: Pick<DealMetaAdSynthesis, "shipIdentityReference">,
  card: Pick<DealMetaAdCard, "references" | "disableShipAnchor" | "imageUrl">,
  mode: DealMetaAdGenerationMode
): DealMetaImageReference[] {
  const resolved: DealMetaImageReference[] = [];

  if (mode === "edit_current" && card.imageUrl) {
    resolved.push({
      id: "active-card-image",
      assetUrl: card.imageUrl,
      role: "composition",
      source: "card_history",
      addedAtIso: new Date(0).toISOString(),
      title: "Active card image",
    });
  }

  const cardReferences = [...(card.references ?? [])].sort(byRoleThenOperatorOrder);
  resolved.push(...cardReferences);

  const anchor = synthesis.shipIdentityReference;
  if (anchor && !card.disableShipAnchor) {
    const alreadyPresent = resolved.some(
      (reference) =>
        reference.assetUrl === anchor.assetUrl ||
        (reference.role === "ship_identity" && reference.id === anchor.id)
    );
    if (!alreadyPresent) resolved.push(anchor);
  }

  // De-dupe by URL — the same image attached twice costs real money per part
  // and gives the model no additional signal.
  const seen = new Set<string>();
  return resolved.filter((reference) => {
    if (seen.has(reference.assetUrl)) return false;
    seen.add(reference.assetUrl);
    return true;
  });
}

/**
 * The prompt block describing what the attached references are FOR.
 *
 * States plainly that references are visual guidance and not extra factual
 * claims — the model must not read a reference as license to assert an
 * amenity, itinerary, or inclusion that the card copy doesn't support.
 */
export function buildReferenceManifest(
  references: DealMetaImageReference[],
  mode: DealMetaAdGenerationMode
): string | undefined {
  if (references.length === 0) return undefined;

  const lines = references.map((reference) => {
    const intent = DEAL_META_REFERENCE_ROLE_INTENT[reference.role];
    return `- ${intent}`;
  });

  const header =
    mode === "edit_current"
      ? "Reference assets (the first image is the current card image being edited). They are visual guidance, not additional factual claims."
      : "Reference assets are visual guidance, not additional factual claims.";

  const modeLine =
    mode === "edit_current"
      ? "Make a bounded change to the supplied image. Preserve its overall layout and subject unless the direction says otherwise."
      : "Create a fresh composition informed by these references. Do not reproduce any reference exactly.";

  // Duplicate role lines add nothing once the role is stated.
  const uniqueLines = Array.from(new Set(lines));

  return `${header}\n\n${uniqueLines.join("\n")}\n\n${modeLine}`;
}

/** Stable id for a newly attached reference. */
export function newReferenceId(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
