# Canva + Templated.io Template-Based Ad System — Master Plan

**Created:** 2026-05-21  
**Status:** Planning — ready to build  
**Owner:** LLI / cclem

---

## 1. The Problem We Are Solving

The current media pipeline renders static ad images in code (`satori` + `sharp`) via `lib/campaigns/design-system/ad-templates.ts`. This produces technically acceptable ads but has three hard limitations:

1. **Visual design is locked in code.** Any aesthetic change — font, layout, color treatment, composition style — requires a developer and a deploy.
2. **Copy is mechanical.** The system pulls `brief.messaging.heroSlogan`, `subSlogan`, and `ctaVariants` verbatim. These fields were written to describe the campaign, not to be catchy ad copy. The result is on-brand but rarely punchy.
3. **Wired to one workflow.** The generator is embedded inside the Group Campaign media orchestrator. Reusing it for a Cruise Brothers Deals workflow would require duplicating it.

---

## 2. The Desired Outcome

A system where:

- **You** design ad templates manually in **Canva** (Pro account, no Enterprise needed).
- Each template has **3–5 text slots** and **as many image slots as the design calls for** — image-heavy layouts (5–10 images per template) are the norm, not the exception. Images tell the campaign story; text anchors it.
- An **AI Copy Forge** step reads the campaign brief + dossier research and generates campaign-specific, catchy copy that fills those slots.
- A **render service** (Templated.io) receives the filled slots and returns production-ready PNG ads.
- The finished PNGs are stored in the existing campaign media manifest, exactly as today, with zero changes to downstream distribution or review tooling.
- The **same module** (Copy Forge + render service) can be called by a completely separate Cruise Brothers Deals workflow — with no duplication of logic.
- Formats covered for P4 static distribution: **Meta feed square, Meta feed portrait, Meta story/reel, Meta carousel square cards, Google Responsive Display landscape, Google Responsive Display square, and Google Responsive Display vertical** (plus legacy aliases retained while old templates migrate).

Quality reference: [`GOLD_STANDARD_AD_REFERENCE.md`](./GOLD_STANDARD_AD_REFERENCE.md) captures the `Reset by Sea` image-detail ad from the older deterministic renderer. That artifact is the current premium benchmark for image mood, restrained composition, and promise-led copy. The Canva/Templated system should emulate that level of taste without preserving the old renderer as the long-term production path.

### P4 Static Distribution Template Matrix

Use these exact canvas sizes when creating Canva/Templated templates. Templated gallery thumbnails may show misleading scaled dimensions; the registry should record the intended output canvas size.

| Format key | Platform | Placement | Ratio | Canva/Templated canvas |
|---|---|---|---|---|
| `meta_feed_square` | Meta | Feed square | 1:1 | 1080 × 1080 |
| `meta_feed_portrait` | Meta | Feed portrait | 4:5 | 1080 × 1350 |
| `meta_story_reel` | Meta | Story/Reel | 9:16 | 1080 × 1920 |
| `meta_carousel_square` | Meta | Carousel card | 1:1 | 1080 × 1080 per card |
| `google_display_landscape` | Google | Responsive Display landscape | 1.91:1 | 1200 × 628 |
| `google_display_square` | Google | Responsive Display square | 1:1 | 1200 × 1200 |
| `google_display_vertical` | Google | Responsive Display vertical | 9:16 | 900 × 1600 |

Legacy format keys `ig_square`, `fb_google_display`, `story_reel`, and `carousel` still work for existing templates, but new P4 templates should use the precise keys above.

---

## 3. Why Templated.io (Not Canva's Own API)

### Canva Connect API + Autofill — disqualified

Canva does have a programmatic autofill API. The workflow is technically sound:

1. Design a Brand Template in Canva with tagged data fields.
2. `POST /v1/autofills` with `{ brand_template_id, data: { FIELD: value } }` → async job → design ID.
3. `POST /v1/exports` → poll → download PNG.

**Hard blocker:** Both the integration developer **and every end user** must be members of a **Canva Enterprise organization** (30+ seat minimum, custom pricing, annual contract, weeks-long sales cycle). There is a dev-access exception but it does not cover production use.

**Decision:** Keep Canva Connect Autofill as a deferred provider behind the same interface, but do not block on it.

### Templated.io — selected

- Supports **direct Canva design import**. Design in Canva → export → import to Templated.io. No re-drawing in a foreign tool.
- Named variable slots (text, image, color) on any layer — same conceptual model as Canva Autofill.
- **No Enterprise requirement.** Starter plan is sufficient for our scale.
- Official **Node.js SDK**.
- ~2-second render times.
- Supports PNG, JPG, WebP, PDF, and MP4 (relevant for animated Story/Reels in the future).
- Embedded editor available (could be used for a Deals operator UI later).

Full vendor comparison is in `../01_RESEARCH_CANVA_OPTIONS.md`.

---

## 4. System Overview (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          UPSTREAM (unchanged)                               │
│  Discovery → Brief Engine (Trinity) → Approved CampaignAestheticBrief      │
│                + CampaignDossier + Campaign (ship / route / dates)          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEW: lib/ads/                                      │
│                                                                             │
│  1. COPY FORGE                                                              │
│     One structured LLM call (gpt-5-medium via structured-generation.ts)    │
│     Input:  brief + dossier + campaign + requested formats                  │
│     Output: AdCopySet — per-format catchy headline / subhead / CTA / hints  │
│                                                                             │
│  2. TEMPLATE REGISTRY                                                       │
│     Static JSON lookup: (workflow, visualFlavor, format) → template_id     │
│     Registry is updated manually each time you add a new Canva template.   │
│                                                                             │
│  3. IMAGE RESOLUTION                                                        │
│     AdCopySet.imageHints → priority search through EXISTING manifest:      │
│     sceneImages → shipReferences → hero → aestheticConcepts → stills       │
│     If a required slot has no match: trigger targeted production bible     │
│     image generation (single scene spec — not a full pipeline re-run)      │
│     Selected images uploaded to Templated.io Assets → provider asset refs  │
│                                                                             │
│  4. RENDER PACK                                                             │
│     For each format: POST to Templated.io /v1/render with slot values      │
│     Response: PNG URL → fetch buffer → storeAsset() → AssetRecord          │
│                                                                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOWNSTREAM (unchanged)                                   │
│  manifest.images.designedAdArtifacts                                        │
│  Distribution planner → review UI → social publishing                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Layout — `lib/ads/`

This is an **isolated render/copy core**, not a duplicate of campaign domain types. `lib/ads/` should accept normalized inputs and stay reusable across workflows, while thin adapters in the calling workflow translate campaign-native or deal-native records into that normalized shape.

```
lib/ads/
├── index.ts                           # Public surface: generateCopySet, renderAdPack, types
├── types.ts                           # AdFormat, AdCopySet, SlotPack, SlotValue, AdRenderResult, NormalizedAdInput
├── config.ts                          # AD_RENDER_PROVIDER, TEMPLATED_API_KEY, optional model override
│
├── copy-forge/
│   ├── index.ts                       # generateCopySet(input: CopyForgeInput): Promise<AdCopySet>
│   ├── prompt.ts                      # Assembles JSON-structured prompt from normalized brief/dossier slices
│   └── schema.ts                      # Zod schema for AdCopySet — enforces all length limits
│
├── template-registry/
│   ├── index.ts                       # lookupTemplate(workflow, visualFlavor, format): TemplateRef
│   ├── templates.json                 # Hand-maintained: template IDs + slot lists per (workflow, flavor, format)
│   └── validator.ts                   # Startup check: registry slots vs Templated.io dataset (fail-fast)
│
├── providers/
│   ├── provider.ts                    # AdRenderProvider interface
│   ├── templated.ts                   # Templated.io implementation (primary)
│   ├── canva-autofill.ts              # Stub — throws "not configured" (future Enterprise path)
│   └── satori-legacy.ts              # Adapter wrapping existing lib/campaigns/design-system renderer
│
├── image-uploader.ts                  # Resolves imageHints → manifest records → uploads to provider
├── render-pack.ts                     # Orchestrates steps 1–4 (Copy Forge → registry → upload → render → store)
│
└── __tests__/
    ├── copy-forge.test.ts             # Schema-validates output on 3 real campaign briefs
    └── render-pack.test.ts            # Mocks provider, asserts slot mapping correctness
```

Workflow-specific adapters stay outside `lib/ads/`:

```text
lib/campaigns/media/ad-pack-adapter.ts   # Campaign + manifest -> NormalizedAdInput
lib/cb/deal-to-ad-input.ts               # CbDeal -> NormalizedAdInput
```

This keeps the reusable ad engine clean without pretending campaign-native data does not exist.

---

## 6. Copy Forge — Detailed Contract

### Purpose

Design each ad as a **complete, unified composition** — copy and imagery planned together as one story, not independently. The output is not "some copy" and "some image suggestions". It is a fully directed ad brief: a clear compositional intent, specific image slot assignments with a stated narrative role for each, and copy that responds to and completes the imagery rather than simply describing the campaign.

Copy Forge thinks like an art director, not a copywriter. Its job is to define a campaign-specific creative territory, then express that territory coherently across formats.

### Input type

```ts
interface CopyForgeInput {
  brief: CampaignAestheticBrief;           // approved brief from brief-engine
  dossier: CampaignDossier | null;         // upstream discovery research
  campaign: Campaign;                       // ship, route, dates
  workflow: 'group_campaign' | 'cb_deal';
  formats: AdFormat[];                      // e.g. ['ig_square', 'story_reel', 'carousel']
  visualFlavor: VisualFlavor;               // visual voice of this campaign
  templateLayouts: Record<AdFormat, TemplateLayout>; // full structural descriptor per format
  availableImages: AvailableImageInventory;             // what's actually in the manifest right now
}

interface TemplateLayout {
  description: string;          // plain-English anatomy e.g. "1 hero image top, 2×2 tile grid middle, headline + CTA footer"
  slotDescriptors: SlotDescriptor[];
}

interface SlotDescriptor {
  name: string;                 // exact slot name matching registry e.g. "tile_image_3"
  type: 'text' | 'image' | 'color';
  visualOrder: number;          // 1 = first element viewer encounters (top-left in LTR layouts)
  zone: SlotZone;               // structural region of the template
  maxChars?: number;            // text slots only; visual-fit budget, not a generic copy limit
  maxWords?: number;            // text slots only; protects huge display type
  maxLines?: number;            // text slots only; estimated line budget for the rendered layer
  copyRole?: string;            // text slots only; e.g. "Large red emotional hook"
  copyInstruction?: string;     // text slots only; what belongs in this layer
  disallow?: string[];          // text slots only; e.g. ["date", "port", "ship"]
}

type SlotZone =
  | 'header'       // top of canvas — eyebrow / issue label
  | 'hero'         // dominant focal image or headline — the emotional center
  | 'tile_grid'    // multi-image collage area
  | 'body'         // mid-canvas text area
  | 'footer'       // bottom bar — CTA, vessel, departure info
  | 'overlay';     // text overlaid directly on an image slot

interface AvailableImageInventory {
  scene_image: number;
  ship_reference: number;
  hero: number;
  aesthetic_concept: number;
  still: number;
  merch: number;
}
```

`templateLayouts` is injected from the registry so Copy Forge knows not just *what* slots exist, but their type, visual order, structural zone, and text-fit budget. Combined with `availableImages`, the agent can reason about the full canvas anatomy before assigning a single value.

**Text-fit rule:** every text slot must have its own budget and role. Do not rely on broad limits like "headline <=50". A giant display layer may need `maxChars: 18`, `maxWords: 3`, and `disallow: ["date", "port", "ship"]`, while a small subhead may accept a compact 56-character phrase. The registry is the source of truth for what text belongs where.

Example `TemplateLayout` for `IG_temp_1` (Story/Reel, vertical film strip collage):

```ts
{
  description: "Vertical film strip collage: left stacked image strip, full-canvas atmospheric background, large hero image, oversized short theme headline on gray overlay, compact theme promise beneath, tiny sensory label near the lower overlay.",
  slotDescriptors: [
    { name: "microcopy",        type: "text",  visualOrder: 1, zone: "header",    maxChars: 22, maxWords: 5, maxLines: 1, copyRole: "Tiny sensory caption", disallow: ["date", "port", "ship", "route"] },
    { name: "background-image", type: "image", visualOrder: 2, zone: "hero",      copyRole: "Atmospheric canvas" },
    { name: "hero_image",       type: "image", visualOrder: 3, zone: "hero",      copyRole: "Primary human niche moment" },
    { name: "tile_image_1",     type: "image", visualOrder: 4, zone: "tile_grid", copyRole: "Niche action detail" },
    { name: "tile_image_2",     type: "image", visualOrder: 5, zone: "tile_grid", copyRole: "Social or group cue" },
    { name: "tile_image_3",     type: "image", visualOrder: 6, zone: "tile_grid", copyRole: "Prop or texture close-up" },
    { name: "tile_image_4",     type: "image", visualOrder: 7, zone: "tile_grid", copyRole: "Cruise-native context" },
    { name: "headline",         type: "text",  visualOrder: 8, zone: "overlay",   maxChars: 18, maxWords: 3, maxLines: 2, copyRole: "Large red emotional hook", disallow: ["date", "port", "ship", "route"] },
    { name: "subhead",          type: "text",  visualOrder: 9, zone: "overlay",   maxChars: 56, maxWords: 10, maxLines: 2, copyRole: "Small supporting promise", disallow: ["date", "port", "ship", "route"] },
  ]
}
```

The `description` field is the plain-English summary that goes directly into the Copy Forge prompt so the model can reason spatially about the canvas without needing to decode slot names.

### Output type (Zod-validated)

```ts
interface AdCopySet {
  creativeTerritory?: string; // short internal name for the ad family's world
                            // e.g. "The First Table at Sea", "Postcards From Your People"
  compositionIntent: string;  // one paragraph: what story this ad tells as a whole,
                              // what emotion it should land, what visual arc it follows.
                              // Written before any slots are filled. This is the north star.
  formats: Partial<Record<AdFormat, SlotPack | SlotPack[]>>;
}

interface SlotPack {
  compositionNote: string;             // how copy + imagery work together in THIS format
  headline: string;                    // max 50 chars — must complete or tension with imagery
  subhead?: string;                    // max 80 chars
  microcopy?: string;                  // max 30 chars
  cta: string;                         // max 20 chars — imperative
  imageSlotDirectives: Record<string, ImageSlotDirective>; // keyed by slot name
}

interface ImageSlotDirective {
  assetType: 'scene_image' | 'ship_reference' | 'hero' | 'aesthetic_concept' | 'still' | 'merch';
  narrativeRole: string;    // what job this specific slot does in the overall ad story
                            // e.g. "anchors the ship — establishes where we are"
                            //      "shows the niche activity in context — teak table, cards, morning light"
                            //      "closes the sequence — pulls wide, suggests scale and possibility"
  moodCue: string;          // lighting / energy / feeling this slot should carry
                            // e.g. "amber late afternoon, warm and still"
                            //      "motion blur, kinetic, crowd energy"
  preferTags?: string[];    // optional: additional manifest tags to filter candidates
}
```

Carousel produces `SlotPack[]` — one per page, each with its own `compositionNote` and `imageSlotDirectives`. The pages should read as a **visual sequence**, not a set of independent panels.

### How Copy Forge reasons — required thinking order

Copy Forge is given a **fixed reasoning sequence** in the prompt. It must complete each step in order before producing any slot values:

**Step 1 — Campaign world summary**
Read brief + dossier. Identify the 3 most specific, sensory, niche-true details about this campaign world. These become the raw material for both copy and imagery decisions.

**Step 2 — Composition intent (written first, drives everything else)**
Decide what the entire ad is *about* as a single emotional experience. Not "a cruise ad for board gamers" — but something like: "The feeling of finding your people at sea — a quiet table, a game half-finished, someone you didn't know yesterday refilling your coffee." One paragraph. This is `compositionIntent`.

**Step 3 — Image slot story arc**
For each image slot in the template (by name, from `templateSlots`), assign a specific narrative role and mood cue. The slots must form a coherent visual sequence — not random selections from the same pool. Think about:
- What does the viewer see first vs. last?
- Which slot is the emotional anchor vs. the supporting context?
- Does the arc build tension, then release? Or establish place, then invite?

**Step 4 — Copy that responds to the imagery**
Only after the image arc is defined, write the headline. The headline must **complete or create tension with** the collective mood of the imagery — not simply describe the campaign theme. A headline that could work on any cruise ad is wrong. A headline that only makes full sense *with this specific arrangement of images* is right.

**Step 5 — Validate the whole**
Check: does the headline make the images sharper? Do the images make the headline feel earned? Does the CTA feel like the natural conclusion of what came before? If any element is redundant or disconnected, revise before outputting.

### Copy constraints (deterministic — baked into prompt JSON)

1. Headline **must** use a concrete sensory or temporal anchor from `nicheSignals` or `propFamilies`.
2. Headline **must not** exceed 50 characters. **Must not** end with a period.
3. Headline **must not** contain any term from `avoidDirectives`.
4. Headline **must respond to the imagery** — it must not be generic campaign description.
5. CTA **must** be imperative voice, max 20 chars.
6. Each `imageSlotDirective.narrativeRole` **must** be unique — no two slots can have the same stated role.
7. Each `imageSlotDirective.assetType` **must** be drawn from the available inventory (`availableImages[type] > 0`).

### Quality gate before render

Before any render is attempted, the generated `AdCopySet` should pass a lightweight structured review pass. This is where we prevent "technically valid but emotionally generic" output from reaching the template renderer.

Required checks:

1. **Specificity** — uses campaign-true sensory details from the brief/dossier, not generic cruise language.
2. **Image-copy dependency** — headline feels sharper *because of* the selected image arc; it should not stand alone as a generic slogan.
3. **Non-genericity** — if the same copy could run on a random Caribbean cruise ad, it fails.
4. **Visual arc coherence** — image slots tell a sequence or composition story rather than acting as redundant filler.
5. **CTA fit** — CTA feels like the natural conclusion of the ad's mood and promise.
6. **Compliance** — no forbidden terms, no accidental payment implication, no promise the campaign cannot operationally support.
7. **Slot fit** — per-template text budgets (`maxChars`, `maxWords`, `maxLines`), forbidden logistics, unique slot roles, and asset availability all pass.

If the review pass fails, regenerate once with the failure reasons injected. Do not loop indefinitely.

### Prompt structure (JSON-in, JSON-out)

Assembled programmatically in `copy-forge/prompt.ts`. The `templateSlots` and `availableImages` fields are deterministically injected from the registry and manifest — never guessed or inferred by the LLM.

```json
{
  "task": "Design a complete ad composition for each requested format. Think holistically — copy and imagery together as one unified story. Follow the 5-step reasoning sequence exactly.",
  "reasoning_sequence": [
    "1. Identify 3 specific, sensory, niche-true details from the campaign world",
    "2. Write compositionIntent — the single emotional experience this ad delivers",
    "3. Assign imageSlotDirectives — one narrative role + mood cue per named slot, forming a visual arc",
    "4. Write headline that responds to and completes the imagery arc",
    "5. Validate: does every element earn its place? Does removing any one element weaken the whole?"
  ],
  "campaign": {
    "name": "...",
    "vessel": "...",
    "route": "...",
    "departure": "...",
    "theme": "...",
    "elevatorPitch": "...",
    "heroSlogan": "...",
    "avoidDirectives": ["..."],
    "propFamilies": ["..."],
    "nicheSignals": ["..."],
    "emotionalPromise": "...",
    "energyMode": "..."
  },
  "formats": [
    {
      "format": "story_reel",
      "layout_description": "Vertical film strip collage: left stacked image strip, full-canvas atmospheric background, large hero image, oversized short theme headline on gray overlay, compact theme promise beneath, tiny sensory label near the lower overlay.",
      "slots": [
        { "name": "microcopy",        "type": "text",  "visualOrder": 1, "zone": "header" },
        { "name": "background-image", "type": "image", "visualOrder": 2, "zone": "hero" },
        { "name": "hero_image",       "type": "image", "visualOrder": 3, "zone": "hero" },
        { "name": "tile_image_1",     "type": "image", "visualOrder": 4, "zone": "tile_grid" },
        { "name": "tile_image_2",     "type": "image", "visualOrder": 5, "zone": "tile_grid" },
        { "name": "tile_image_3",     "type": "image", "visualOrder": 6, "zone": "tile_grid" },
        { "name": "tile_image_4",     "type": "image", "visualOrder": 7, "zone": "tile_grid" },
        { "name": "headline",         "type": "text",  "visualOrder": 8, "zone": "overlay" },
        { "name": "subhead",          "type": "text",  "visualOrder": 9, "zone": "overlay" }
      ]
    }
  ],
  "available_images": {
    "scene_image": 12,
    "ship_reference": 5,
    "aesthetic_concept": 6,
    "still": 8,
    "hero": 1,
    "merch": 2
  },
  "constraints": {
    "headline_max_chars": 50,
    "headline_no_period": true,
    "headline_must_use_niche_anchor": true,
    "headline_must_respond_to_imagery": true,
    "cta_max_chars": 20,
    "cta_must_be_imperative": true,
    "image_slot_roles_must_be_unique": true,
    "image_slot_asset_type_must_be_available": true
  },
  "output_schema": { "...": "Zod schema injected here" }
}
```

All conditional logic (which formats to include, which slots to pass, available image counts) is handled in `copy-forge/prompt.ts` **before** the prompt is sent. The LLM receives a fully resolved, deterministic instruction set.

---

## 7. Template Registry

`lib/ads/template-registry/templates.json` is the **single point of coordination** between your Canva designs and the render pipeline.

### Schema

```json
{
  "group_campaign": {
    "travel_nostalgia": {
      "story_reel": {
        "templated_id": "b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e",
        "templated_id_previous": null,
        "dimensions": { "width": 1080, "height": 1920 },
        "layout": {
          "description": "Vertical film strip collage: left stacked image strip, full-canvas atmospheric background, large hero image, oversized short theme headline on gray overlay, compact theme promise beneath, tiny sensory label near the lower overlay.",
          "slotDescriptors": [
            { "name": "microcopy", "type": "text", "visualOrder": 1, "zone": "header", "maxChars": 22, "maxWords": 5, "maxLines": 1, "copyRole": "Tiny sensory caption", "disallow": ["date", "port", "ship", "route"] },
            { "name": "background-image", "type": "image", "visualOrder": 2, "zone": "hero", "copyRole": "Atmospheric canvas" },
            { "name": "hero_image", "type": "image", "visualOrder": 3, "zone": "hero", "copyRole": "Primary human niche moment" },
            { "name": "tile_image_1", "type": "image", "visualOrder": 4, "zone": "tile_grid", "copyRole": "Niche action detail" },
            { "name": "tile_image_2", "type": "image", "visualOrder": 5, "zone": "tile_grid", "copyRole": "Social or group cue" },
            { "name": "tile_image_3", "type": "image", "visualOrder": 6, "zone": "tile_grid", "copyRole": "Prop or texture close-up" },
            { "name": "tile_image_4", "type": "image", "visualOrder": 7, "zone": "tile_grid", "copyRole": "Cruise-native context" },
            { "name": "headline", "type": "text", "visualOrder": 8, "zone": "overlay", "maxChars": 18, "maxWords": 3, "maxLines": 2, "copyRole": "Large red emotional hook", "disallow": ["date", "port", "ship", "route"] },
            { "name": "subhead", "type": "text", "visualOrder": 9, "zone": "overlay", "maxChars": 56, "maxWords": 10, "maxLines": 2, "copyRole": "Small supporting promise", "disallow": ["date", "port", "ship", "route"] }
          ]
        }
      },
      "ig_square": { "...": "layout descriptor goes here" },
      "fb_google_display": { "...": "layout descriptor goes here" },
      "carousel": { "pages": 4, "...": "one layout descriptor per page" }
    },
    "editorial_magazine": { "...": "..." },
    "indie_zine": { "...": "..." },
    "modern_brand": { "...": "..." }
  },
  "cb_deal": {
    "modern_brand": { "...": "..." }
  }
}
```

### Fail-fast validation

On app startup (or `/tests/canva-ads` page load), `template-registry/validator.ts`:

1. Calls `GET /v1/templates/{id}/layers` (Templated.io) for each template in registry.
2. Diffs the response against all `slotDescriptors[].name` values in the registry `layout`.
3. **Throws** if any slot in the registry is missing from the Templated.io template, or vice versa.

This ensures you never silently render a partially filled ad.

---

## 8a. Image Source Strategy

Ad template image slots are filled **primarily from assets already generated by the production bible pipeline**. The ad pack should behave like a curation-aware consumer of the manifest, not a parallel image system.

### Production bible asset sections and their ad slot roles

| Manifest section | Asset type tag | Typical ad slot role |
|---|---|---|
| `manifest.images.sceneImages` | `scene_image` | Collage tiles, atmospheric backgrounds |
| `manifest.images.shipReferences` | `ship_reference` | Hero / main focal image (ship-faithful, real photo) |
| `manifest.images.hero` | `hero` | Hero image fallback |
| `manifest.images.aestheticConcepts` | `aesthetic_concept` | Mood / texture tiles |
| `manifest.images.stills` | `still` | Close-up detail tiles |
| `manifest.images.merch` | `merch` | Merch-focused tile (where applicable) |

### Resolution priority (in order)

1. `sceneImages` — most diverse pool, best for multi-tile templates
2. `shipReferences` — SerpAPI real-ship photos — preferred for `hero_image` slot (trust signal)
3. `hero` — campaign hero render
4. `aestheticConcepts` — watercolor / themed stills
5. `stills` — production bible still library
6. `merch` — only if explicitly hinted

The image-uploader selects **distinct images** per slot (no duplicates within one render). If two tile slots would resolve to the same asset, the second slot advances to the next candidate in the same pool, then to the next pool.

Selection order inside each pool should prefer:

1. `active === true`
2. Human-approved or auto-approved assets over unresolved ones
3. Assets not marked rejected / revision required / hold
4. Best tag or context match for that slot's narrative role
5. Higher-priority assets when curation metadata exists

This keeps a beautiful template from being fed weak or already-questioned source material.

**Image pool depth (typical completed campaign):**

| Pool | Typical count |
|---|---|
| `sceneImages` | 8–16 |
| `shipReferences` | 3–8 |
| `aestheticConcepts` | 4–8 |
| `stills` | 6+ |
| `hero` | 1–2 |

A template with 8–10 image slots will be satisfied in the vast majority of cases without touching the on-demand fallback. Image-heavy templates are the expected design pattern.

### On-demand generation fallback

If a required image slot has **no match** in any pool after exhausting the priority list:

- The image-uploader does **not** silently fall back to a stock image (per no-mock rule).
- It triggers a **targeted single-image generation** via the existing production bible image pipeline (`generateSingleSceneImage(slug, sceneSpec)`) — the same models and prompts that produced `sceneImages`, but scoped to one shot spec derived from the brief's `cruiseNativeMoments`.
- The newly generated asset is saved to `manifest.images.sceneImages` and used for the slot.
- This only fires when a slot genuinely has no match — for most campaigns with a completed production bible, it will never be needed.

### CB Deals — no production bible available

CB Deals do not run the full production bible pipeline. For deal ad rendering:
- `hero_image` slot is filled from the deal's `imageUrl` (CB API field).
- Tile slots use images from a **shared deal asset pool** (deal category + cruise line images, stored separately).
- No on-demand generation is triggered for deals.

---

## 8. Provider Interface

The render step is behind a clean interface so the Group orchestrator and CB Deals workflow never reference Templated.io directly:

```ts
// lib/ads/providers/provider.ts
export interface AdRenderProvider {
  readonly name: 'templated' | 'canva_autofill' | 'satori_legacy';

  uploadImage(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<{ ref: string }>;           // returns Templated.io image URL or asset_id

  render(input: {
    templateRef: TemplateRef;
    slots: Record<string, SlotValue>;
  }): Promise<{
    pngBuffer: Buffer;
    width: number;
    height: number;
    providerJobId: string;
  }>;
}
```

Active provider is selected at runtime:

```ts
// lib/ads/config.ts
export const AD_RENDER_PROVIDER = process.env.AD_RENDER_PROVIDER ?? 'satori_legacy';
// values: 'templated' | 'satori_legacy' | 'canva_autofill'
```

Switching from `satori_legacy` to `templated` is a single env var change — no code changes.

---

## 9. Slot Naming Contract

Every template you design in Canva must use these exact layer names for the variable elements. Rename them in Templated.io after import.

### Text slots

| Slot name | Max chars | Role |
|---|---|---|
| `headline` | 50 | Primary hook. No period. Must contain a niche anchor. |
| `subhead` | 80 | Clarifier — what / where / when |
| `microcopy` | 30 | Eyebrow / badge / sticker label |
| `cta` | 20 | Imperative action phrase |
| `vessel` | 30 | Ship name (auto-injected, not Copy Forge) |
| `route` | 40 | Destination string (auto-injected) |
| `departure` | 30 | Date string (auto-injected) |
| `page_title` | 40 | Carousel per-page heading |
| `page_body` | 120 | Carousel per-page body |

### Image slots

| Slot name | Role |
|---|---|
| `hero_image` | Main focal / background image |
| `tile_image_1` … `tile_image_N` | Collage / multi-photo layout tiles — no cap on N. Use as many as the template requires. |
| `page_image` | Carousel per-page image |
| `background-image` | Full-canvas structural background image if the design uses one |

### Color slot

| Slot name | Role |
|---|---|
| `accent_color` | Hex string from `tokens.accentHex` — injected from campaign identity, not Copy Forge |

Only include slots your template actually uses. The registry `slots[]` array is the contract — if a slot is listed there, it **will** be filled.

---

## 10. Current Template — First Design (Story/Reel)

**Template:** `IG_temp_1` (1080 × 1920)  
**Templated.io ID:** `b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e`  
**Visual flavor target:** `travel_nostalgia` (System 2 — postcard/collage aesthetic)  
**Format:** `story_reel`

**Current raw slot names (as imported from Canva):**

| Raw name | Rename to |
|---|---|
| `heading` | `headline` |
| `title` | `microcopy` |
| `paragraph` | `subhead` |
| `photo-1` | `hero_image` |
| `photo-3` | `tile_image_1` |
| `photo-4` | `tile_image_2` |
| `file-frame-4` | `tile_image_3` |
| `file-frame-5` | `tile_image_4` |
| `background-image` | `background-image` |

**Action required (you):** Rename these 9 variable layers inside the Templated.io layer editor, then save. Do not keep `film_frame_6` in the contract; it was a mistaken layer and should be removed from the live template or left out of the registry entirely. This makes the template registry-ready.

**Registry entry to add after rename:**

```json
"group_campaign": {
  "travel_nostalgia": {
    "story_reel": {
      "templated_id": "b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e",
      "templated_id_previous": null,
      "dimensions": { "width": 1080, "height": 1920 },
      "layout": { "description": "...", "slotDescriptors": [ "...(see Section 7 schema)" ] }
    }
  }
}
```

---

## 11. Integration Into the Existing Orchestrator

The existing orchestrator at `lib/campaigns/media/media-orchestrator.ts:520-528` calls `generateDesignedAdArtifactPack()`. That function is modified minimally:

```ts
// lib/campaigns/media/generators/ad-artifact-generator.ts
import { renderAdPack } from '@/lib/ads';
import { AD_RENDER_PROVIDER } from '../media-pipeline-config';

export async function generateDesignedAdArtifactPack(slug, brief, campaign) {
  if (AD_RENDER_PROVIDER === 'satori_legacy') {
    return legacySatoriGeneratePack(slug, brief, campaign); // existing code, renamed
  }
  return renderAdPack({
    slug,
    workflow: 'group_campaign',
    brief,
    campaign,
    dossier: await loadDossier(slug),
  });
}
```

Return shape stays `{ documentaryDetails, designedAds, tokens }`. The orchestrator's 8 lines of wiring code do not change.

`documentaryDetails` should usually return empty (`[]`) when Templated.io is active, but this is an implementation choice, not a manifesto. Existing `documentaryDetails` records remain valid manifest ingredients for other consumers. The Templated path simply stops depending on freshly generated documentary modules unless a future template explicitly calls for them.

---

## 12. CB Deals Reuse

The CB Deals workflow is completely separate from group campaigns. It reuses `lib/ads/` by:

1. Writing a thin adapter `lib/cb/deal-to-brief.ts` that converts a `CbDeal` into the minimal `CopyForgeInput` shape.
2. Calling `renderAdPack({ workflow: 'cb_deal', ... })`.
3. Registering CB Deal templates under `templates.json["cb_deal"]`.

No duplication of Copy Forge logic, provider code, or slot contracts.

```ts
// lib/cb/deals-ad-generator.ts (new, thin)
import { renderAdPack } from '@/lib/ads';
import { dealToAdInput } from './deal-to-brief';

export async function generateCbDealAdPack(deal: CbDeal) {
  return renderAdPack(dealToAdInput(deal));
}
```

---

## 13. Manifest Impact

**One small schema change is recommended.** If we want truthful provenance on saved ad assets, add `'templated'` to `GeneratorServiceEnum`. Otherwise the system has to keep pretending a Templated render was generated by `'sharp'`, which makes provenance worse.

Ads continue to write into:

- `manifest.images.designedAdArtifacts` — final PNGs with:
  - `generator: 'templated'` once the enum is updated
  - Provider tags like `provider:templated`, `workflow:group_campaign`, `format:story_reel`
  - Legacy compatibility tags that downstream code already expects, such as `google_display`, `instagram_square`, `square_1x1`, `story_reel`, etc.

- `manifest.images.documentaryDetails` — only populated when `satori_legacy` is active. Not written by the Templated.io path.

Distribution planner already selects assets by tags, but some downstream code paths also expect existing legacy format tags by exact name. New tags should be additive, not replacements.

Review UI (`app/(tests)/tests/media-generation/media-review-panel.tsx`) renders both sections from the manifest — unchanged.

---

## 14. Test Surface

Per the project rule: new UI-backed features live in `/tests/` first.

### `/tests/canva-ads` (new page)

1. Pick a campaign from a dropdown.
2. Pick a creative territory / template family and a format (`ig_square`, `story_reel`, etc.).
3. See the generated `AdCopySet`, quality-gate verdict, and per-slot image reasoning.
4. Compare 2-3 copy directions or image resolutions side-by-side before choosing one.
5. Hit "Render" → shows the PNG inline.
6. "Save to manifest" button writes the `AssetRecord` (disabled until render succeeds).

This page is the acceptance gate before each new template is promoted into the orchestrator. It should function as a **creative audition room**, not just a render button.

### Unit tests — `lib/ads/__tests__/`

- `copy-forge.test.ts` — validates schema compliance on 3 real campaign briefs. Checks length constraints and quality-gate outputs pass.
- `render-pack.test.ts` — mocks `AdRenderProvider`, asserts that slot mapping from `AdCopySet` → provider call is correct for each format.
- Registry validator test — asserts that a slot mismatch (registry vs template) throws.

---

## 15. Phased Implementation

| Phase | Deliverable | Your action | My action | Gate |
|---|---|---|---|---|
| **P1** | `lib/ads/copy-forge/` scaffold + `/tests/canva-ads` showing copy + quality gate (no render) | None | Build Copy Forge + test page | Output is specific, non-generic, and passes the review rubric on 2 real campaigns |
| **P2** | First template ready in Templated.io | Rename slots in `IG_temp_1`, confirm manual render passes, share template_id | Add registry entry | Manual render in Templated.io UI looks correct |
| **P3** | `providers/templated.ts` + image uploader + end-to-end render in test page | Provide `TEMPLATED_API_KEY` env var | Implement provider | PNG returns in < 5s and selected assets respect manifest curation state |
| **P4** | Full static distribution matrix (1 visual system) | Design the 7 precise P4 canvases: Meta 1:1, Meta 4:5, Meta 9:16, Meta carousel 1:1, Google 1.91:1, Google 1:1, Google 9:16 | Wire all 7 precise format keys into registry + test page | Full static pack renders from one campaign with compatible downstream tags |
| **P5** | Orchestrator integration | — | Swap `ad-artifact-generator.ts`, add `AD_RENDER_PROVIDER` flag, test full pipeline run | End-to-end campaign run produces Templated ads in review UI with truthful provenance |
| **P6** | Additional visual systems (Systems 1, 3, 4) | Design remaining template families | Registry + test page | Visual-system-sweep regression page covers all |
| **P7** | CB Deals adapter | — | `deal-to-brief.ts` adapter + `/tests/cb-deal-ads` page | One real CB deal renders all 4 formats |

Each phase ends with a checkpoint commit: `"checkpoint: before <next phase>"`.

---

## 16. Environment Variables

Add to `.env.local` (never committed, never Vercel):

```
TEMPLATED_API_KEY=<from Templated.io account settings>
AD_RENDER_PROVIDER=satori_legacy      # change to 'templated' when ready
```

Model routing note:

- Default Copy Forge routing should go through the LLM gateway task map, ideally as `modelForTask('creative')` or a dedicated `ad_copy_forge` task.
- Only add `AD_COPY_FORGE_MODEL` as a temporary local override if we explicitly need to audition or debug model behavior.

---

## 17. Immediate Next Steps

**You (right now):**
1. In Templated.io, open template `b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e`.
2. Rename the 9 variable layers as listed in Section 10, and do not include `film_frame_6` in the contract.
3. Manually fill them with test copy + any cruise image URLs.
4. Click *Generate Render* and confirm the output looks right.

**Me (when you give the go-ahead):**
1. Scaffold `lib/ads/copy-forge/` + `lib/ads/types.ts`.
2. Build `/tests/canva-ads` as a creative audition page showing copy output + quality gate (no Templated key needed).
3. Validate Copy Forge produces specific, campaign-native lines on 2 real campaigns.

Then we proceed to P3.

---

## 18. Coordination Checklist

Use this as the operating checklist so we can move cleanly from planning into execution.

### Start Here

1. `You`: open the first Templated.io template and rename the 9 variable layers.
2. `You`: confirm the manual render looks correct with test copy and images.
3. `Me`: scaffold `lib/ads/` Copy Forge and the `/tests/canva-ads` audition page.
4. `Me`: wire the copy quality gate so we can reject generic output before render.

### Phase Ownership

1. **P1**
   - `You`: review the first copy directions and tell us which territory feels strongest.
   - `Me`: build the copy engine, quality rubric, and preview page.
2. **P2**
   - `You`: do the Templated.io slot rename and manual sanity check.
   - `Me`: add the registry entry and validate slot matching.
3. **P3**
   - `You`: provide `TEMPLATED_API_KEY`.
   - `Me`: implement the provider, image uploader, and end-to-end render flow.
4. **P4**
   - `You`: design or approve the first full visual system family.
   - `Me`: wire the full four-format pack into the registry and test page.
5. **P5**
   - `You`: review the first live campaign pack before we flip the flag broadly.
   - `Me`: swap the orchestrator path and verify the manifest/provenance output.
6. **P6**
   - `You`: approve new visual systems only after the first family feels right.
   - `Me`: add the remaining template families and regression coverage.
7. **P7**
   - `You`: only if CB Deals should enter the same ad engine now.
   - `Me`: build the deal adapter and the deal test page.

### Practical Rule

If a step needs taste, vendor UI interaction, or a product call, it lands with you. If it is wiring, validation, or repeatable implementation, it lands with me.
