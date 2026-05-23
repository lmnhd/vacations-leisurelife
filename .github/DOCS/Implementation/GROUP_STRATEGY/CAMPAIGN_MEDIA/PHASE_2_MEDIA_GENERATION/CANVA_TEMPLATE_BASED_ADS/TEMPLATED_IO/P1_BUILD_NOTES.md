# P1 Build Notes — `lib/ads/` Foundation + `/tests/canva-ads`

**Built:** 2026-05-20
**Status:** P1 complete — Copy Forge + deterministic quality gate, no render.
**Spec:** [`MASTER_PLAN.md`](./MASTER_PLAN.md)

---

## What landed

P1 is the **creative-only** slice of the system described in MASTER_PLAN sections 5–6, 14, and 17. Render (P3) is intentionally out of scope. Everything below should function without a `TEMPLATED_API_KEY`.

### Module layout — `lib/ads/`

```
lib/ads/
├── index.ts                           ← public surface
├── types.ts                           ← AdFormat, AdCopySet, SlotPack, NormalizedAdInput, QualityGateResult, …
├── config.ts                          ← AD_RENDER_PROVIDER, TEMPLATED_API_KEY (consumed in P3), AD_COPY_FORGE_MODEL override
│
├── copy-forge/
│   ├── index.ts                       ← generateCopySet() — single structured LLM call + gate, regenerates once on failure
│   ├── prompt.ts                      ← deterministic JSON-in prompt assembler; injects template anatomy + image inventory
│   ├── schema.ts                      ← Zod schema enforcing length limits + role uniqueness at the model boundary
│   └── quality-gate.ts                ← runQualityGate() — 7 deterministic checks (specificity, non-genericity, …)
│
└── template-registry/
    ├── index.ts                       ← lookupTemplate, listTemplateLayouts, listRegistryEntries
    └── templates.json                 ← hand-maintained; seeded with IG_temp_1 (group_campaign / travel_nostalgia / story_reel)
```

Workflow-specific adapter (lives outside `lib/ads/` per MASTER_PLAN §5):

```
lib/campaigns/media/ad-pack-adapter.ts ← buildCampaignAdInput(brief, campaign, manifest, formats) -> NormalizedAdInput
```

### API + UI

```
app/api/ads/copy-forge/route.ts        ← POST: generate + gate. PUT: re-run gate against an existing AdCopySet.
app/(tests)/tests/canva-ads/page.tsx   ← creative audition page (no render)
```

The page is also wired into the test index ([`app/(tests)/tests/page.tsx`](../../../../../../../../app/(tests)/tests/page.tsx)) under **Media Generation → Canva Ads — Audition** with a `P1` badge.

---

## Contract decisions worth flagging

Every place I made a judgement call beyond verbatim MASTER_PLAN spec:

1. **Composition-first output shape.** The Zod schema (`copy-forge/schema.ts`) enforces `compositionIntent ≥ 40 chars` and `compositionNote ≥ 20 chars` per format. The model literally cannot produce a copy set without these, which forces it through MASTER_PLAN §6 step 2 + per-format composition planning.

2. **One regeneration max, then return best-of-two.** If pass 1 fails the gate, we re-call once with `PREVIOUS_ATTEMPT_FAILED_THESE_CHECKS:` injected. If pass 2 has fewer blockers, we keep it; otherwise we return pass 1 with the failed gate visible in the UI. Never loops. Matches §6 *"regenerate once with the failure reasons injected; do not loop indefinitely."*

3. **Quality gate is deterministic and runs server-side after the LLM call.** The seven checks in [`quality-gate.ts`](../../../../../../../../lib/ads/copy-forge/quality-gate.ts) match the rubric in MASTER_PLAN §6 *Quality gate before render*:
    - `specificity` — headline must reference a term from `nicheSignals ∪ propFamilies ∪ cruiseNativeMoments ∪ dossier.specificExamples`
    - `image_copy_dependency` — `compositionIntent` and every per-format `compositionNote` must be populated and substantive
    - `non_genericity` — regex pattern set covering ~9 generic cruise-brochure tropes (`set sail`, `unforgettable voyage`, …)
    - `visual_arc_coherence` — `narrativeRole` strings must be unique within a SlotPack (per-format, per-page for carousel)
    - `cta_fit` — first token of `cta` must be in the imperative-lead whitelist (`book`, `reserve`, `join`, …)
    - `compliance` — no banned `avoidDirectives` term appears in any slot's text
    - `slot_fit` — length limits, no-trailing-period on headline, asset-type availability vs `availableImages`

    The PUT endpoint lets the UI re-run the gate against an unchanged copy set so reviewers can confirm the rubric without paying for another LLM call.

4. **Image inventory comes from the manifest, not the brief.** `ad-pack-adapter.ts` reads counts from `manifest.images.{sceneImages, shipReferences, hero, aestheticConcepts, documentaryDetails}` and `manifest.merch.designs`. The `still` count temporarily maps to `documentaryDetails` because the live manifest has no first-class "still" pool yet — MASTER_PLAN §8a anticipates this, and the on-demand generation fallback (P3+) is the long-term cure.

5. **Model routing.** Copy Forge resolves through `modelForTask('creative')` via the LLM gateway. If the resolved model is not OpenAI (creative currently routes to Claude 4 Opus), it falls back to GPT-5-HIGH because `generateObject` from the AI SDK requires an OpenAI provider for structured output. A local override is available via `AD_COPY_FORGE_MODEL` for audition/debug per MASTER_PLAN §16.

6. **Visual flavor resolution.** `manualVisualFlavor` from the Campaign wins (operator-locked), then `identityBlueprint.visualFlavor`, then `travel_nostalgia` as the default — same precedence the landing page already uses.

7. **Templates.json bootstrap.** Only the IG_temp_1 entry from MASTER_PLAN §10 is registered. All other (workflow, flavor, format) tuples deliberately return `null` from `lookupTemplate`; the API returns 409 if none of the requested formats have a template, otherwise it runs Copy Forge for the subset that does and reports the rest as `skippedFormats`. The Templated.io slot rename in MASTER_PLAN §17 is still on the **You** side of the coordination checklist.

8. **No render code, no Templated.io SDK import.** Per the P1 gate. P2/P3 will add `providers/templated.ts`, `image-uploader.ts`, and `render-pack.ts`. The provider config (`AD_RENDER_PROVIDER`, `TEMPLATED_API_KEY`) is already wired in `config.ts` so P3 only adds files.

---

## How to verify locally

1. Make sure a campaign has an approved brief and a media manifest (use `/tests/brief-studio` if needed).
2. Open `/tests/canva-ads`.
3. Pick the campaign, leave **Story / Reel** selected, click **Run Copy Forge**.
4. Confirm the response includes:
    - A composition intent paragraph that reads like a directorial brief
    - A SlotPack with `headline ≤ 50`, `cta ≤ 20`, no trailing period on headline
    - One `imageSlotDirective` per image slot in IG_temp_1 (`hero_image`, `tile_image_1..4`) with distinct `narrativeRole`s
    - Quality gate verdict — green or red, with per-check explanations
5. Click **Re-run quality gate only** to re-evaluate without calling the LLM again.

A campaign with a non-`travel_nostalgia` visual flavor will currently 409 with a registry-empty message — that is expected until more templates are added.

---

## What is intentionally NOT done

- **No render.** No call to Templated.io, no PNG output, no asset upload, no manifest write.
- **No on-demand image fallback.** MASTER_PLAN §8a fallback to `generateSingleSceneImage` lands when the image uploader does (P3).
- **No unit tests.** `lib/ads/__tests__/` directory is empty; the page is the acceptance gate for P1 per MASTER_PLAN §14. Tests come with P3 when the surface stops changing under us.
- **No orchestrator integration.** `ad-artifact-generator.ts` still calls the satori path. P5 swaps that.
- **No CB Deals adapter.** P7 work.

---

## File index

| Path | Purpose |
|---|---|
| [`lib/ads/types.ts`](../../../../../../../../lib/ads/types.ts) | Public type surface — `AdFormat`, `AdCopySet`, `SlotPack`, `NormalizedAdInput`, etc. |
| [`lib/ads/config.ts`](../../../../../../../../lib/ads/config.ts) | Provider + model env-driven config |
| [`lib/ads/index.ts`](../../../../../../../../lib/ads/index.ts) | Public surface re-exports |
| [`lib/ads/copy-forge/index.ts`](../../../../../../../../lib/ads/copy-forge/index.ts) | `generateCopySet()` orchestrator |
| [`lib/ads/copy-forge/prompt.ts`](../../../../../../../../lib/ads/copy-forge/prompt.ts) | Deterministic prompt assembler |
| [`lib/ads/copy-forge/schema.ts`](../../../../../../../../lib/ads/copy-forge/schema.ts) | Zod schema for `AdCopySet` |
| [`lib/ads/copy-forge/quality-gate.ts`](../../../../../../../../lib/ads/copy-forge/quality-gate.ts) | Deterministic 7-check rubric |
| [`lib/ads/template-registry/index.ts`](../../../../../../../../lib/ads/template-registry/index.ts) | `lookupTemplate`, `listTemplateLayouts`, `listRegistryEntries` |
| [`lib/ads/template-registry/templates.json`](../../../../../../../../lib/ads/template-registry/templates.json) | Hand-maintained Canva/Templated.io template registry |
| [`lib/campaigns/media/ad-pack-adapter.ts`](../../../../../../../../lib/campaigns/media/ad-pack-adapter.ts) | Campaign → `NormalizedAdInput` adapter |
| [`app/api/ads/copy-forge/route.ts`](../../../../../../../../app/api/ads/copy-forge/route.ts) | POST: generate + gate. PUT: re-gate existing copy set. |
| [`app/(tests)/tests/canva-ads/page.tsx`](../../../../../../../../app/(tests)/tests/canva-ads/page.tsx) | Creative audition UI |

---

## Next phase — what unblocks P2

Per MASTER_PLAN §17, two things on your side:

1. In Templated.io, open template `b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e` and rename the eight raw slot names to the contract names in MASTER_PLAN §10 (`heading→headline`, `title→microcopy`, `paragraph→subhead`, `photo-1→hero_image`, …).
2. Manually run a render in Templated.io with test copy and any cruise URLs — confirm the layout looks the way you want.

Once those are done, P2 is mechanical: add the validator (`template-registry/validator.ts`) that hits `GET /v1/templates/{id}/layers` and diffs against `templates.json`. From there, P3 adds the Templated.io provider + image uploader + render flow on the same `/tests/canva-ads` page.
