/**
 * Landing-image variations (Step 7 Funnel Synthesis).
 *
 * Turns an operator-approved candidate into a NEW reviewable candidate using
 * GPT Image 2, reusing the same reference plumbing as the Step 8 Meta cards.
 *
 * The safety property this module exists to guarantee: a variation is only ever
 * ADDED to the candidate pool. It never overwrites its source, the hero, a
 * gallery entry, or a segment assignment. Promotion is a separate, explicit
 * operator gesture, so experimental image spend is always safe to review.
 */

import { generateGptImage2WithReferences } from "@/lib/campaigns/media/generators/gpt-image";
import { fetchUsableReferenceImage } from "@/lib/campaigns/media/generators/reference-image";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

import {
  DEAL_IMAGE_VARIATION_ASPECTS,
  type DealFunnelSynthesis,
  type DealImageCandidate,
  type DealImageVariationAspect,
} from "./deal-page-design-types";

export interface GenerateDealImageVariationInput {
  synthesis: DealFunnelSynthesis;
  sourceCandidateId: string;
  direction: string;
  mode: "edit_current" | "new_variation";
  aspect: DealImageVariationAspect;
}

/**
 * Build the prompt sent to the image model.
 *
 * The factual guardrail is not optional garnish: these images go on a public
 * Deal page beside real supplier facts, so the model must not invent an
 * amenity, venue, or claim that the deal doesn't support.
 */
export function buildDealImageVariationPrompt(
  direction: string,
  mode: "edit_current" | "new_variation",
  category: string
): string {
  const modeLine =
    mode === "edit_current"
      ? "Make a bounded change to the supplied image. Preserve its subject, layout, and setting except where the direction says otherwise."
      : "Create a fresh composition informed by the supplied reference. Do not reproduce it exactly.";

  return [
    `Cruise landing-page image (${category.replace(/_/g, " ")}).`,
    modeLine,
    `Operator direction (HIGHEST PRIORITY):\n${direction.trim()}`,
    "Factual integrity:\nThe source image is visual guidance only. Do not invent or make legible any prices, dates, ports, amenities, promotions, brand names, restaurant names, logos, web addresses, QR codes, or claims. Do not add readable text of any kind.",
    "Realism:\nThe result must read as a real photograph of a real space, not a render or an over-styled composite.",
  ].join("\n\n");
}

/**
 * Generate a variation and return it as a brand-new candidate.
 *
 * Throws on fetch/generation/storage failure so the caller can surface the error
 * without mutating the synthesis — a failed variation must leave curation
 * exactly as it was.
 */
export async function generateDealImageVariation(
  input: GenerateDealImageVariationInput
): Promise<DealImageCandidate> {
  const { synthesis, sourceCandidateId, direction, mode, aspect } = input;

  const source = synthesis.candidates.find((c) => c.id === sourceCandidateId);
  if (!source) {
    throw new Error(`No candidate with id "${sourceCandidateId}" in synthesis "${synthesis.id}".`);
  }
  if (!direction.trim()) {
    throw new Error("A transformation direction is required.");
  }

  // Publisher CDNs routinely block a bare fetch agent; the candidate's
  // thumbnailUrl (Google's cached copy) is the reliable fallback.
  const fetched = await fetchUsableReferenceImage(source.imageUrl, source.thumbnailUrl);

  const promptUsed = buildDealImageVariationPrompt(direction, mode, source.category);
  const buffer = await generateGptImage2WithReferences({
    prompt: promptUsed,
    references: [
      {
        buffer: fetched.buffer,
        mimeType: fetched.mimeType,
        label: source.title ?? source.category,
      },
    ],
    mode,
    aspect: DEAL_IMAGE_VARIATION_ASPECTS[aspect].apiAspect,
  });

  const generatedAtIso = new Date().toISOString();
  const stamp = Date.now();
  const variationId = `img-var-${source.category}-${stamp}`;
  const imageUrl = await storeAsset(
    `deals/${synthesis.dealId}`,
    variationId,
    `funnel-variations/${synthesis.id}/${variationId}.png`,
    buffer,
    "image/png"
  );

  const { width, height } = variationDimensions(aspect);

  return {
    id: variationId,
    imageUrl,
    // Same asset for the thumb: it's already ours and CDN-served, so there is
    // no separate cached copy to point at.
    thumbnailUrl: imageUrl,
    title: source.title ? `Variation of ${source.title}` : "Operator variation",
    width,
    height,
    // The operator deliberately created this, so it enters as operator_supplied.
    // `isGenerated` is what marks it synthetic — see the type comment.
    provenance: "operator_supplied",
    category: source.category,
    variationOfCandidateId: source.id,
    variationMode: mode,
    variationDirection: direction.trim(),
    variationPromptUsed: promptUsed,
    variationGeneratedAtIso: generatedAtIso,
    isGenerated: true,
  };
}

function variationDimensions(aspect: DealImageVariationAspect): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "landscape":
      return { width: 1792, height: 1024 };
    case "portrait":
      return { width: 1024, height: 1792 };
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Insert a variation into the pool immediately after its source, so it appears
 * next to the image it came from rather than at the end of a long grid.
 *
 * Returns a new synthesis; galleryIds, heroImageId, and segment assignments are
 * untouched by construction.
 */
export function addDealImageVariation(
  synthesis: DealFunnelSynthesis,
  variation: DealImageCandidate
): DealFunnelSynthesis {
  const sourceIndex = synthesis.candidates.findIndex(
    (c) => c.id === variation.variationOfCandidateId
  );
  const candidates = [...synthesis.candidates];
  candidates.splice(sourceIndex >= 0 ? sourceIndex + 1 : candidates.length, 0, variation);
  return { ...synthesis, candidates };
}

/**
 * Remove a variation from the pool.
 *
 * Refuses if it is currently in use (gallery, hero, or a segment), so "Discard"
 * can never silently blank a curated landing slot. The operator must un-assign
 * it first — an explicit gesture with visible consequences.
 */
export function removeDealImageVariation(
  synthesis: DealFunnelSynthesis,
  candidateId: string
): DealFunnelSynthesis {
  const target = synthesis.candidates.find((c) => c.id === candidateId);
  if (!target) {
    throw new Error(`No candidate with id "${candidateId}".`);
  }
  if (!target.isGenerated) {
    throw new Error("Only generated variations can be discarded here.");
  }

  const inUse: string[] = [];
  if (synthesis.galleryIds.includes(candidateId)) inUse.push("the gallery");
  if (synthesis.heroImageId === candidateId) inUse.push("the hero slot");
  for (const segment of synthesis.landingPage.segments) {
    if (segment.imageId === candidateId) inUse.push(`the ${segment.segment} section`);
  }
  if (inUse.length > 0) {
    throw new Error(
      `This variation is in use by ${inUse.join(" and ")}. Remove it from there before discarding.`
    );
  }

  return {
    ...synthesis,
    candidates: synthesis.candidates.filter((c) => c.id !== candidateId),
  };
}
