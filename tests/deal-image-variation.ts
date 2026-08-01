/**
 * Landing-image variation proof (Step 7 Funnel Synthesis).
 *
 * The invariant under test: a variation is only ever ADDED to the candidate
 * pool. It must never overwrite its source, the hero, a gallery entry, or a
 * segment assignment — that is what makes experimental image spend safe.
 *
 * Run:
 *   npm run test:deal-image-variation
 */

import {
  addDealImageVariation,
  buildDealImageVariationPrompt,
  DEAL_IMAGE_VARIATION_ASPECTS,
  DEAL_IMAGE_VARIATION_PRESETS,
  removeDealImageVariation,
  type DealFunnelSynthesis,
  type DealImageCandidate,
} from "../lib/cb/deals-system";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const candidate = (id: string, extra: Partial<DealImageCandidate> = {}): DealImageCandidate => ({
  id,
  imageUrl: `https://cdn.example.com/${id}.jpg`,
  thumbnailUrl: `https://cdn.example.com/${id}-thumb.jpg`,
  provenance: "serpapi_search",
  category: "dining",
  ...extra,
});

const baseSynthesis: DealFunnelSynthesis = {
  id: "funnel-test",
  dealId: "1234567",
  generatedAtIso: "2026-07-31T12:00:00.000Z",
  generator: "gpt",
  sourceAdCopyId: "adcopy-test",
  sailingAngleTitle: "Test angle",
  landingPage: {
    heroHeadline: "H",
    heroSubhead: "S",
    segments: [
      { segment: "dining", heading: "Dining", body: "b", imageId: "img-a" },
      { segment: "cabins", heading: "Cabins", body: "b" },
    ],
    warnings: [],
  },
  carousel: { cards: [{ headline: "h", primaryText: "p" }] },
  candidates: [candidate("img-a"), candidate("img-b"), candidate("img-c")],
  galleryIds: ["img-a", "img-b"],
  heroImageId: "img-a",
};

const variation: DealImageCandidate = candidate("img-var-1", {
  provenance: "operator_supplied",
  isGenerated: true,
  variationOfCandidateId: "img-a",
  variationMode: "edit_current",
  variationDirection: "Add guests",
});

// ── Insertion is purely additive ─────────────────────────────────────────────

const withVariation = addDealImageVariation(baseSynthesis, variation);

check(
  "variation is added to the candidate pool",
  withVariation.candidates.some((c) => c.id === "img-var-1")
);
check(
  "variation is inserted directly after its source",
  withVariation.candidates.findIndex((c) => c.id === "img-var-1") ===
    withVariation.candidates.findIndex((c) => c.id === "img-a") + 1
);
check(
  "the source candidate survives untouched",
  withVariation.candidates.find((c) => c.id === "img-a")?.imageUrl ===
    baseSynthesis.candidates.find((c) => c.id === "img-a")?.imageUrl
);
check(
  "gallery selection is unchanged",
  JSON.stringify(withVariation.galleryIds) === JSON.stringify(baseSynthesis.galleryIds)
);
check("hero assignment is unchanged", withVariation.heroImageId === baseSynthesis.heroImageId);
check(
  "segment image assignment is unchanged",
  withVariation.landingPage.segments[0].imageId === "img-a"
);
check(
  "no candidate is removed",
  withVariation.candidates.length === baseSynthesis.candidates.length + 1
);
check(
  "the original synthesis object is not mutated",
  baseSynthesis.candidates.length === 3
);

// ── Discard refuses while in use ─────────────────────────────────────────────

check(
  "an unused variation can be discarded",
  removeDealImageVariation(withVariation, "img-var-1").candidates.every(
    (c) => c.id !== "img-var-1"
  )
);

function refuses(label: string, synthesis: DealFunnelSynthesis, id: string, needle: string) {
  try {
    removeDealImageVariation(synthesis, id);
    check(label, false, "expected it to throw");
  } catch (error) {
    check(label, error instanceof Error && error.message.includes(needle), String(error));
  }
}

refuses(
  "refuses to discard a variation that is in the gallery",
  { ...withVariation, galleryIds: [...withVariation.galleryIds, "img-var-1"] },
  "img-var-1",
  "gallery"
);
refuses(
  "refuses to discard a variation used as the hero",
  { ...withVariation, heroImageId: "img-var-1" },
  "img-var-1",
  "hero"
);
refuses(
  "refuses to discard a variation used by a segment",
  {
    ...withVariation,
    landingPage: {
      ...withVariation.landingPage,
      segments: [
        { segment: "dining", heading: "Dining", body: "b", imageId: "img-var-1" },
        ...withVariation.landingPage.segments.slice(1),
      ],
    },
  },
  "img-var-1",
  "dining"
);
refuses(
  "refuses to discard a non-generated SERP candidate",
  withVariation,
  "img-b",
  "Only generated variations"
);

// ── Prompt guardrails ────────────────────────────────────────────────────────

const editPrompt = buildDealImageVariationPrompt("Add guests", "edit_current", "dining");
check(
  "edit mode instructs a bounded change",
  editPrompt.includes("bounded change") && editPrompt.includes("Preserve its subject")
);
check(
  "operator direction is marked highest priority",
  editPrompt.includes("HIGHEST PRIORITY") && editPrompt.includes("Add guests")
);
check(
  "prompt forbids invented claims and brand names",
  editPrompt.includes("Do not invent") &&
    editPrompt.includes("brand names") &&
    editPrompt.includes("restaurant names")
);
check(
  "prompt forbids readable text",
  editPrompt.includes("Do not add readable text")
);
check(
  "prompt requires photographic realism",
  editPrompt.includes("real photograph")
);

const freshPrompt = buildDealImageVariationPrompt("Same palette", "new_variation", "dining");
check(
  "fresh-take mode asks for a new composition, not a duplicate",
  freshPrompt.includes("fresh composition") && freshPrompt.includes("Do not reproduce it exactly")
);

// ── Presets ──────────────────────────────────────────────────────────────────

const addGuests = DEAL_IMAGE_VARIATION_PRESETS[0];
check("the first preset is the add-guests case", addGuests.id === "add_guests");
check("add-guests uses edit mode", addGuests.mode === "edit_current");
check(
  "add-guests leads with preservation",
  addGuests.direction.includes("Preserve the existing space exactly")
);
check(
  "add-guests requires plausible support and lighting",
  addGuests.direction.includes("real visible surfaces") &&
    addGuests.direction.includes("same light sources")
);
check(
  "every preset forbids inventing menu items, logos, or text",
  DEAL_IMAGE_VARIATION_PRESETS.every((p) =>
    p.direction.includes("Do not add or change menu items")
  )
);
check(
  "aspect map only exposes gpt-image-2 supported ratios",
  Object.values(DEAL_IMAGE_VARIATION_ASPECTS).every((a) =>
    ["1:1", "16:9", "9:16"].includes(a.apiAspect)
  )
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
