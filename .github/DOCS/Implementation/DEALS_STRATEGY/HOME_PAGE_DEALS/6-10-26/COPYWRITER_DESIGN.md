# Ad Copywriter — Deal Workflow Step 3 (Design / as-built)

> Status: **Implemented.** Authored 2026-06-10; updated 2026-06-10 to match the
> shipped build. Step 3 is the unified-manifest + copywriter agent. It takes the
> persisted Step 1 creative brief and Step 2 inventory manifest, then expands them
> into direct-response ad copy without re-guessing the angle.

## Purpose

Step 3 is the final creative stage in the deals workflow. It consumes the **unified
manifest** produced by Step 2 and writes ad copy for the dashboard/test UI. The
copywriter is the only AI step in this path:

- **Unified manifest** = deterministic stitch of Step 1 + Step 2.
- **Copywriter** = AI expansion of that stitched artifact into ad-ready variants.

This is the “no creative drift” fix: the copywriter never has to rediscover the
voice, hook, promo framing, or inventory context. It simply expands what Step 1 and
Step 2 already locked in.

## The unified manifest fix

`lib/cb/deals-system/deal-unified-manifest-cache.ts` persists the stitched object,
and `lib/cb/deals-system/deal-unified-manifest-types.ts` defines its shape.

The unified manifest deterministically combines:

- **Step 1 creative brief** (`SailingAngleProfile`): voice, insider hooks, pain
  points, visual anchor, relevant keywords.
- **Step 2 inventory manifest**: cruise line, ship class, itinerary, sail window,
  applied promos, promo strategy, lookup query, and reasoning.

That split is the practical equivalent of `{{CREATIVE_BRIEF_JSON}}` plus
`{{INVENTORY_MANIFEST_JSON}}`. The copywriter gets one persisted artifact and never
has to re-infer what the trip is supposed to say.

## The copywriter agent

`lib/cb/deals-system/deal-copywriter-generator.ts` is the AI engine for Step 3.
It uses the system prompt **verbatim** and enforces:

- the **expansion rule** — expand the unified manifest rather than inventing a new
  angle,
- **hyper-specificity / insider cognition** — speak in the niche’s own language,
- **no mass-group traps** — no group-cruise framing,
- the banned platitudes list — no paradise / escape / unwind / cruising / hidden gem /
  luxury for less / magnificent / breathtaking,
- the **promo-integration rule** — reframe onboard credit as a lifestyle fund and
  append mandatory disclaimers.

The generator emits **multiple variants** per run:

- a **primary play** on the strongest promo / hook,
- one or more **aspirational upsells**.

Each variant follows the `adCopyPayload` shape in `lib/cb/deals-system/deal-ad-copy-types.ts`:

- `headline`
- `bodyCopy`
- `pricingDisclaimers`
- `callToAction`
- `adPlatformTargetingHooks`

The variant also carries `promoApplied`, `variantLabel`, and `voiceWarnings`.

## Guardrails enforced in code

Two important checks live in code, not just in the prompt:

1. **`validateAdCopyVoice`** scans every variant’s headline, body, and CTA for banned
   vocabulary and returns `voiceWarnings`. It reports the issue; it does not rewrite
   the text automatically.
2. **Promo provenance validation** remaps any `promoApplied` id that is not present in
   the unified manifest to `"none"` and reports it. The copywriter cannot invent a
   promo the manifest never carried.

## Flow — one click from Step 2 to Step 3

The operator path is now visible in the UI:

- **Step 2 dashboard bullets** show the manifest list as `cruise line · destination`,
  each with a **“Write ad copy →”** trigger and an **“ad copy ✓”** badge once written.
- **Trip Manifestation lab** cards also expose **“Write ad copy →”** and deep-link to
  Step 3 with `?manifestId=` so the manifest arrives preselected.
- **Step 3 lab** opens directly to the manifest picker and the **“Unify & write ad copy”**
  action.

This keeps the workflow linear: manifest bullet → ad copy prompt → generated variants.

## As-built file map

| Concern | File | Notes |
|---|---|---|
| Unified manifest contracts | `lib/cb/deals-system/deal-unified-manifest-types.ts` | Step 1 + Step 2 stitched artifact. |
| Unified manifest cache | `lib/cb/deals-system/deal-unified-manifest-cache.ts` | Persist/load/upsert for `deal-unified-manifests-cache.json`. |
| Copywriter generator | `lib/cb/deals-system/deal-copywriter-generator.ts` | AI expansion into ad copy; returns variants + trace + rejected promo ids. |
| Ad-copy types | `lib/cb/deals-system/deal-ad-copy-types.ts` | Variant payload, targeting hooks, voice warnings, cache shape. |
| Step 3 page | `app/(tests)/tests/deals-system/copywriter/page.tsx` + `copywriter-view.tsx` | Preselects via `?manifestId=` and runs the write action. |
| Dashboard entry points | `app/(tests)/tests/deals-system/dashboard-view.tsx` | Step 2 bullets + Step 3 panel. |
| Trip-manifestation entry point | `app/(tests)/tests/deals-system/trip-manifestation/manifestation-view.tsx` | “Write ad copy →” deep-link into Step 3. |
| Test | `tests/deal-copywriter.ts` | `npm run test:deal-copywriter`. |

## Test coverage

The proof artifact checks the full Step 3 path:

- unified manifest carries both halves,
- ad copy generator returns `generator: "gpt"` + `aiTrace`,
- each variant has headline/body/CTA + targeting hooks,
- banned vocabulary is flagged,
- stray promo ids are remapped to `"none"`,
- cache upsert is idempotent,
- validators accept good payloads and reject empty-variant payloads.

## Guardrails carried from policy

- LLM Gateway Mandate: generation goes through `generateStructuredObject` + model
  enums, not provider SDKs.
- Deals remain separate from Groups: the copywriter reads deals caches only.
- No fabricated promo provenance: ids are validated against the unified manifest.
- No booking / hold / publish from Step 3; this stage only writes ad copy.
