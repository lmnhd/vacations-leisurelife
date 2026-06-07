# Flavor Batch 01 — Brutalist Broadsheet & Liquid Glass

**Created:** 2026-06-06
**Status:** Design + plan only (not implemented)
**Produced via:** `PROMPT.md` in this directory.

## Review of the current set (so these two stay distinct)

| Existing flavor | Identity | What it already owns |
|---|---|---|
| `editorial_magazine` | Premium literary magazine | Sea-glass light, clean large crops, slab headline, few overlays |
| `travel_nostalgia` | Warm sentimental postcard | Paper/sepia warmth, postcard spacing, soft |
| `indie_zine` | Subcultural cut-out zine | High contrast, hard offset shadows, `orbitron`, irregular collage |
| `none` (modular) | Calm premium brand | Dark UI, low-opacity image backdrops, clean operational cards |

**Gaps:** Nothing in the catalog is (a) a stark, ink-on-newsprint **structural/brutalist** system
with rigid grid lines and oversized type, nor (b) a **soft, translucent, depth-layered glass**
system. The two new flavors below claim those two opposite poles — one maximally hard, one maximally
soft — so they are distinct from each other *and* from all four incumbents.

---

## Flavor A — **Brutalist Broadsheet** (`structural_broadsheet` → `system_5_broadsheet`)

**Trend:** Neo-brutalism / Swiss-grid maximalism / "anti-design" broadsheet — visible grid rules,
monospace metadata, oversized ALL-CAPS condensed headlines, raw boxed images, near-zero rounding.

**Identity:** For high-information, high-conviction campaigns that want to read like a serious
front page — confident, structural, a little defiant. Black ink on bright paper, everything boxed
and gridded, images sit in hard-ruled cells like press photos with caption rails. It is the
*loudest legible* flavor: it shouts with structure, not with color.

### `SystemTheme` token set
| Field | Value |
|---|---|
| `pageBg` | `bg-[#f4f1ea] text-black` (newsprint warm-white) |
| `pageText` | `text-black` |
| `sectionAlt` | `bg-[#e7e2d6]` |
| `surface` | `bg-white border-[3px] border-black shadow-none` |
| `surfaceText` | `text-black` |
| `cardBorder` | `border-[3px] border-black` |
| `softText` | `text-neutral-800` |
| `softerText` | `text-neutral-600` |
| `accentText` | `text-black` |
| `eyebrowFont` | `font-mono` |
| `headingFont` | `righteous.className` (heavy, tight; condensed feel — already in `lib/fonts`) |
| `rule` | `border-black` (and bump rule weight to 2–3px where the shell allows) |
| `badge` | `border-[2px] border-black bg-[#ffe600] text-black` (single hazard-yellow accent) |
| `primaryBtnTextColor` | `#000000` (primary button bg = `#ffe600`) |
| `secondaryBtnClasses` | `border-[3px] border-black bg-white text-black hover:bg-[#ffe600]` |
| `chip` | `bg-black text-[#f4f1ea]` (inverted ink chip) |
| `accentRingShadow` | `() => '8px 8px 0 #000000'` (hard offset, no blur) |

> Single accent: hazard-yellow `#ffe600` only. Everything else is ink/paper. The hard offset
> shadow is *black*, distinguishing it from zine's colored offset shadow.

### Hero composition
```
┌─────────────────────────────────────────────────────────┐
│ THE LEISURE BROADSHEET · ISSUE 01 · [stateLabel]          │  ← mono masthead rule
├───────────────────────────────┬───────────────────────────┤
│  MASSIVE CONDENSED HEADLINE    │  ┌─────────────────────┐ │
│  ALL CAPS, 3–4 LINES,          │  │   heroImage         │ │
│  spanning 2/3 width            │  │   (hard-boxed,       │ │
│                                │  │    b/w + caption)    │ │
│  subhead (serif/mono)          │  └─────────────────────┘ │
│  [ PRIMARY ▮ ] [ secondary ]   │  caption rail (mono)      │
├───────────────────────────────┴───────────────────────────┤
│ fact · fact · fact · fact   (4-col ruled metadata strip)   │
└─────────────────────────────────────────────────────────┘
```
Hero is a two-column ruled grid: headline left, `heroImage` boxed top-right with a monospace caption
rail beneath it (use the asset's alt/label). A 4-column ruled fact strip closes the hero.

### Section + gallery treatment
- **Gallery** renders as a **ruled contact-sheet grid** (3–4 columns), each `galleryImages[i]` in a
  hard-bordered cell with a tiny mono index caption (`FIG. 01`, `FIG. 02`…). No gaps softened; cells
  share 3px black rules like a table.
- **trustImages** → a single full-width "press band": one large boxed image with a caption rail and
  the trust copy set as a numbered list beside it.
- **placements:** `chatBackdrop` and `formBackdrop` render as **boxed framed images with a label
  bar**, not bleeds — the form sits in a bordered "coupon" box (very on-theme for a broadsheet).
- **`PhotoStrip` filter:** `grayscale(1) contrast(1.15)` (press-photo black & white).

### Typography + motion
- Heading: `righteous` (already imported). Eyebrows/captions/metadata: `font-mono`. Body: default
  sans. No new font dependency.
- Motion: essentially none — maybe a 1px rule that draws in on scroll. Brutalism is static by
  intent. Keeps it cheap and accessible.

### Wire-in checklist
1. `VisualFlavorEnum` += `'structural_broadsheet'` (+ doc-comment line: "System 5 — stark
   newsprint/brutalist grid; high-information, high-conviction niches").
2. `view-model.ts`: add `system_5_broadsheet` to the `VisualSystem` union; map both ways in
   `visualFlavorForSystem` / `visualSystemForFlavor`; `issueLabelForSystem` → `"Issue 01"` (or
   `"Front Page"`); `SYSTEM_SURFACE.system_5_broadsheet = "#f4f1ea"`.
3. `buildTheme()`: add `if (system === 'system_5_broadsheet')` branch with the tokens above; wire
   `HeroDispatcher` → `BroadsheetHero`.
4. `landing-system-heroes.tsx`: add `BroadsheetHero`. `landing-system-itinerary.tsx`: ruled
   numbered table treatment.
5. `PhotoStrip`: add `system_5_broadsheet → 'grayscale(1) contrast(1.15)'`.
6. `flavor-audition-toolbar.tsx`: `FLAVOR_OPTIONS` += `{ flavor: 'structural_broadsheet', label:
   'Broadsheet', sublabel: 'System 5 · Newsprint' }`, and add it to the `overrideParam` allow-list.
   Studio `FLAVORS` += `{ id: 'structural_broadsheet', label: 'Broadsheet' }`.
7. Tests: extend `view-model.design-system.test.ts` to assert the new flavor↔system mapping and that
   `SYSTEM_SURFACE` has the entry.

### Risks / readability notes
- Hazard-yellow + black has strong contrast (good for AA), but keep yellow off of body text — it's
  a *background/badge* accent only.
- All-caps condensed headlines can hurt readability if too long; cap at ~4 lines and keep subhead
  in sentence case.
- 3px rules everywhere can feel heavy on mobile — collapse the contact-sheet grid to 2 columns and
  reduce rule weight to 2px under `md`.

---

## Flavor B — **Liquid Glass** (`liquid_glass` → `system_6_glass`)

**Trend:** Glassmorphism revival / "liquid glass" depth UI / soft aurora gradients — frosted
translucent panels, layered blur, large soft radii, vivid but desaturated aurora background washes,
images bleeding *behind* glass cards.

**Identity:** For aspirational, premium-but-warm, sensory campaigns (spa-at-sea, wellness, luxe
escapes) that want to feel modern, calm, and expensive without the dark modular severity. The page
is a stack of frosted glass panels floating over a soft, blurred image aurora — depth and light
rather than ink and grid. It is the soft inverse of Broadsheet.

### `SystemTheme` token set
| Field | Value |
|---|---|
| `pageBg` | `bg-[#eaf1f8] text-slate-900` (cool light; a blurred image aurora is layered over it in the renderer) |
| `pageText` | `text-slate-900` |
| `sectionAlt` | `bg-white/40` (translucent, lets aurora through) |
| `surface` | `bg-white/45 border border-white/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(31,67,114,0.18)]` |
| `surfaceText` | `text-slate-900` |
| `cardBorder` | `border border-white/60` |
| `softText` | `text-slate-700` |
| `softerText` | `text-slate-500` |
| `accentText` | `text-sky-700` |
| `eyebrowFont` | `font-mono` |
| `headingFont` | `prompt.className` (clean rounded sans, already imported — soft, modern) |
| `rule` | `border-white/50` |
| `badge` | `border border-white/60 bg-white/50 text-slate-700 backdrop-blur-md` |
| `primaryBtnTextColor` | `#0b2545` (primary btn = frosted light gradient w/ sky accent) |
| `secondaryBtnClasses` | `border border-white/60 bg-white/40 text-slate-800 backdrop-blur-md hover:bg-white/60` |
| `chip` | `bg-white/45 text-slate-700 backdrop-blur-md border border-white/60` |
| `accentRingShadow` | `(hex) => \`0 24px 70px ${hex}33\`` (soft, wide, colored bloom) |

> Note: the **aurora background** (a blurred, low-opacity composite of `heroImage` + a couple of
> `galleryImages`) is rendered by the flavor itself as a fixed/sticky layer behind the glass; the
> theme tokens above assume that layer exists. This is the one flavor that leans hardest on `backdrop-blur`.

### Hero composition
```
   ╭──── soft aurora: blurred heroImage + gallery wash, fixed behind everything ────╮
   │                                                                                │
   │      ╭───────────────────────── frosted glass card ─────────────────────────╮ │
   │      │  eyebrow (mono)                                                        │ │
   │      │  Large soft headline (prompt), italic accent word in sky              │ │
   │      │  subhead                                                              │ │
   │      │  [ PRIMARY pill ]  [ secondary glass pill ]                           │ │
   │      │  ┌─ small floating glass thumb ─┐  ┌─ thumb ─┐  (gallery[0..1])        │ │
   │      ╰───────────────────────────────────────────────────────────────────────╯ │
   ╰────────────────────────────────────────────────────────────────────────────────╯
```
Hero is one large centered frosted card floating over the aurora, with 1–2 small floating glass
thumbnail chips (gallery images) peeking at the corners for depth. heroImage is *both* the sharp
content of a thumb and the blurred aurora source.

### Section + gallery treatment
- **Gallery** → a **soft mosaic of rounded glass tiles** at varying sizes (a light masonry feel),
  each `galleryImages[i]` behind a thin frosted frame with a subtle inner glow. Generous rounding
  (`rounded-3xl`), soft shadows, no hard edges anywhere.
- **trustImages** → trust bullets become **floating glass cards**, each with a small rounded
  companion image and a soft colored bloom (`accentRingShadow`).
- **placements:** `chatBackdrop` / `formBackdrop` → image bleeds behind the panel, then a
  `backdrop-blur-xl` white/40 glass layer sits over it with the form on top (fully legible). This is
  the flavor's signature move and exactly what glassmorphism is for.
- **`PhotoStrip` filter:** `saturate(1.05) brightness(1.05) contrast(0.95)` (bright, slightly
  dreamy — opposite of Broadsheet's b/w).

### Typography + motion
- Heading: `prompt` (already imported, soft + rounded). Eyebrows: `font-mono`. No new font.
- Motion: gentle — glass cards rise + fade on scroll (`translateY` + opacity), and the aurora can
  drift *very* slowly (respect `prefers-reduced-motion`: disable drift). Keep blur radii moderate on
  mobile for perf.

### Wire-in checklist
1. `VisualFlavorEnum` += `'liquid_glass'` (+ doc-comment: "System 6 — frosted glass depth / aurora;
   aspirational, wellness, luxe-sensory niches").
2. `view-model.ts`: add `system_6_glass` to `VisualSystem`; map both ways; `issueLabelForSystem` →
   `"Collection 01"`; `SYSTEM_SURFACE.system_6_glass = "#eaf1f8"`.
3. `buildTheme()`: add `system_6_glass` branch (tokens above); `HeroDispatcher` → `GlassHero`. Note:
   this flavor also needs an **aurora background layer** — implement it inside `GlassHero` / the page
   shell (a fixed blurred composite of `heroImage` + `galleryImages[0..1]`), since it's flavor-specific
   chrome, not new view-model data.
4. `landing-system-heroes.tsx`: add `GlassHero`. `landing-system-itinerary.tsx`: glass-step cards.
5. `PhotoStrip`: add `system_6_glass → 'saturate(1.05) brightness(1.05) contrast(0.95)'`.
6. `flavor-audition-toolbar.tsx`: `FLAVOR_OPTIONS` += `{ flavor: 'liquid_glass', label: 'Glass',
   sublabel: 'System 6 · Frosted' }` + allow-list entry. Studio `FLAVORS` += `{ id: 'liquid_glass',
   label: 'Glass' }`.
7. Tests: extend `view-model.design-system.test.ts` for the new mapping + surface entry.

### Risks / readability notes
- **Contrast is the main risk.** Frosted-glass text over busy imagery can fail AA. Mitigate: keep
  the glass layer at ≥40% white opacity *plus* `backdrop-blur-xl`, and dim/blur the underlying image
  hard. Always test the worst-case (a high-contrast hero) in the Studio.
- `backdrop-blur` is GPU-heavy; cap stacked blur layers and reduce blur radius under `md` for mobile
  perf. Provide a non-blurred fallback (`bg-white/80`) for browsers without `backdrop-filter`.
- Aurora drift motion must honor `prefers-reduced-motion`.

---

## Summary

| New flavor | Enum / system | Trend | Pole it claims |
|---|---|---|---|
| Brutalist Broadsheet | `structural_broadsheet` / `system_5_broadsheet` | Neo-brutalism / Swiss broadsheet | Maximally hard, ink-on-paper, gridded |
| Liquid Glass | `liquid_glass` / `system_6_glass` | Glassmorphism / aurora depth | Maximally soft, translucent, layered light |

Both reuse the existing `heroImage / galleryImages[] / trustImages[] / imagePlacements` structure
verbatim — only arrangement, framing, cropping, and filters change — so they drop into the audition
toolbar and Landing Studio with no view-model data changes.

**Next step (separate request):** "Implement Flavor A" and/or "Implement Flavor B" — then visual-QA
in `/tests/landing-studio` against ≥2 campaigns before locking on any live campaign.
