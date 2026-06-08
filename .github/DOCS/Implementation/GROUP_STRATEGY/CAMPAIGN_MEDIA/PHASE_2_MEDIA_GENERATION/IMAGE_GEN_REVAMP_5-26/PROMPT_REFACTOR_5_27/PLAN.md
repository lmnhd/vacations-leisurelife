# Prompt Refactor — 2026-05-27

**Branch:** `feature/shadow-groups`
**Source audit:** `notes.txt` in this directory (image quality review of `image_75e37b.jpg`)
**Scope:** Fix three AI prompt construction bugs + extract visual effects into an extensible server-side post-processor + introduce a prompt extender system that guarantees variety for per-image variables (time of day, casting, energy) without threading those decisions through the generation pipeline.

---

## Root Causes

Four bugs were identified in the current prompt pipeline. The first three cause flat, theme-blind output. The fourth (film grade injection) creates a style contradiction and belongs in image post-processing, not in text prompts.

### Bug 1 — Style Contradiction

`REALISTIC_BASE_STYLE` in `style-prompts.ts:42` claims "shot on a modern mirrorless camera." `resolveMediaStyle` then appends a film grade such as "Kodachrome 1970s warmth." The model interprets both simultaneously and produces muddy, desaturated output — neither modern nor analog.

### Bug 2 — Theme Starvation (Scene Prompts)

`buildSceneImagePrompt` in `stability-generator.ts:1233` puts `resolvedStyle.promptBlock` (generic style boilerplate) at position 1 and `scene.imagePrompt` (the Production Bible creative direction containing the actual theme words) at position 12. The image model never reaches the theme with meaningful attention weight.

### Bug 3 — Style Block Too Late (Hero Prompts)

In all three paths of `buildHeroPrompts` (`stability-generator.ts:257`), `resolvedStyle.promptBlock` arrives near the end of the array, after casting rules, prop rules, and ship-realism rules. The aesthetic frame should arrive before secondary rules.

### Bug 4 — Film Grade in AI Prompts

`FILM_GRADES` in `style-prompts.ts:46` and the `chooseRealisticFilmGrade` call in `resolveMediaStyle` inject analog-film language into the text prompt. This is the wrong layer:

1. It creates the "mirrorless vs. Kodachrome" contradiction (Bug 1).
2. Analog look-and-feel is more reliably and consistently produced through deterministic image processing (color matrix, gamma, grain) than by asking a generative model to interpret film-stock names.

The fix: remove all film grade logic from `style-prompts.ts` and implement an extensible `ImageFilterRegistry` that applies distinct visual effects to a subset of each image batch after generation.

---

## Changes — File by File

### 1. `lib/campaigns/media/style-prompts.ts`

**Remove:**

- `FILM_GRADES` constant (lines 46–51)
- `chooseRealisticFilmGrade` function (lines 62–64)
- The `filmGrade` interpolation in `resolveMediaStyle` return block
- The "modern mirrorless camera" substring from `REALISTIC_BASE_STYLE` (line 42)

**Result:** `resolveMediaStyle` returns a clean, camera-agnostic documentary-style `promptBlock`. No analog-film language. No contradiction.

**Before (relevant excerpt):**

```typescript
export const REALISTIC_BASE_STYLE = [
  "Style: Documentary-grade cruise photography",
  "Use sharp detail, accurate ship architecture, natural marine lighting...",
  // ↓ contradicts the film grade appended below
  "Keep editorial restraint...; the image should feel like a professional cruise line brochure or travel photographer portfolio shot on a modern mirrorless camera",
  "Use subtle depth of field only where appropriate...",
].join(". ");

export const FILM_GRADES = [
  "Kodachrome 1970s warmth with natural reds, amber sunlight, and gentle highlight rolloff",
  "late-1980s Ektachrome saturation with crisp blue water, clean whites, and slide-film contrast",
  "expired Polaroid color shift with softened shadows, creamy highlights, and tactile analog imperfection",
  "cross-processed slide film with restrained cyan shadows, warm highlights, and real optical character",
] as const;

// In resolveMediaStyle:
return {
  style,
  promptBlock: [
    REALISTIC_BASE_STYLE,
    `Analog film character: ${filmGrade}; make this feel like physical film stock or lens behavior, not a digital overlay`,
    buildThemeAnchorInstruction(input.themeAnchorProps),
  ].join(". "),
};
```

**After:**

```typescript
export const REALISTIC_BASE_STYLE = [
  "Style: Documentary-grade cruise photography",
  "Use sharp detail, accurate ship architecture, natural marine lighting...",
  "Keep editorial restraint with no over-processing; the image should feel like a professional cruise line brochure or travel photographer portfolio",
  "Use subtle depth of field only where appropriate...",
].join(". ");

// FILM_GRADES removed — visual effects live in lib/campaigns/media/image-filter-registry.ts

// In resolveMediaStyle:
return {
  style,
  promptBlock: [
    REALISTIC_BASE_STYLE,
    buildThemeAnchorInstruction(input.themeAnchorProps),
  ].join(". "),
};
```

---

### 2. `lib/campaigns/media/generators/stability-generator.ts`

#### 2a. `buildSceneImagePrompt` — reorder for theme-first weight

Move `scene.imagePrompt` (Production Bible creative content) to position 1. Move `resolvedStyle.promptBlock` to position 3. Push research context and secondary signals to after scene-specific details. Keep the `Avoid` block last.

**New order:**

```
1.  Production Bible source frame: ${scene.imagePrompt}   ← THEME FIRST
2.  Mood: ${scene.mood}
3.  resolvedStyle.promptBlock                              ← Visual style second
4.  sceneActionGuidance
5.  environmentGuidance
6.  themeSpecificWellnessGuidance
7.  categoryGuidance
8.  nicheVisibilityGuidance
9.  preserveClause
10. Setting / Time / Light / Framing / ShipName
11. researchContext                                        ← Secondary context after primary
12. researchSignalGuidance / discouragedSignalGuidance
13. researchRoutineGuidance / researchTranslationGuidance
14. buildStoryboardSafeSceneDirection(scene)
15. People / Location integrity / Environment rule
16. landscapeGuardrails.reality
17. Avoid ${landscapeGuardrails.avoid}                    ← Avoids last
```

#### 2b. `buildHeroPrompts` — move style block earlier

In all three paths (still-based, production-bible-based, fallback), move `resolvedStyle.promptBlock` to immediately after the primary blueprint block, before plausibility and casting rules.

**New order for still-based path:**

```
1.  Primary image blueprint: ${still.imagePrompt}         ← Already first ✓
2.  On ${shipName} / usage / action / location / mood
3.  resolvedStyle.promptBlock                              ← Move here (was near end)
4.  Overall direction / Atmosphere / Lighting / Composition
5.  Plausibility rule / Niche cue strategy / Niche moment
6.  researchContext
7.  Hero shot variant / Framing / Layout
8.  Casting / Props / Ship realism
9.  landscapeGuardrails.reality
10. Avoid: ...                                             ← Avoids last
```

---

### 3. `lib/campaigns/media/image-filter-registry.ts` — NEW FILE

An extensible registry of visual post-processing filters. Each filter is an object that implements the `ImageFilter` interface. The registry is a flat array — adding a new filter from any NPM package requires only adding a new entry to that array.

#### Design Goals

- **Partial application**: in a batch of N images, only `filterCount` (default: 3 of 5) receive a filter. The remaining images stay clean.
- **No repeats within a batch**: each filtered image in a batch gets a distinct filter.
- **Extensible**: any NPM package that can transform a `Buffer` → `Buffer` can be wrapped as an `ImageFilter`.
- **Deterministic selection**: which images are filtered and which filter they receive is derived from a campaign seed so the same campaign always produces the same assignment, making re-runs auditable.

#### `ImageFilter` Interface

```typescript
export interface ImageFilter {
  readonly id: string; // stable key used in AssetRecord metadata
  readonly label: string; // human-readable name for logs and review UI
  apply(buffer: Buffer): Promise<Buffer>;
}
```

#### Batch Selection

```typescript
/**
 * Returns an array of length `batchSize`.
 * Exactly `filterCount` entries are ImageFilter instances (each distinct).
 * The rest are null (no filter applied).
 * Selection order is deterministic given the same `seed`.
 */
export function selectFiltersForBatch(
  batchSize: number,
  filterCount: number,
  seed: string,
): Array<ImageFilter | null>;
```

Implementation sketch:

1. Seeded shuffle of `[0 … batchSize-1]` → pick first `filterCount` as the filtered positions.
2. Seeded shuffle of `IMAGE_FILTER_REGISTRY` → take first `filterCount` entries as the assigned filters.
3. Build the result array pairing position → filter; all other positions → `null`.

For the seed, use the campaign slug or a combination of `themeName + batchKey` so the assignment is stable across re-runs of the same campaign.

#### Initial Filter Set (using `sharp`, already a dependency)

| Filter ID          | Visual Character                                  | Key `sharp` Operations                                                              |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `kodachrome_70s`   | Warm ambers, gentle highlight rolloff, fine grain | `recomb` (red push), `modulate` (sat +10%), `gamma(1.05)`, grain overlay 8%         |
| `ektachrome_80s`   | Crisp blues, punchy slide-film contrast           | `recomb` (blue push), `modulate` (sat +18%), `linear(1.06, -4)`, grain overlay 5%   |
| `polaroid_expired` | Creamy cast, softened blacks, subtle blur         | `tint({245,238,220})`, `modulate` (sat -18%), `blur(0.4)`, `gamma(0.92)`, grain 12% |
| `cross_process`    | Cyan shadows, compressed tonal range              | `recomb` (cyan/warm split), `modulate` (sat +15%), `linear(1.08, -8)`, grain 7%     |

Grain is not native to `sharp` but can be applied with `.composite()` using a generated noise buffer at `blend: 'soft-light'`.

#### Extensibility — NPM Packages to Evaluate

When adding new filter types beyond the initial film grades, the following packages are worth evaluating:

| Package              | What It Offers                                                                                                              | Notes                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `jimp`               | Pure-JS image processing; built-in Photoshop-style effects: posterize, sepia, dither, color curves, blur, invert, normalize | Works on `Buffer` natively; no native bindings  |
| `@jimp/plugin-color` | Per-channel brightness/contrast, mix, colorize, desaturate                                                                  | Pairs well with jimp's base                     |
| `node-canvas`        | Full 2D Canvas API including CSS `filter` property (blur, brightness, contrast, grayscale, hue-rotate, saturate, sepia)     | Heavier but very expressive                     |
| `fabric`             | Canvas-based; supports Instagram-style filter stacks                                                                        | More suited to compositing than pure transforms |
| `gm`                 | GraphicsMagick/ImageMagick bindings; supports vignette, charcoal sketch, oil-paint, solarize                                | Requires system-level `gm` or `convert` binary  |

The `ImageFilter` interface is intentionally thin so any of these can be wrapped without touching the registry contract:

```typescript
// Example: wrapping a jimp sepia effect
import Jimp from "jimp";

export const sepiaFilter: ImageFilter = {
  id: "jimp_sepia",
  label: "Jimp Sepia",
  async apply(buffer) {
    const img = await Jimp.read(buffer);
    img.sepia();
    return img.getBufferAsync(Jimp.MIME_PNG);
  },
};
```

#### Full Registry

```typescript
export const IMAGE_FILTER_REGISTRY: ImageFilter[] = [
  kodachrome70sFilter,
  ektachrome80sFilter,
  polaroidExpiredFilter,
  crossProcessFilter,
  // future entries drop in here
];
```

---

### 4. Integration — where filters are applied

The filter selection and application happen **after** generation, inside each generator function, before results are pushed. The `AssetRecord` metadata field (already used for `referenceStatus`) should also record which `filterId` was applied (or `null`).

**`generateHeroImages` — 3 of 5:**

```typescript
const filterAssignment = selectFiltersForBatch(prompts.length, 3, brief.themeName);

for (let i = 0; i < prompts.length; i++) {
    const rawBuffer = await generateNanoBananaImage(...);
    const filter = filterAssignment[i];
    const buffer = filter ? await filter.apply(rawBuffer) : rawBuffer;
    results.push({
        buffer,
        filterId: filter?.id ?? null,
        ...
    });
}
```

**`generateSceneImages`:** same pattern — 3 of 5 by default. The `filterCount` should be a named constant (`SCENE_FILTER_COUNT = 3`) so it is easy to adjust.

**`generateAestheticConcepts`:** apply to 2 of 4 concepts (`CONCEPT_FILTER_COUNT = 2`). Concepts are smaller/square and more editorial — lighter touch.

**`generateReferenceGroundedHeroImages`:** apply to 1 of however many are generated (typically 1–2). Reference-grounded images are already constrained by the ship photo; a filter on top of every one would compound changes too aggressively.

**`generateMerchDesigns` in `dalle-generator.ts`:** **skip entirely.** Merch designs are illustration-style (`assetKind: 'merch'`); film/photographic treatments are wrong for that asset kind.

---

### 5. `lib/campaigns/media/prompt-extender.ts` — NEW FILE

A prompt extender is a categorical variable (time of day, crowd composition, energy level, etc.) whose options cycle across a batch of images by position, guaranteeing that a range of values appear in every generation run without the pipeline needing to reason about any of it.

#### Why This Layer Exists

The current pipeline threads diversity, casting, and time-of-day instructions through `buildHeroPrompts` and `buildSceneImagePrompt` using data pulled from `CampaignAestheticBrief`. This has two problems:

1. **Inconsistency** — the instructions are applied to every image identically, so a batch of five hero images can all end up at the same time of day and the same general casting note.
2. **Prompt bloat** — casting guidance (castingGoal, ageRangeGuidance, diversityIntent, pairingGuidance, antiStereotypeRules) accounts for five separate lines in every hero prompt, competing with the theme content for attention weight.

The extender system replaces all of that with a positional cycling approach: define the variable once in the extender config, and the system guarantees the options are distributed across the batch automatically.

#### Design

```typescript
export interface PromptExtenderCategory {
  readonly id: string;
  readonly label: string;
  /**
   * Append this extender to every Nth image in the batch.
   * 1 = every image, 2 = every other image, 3 = every third, etc.
   * When N > 1, the images that don't receive this extender get nothing
   * from this category — the main prompt carries the frame.
   */
  readonly applyToEveryN: number;
  readonly options: readonly string[];
}

/**
 * Returns an array of length `batchSize`.
 * Each entry is a (possibly empty) array of extender strings to append
 * to that image's prompt.
 */
export function assignExtendersToBatch(
  batchSize: number,
  categories: readonly PromptExtenderCategory[],
): string[][];
```

**Assignment logic per category:**

- Maintain an internal option index that advances every time the category fires.
- For image at position `i`: fire if `i % applyToEveryN === 0`; use `options[fireCount % options.length]`.
- This produces a round-robin within each category, independent of other categories.

No seed needed — the distribution is purely positional. The same batch size always produces the same distribution, which is the point.

#### Default Extender Categories

```typescript
export const DEFAULT_PROMPT_EXTENDERS: readonly PromptExtenderCategory[] = [
  {
    id: "time_of_day",
    label: "Time of Day",
    applyToEveryN: 1, // every image — always want time variety
    options: [
      "Time of day: early morning golden hour; warm low-angle light, long soft shadows, calm unhurried atmosphere",
      "Time of day: late morning; bright but not harsh, sea sparkle, clear visibility across the full deck",
      "Time of day: midday overcast; flat diffuse light, clean whites, no dramatic shadows — suits glass and interior spaces",
      "Time of day: late afternoon; warm directional side-light, amber tones building toward the horizon",
      "Time of day: dusk blue hour; deep indigo sky, warm interior lamps glowing against the darkening sea",
    ],
  },
  {
    id: "crowd_composition",
    label: "Crowd Composition",
    applyToEveryN: 1, // every image
    options: [
      "Group of 3–4 adults, mixed gender, ages mid-30s to mid-50s, casually dressed and self-directed",
      "Small cluster of 4–5; majority women, relaxed and engaged with each other rather than the camera",
      "Intergenerational group: one or two people visibly in their 60s alongside others in their 40s",
      "Intimate foreground pair with one or two background figures; the pair share clear focus and easy chemistry",
      "Wider social group of 5–6 spread naturally across the space; no posed or symmetrical arrangement",
    ],
  },
  {
    id: "ethnic_diversity",
    label: "Ethnic Diversity",
    applyToEveryN: 2, // every other image — enough coverage without over-specifying every frame
    options: [
      "Ethnically diverse group; at least one person of color clearly visible in the foreground or mid-ground",
      "Mixed heritage across the group; diversity reads naturally, not as a staged stock-photo arrangement",
      "Visibly multiracial; no single ethnicity dominates the frame; representation feels incidental and real",
    ],
  },
  {
    id: "energy_level",
    label: "Energy Level",
    applyToEveryN: 2,
    options: [
      "Energy: calm and settled; people at rest, quiet conversation, no urgency or motion",
      "Energy: engaged but low-key; leaning in, pointing outward, sharing attention — focused but unhurried",
      "Energy: gently animated; a laugh mid-exchange or a gesture toward the horizon; spontaneous, not performative",
    ],
  },
];
```

#### Pipeline Impact — What Gets Removed from Hero and Scene Prompts

Once the extender system is wired in, the following lines should be **deleted** from `buildHeroPrompts` and from the hero paths in `stability-generator.ts` — they are fully replaced by the extender categories above:

| Removed from prompt builder                                        | Replaced by extender      |
| ------------------------------------------------------------------ | ------------------------- |
| `Casting goal: ${casting.castingGoal}`                             | `crowd_composition`       |
| `Age guidance: ${casting.ageRangeGuidance}`                        | `crowd_composition`       |
| `Diversity guidance: ${casting.diversityIntent}`                   | `ethnic_diversity`        |
| `Pairing guidance: ${casting.pairingGuidance}`                     | `crowd_composition`       |
| `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}` | removed (over-constraint) |
| `Lighting: ${lightingStyle}` (per-still path)                      | `time_of_day`             |
| `Time-of-day bias: ${heroVariant.temporalBias}`                    | `time_of_day`             |

`stylingGuidance` stays in the main prompt — it is theme-specific and not a cycling variable.

#### Integration — call site in `generateHeroImages`

```typescript
const extenderAssignment = assignExtendersToBatch(prompts.length, DEFAULT_PROMPT_EXTENDERS);

for (let i = 0; i < prompts.length; i++) {
    const extenders = extenderAssignment[i];
    const finalPrompt = extenders.length > 0
        ? `${prompts[i]}. ${extenders.join('. ')}`
        : prompts[i];

    const rawBuffer = await generateNanoBananaImage(finalPrompt, ...);
    // filter application follows here (see image-filter-registry.ts)
}
```

Same pattern in `generateSceneImages`. For merch and concept assets, extenders are skipped — they are not photographic group scenes.

---

## Rollout Order

1. **`style-prompts.ts`** — remove `FILM_GRADES`, fix `REALISTIC_BASE_STYLE` (smallest diff, safe to ship alone)
2. **`stability-generator.ts`** — reorder `buildSceneImagePrompt` (Bug 2)
3. **`stability-generator.ts`** — reorder `buildHeroPrompts` (Bug 3)
4. **`prompt-extender.ts`** — new file; implement `assignExtendersToBatch` and default categories; remove the replaced casting/time lines from generator functions; unit test
5. **`image-filter-registry.ts`** — new file; implement four initial filters, `selectFiltersForBatch`, unit tests
6. **Wire both** into generator call sites

Steps 1–3 are a safe prompt-only refactor that can ship independently. Steps 4 and 5 are independent of each other and can be built in parallel. Step 6 activates both.

---

## Testing

**Unit — `prompt-extender.ts`:**

- `assignExtendersToBatch(5, DEFAULT_PROMPT_EXTENDERS)` → 5 entries; entries at even indices include `ethnic_diversity` and `energy_level`; all 5 include `time_of_day` and `crowd_composition`.
- Five consecutive calls with `applyToEveryN: 1` and 5 options → all 5 distinct options appear exactly once.
- `applyToEveryN: 2`, batch of 6 → extender appears at indices 0, 2, 4 only.
- Options wrap correctly when `batchSize > options.length`.

**Unit — `image-filter-registry.ts`:**

- Each filter applied to a synthetic 1×1 and 16×9 solid-color buffer; assert dimensions unchanged, output differs from input, output is valid PNG.
- `selectFiltersForBatch(5, 3, seed)` → exactly 3 non-null entries, all distinct `id` values.
- Same seed → same assignment (determinism).
- `filterCount > registry size` → throws a descriptive error, no silent repeats.

**Visual spot-check:**

- Run one hero batch before/after; confirm 3 of 5 images have a visible filter applied and the other 2 are neutral.
- Confirm the five images span at least three distinct times of day.
- Confirm the theme words now dominate output (`winter`, `observatory`, etc. reflected in the scene).

**Regression:**

- `lib/campaigns/__tests__/distribution-marketing.designed-ads.test.ts`
- `lib/campaigns/__tests__/distribution-planner.designed-ads.test.ts`
