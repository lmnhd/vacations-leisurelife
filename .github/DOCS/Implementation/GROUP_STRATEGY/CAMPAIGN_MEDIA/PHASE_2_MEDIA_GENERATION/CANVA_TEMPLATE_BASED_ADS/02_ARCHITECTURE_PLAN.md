# Architecture Plan — Template-Based Ad Module

This document defines **what gets built**, **where it lives**, and **how it plugs into the existing media pipeline without disturbing upstream stages**.

---

## Design principles

1. **Isolation.** New code lives in `lib/ads/`, not under `lib/campaigns/`. Group orchestrator imports it; future CB Deals workflow also imports it. Nothing in `lib/ads/` may import from `lib/campaigns/`.
2. **Provider-agnostic.** A single `AdRenderProvider` interface; `templated` is the first implementation, `canva_autofill` and `satori_legacy` are siblings.
3. **Drop-in replacement.** Replaces the existing `designed_ad_artifact` job in `media-orchestrator.ts` behind a config flag. Upstream brief/discovery/identity stages are untouched.
4. **Structured outputs only.** Copy Forge uses `lib/campaigns/brief-engine/structured-generation.ts` (or its `lib/ads/` re-export). No agent loops. No free-form prompts.
5. **Stateless renders.** Each render is `(template_id, slot_values) -> PNG_url`. No session state at the provider.
6. **Determinism via the registry.** Template choice = `(workflow, visualFlavor, format)` is a lookup, never an LLM decision.

---

## Module layout

```
lib/ads/
├── README.md
├── types.ts                          # AdFormat, AdCopySet, SlotValue, RenderResult
├── copy-forge/
│   ├── index.ts                      # generateCopySetForCampaign(input) -> AdCopySet
│   ├── prompt.ts                     # JSON-structured prompt template
│   └── schema.ts                     # Zod schema for AdCopySet
├── template-registry/
│   ├── index.ts                      # lookupTemplate(workflow, visualFlavor, format) -> TemplateRef
│   ├── templates.json                # source-of-truth registry (id, slots, dimensions)
│   └── slot-contracts.ts             # SlotContract types per format (see 03_TEMPLATE_SPEC.md)
├── providers/
│   ├── provider.ts                   # AdRenderProvider interface
│   ├── templated.ts                  # Templated.io implementation
│   ├── canva-autofill.ts             # stub (throws "not configured")
│   └── satori-legacy.ts              # adapter around current lib/campaigns/design-system renderer
├── image-uploader.ts                 # uploads source images to provider, returns provider asset URL/ID
├── render-pack.ts                    # orchestrates copy forge → upload → render → return PNG buffers
└── __tests__/
    ├── copy-forge.test.ts
    └── render-pack.test.ts
```

### Public surface (everything else imports only these)

- `lib/ads/index.ts` re-exports:
  - `generateCopySetForCampaign`
  - `renderAdPack`
  - `AdFormat`, `AdCopySet`, `AdRenderResult`, `AdPackInput`
  - `getActiveProvider()` (reads env)

---

## Data flow

```
Campaign Brief ──┐
                 ├──► CopyForge (1 LLM call) ──► AdCopySet {format: {slots: {...}}}
Dossier  ────────┘                                       │
                                                         ▼
                                       TemplateRegistry.lookup(workflow, flavor, format)
                                                         │
                                                         ▼
                                       For each format:
                                         1. Resolve image slots → upload to provider (get asset refs)
                                         2. Provider.render(template_id, slots) → PNG URL
                                         3. Fetch PNG → Buffer
                                                         │
                                                         ▼
                            storeAsset() + saveAssetRecord()   (same media-store as today)
                                                         │
                                                         ▼
                            manifest.images.designedAdArtifacts (unchanged section)
```

---

## Copy Forge contract

**One LLM call per campaign produces all formats at once.** Cheaper, more consistent voice across IG / FB / Story / Carousel.

### Input
```ts
interface CopyForgeInput {
  brief: CampaignAestheticBrief;           // already-approved, from brief-engine
  dossier: CampaignDossier | null;         // upstream research
  campaign: Campaign;                       // ship, route, dates
  workflow: 'group_campaign' | 'cb_deal';
  formats: AdFormat[];                      // which formats to generate copy for
  visualFlavor: VisualFlavor;               // used as voice hint, not template pick
}
```

### Output (Zod-validated)
```ts
interface AdCopySet {
  voiceNotes: string;                       // one-liner brand voice anchor used internally
  formats: {
    ig_square: SlotPack;
    fb_google_display: SlotPack;
    story_reel: SlotPack;
    carousel: SlotPack[];                   // one SlotPack per carousel page
  };
}

interface SlotPack {
  headline: string;                         // max 50 chars - catchy hook
  subhead?: string;                         // max 80 chars - clarifier
  microcopy?: string;                       // max 30 chars - badge/eyebrow
  cta: string;                              // max 20 chars
  imageHints: string[];                     // which source images to prefer (asset tags / kinds)
}
```

Length limits are **enforced in the schema** so templates never overflow.

### Prompt rules

- All instructions are deterministic (per user rule: no conditional logic in AI prompts).
- Prompt is assembled programmatically from brief + dossier slices (per user rule: separate AI logic from main logic; JSON-structured input).
- Output is JSON only (use existing `structured-generation.ts` pattern with native structured outputs).
- "Catchy" is operationalized as 3 constraints:
  1. Headline must contain a concrete sensory or temporal anchor from `dossier.nicheSignals` or `brief.identityBlueprint.propFamilies`.
  2. Headline must avoid the campaign `avoidDirectives` list.
  3. Headline must not be longer than 50 chars and must not be a full sentence (no period).

---

## Template Registry

`lib/ads/template-registry/templates.json` is hand-edited:

```json
{
  "group_campaign": {
    "travel_nostalgia": {
      "ig_square":         { "templated_id": "tpl_abc123", "slots": ["headline", "subhead", "cta", "hero_image", "accent_color"] },
      "fb_google_display": { "templated_id": "tpl_def456", "slots": ["headline", "cta", "hero_image"] },
      "story_reel":        { "templated_id": "tpl_ghi789", "slots": ["headline", "microcopy", "cta", "hero_image", "accent_color"] },
      "carousel":          { "templated_id": "tpl_jkl012", "slots": ["headline", "subhead", "page_image"], "pages": 4 }
    }
  },
  "cb_deal": { "...": "same shape" }
}
```

The registry is the **single point of coordination** between the Canva templates you design and the code that fills them. If a Canva template uses slot `hero_image`, the registry entry must list `hero_image`. If they diverge, the loader throws on startup (fail-fast).

---

## Provider interface

```ts
// lib/ads/providers/provider.ts
export interface AdRenderProvider {
  readonly name: 'templated' | 'canva_autofill' | 'satori_legacy';

  uploadImage(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<ProviderAssetRef>;

  render(input: {
    templateRef: TemplateRef;
    slots: Record<string, SlotValue>; // text | image | color
  }): Promise<{ pngBuffer: Buffer; width: number; height: number; providerJobId: string }>;
}
```

`templated.ts` calls the Templated.io REST API. `satori-legacy.ts` calls the existing `renderDesignedAdArtifact` — preserves a zero-cost fallback if Templated.io is unreachable.

---

## Integration into the existing orchestrator

The change at the orchestrator site is **a single function swap**, behind a flag:

```ts
// lib/campaigns/media/generators/ad-artifact-generator.ts (modified)
import { renderAdPack } from '@/lib/ads';
import { AD_RENDER_PROVIDER } from '../media-pipeline-config';

export async function generateDesignedAdArtifactPack(slug, brief, campaign) {
  if (AD_RENDER_PROVIDER === 'satori_legacy') {
    return legacyGenerateDesignedAdArtifactPack(slug, brief, campaign); // existing code, renamed
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

The return shape stays `{ documentaryDetails, designedAds, tokens }` so `media-orchestrator.ts:520-528` does not change.

`documentaryDetails` becomes optional/empty when the Templated provider is active — Canva templates own their own background imagery, so the documentary detail module pipeline can be skipped (or kept on-demand if a template's `hero_image` slot references one).

---

## Config flags

In `lib/campaigns/media/media-pipeline-config.ts` (or new `lib/ads/config.ts`):

```ts
AD_RENDER_PROVIDER = 'templated' | 'satori_legacy' | 'canva_autofill';   // default 'satori_legacy'
AD_COPY_FORGE_MODEL = 'gpt-5-medium';                                     // same gateway as identity-blueprint AI classifier
TEMPLATED_API_KEY  = process.env.TEMPLATED_API_KEY;
TEMPLATED_BASE_URL = 'https://api.templated.io';
```

Per the local-only campaign-building rule, these run from local dev; no Vercel.

---

## Manifest impact

Zero schema changes. We continue to write into:

- `manifest.images.designedAdArtifacts` (final ad PNGs — now with `generator: 'templated' | 'canva_autofill' | 'sharp'`)
- `manifest.images.documentaryDetails` (only when satori_legacy or when a template references one)

`AssetRecord.tags` will gain three new tag families:
- `provider:templated`
- `format:ig_square` / `format:fb_google_display` / `format:story_reel` / `format:carousel`
- `workflow:group_campaign` / `workflow:cb_deal`

Distribution planner already filters by tags (`lib/campaigns/distribution-planner.ts`), so no planner changes are required.

---

## CB Deals reuse

The CB Deals workflow (separate from groups, see `lib/cb/`) imports the same `lib/ads/` module:

```ts
const copy = await generateCopySetForCampaign({
  workflow: 'cb_deal',
  brief: dealAsBrief(deal),       // small adapter from CbDeal → minimal brief shape
  dossier: null,
  campaign: dealAsCampaign(deal),
  formats: ['ig_square', 'fb_google_display', 'story_reel'],
  visualFlavor: 'modern_brand',
});
const pngs = await renderAdPack({ ...copy, workflow: 'cb_deal' });
```

A thin `lib/cb/deal-to-brief.ts` adapter is the only CB-side code needed. No duplication of render or copy logic.

---

## Test surface

Per the user rule: validate in `/tests/` first.

- `app/(tests)/tests/canva-ads/page.tsx` — pick campaign → pick format → preview AdCopySet (editable) → render → see PNG. No DB writes until "Save to manifest" is pressed.
- Unit tests in `lib/ads/__tests__/`:
  - Copy Forge produces schema-valid output for 3 reference briefs.
  - Render Pack mocks the provider, asserts slot mapping.
  - Registry mismatch (slot in template but not in registry) throws on init.

---

## Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **P1** | `lib/ads/copy-forge/` + `/tests/canva-ads` page rendering copy only (no images) | Catchy lines look right on 2 real campaigns |
| **P2** | 1 Canva template (IG Square, System 2) hand-designed + imported to Templated.io + registry entry | Manual render works in Templated.io UI |
| **P3** | `providers/templated.ts` + image upload + end-to-end `/tests/canva-ads` render | PNG returns < 5s |
| **P4** | All 4 formats × 1 visual system | Full pack renders cleanly |
| **P5** | Wire into orchestrator behind `AD_RENDER_PROVIDER` flag | One full campaign run succeeds end-to-end |
| **P6** | Remaining visual systems (1 → 3) | Visual-system-sweep regression page covers all |
| **P7** | CB Deals adapter + separate `/tests/cb-deal-ads` page | One real CB deal renders all formats |

Each phase is a single checkpoint commit per user rule.
