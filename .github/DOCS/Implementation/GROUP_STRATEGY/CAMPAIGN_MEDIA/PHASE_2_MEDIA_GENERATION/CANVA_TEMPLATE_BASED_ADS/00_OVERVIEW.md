# Canva-Style Template-Based Ads — Overview

**Status:** ✅ Implemented — HTML + Playwright path active (see `HTML_PLAYWRIGHT/`)
**Scope:** Group campaigns + Cruise Brothers deals (shared module)

> **Implementation note (2026-05-29):** The render step evolved from the Canva/Templated.io
> plan below to an HTML + Playwright approach. Copy Forge, the template registry, slot names,
> and manifest integration are all unchanged. Only the render provider changed. See:
> - [`HTML_PLAYWRIGHT/MASTER_PLAN.md`](./HTML_PLAYWRIGHT/MASTER_PLAN.md) — current system
> - [`HTML_PLAYWRIGHT/TEMPLATE_REFERENCE.md`](./HTML_PLAYWRIGHT/TEMPLATE_REFERENCE.md) — all 8 templates
> - [`HTML_PLAYWRIGHT/DISTRIBUTION_INTEGRATION.md`](./HTML_PLAYWRIGHT/DISTRIBUTION_INTEGRATION.md) — distribution layer
> - [`TEMPLATED_IO/MASTER_PLAN.md`](./TEMPLATED_IO/MASTER_PLAN.md) — original plan (still valid as fallback path)

---

---

## Why we are doing this

The current `designed_ad_artifact` system (`@/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/ad-artifact-generator.ts:52-118`) renders static ads in code via `satori` + `sharp`. This works, but:

- **Look is fixed in code.** Visual changes require a developer.
- **Copy is mostly mechanical** — it pulls `brief.messaging.heroSlogan`, `subSlogan`, `ctaVariants.bookNow`. The result is technically on-brand but rarely *catchy per campaign*.
- **One workflow only.** It is wired to group campaigns; reusing it for CB deals requires duplicating it.

We want to replace that step with:

1. **Hand-designed templates** (by you, in Canva) with named input slots.
2. **A small AI "Copy Forge" step** that reads the campaign brief + dossier and outputs the 3–5 catchy text + image slots per template.
3. **An isolated render service** that fills templates and returns PNGs — callable from both the Group orchestrator and a separate Cruise Brothers Deals workflow.

---

## Recommendation (the short version)

| Decision | Pick | Reason |
|---|---|---|
| Template tool I design in | **Canva** (Pro, no Enterprise needed) | You already want Canva. No code involved in template design. |
| Render/Autofill API | **Templated.io** (primary), Canva Connect Autofill (deferred fallback) | Templated.io supports **direct Canva design import**, has variable fields, ~2s renders, Node SDK, no Enterprise requirement. Canva Connect Autofill requires an **Enterprise plan for both you and the integration users** — disqualifying for the foreseeable future. |
| Copy generation | New `lib/ads/copy-forge` module — single LLM call per template, structured JSON output via existing `structured-generation.ts` | Matches the same pattern used in Trinity / brief-engine. Deterministic schemas, no agent loops. |
| Integration shape | Provider-based: `AdRenderProvider` interface, `templated` implementation first, `canva_autofill` and `satori_legacy` as siblings | Lets us swap providers per workflow and keep the legacy renderer for fallback. |
| Where it lives | `lib/ads/` (new top-level), NOT under `lib/campaigns/` | This is the deliberate isolation the request calls out — CB deals workflow will import the same module. |

Full reasoning is in `01_RESEARCH_CANVA_OPTIONS.md`.

---

## What you need to do (human side)

1. Design **4 templates** in Canva per Visual System you want to support (start with one system):
   - **IG Square** (1080×1080)
   - **FB / Google Display** (1200×628)
   - **Story / Reels** (1080×1920)
   - **Carousel** (1080×1350, multi-page)
2. Each template uses **3–5 named slots** following the schema in `03_TEMPLATE_SPEC.md`. Slot names are case-sensitive and shared between Canva and Templated.io.
3. Export each design once → import into Templated.io → confirm variable slots map cleanly → record the resulting Templated.io `template_id`.

The system handles the rest.

---

## What I will build (system side)

Detailed in `02_ARCHITECTURE_PLAN.md`. High-level:

- `lib/ads/copy-forge/` — brief + dossier → structured `AdCopySet` (per-format catchy lines)
- `lib/ads/template-registry/` — maps `(workflow, visualFlavor, format)` → Templated.io `template_id` + slot contract
- `lib/ads/providers/templated.ts` — implements `AdRenderProvider`
- `lib/ads/providers/canva-autofill.ts` — stub for later, same interface
- `lib/ads/render-pack.ts` — orchestrates copy forge → image asset upload → autofill → export → store in manifest
- Wire into the existing orchestrator at the `designed_ad_artifact` job site, behind a feature flag (`AD_RENDER_PROVIDER=templated | satori_legacy`)
- A new `/tests/canva-ads` validation page (per your rule: new UI tools live in `/tests` first)

---

## Quick next steps

1. **You:** Sign up for Templated.io free tier, confirm Canva import works on a throwaway template.
2. **Me (when greenlit):** Stub `lib/ads/` skeleton + Copy Forge schema + `/tests/canva-ads` page, no provider yet, just verify the copy generation produces good catchy lines from a real brief.
3. **You:** Design the first template (IG Square, System 2 nostalgia is a good test), wire its `template_id` into the registry.
4. **Me:** Implement `templated.ts` provider, end-to-end render through `/tests/canva-ads`.
5. Promote into orchestrator behind flag.

See:
- `01_RESEARCH_CANVA_OPTIONS.md` — full vendor research
- `02_ARCHITECTURE_PLAN.md` — module layout + data flow + integration point
- `03_TEMPLATE_SPEC.md` — slot contracts you design Canva templates against
