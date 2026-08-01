# GPT Image 2 Reference Image Upgrade

**Status:** Revised July 30, 2026 after code review of the shipped Step 8 controls
**Date:** July 30, 2026
**Scope:** Deal Workflow Step 8 - Meta Ad Synthesis (Releases 1-2), Step 7 Funnel
landing imagery (Release 3, deferred but committed)
**Depends on:** `META_AD_CREATIVE_DIRECTION_PLAN.md`

## Decision

Add reference images as an optional, operator-selected input to GPT Image 2
generation. The feature must create better, more specific creative without
turning a selected image into an unreviewed supplier-fact claim or giving the
model arbitrary public URLs.

The system supports two distinct jobs:

1. **Reference a visual direction while generating a new image.** Use a ship,
   destination, gallery, prior-card, or operator-uploaded image to influence a
   new composition.
2. **Edit an existing generated card.** Use the active card image plus an
   instruction to make a bounded change, optionally with a mask later.

Do not describe the first job as pixel editing. GPT Image 2 can produce a new
composition informed by one or more references. It does not promise exact
layout, object, or brand consistency.

## Verified API Facts

Probed directly against `https://api.openai.com/v1/images/edits` with
`model: gpt-image-2` on **2026-07-30**. These supersede any third-party doc
claims, in the same spirit as the dated `quality` enum note in
`media-pipeline-config.ts`.

| Question | Verified answer |
| --- | --- |
| Multiple reference images? | **Yes.** Repeated `image[]` multipart parts. 1 part → 200, 2 parts → 200. |
| Response shape | **`b64_json` only.** No `url` variant observed on the edits path. |
| `input_fidelity` | **Rejected.** `400 invalid_input_fidelity_model`: "The model 'gpt-image-2' does not support the 'input_fidelity' parameter." Never send it. |
| Minimum input size | Small placeholders (4x4 PNG) fail with `400 invalid_image_file`. Send realistic dimensions; normalize before upload. |
| Latency | ~16s at `quality: low`, 1024x1024, for both 1 and 2 reference parts. |

The earlier draft of this plan advised omitting `input_fidelity` because the
model "processes input images at high fidelity." That conclusion was right but
the reason was wrong: the parameter is **unsupported and hard-errors**. Treat it
as forbidden, not optional.

## Current Step 8 Review

The current Meta Ad Synthesis is a strong base for this work:

- The operator can set a campaign-wide style preset without image spend.
- Every card has a persistent positive `imageDirection`; the prompt builder
  gives that direction highest priority over the selected style preset.
- The UI previews the next prompt using an unsaved direction draft and makes
  `Save direction & regenerate` explicit.
- Each card retains prompt provenance and a reversible image history.
- `generate_image` already updates only one card, preserving the rest of the
  carousel during expensive exploration.

The missing capability is input imagery. The current `generateGptImage2`
wrapper calls the text-only `images/generations` endpoint, so even a precise
direction can still yield a generic ship, destination, or lifestyle scene.

## Reuse Before Building

Three pieces of this already exist in the repo. Building parallel copies would
be the main avoidable cost in this work.

| Need | Already exists | Action |
| --- | --- | --- |
| Fetch a remote image safely into a Buffer | `fetchUsableReferenceImage` in `lib/campaigns/media/generators/stability-generator.ts` — multi-URL fallback, content-type validation, timeout, typed `ReferenceFetchError`, skips `r2://pending:` | Extract to a shared module, reuse verbatim |
| Normalize/downscale a reference for an image API | `optimizeReferenceImageForNanoBanana` in the same file — sharp rotate, max-dimension resize, alpha-aware PNG/JPEG | Extract and generalize (drop the Nano-specific name) |
| SSRF-safe fetch of an arbitrary operator URL | `app/api/tests/deals-system/image-proxy/route.ts` — protocol allowlist, private/link-local host rejection incl. 169.254 metadata, byte caps, content-type check | Reuse its host-validation logic for Release 2 URL import |

The Nano-Banana path in `generateNanoBananaImage` also already demonstrates the
whole reference-conditioned generation pattern end to end. Follow its shape.

## Product Model

Use a **Reference Pack** rather than a single ambiguous image field.

### Campaign Ship Anchor

One optional campaign-wide reference that helps every card identify the real
ship. It is a visual identity anchor, not a requirement that every card show a
ship exterior.

Recommended initial sources:

- an operator-designated, reviewed image from the Funnel gallery
- an operator-uploaded supplier or licensed ship image (Release 2)

The selected anchor is supplied to card generation unless a card explicitly
disables it. This prevents unrelated ships from becoming the default visual
subject across a new carousel.

### Per-Card References

Each card can add zero to several references with a clear role:

| Role | Use | Example |
| --- | --- | --- |
| `ship_identity` | Keep ship appearance credible | Silver Muse exterior or interior supplied by the operator |
| `destination_truth` | Ground scenery or a port | Operator-approved image of Cochin waterfront |
| `composition` | Borrow framing, material, or visual rhythm | The approved map/book/compass Card 3 image |
| `style` | Carry palette or art-direction cues | A selected quiet-luxury print treatment |
| `object` | Include a specific visible object | A verified suite detail or dining setting |

The role is passed into the prompt as intent. A reference does not mean every
visual feature in it should be reproduced.

### Reference Modes

| Mode | What it does | Best use |
| --- | --- | --- |
| `new_variation` | Sends the prompt plus selected references and requests a fresh composition | More options like the successful Card 3 still life |
| `edit_current` | Sends the active card image as the primary image and asks for a bounded change | Keep layout, change an object, mood, or crop |
| `masked_edit` | Later enhancement using the current image and an alpha mask | Replace only a text-free image area or a specific object |

Release 1 ships `new_variation` and `edit_current`. Masking waits until the
operator can create or upload a valid alpha mask without friction.

## Approval Is Per-Use, Not Per-Asset

An earlier draft put `approvalState: "approved" | "needs_review"` on the asset
record. That is the wrong shape: approval is a property of *this operator's
decision for this campaign and this role*, not an intrinsic property of the
image. A SERP photo approved as a `composition` reference for Card 3 is not
thereby approved as a `ship_identity` fact.

Since role and approval are both per-use, they collapse: **a reference is either
attached to a card (the operator chose it, with a role) or it is not.** The
confirmation step lives in the attach flow, not in a state machine on the asset.

This removes the `needs_review` lifecycle entirely. What remains is provenance —
where the bytes came from — which is recorded for audit but never gates.

## Data Contract

```ts
type DealMetaReferenceRole =
  | "ship_identity"
  | "destination_truth"
  | "composition"
  | "style"
  | "object";

type DealMetaReferenceSource =
  | "funnel_candidate"
  | "card_history"
  | "operator_upload"   // Release 2
  | "url_import";       // Release 2

interface DealMetaImageReference {
  id: string;
  /** Fetchable image URL. Release 1: owned R2 / funnel candidate only. */
  assetUrl: string;
  thumbnailUrl?: string;
  role: DealMetaReferenceRole;
  source: DealMetaReferenceSource;
  sourceCandidateId?: string;
  sourceCardIndex?: number;
  /** Audit only, never sent to the image API. */
  originalSourceUrl?: string;
  title?: string;
  addedAtIso: string;
  /** Operator's rights assertion for uploads/imports (Release 2). */
  rightsNote?: string;
}

interface DealMetaAdCard {
  // Existing fields...
  references?: DealMetaImageReference[];
  /** Opt this card out of the campaign ship anchor. */
  disableShipAnchor?: boolean;
}

interface DealMetaAdSynthesis {
  // Existing fields...
  shipIdentityReference?: DealMetaImageReference;
}
```

History entries gain generation lineage:

```ts
interface DealMetaAdImageHistoryEntry {
  // Existing fields...
  mode?: "text_only" | "new_variation" | "edit_current";
  referenceIds?: string[];
  referenceAssetUrls?: string[];
  /** For edit_current: the image this one was derived FROM. */
  derivedFromImageUrl?: string;
}
```

`derivedFromImageUrl` matters because `edit_current` stores its result as a new
image and pushes the old one to `previousImages` — structurally identical to a
from-scratch regeneration. Without a parent pointer, after three edits the
operator cannot tell an edit chain from unrelated attempts.

Reference records must remain backward compatible. A legacy synthesis with no
reference fields continues using text-only generation.

## Concurrency

`generate_image` deliberately re-reads the record immediately before merging
(`mergeCardIntoLatest`) so a parallel "Generate all 4" cannot clobber sibling
cards. A campaign-level `shipIdentityReference` reintroduces that same race one
level up: a write to the synthesis root during an in-flight parallel run can be
lost or can overwrite concurrent card results.

Anchor and reference writes must therefore use the same read-latest-then-merge
discipline as card writes, and must never write the whole synthesis object from
a stale snapshot.

## GPT Image 2 Integration

```ts
generateGptImage2WithReferences({
  prompt,
  references,   // ordered buffers + mime types
  mode: "new_variation" | "edit_current",
  aspect: "1:1",
  quality,
})
```

Implementation rules, all confirmed by the probe above:

- POST multipart to `images/edits` with one repeated `image[]` part per reference.
- **Never send `input_fidelity`** — gpt-image-2 hard-errors on it.
- Decode `b64_json` from the response; the edits path returns no `url`.
- Normalize every reference through the shared sharp helper before upload —
  undersized or exotic inputs fail as `invalid_image_file`.
- Keep the existing `images/generations` helper for text-only requests.
- Preserve existing aspect/quality config, `storeAsset` path, and history behavior.

Deterministic reference order:

1. current card image for `edit_current`, when present
2. card-level references, ordered by role then operator order
3. campaign ship anchor, unless the card disabled it

The persisted prompt carries a short reference manifest:

```text
Reference assets are visual guidance, not additional factual claims.

- ship identity anchor: keep ship-specific architecture credible when visible
- composition reference: borrow visual language, not an exact duplicate
- destination reference: use only for the named destination context
```

Record `referenceIds`, `referenceAssetUrls`, mode, and the final prompt in the
image-history entry.

## Ship Truth and Initial Generation

When a Deal has a verified ship name, Step 8 shows a non-blocking
`Ship identity anchor missing` status until an anchor is selected. The operator
can still generate text-only creative; this is a quality signal, not a
publishing gate.

When an anchor exists:

- use it automatically for card generation
- let individual cards opt out when the ship should not appear
- instruct the model to treat it as an architectural and material reference,
  not a mandate to show a full ship exterior
- preserve the actual ship name in the operator surface and prompt provenance

Avoid automatic SERP selection for this anchor. A wrong ship image is worse than
a generic but honest text-only image.

## Operator Experience

### Card-Level Controls (Release 1)

Inside each card, beside **Image direction**:

- a small selected-reference strip with thumbnails and role labels
- `Add reference` menu: campaign ship anchor, Card history, Funnel gallery
- `Use active image as reference` for follow-up variations
- generation menu: `Generate new variation` / `Edit active image`
- prompt preview naming the selected reference roles, never implying a
  reference verifies the itinerary

The existing direct `Regenerate image` stays as the simple text-only path and
remains visually distinct. The reference path states its mode before spend.

### Campaign-Level Panel (Release 1, minimal)

A compact **Reference Images** panel after Creative Direction, before global
Negations, holding the `Ship identity anchor` slot with `Set ship anchor` as its
main action. Naming the role prevents a destination photo being used as a
ship-identity fact. Upload and URL import appear here in Release 2.

### Live Example: Silver Muse Card 3

Select the active image as a `composition` reference, keep the saved direction:

```text
Create a new editorial still-life variation. Retain the reference image's
quiet navy, cream, brass, map, and unhurried-reading visual language. Use a
fresh arrangement and do not reproduce the reference exactly. No people,
railings, decks, pool areas, ship exteriors, or readable invented geography.
```

## Guardrails

- Reference selection is an operator decision; generation remains the explicit
  spend action.
- Never turn a reference image into a claim about an amenity, itinerary, fare,
  or inclusion unless supplier facts separately support the claim.
- Never send an arbitrary remote URL to OpenAI or fetch it from the generation
  request; Release 2 imports go through the hardened server-side path.
- Never use guest, booking, payment, or personal data as reference imagery.
- Keep reference provenance and rights metadata internal; never project it to
  the public Deal page.
- A generated card remains `needs_review`; references do not approve, publish,
  or validate booking links.
- Preserve all image history and make reference-driven outputs reversible.

## Release Plan

### Release 1 — Owned-Asset References (current work)

No new storage, no import path, no approval state. Both sources are already
owned, fetchable URLs.

- Extract the shared reference fetch + sharp normalize helpers out of
  `stability-generator.ts`.
- Add `generateGptImage2WithReferences` against `images/edits`.
- Sources: **card history** and **campaign ship anchor** (from Funnel gallery).
- Modes: `new_variation` and `edit_current`.
- Persist `references`, `shipIdentityReference`, mode, `referenceIds`,
  `derivedFromImageUrl`; apply read-latest-then-merge to anchor writes.
- Card + campaign UI controls; text-only path untouched.

### Release 2 — Import Paths

- Operator upload and URL import, reusing the image-proxy host validation.
- Rights note required before Generate becomes available for imported assets.
- Funnel gallery candidates gain explicit role assignment at attach time.
- Tests for MIME, byte limits, private-URL rejection, and provenance.

### Release 3 — Funnel Landing-Image Transformations ✅ SHIPPED 2026-07-31

Shipped ahead of Release 2 (imports), because the operator's real blocker was
populating an empty dining room, not importing new source imagery.

**What landed**, in `deal-image-variation-generator.ts` + the `generate_variation`
/ `discard_variation` funnel actions + a `✨ Variation` control on every
candidate tile:

- `edit_current` and `new_variation` modes over the Release 1 reference helper.
- Five directions, led by **"Add guests to this space"** — every preset states
  what to PRESERVE first, which is what keeps a real room's architecture,
  lighting, and layout instead of drifting to a generic venue.
- Aspect selector (`16:9` default for gallery/segment slots) with an explicit
  recrop warning, since gpt-image-2 offers only 1:1 / 16:9 / 9:16 and SERP
  sources are typically 3:2.
- `isGenerated` + a violet `✨ AI` tile badge. This is deliberately separate from
  `provenance`: a variation is `operator_supplied` (the operator made it) AND
  synthetic. A photoreal edit of a real venue is a different class of asset from
  supplier photography, and the operator is the last person who can tell.
- Read-latest-then-merge before persisting, so a curation change made during a
  ~55s generation isn't rolled back.

**Verified end to end on live data:** source URL, galleryIds, heroImageId, and
all five segment assignments unchanged; exactly one candidate added, inserted
directly after its source; discard correctly refused while the variation was in
the gallery. 25 unit tests cover the additive invariant and the prompt
guardrails.

Deviation from the plan below: the `DealLandingImageVariation` side-record was
dropped. Lineage lives on the candidate itself (`variationOfCandidateId`,
`variationMode`, `variationDirection`, `variationPromptUsed`,
`variationGeneratedAtIso`), which keeps one source of truth and avoids a second
record that could drift out of sync with the pool it describes.

The original design follows, retained for context.

The goal is not to replace a real image casually. It is to produce reviewable
variants of an operator-approved source when the asset is nearly right but needs
a better crop, calmer composition, cleaner background, or a format that serves
the landing section better.

**Operator flow.** On a selected image in Funnel Synthesis, a compact
**Create variation** action opens an inline editor with: source thumbnail,
title, provenance, target landing section; an editable transformation direction;
a `new_variation` / `edit_current` mode selector; optional target aspect ratio
from the destination slot; an explicit `Generate variation` spend action; and a
variation history with `Use on page`, `Keep as candidate`, `Revert source`, and
`Discard`.

| Landing use | Safe, useful request |
| --- | --- |
| Hero | "Retain the ship and ocean setting; create a wider, calmer dawn composition with clear negative space for headline overlay." |
| Cabins | "Keep the visible room category and materials; remove incidental clutter and create a horizontal editorial crop. Do not add amenities." |
| Dining | "Keep the real table setting as reference; create a warm evening variation with cleaner background separation. Do not add menu items or people." |
| Destination | "Use this approved port image as visual reference; create a cinematic vertical crop focused on the actual waterfront, without adding landmarks or ship calls." |
| Section rescue | "Use this as a composition reference only; create an alternative with the same quiet navy and cream visual language, but no people and no visible railings." |

Guide the operator toward positive direction first — state what belongs in the
frame, then exclusions. This matches the Meta-card Image Direction behavior.

**Never silently replace public imagery.** Every transformed image begins as a
new candidate. It must not overwrite the original Funnel candidate, the hero
assignment, a gallery assignment, or a section-image assignment. The operator
explicitly chooses `Use on page` after inspecting output. The source remains a
reversible parent.

```ts
interface DealLandingImageVariation {
  id: string;
  sourceCandidateId: string;
  sourceAssetUrl: string;
  resultCandidateId: string;
  resultAssetUrl: string;
  targetCategory: DealImageCategory;
  targetSlot: "hero" | DealLandingSegmentKey;
  mode: "new_variation" | "edit_current";
  direction: string;
  aspectRatio: "landscape" | "square" | "portrait";
  promptUsed: string;
  referenceIds: string[];
  generatedAtIso: string;
  generatedBy: "gpt_image_2";
  status: "ready" | "error";
  error?: string;
}
```

Insert the result into the existing Funnel `candidates` list with
`provenance: "operator_supplied"` only after controlled storage succeeds, with a
source-candidate pointer so the UI can label it `Variation of <source title>`.
Transformation prompts cannot claim or visibly invent ship amenities, cabin
categories, destination landmarks, promotions, fares, port calls, or people who
appear to be guests or staff. If generation or storage fails, leave the source
assignment untouched and surface the error on the variation record.

### Release 4 — Quality Signals and Live Comparison

- Non-blocking ship-anchor quality status.
- Prompt preview discloses reference roles and active mode.
- Controlled comparison: text-only vs one-reference vs multi-reference, using
  one verified ship anchor and one Card 3 composition reference. Record the
  operator's choice and why it won. Stop before any ad dispatch or publication.

## Acceptance Criteria

Release 1 is complete when:

1. An operator can select a ship anchor and use it during Meta card generation.
2. An operator can add a reference from card history or the Funnel gallery.
3. A card can generate a fresh composition informed by references without
   overwriting its prior image.
4. A card can edit its active image through an explicit edit mode, with the
   parent image recorded.
5. The final prompt, generation mode, reference ids, and prior image remain
   reviewable and reversible.
6. Text-only generation keeps working for legacy and reference-free campaigns.
7. `input_fidelity` is never sent, and no arbitrary remote URL reaches OpenAI.
8. No reference operation changes approval, publishing, booking, or dispatch
   state.
9. Concurrent card generation cannot lose an anchor write, and an anchor write
   cannot clobber concurrent card results.

Release 3 adds:

10. A Funnel image transformation never replaces the source or a selected
    landing-page image until the operator explicitly chooses `Use on page`.
