# P3 Build Notes — Templated Render End-to-End

**Built:** 2026-05-22
**Status:** P3 complete — end-to-end render through Templated.io with manifest-backed image resolution and curation-state filtering.
**Spec:** [`MASTER_PLAN.md`](./MASTER_PLAN.md) §3, §8, §8a, §15 (P3)
**Predecessor:** [`P1_BUILD_NOTES.md`](./P1_BUILD_NOTES.md)

---

## P3 acceptance gate

> PNG returns in < 5s and selected assets respect manifest curation state.

Both halves are now wired:

1. **PNG render.** `POST /api/ads/render` runs Copy Forge's approved set through Templated.io's sync render endpoint and surfaces the resulting PNG URL inline on `/tests/canva-ads`. Templated typically returns in ~2s per format per their docs.
2. **Curation-state filtering.** Image slots are resolved against the live manifest through a governance-aware filter (rejected / revision_required / hold blocked per `manifest.governance`), then ranked by approval rank, slot tag match, global priority, and recency. No mock images, no silent stock fallback.

---

## Files added or rewritten in P3

```
lib/ads/
├── config.ts                          ← (modified) added TEMPLATED_API_BASE_URL; AD_RENDER_PROVIDER still defaults to 'satori_legacy'
├── types.ts                           ← (modified) added TemplatedRenderRequest / TemplatedLayerOverride / TemplatedRenderResponsePage / AdRenderPack / AdRenderResult / AdRenderImageSelection
├── index.ts                           ← (modified) re-exports renderWithTemplated, buildTemplatedRenderPacks, prepareRenderImageSource, TEMPLATED_API_BASE_URL, TEMPLATED_API_KEY
├── image-uploader.ts                  ← NEW — prepareRenderImageSource() — resolves manifest asset → publicly fetchable URL (rehosts internal URLs via R2 when available)
├── render-pack.ts                     ← NEW — buildTemplatedRenderPacks() — manifest asset selection + Templated layer-override assembly
└── providers/
    └── templated.ts                   ← NEW — renderWithTemplated() — POST https://api.templated.io/v1/render
```

```
app/
├── api/ads/render/route.ts            ← NEW — POST endpoint, schema-validates copy set, re-runs quality gate, renders, returns render groups
└── (tests)/tests/canva-ads/page.tsx   ← (modified) RenderPanel — fires /api/ads/render and renders the returned PNGs inline
```

---

## Architectural decisions worth flagging

1. **Provider abstraction lives where the contract is, not as a class.** `providers/templated.ts` exports a single async `renderWithTemplated(request)` function. The `AdRenderProvider` interface from MASTER_PLAN §8 is not yet codified because there's only one live implementation; if `canva-autofill.ts` or `satori-legacy.ts` lands, we promote the function signatures into a discriminated union or interface at that point. Premature abstraction is the bigger risk for now.

2. **Image resolution is governance-aware.** `lib/ads/render-pack.ts` consumes `manifest.governance` (defaulting to the MASTER_PLAN defaults if absent) and applies it at the pool-filter stage. An asset never reaches the scoring step if it's `rejected`, `revision_required`, or `hold` and the corresponding policy bit is on. This is the literal P3 gate language — *selected assets respect manifest curation state.*

3. **Asset scoring is layered, not a single score.** Ranking, in order: (a) approval rank — `human_approved` > `auto_approved` > `pending_review`; (b) "has all preferred tags from the directive"; (c) raw tag matches; (d) `curation.globalPriority`; (e) `createdAt` recency; (f) `assetId` for determinism. This matches MASTER_PLAN §8a *Selection order inside each pool*.

4. **Cross-slot uniqueness within a pack.** A `usedAssetIds` set is shared across all image slots inside a single render pack (and across pages for carousel), so the orchestrator never hands the same asset to two slots — exactly the constraint MASTER_PLAN §8a calls out ("image-uploader selects distinct images per slot").

5. **Image rehosting only when necessary.** `prepareRenderImageSource` passes external `https://...` URLs through unchanged. Internal `/api/groups/campaign/<slug>/media/asset-data/...` URLs are fetched and re-uploaded to R2 via `storeAsset()` so Templated can reach them. If R2 is not available in the local environment, we fall back to the public app URL — the caller's job to ensure that's reachable from `api.templated.io`.

6. **Quality gate re-runs server-side before render.** The page sends the previously-generated copy set up; the render route schema-validates it (`AdCopySetSchema.safeParse`) and runs the deterministic gate against the resolved input one more time. A copy set that fails the gate cannot reach Templated. This both defends the gate semantics and keeps clients honest — they can't bypass the gate just because P1 once said "pass."

7. **Sync render only.** `POST /v1/render` is called with `async: false`. Templated typically returns ~2s per format. Multi-format requests render in series — that's intentional for P3 to keep error surfaces simple. Parallel format rendering is a P4/P5 perf optimization once we have multiple template families to render.

8. **No manifest write yet.** The page surfaces returned PNG URLs but does not save them to `manifest.images.designedAdArtifacts`. MASTER_PLAN §14's "Save to manifest" button is the next acceptance gate; doing it now without the `'templated'` value in `GeneratorServiceEnum` (§13) would force us to lie about provenance, which is exactly the issue the plan calls out. Adding the enum value is a one-line schema change for P3.5 / P5.

---

## Page-side flow (`/tests/canva-ads`)

1. User picks a campaign + formats and clicks **Run Copy Forge** (P1 behavior — unchanged).
2. Quality gate verdict displays.
3. If gate passes, the new **Render with Templated** button enables.
4. Click → `POST /api/ads/render` with `{ slug, formats: supportedFormats, copySet }`.
5. Response contains a `renderGroups[]` array — one entry per rendered format with the rendered PNG URL, selected manifest assets, and the exact Templated request that produced it.
6. Each rendered PNG is displayed inline with a click-through to the full-resolution image; the selected-image chips below show which manifest asset filled each slot and whether it was rehosted.

If the gate did NOT pass, the render button stays disabled and a tooltip explains why. If `TEMPLATED_API_KEY` is missing, the server returns 503 with a specific message that the page surfaces directly.

---

## Manual verification

Validator update: the live `IG_temp_1` contract is now the 9-variable set in `templates.json`: `headline`, `subhead`, `microcopy`, `background-image`, `hero_image`, and `tile_image_1` through `tile_image_4`. Ignore the older 8-slot wording below; `film_frame_6` was a mistaken layer and must not be part of the contract.

Pre-reqs:
1. A campaign with an approved aesthetic brief + a media manifest that contains enough usable imagery for `background-image`, `hero_image`, and `tile_image_1` through `tile_image_4`.
2. `TEMPLATED_API_KEY` in `.env.local` (P3 user action per MASTER_PLAN §17).
3. The live variables inside the `b7e3e02a-...` Templated.io template renamed to match `templates.json`: `headline`, `subhead`, `microcopy`, `background-image`, `hero_image`, and `tile_image_1` through `tile_image_4`.

Run:

1. `npm run dev`
2. Open `/tests/canva-ads`
3. Pick a campaign, leave **Story / Reel** selected, click **Run Copy Forge**.
4. Confirm the quality gate passes (it should — same P1 flow).
5. Click **Render with Templated**.
6. Within ~5s, the page should display the returned PNG inline. The selected-image chips below list one `background-image -> <assetId>`, one `hero_image -> <assetId>`, and four `tile_image_N -> <assetId>` entries.
7. Click the PNG to open it in a new tab at full resolution.

If the manifest is empty or every candidate asset is curation-blocked, the render fails fast with a 500 + descriptive error (no usable manifest asset for slot X with assetType Y).

---

## What is still NOT done (rolling list)

- **No manifest write** — `manifest.images.designedAdArtifacts` not updated yet. Add `'templated'` to `GeneratorServiceEnum`, then wire `saveAssetRecord` from the render route. (Half-day; lands with P5 orchestrator swap or sooner if needed.)
- **No on-demand image fallback.** MASTER_PLAN §8a's `generateSingleSceneImage` is still TODO. Today, if a slot's `assetType` pool is empty, the render throws. A targeted single-scene generation is the long-term cure; right now you would re-run the production-bible pipeline manually.
- **No `template-registry/validator.ts`.** MASTER_PLAN §7 *Fail-fast validation* against `GET /v1/templates/{id}/layers`. Worth doing alongside the first second template (P4) so the validator covers more than one entry.
- **No unit tests in `lib/ads/__tests__/`.** Same posture as P1 — the page is the acceptance surface until P4/P5 stops the schema from churning. Render-pack image selection is the highest-value thing to test first.
- **Orchestrator integration (P5) not wired.** `ad-artifact-generator.ts` still calls `legacySatoriGeneratePack`. The flag-switch is one line + the missing enum value.
- **CB Deals adapter (P7) not started.**

---

## Coordination — what unblocks P4

P4 is "all 4 formats, 1 visual system." Your side: design IG Square, FB/Google Display, and a Carousel template in Canva → import into Templated.io → share the IDs + the renamed slot list. Each new entry in `templates.json` lights up an additional format button in `/tests/canva-ads`. The same render path serves all of them — no new code required until visual systems 2–4 land in P6.
