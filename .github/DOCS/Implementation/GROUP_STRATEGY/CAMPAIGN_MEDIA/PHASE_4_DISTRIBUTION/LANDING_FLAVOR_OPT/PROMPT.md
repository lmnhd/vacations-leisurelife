# Landing Flavor Optimization — Reusable Agent Prompt

**Purpose:** A repeatable instruction prompt for designing **two new landing-page "flavors"**
(visual systems) for campaign landing pages, on demand, to keep the page styles fresh as design
trends move. Paste the prompt below to any capable agent. It is self-contained: it tells the agent
where the flavor system lives, the hard constraints it must honor, and what to produce.

**When to use:** Periodically (e.g. quarterly, or whenever the current set feels dated). Each run
reviews the *current* set of flavors and adds two more. Over time the catalog grows; weaker flavors
can be retired separately.

---

## The Prompt (copy everything below this line)

> You are designing **two new landing-page visual "flavors"** for the Leisure Life Interactive
> campaign landing system. A "flavor" is a complete, named visual design language that the same
> landing **view-model** data can be rendered in. The data is fixed; only the look changes per
> flavor.
>
> ### Step 0 — Review the current flavors first
> Before designing anything, read and internalize the existing flavors so your two new ones are
> **genuinely distinct** from them and from each other. Do not repeat an existing aesthetic.
>
> Current flavors (enum `VisualFlavor` → internal `VisualSystem`):
>
> | Flavor enum | System key | Identity | Heading font | Surface mood |
> |---|---|---|---|---|
> | `editorial_magazine` | `system_1_editorial` | Premium literary magazine | `alfa_slab_one` | Sea-glass light, clean crops, few overlays |
> | `travel_nostalgia` | `system_2_nostalgia` | Warm sentimental postcard | `alfa_slab_one` | Paper/sepia, postcard spacing |
> | `indie_zine` | `system_3_zine` | Subcultural cut-out zine | `orbitron` | High-contrast, hard offset shadows, irregular |
> | `none` | `system_4_modular` | Calm premium brand/operational | (sans) | Dark, low-opacity image backdrops, clear cards |
>
> Read these files to ground yourself in how flavors are actually built (paths relative to repo
> root):
> - `lib/campaigns/schema.ts` — the `VisualFlavorEnum` (source of truth for the 4 values) + the
>   doc comment block above it describing each flavor's intent.
> - `lib/campaigns/landing/view-model.ts` — `visualFlavorForSystem` / `visualSystemForFlavor`
>   (the two-way mapping), `issueLabelForSystem`, and the `SYSTEM_SURFACE` color map.
> - `components/campaign-landing/landing-page-visual-system.tsx` — `buildTheme(system)` (the
>   per-system `SystemTheme` token set: backgrounds, surfaces, fonts, rules, badges, button
>   colors, accent ring/shadow), `HeroDispatcher`, `SectionShell`, and the `PhotoStrip` per-system
>   CSS `filter` switch.
> - `components/campaign-landing/landing-system-heroes.tsx` — `EditorialHero` / `NostalgiaHero` /
>   `ZineHero` / `ModularHero` (each flavor has its own hero composition).
> - `components/campaign-landing/landing-system-itinerary.tsx` — per-system itinerary treatment.
> - `components/campaign-landing/flavor-audition-toolbar.tsx` — `FLAVOR_OPTIONS` (the public
>   audition switcher) and the `overrideParam` allow-list.
> - `app/(tests)/tests/landing-studio/page.tsx` — the `FLAVORS` array (the Landing Studio
>   preview switcher).
> - `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/VISUAL_SYSTEMS.md`
>   — the canonical narrative description of what each system is *for*.
> - The Landing Image Studio master plan in
>   `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/LANDING_IMAGE_STUDIO/MASTER_PLAN.md`
>   — for the semantic image-placement layer (`landing.imagePlacements`) you may use.
>
> ### Step 1 — Design two NEW flavors
> Design two flavors that are **qualitatively unique** and reflect **recent design trends** (state
> the trend each one draws on, e.g. neo-brutalism, glassmorphism, kinetic/anti-design editorial,
> Y2K-revival, Swiss-grid maximalism, organic/blobby, retro-futurist, vaporwave, "boring-luxury"
> serif minimalism, etc.). The two must differ sharply from each other and from all four existing
> flavors. They may be **radically** different in layout, color, type, and density — that is
> encouraged.
>
> ### HARD CONSTRAINT — image-set structure is fixed
> Every flavor consumes the **same** landing view-model image structure. You may **not** invent a
> new image data shape. You must use only:
> - `landing.heroImage` (1)
> - `landing.galleryImages[]` (≤10, ordered)
> - `landing.trustImages[]`
> - and, optionally, the semantic `landing.imagePlacements.*` keys already defined by the Landing
>   Image Studio (e.g. `chatBackdrop`, `formBackdrop`, story/progress/pricing/trust placements).
>
> A flavor differs in **how it arranges, crops, filters, masks, and frames** those same images —
> never in *which collections exist*. This keeps all flavors swappable on any campaign and keeps
> the Landing Studio + audition toolbar working unchanged. If enough assets exist, aim for the
> master-plan density target (≈8–12 distinct image appearances) without hurting readability.
>
> ### Other constraints
> - **Same view-model, no renderer-specific data:** renderers read `heroImage / galleryImages /
>   trustImages / imagePlacements` and the existing `landing.*` copy/CTA/fact fields only. Do not
>   request new view-model fields unless absolutely unavoidable — and if so, call it out explicitly
>   as a separate dependency.
> - **Readability first:** image-backed text sits under high-opacity scrims (blur/fade/duotone).
>   Forms and CTAs must stay legible and completable. Mobile cropping must be considered.
> - **Deterministic + backward compatible:** absent manual placements, the flavor still renders
>   from the hero/gallery/trust algorithm with no broken images.
> - **Wire-in checklist (every flavor must enumerate all of these):**
>   1. Add the enum value to `VisualFlavorEnum` in `lib/campaigns/schema.ts` (+ doc comment) — or,
>      if the flavor is delivered as a *system* variant only, explain the mapping.
>   2. Extend `visualFlavorForSystem` / `visualSystemForFlavor` / `issueLabelForSystem` /
>      `SYSTEM_SURFACE` in `view-model.ts`.
>   3. Add a `SystemTheme` branch in `buildTheme()` and wire `HeroDispatcher` to a new hero.
>   4. Add the new hero to `landing-system-heroes.tsx` and itinerary treatment to
>      `landing-system-itinerary.tsx`.
>   5. Add the `PhotoStrip` CSS `filter` case.
>   6. Add it to `FLAVOR_OPTIONS` (audition toolbar) + the `overrideParam` allow-list, and to the
>      Studio `FLAVORS` array.
>   7. Note any test updates (`lib/campaigns/landing/__tests__/view-model.design-system.test.ts`).
>
> ### Deliverable format
> Produce a single design document (Markdown) saved in
> `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/LANDING_FLAVOR_OPT/`
> named `FLAVOR_BATCH_<NN>_<short-name>.md` (increment `<NN>`). For **each** of the two flavors
> include:
> 1. **Name + enum/system key** (proposed) and the **trend** it draws on.
> 2. **One-paragraph identity** — who it's for, the feeling.
> 3. **Full `SystemTheme` token set** — concrete values for every field in the `SystemTheme`
>    interface (pageBg, pageText, sectionAlt, surface, surfaceText, cardBorder, softText,
>    softerText, accentText, eyebrowFont, headingFont, rule, badge, primaryBtnTextColor,
>    secondaryBtnClasses, chip, accentRingShadow). Use real Tailwind / hex values.
> 4. **Hero composition** — layout sketch (ASCII or prose) showing where heroImage and supporting
>    images sit.
> 5. **Section + gallery treatment** — how galleryImages/trustImages/placements are arranged
>    (strips, mosaics, masks, etc.) and the `PhotoStrip` filter.
> 6. **Typography + motion** — fonts (must already exist in `lib/fonts` or be flagged as a new
>    dependency), and any tasteful motion.
> 7. **The wire-in checklist** above, filled in for this flavor.
> 8. **Risks / readability notes.**
>
> Do **not** implement code unless explicitly asked in the same request — design + plan only,
> unless the invoking instruction says "and implement."

---

## Notes for the human operator
- Run this prompt, review the produced design doc, then (separately) ask the agent to implement
  one or both flavors. Implementation is intentionally decoupled so you can curate before building.
- Keep batches numbered so the catalog has a clear history.
- After implementing, verify visually in `/tests/landing-studio` against ≥2 campaigns (per the
  Landing Image Studio Phase 8 QA standard) before locking a flavor on any live campaign.
