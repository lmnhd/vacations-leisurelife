# Campaign Visual Systems

**Source:** Claude Design export — `Cruise Campaign Visual Systems.html`  
**Status:** Integrated (system selection wired into `CampaignIdentityBlueprint.visualFlavor`)  
**North star:** "Campaign worlds, not pictures."

---

## Core Philosophy

The designed media system decomposes every campaign deliverable into four independent concerns:

| Concern | What it is | Who owns it |
|---------|-----------|------------|
| **Frame** | The visual system shell (layout, typography, artifact shape) | System 1–4 templates |
| **Image module** | One documentary photo or detail still | Image generator |
| **Type module** | Headlines, subheads, labels, CTA | `NicheTokens` → templates |
| **Artifact module** | Tickets, stamps, badges, stickers, merch | Templates (no image gen) |

The image generator only fills the image module. All other concerns are owned by the design system.  
**Image budget per campaign: 3–5 documentary stills, not 30 staged scenes.**

---

## The Four Systems

System 4 is the **permanent structural foundation**. Systems 1–3 are **expressive flavors** layered on top.  
A campaign always ships with System 4 + at most one flavor.

---

### System 4 — "Side A" · Modern Brand

**Tag:** `system_4_modular`  
**Philosophy:** Restraint. Big confident type carries the headline. One trust image per page, treated as a gallery object. The niche shows up as copy, section labels, accent color, and a single italic-serif word against a workhorse sans. Feels like a contemporary travel-app brand. Generation cost per campaign drops because the system asks for fewer scenes and more typography.

**When to use:** Always. This is the base for every campaign.  
**Energy modes:** All — but especially `calm_contemplative` which uses System 4 alone with no flavor.

**Core unit:** Type lock-up + accent color + one image module  
**Niche carrier:** One italic-serif word embedded in the sans headline (e.g. "The Sea, in *33⅓*"), section labels using niche vocabulary, accent hex  
**Trust image:** One documentary ship/deck photo per page; everything else is type, modules, badges  
**Zero-photo assets:** Type-only social cards, merch badges, itinerary strips — most artifacts have no photography  
**Ad/social:** Modular cards drop into IG/TikTok/web without redesign — the system is the social grid

**Asset pack (System 4 base):**
| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Landing hero | 16:9 | Dark mode, type-driven | One trust photo top-right |
| Feature module | Landing scroll | Light | Photo band + stat modules |
| Itinerary card | Stacked | Light | Text-only rows |
| Type-only social | 1:1 | Dark | Zero photography |
| Image-led social | 1:1 | Light | One detail photo |
| Merch badge / pin | 1:1 | — | Type + icon only |

**Token requirements:**
```
headline        — primary slogan (e.g. "The Sea, in 33⅓.")
italicWord      — the one italic-serif accent word per headline
subhead         — secondary line
vesselName      — ship name
route           — destination string
departure       — sailing date
sectionLabels[] — 3–5 niche-vocabulary section names
quote           — pull quote (≤140 chars)
quoteCite       — attribution
cta             — CTA button text
accentHex       — brand accent color (#rrggbb)
```

**Prompt language (type-driven hero):**
> A landing-page hero, dark mode, modular. Massive sans display headline "[HEADLINE]" with "[ITALIC_WORD]" set in italic-serif accent color. Right column: small label "[VOYAGE_LABEL]", short paragraph, pull-quote with cite, pill CTA. Bottom: 4-column metadata strip. One small documentary trust image, 7:5, top-right. Geist sans, Newsreader italic accent, JetBrains Mono labels, sharp accent color only.

---

### System 1 — "Vinyl & Tide" · Editorial Magazine

**Tag:** `system_1_editorial`  
**Philosophy:** The campaign is published, not posted. Every cruise concept ships as a printed-feeling magazine: cover, spread, contributors, table of contents. Photography is a guest, not the show — typography and editorial voice carry the weight. Awkward staged scenes become considered cover art the moment they sit under a masthead.

**When to use:** Premium, considered, intellectual niches. Art, literature, music (prestige), food, culinary, fine arts, classical music, philosophy. When the guest is likely to respond to "I am reading about this" rather than "I was shown an ad."  
**Energy modes:** `refined_premium`, `nostalgic_kinetic`  
**VisualFlavor value:** `editorial_magazine`

**Core unit:** Magazine cover + editorial spread  
**Niche carrier:** Section names ("Side A", "Field Guide"), headline diction, contributor bylines, folio numbers  
**Trust image:** Real ship/port photo framed under a masthead — editorial context neutralizes any AI rendering awkwardness  
**Ad/social:** Pull-quote cards, contributor portraits, departmental icons

**Asset pack additions (System 1 flavor):**
| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Magazine cover | 3:4 | Landing hero | Masthead + cover image + 3 blurb teasers |
| Editorial spread | 2pp | Landing scroll | Full-bleed photo left, typography right |
| Contributor card | 1:1 | Social | Portrait + role + short bio |
| TOC-as-itinerary | Landing module | — | Issue-style table of contents |
| Pull-quote social | 1:1 | IG | Large quote with section stamp |

**Prompt language:**
```
// COVER
A printed-magazine cover for a [NICHE] cruise. Documentary photo of [SPECIFIC_PROP + SETTING],
framed beneath a large serif masthead "[MAGAZINE_NAME]", issue number, three blurb teasers,
magazine layout grid. Editorial restraint. Newsreader serif, [ACCENT_COLOR] folios, paper texture.
No people on deck.

// SPREAD
A magazine feature spread, 2-page editorial layout. Left page full-bleed documentary photo
of [SCENE]. Right page typography only: folio "[SECTION] [PAGE_NUM]", italic display headline
"[HEADLINE]", pull quote, drop cap. Photographer credit. Cream paper, no decorative props.
```

**How niche shows up:** Section names, headline diction, contributor framing, folio numbers. The image stays a real ship; the world is built in type.

---

### System 2 — "Port of Call" · Travel Nostalgia

**Tag:** `system_2_nostalgia`  
**Philosophy:** Every campaign artifact arrives as a physical travel object: postcard, stamp, ticket, baggage tag, itinerary card. The cruise feels mailed to you. AI-rendered scenes get tucked behind layers of paper, postmarks, and handwriting — so the image is no longer load-bearing. Built-in believability because we're not pretending the artifact is candid; we're saying it's collateral.

**When to use:** Nostalgic, sentimental, or family-shaped niches. Multi-generational, anniversary, heritage, faith travel, cottagecore, gardening, crafts. Also effective for any niche where the "warm and unhurried" register matters more than edge or prestige.  
**Energy modes:** `warm_social`, `playful_collective`  
**VisualFlavor value:** `travel_nostalgia`

**Core unit:** Postcard + ticket + baggage tag + postmark  
**Niche carrier:** Stamp art, postmark vessel name, handwritten greeting with specific niche verbs, seal text  
**Trust image:** The deck photo lives inside a postcard frame — uncanny edges hide behind the white border  
**Ad/social:** Stamps, ticket stubs, luggage tags travel naturally on social — they're already squares  
**Merch:** Baggage tags, stamps, and stickers fall out for free from the same template set

**Asset pack additions (System 2 flavor):**
| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Postcard hero | 5:3 | Landing hero | Photo inside paper frame + stamp + postmark |
| Boarding pass | Stacked | Landing | Route + cabin + voyage fields |
| Itinerary card | Stacked | Landing | Day-by-time format with niche activities |
| Baggage tag | 2:3 | Merch / social | Text-only — ship name, FROM/TO ports, niche seal |
| Air-mail social | 1:1 | IG | Striped border, handwriting greeting |
| Scene image | 3:2 | Video frame | Hands/props action shot for storyboard extraction |

**Prompt language:**
```
// POSTCARD HERO
A vintage travel postcard, slight rotation, white photo border. Photo subject: [TRUST_IMAGE_BRIEF].
Above: a commemorative postage stamp reading "[VESSEL_NAME] · [NICHE_SHORT]" and a circular
postmark "[ROUTE] [DATE]". Below: handwritten greeting in cursive "[NICHE_SPECIFIC_SCENE]",
three handwritten address lines. Cream paper, deckle edges, ink bleed, [COLOR_PALETTE].

// BAGGAGE TAG
A manila luggage tag with metal grommet. "[NICHE_NAME]" in italic display serif, vessel band at
top, FROM/TO ports in body, niche-specific seal text. Mono caption type. No people, no scene —
pure paper artifact.
```

**How niche shows up:** Postage stamp art, postmark vessel name, handwritten note's specific verbs, seal text. Photography is reduced to one trust image inside a paper frame.

---

### System 3 — "Deck Notes" · Indie Zine

**Tag:** `system_3_zine`  
**Philosophy:** Built like a fan zine: photocopied edges, masking tape, polaroid clusters, marker scribbles, ripped paper. Awkwardness becomes texture. The zine doesn't care if a face is slightly wrong because the page is loud, hand-made, and full of human voice. Best for niches with subculture energy where polish reads as inauthentic.

**When to use:** Subcultural, indie, or fandom-shaped niches. Board games, D&D/tabletop, vinyl collecting, tattoo culture, sober punk, zine culture, skateboarding, cosplay, niche craft. Anywhere that "polished is bad here — handmade is the credential."  
**Energy modes:** `after_hours_electric`, `subcultural_intimate`  
**VisualFlavor value:** `indie_zine`

**Core unit:** Polaroid collage + masking tape + marker scribbles  
**Niche carrier:** Tracklist/track nomenclature for voyage structure, polaroid captions, scribbled marginalia, sticker copy, volume number on every artifact  
**Trust image:** Polaroids hide AI artifacts behind frames, captions, and tilt — the mess is the style  
**Ad/social:** Sticker sheets, mixtape track cards, scribble cards — native to TikTok  
**Merch:** Sticker sheets, die-cut badges fall out directly from the same template set

**Asset pack additions (System 3 flavor):**
| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Zine cover | 3:4 | Landing hero | 4–5 tilted polaroids + tape + torn banner + footer blob |
| Liner notes spread | 2pp | Landing | Tracklist itinerary + clippings + sticker |
| Sticker sheet | Full-width | Merch / TikTok | 6 die-cut sticker designs, text-only |
| Scribble social | 1:1 | TikTok / IG | Marker text + polaroid |

**Prompt language:**
```
// COLLAGE COVER
A photocopied zine cover, slightly off-register, cream paper background with grain. Four-five
tilted polaroids with masking-tape strips, captions in handwritten font: "[NICHE_CAPTIONS]".
Torn banner across top "[NICHE_VOYAGE_LABEL]". Yellow sticky note bottom-left with body copy.
Marker scribble bottom-right "[NICHE_VERB_PHRASE]". Special Elite typewriter, DM Serif Display
italic for accents, marker [ACCENT_COLORS].

// STICKER SHEET
A die-cut sticker sheet, cream backing paper, six stickers in different shapes and rotations:
[STICKER_1_SHAPE] "[STICKER_1_TEXT]", [STICKER_2_SHAPE] "[STICKER_2_TEXT]", ...
No photography. Pure designed graphic.
```

**How niche shows up:** Polaroid captions, tracklist nomenclature, scribbled marginalia, sticker copy, volume number on every artifact. Image budget per asset drops to 1–2 polaroids.

---

## System Selection Matrix

| Energy Mode | Visual Flavor | System Tag | Rationale |
|-------------|--------------|------------|-----------|
| `refined_premium` | `editorial_magazine` | `system_1_editorial` | Quiet confidence + specific taste = editorial register |
| `nostalgic_kinetic` | `editorial_magazine` | `system_1_editorial` | Analog/vintage = magazine/liner-notes world |
| `warm_social` | `travel_nostalgia` | `system_2_nostalgia` | Social warmth = postcard / paper artifact world |
| `playful_collective` | `travel_nostalgia` | `system_2_nostalgia` | Playful + communal = warm paper register |
| `after_hours_electric` | `indie_zine` | `system_3_zine` | After-hours energy = subcultural, rough, handmade |
| `subcultural_intimate` | `indie_zine` | `system_3_zine` | Fandom / niche = zine is the credential |
| `calm_contemplative` | `none` | `system_4_modular` | No flavor needed — System 4 pure |

The `VisualFlavor` is set by `selectVisualFlavor()` in `identity-blueprint.ts` and stored in `CampaignIdentityBlueprint.visualFlavor`. The token system reads it via `brief.identityBlueprint?.visualFlavor` and maps it to `NicheTokens.system`.

---

## Cross-Format Application

### Ads (Meta / Google Display)

| Placement | System 4 base | Flavor adds |
|-----------|--------------|------------|
| IG/FB Feed (4:5) | Editorial cover ad | Sys 1: masthead; Sys 2: postcard border; Sys 3: polaroid collage |
| IG/FB Square (1:1) | Quote card or type-only card | Sys 2: stamp/air-mail; Sys 3: scribble |
| Stories/Reels/TikTok (9:16) | Type hook card | Sys 3: zine cover full-bleed |
| Google Display (1.91:1) | Image detail ad | Sys 1: magazine spread crop |
| FB/IG Carousel | Itinerary TOC card | Sys 1: TOC spread; Sys 2: ticket stub |

### Landing Pages

Every landing page is structured as:
1. **Hero** — flavor-system hero (cover, postcard, or zine collage) OR System 4 type hero
2. **Scroll modules** — feature modules driven by `sectionLabels[]` from tokens
3. **Itinerary** — TOC-style (Sys 1), ticket-style (Sys 2), tracklist-style (Sys 3), or grid (Sys 4)
4. **Social proof** — contributor card (Sys 1), handwritten testimonial (Sys 2), marginalia clipping (Sys 3)
5. **CTA** — standard across all systems

### Documentary Image Modules (Ingredient Stills)

The image generator is asked for 3–5 documentary stills per campaign. Each still is framed for negative space (text overlay). The kind requested should match the active flavor:

| Flavor | Preferred documentary kinds | Notes |
|--------|----------------------------|-------|
| `editorial_magazine` | `trust_photo`, `artifact_still_life` | No faces; prop + sea context |
| `travel_nostalgia` | `trust_photo`, `motion_plate` (hands in action) | Suitable for postcard crop |
| `indie_zine` | `artifact_still_life`, `human_glimpse` | Polaroid-sized crops; imperfection is fine |
| `none` (Sys 4) | `trust_photo`, `texture_plate` | Maximum negative space for type overlay |

### Heroes / Crops

Hero images are derived from the documentary stills by applying system-appropriate cropping and framing:
- **System 4:** 7:5 or 16:9 with heavy type overlay; image is 30–40% of visual real estate
- **System 1:** 3:2 full-bleed under masthead; type lives outside the photo
- **System 2:** 5:3 inside postcard white border; 8px border = safe zone
- **System 3:** Square polaroid crop with deliberate tilt; caption below

### Scenes (Storyboard / Video Frames)

The `artifact.scene` field on each documentary module spec describes what was captured — this becomes the scene brief for video. System 2 includes a dedicated `scene image` asset (3:2) explicitly intended for video frame extraction.

Video scene briefs should follow the same prompt discipline as documentary stills:
- Documentary, not staged
- Hands/props in motion rather than posed people
- Sea light, ship materials, negative space for lower-third text overlay
- Specific to the campaign's `propFamilies` and `allowedThemeSignals`

### Audio / Music Mood

The `CampaignAestheticBrief.audio.musicMood` field drives ambient audio selection. Visual system should be coherent with audio register:

| Visual Flavor | Audio register |
|--------------|---------------|
| `editorial_magazine` | Considered, unhurried — ambient jazz, chamber, or acoustic |
| `travel_nostalgia` | Warm and melodic — folk, soft pop, vintage travel soundtrack |
| `indie_zine` | Subcultural — post-punk, lo-fi hip hop, dub, ambient electronic |
| `none` (Sys 4) | Clean and modern — contemporary ambient, minimal electronic |

### Merch

Merch assets fall out of the same token set with no additional image generation:

| Visual Flavor | Merch artifacts |
|--------------|----------------|
| `editorial_magazine` | Magazine back-cover poster, subscriber tote, byline pin |
| `travel_nostalgia` | Baggage tag (physical), postcard print, stamp sheet |
| `indie_zine` | Sticker sheet, die-cut badge, risograph-style poster |
| `none` (Sys 4) | Enamel pin, type-only tee, merch badge |

### References (Mood Board / Creative Briefs)

When writing image prompts or briefing creative direction, reference the system's **material language**:

| System | Material language |
|--------|-----------------|
| Sys 1 | Newsprint, cream paper, oxide-red folios, photographic grain, serif type |
| Sys 2 | Manila tag stock, deckle paper edges, postage stamp perforations, cursive ink, postmark circular |
| Sys 3 | Photocopied grain, masking tape, polaroid frame, marker ink, ripped paper edges |
| Sys 4 | Dark mode glass, sharp orange accent, JetBrains Mono labels, Geist sans, Newsreader italic |

---

## Implementation Reference

### Type Locations

| Concern | File | Field |
|---------|------|-------|
| Flavor enum | `lib/campaigns/schema.ts` | `VisualFlavorEnum`, `VisualFlavor` |
| Blueprint field | `lib/campaigns/schema.ts` | `CampaignIdentityBlueprint.visualFlavor` |
| Selection logic | `lib/campaigns/design-system/identity-blueprint.ts` | `selectVisualFlavor(energyMode)` |
| System type | `lib/campaigns/design-system/types.ts` | `VisualSystem` |
| Token field | `lib/campaigns/design-system/types.ts` | `NicheTokens.system` |
| Token derivation | `lib/campaigns/design-system/niche-tokens.ts` | `visualFlavorToSystem()` |

### Template Coverage (Current)

The templates in `lib/campaigns/design-system/ad-templates.ts` currently render:
- `editorial_cover_ad` — editorial magazine cover (System 1 flavor)
- `quote_card` — pull quote (System 1 / 4)
- `itinerary_toc_card` — TOC-style itinerary (System 1 / 4)
- `contributor_card` — contributor portrait (System 1)
- `type_hook_card` — type-only 9:16 (System 4)
- `image_detail_ad` — image + type 1.91:1 (System 4)

**Not yet implemented:** System 2 postcard hero, boarding pass, baggage tag, air-mail social; System 3 zine cover, liner-notes spread, sticker sheet.

### Phased Rollout Status

| Phase | Status | Description |
|-------|--------|-------------|
| P1 | ✅ Done | Stop generating whole scenes; System 4 base library built |
| P2 | Planned | System 2 warm flavor templates |
| P3 | Planned | System 1 premium + System 3 subculture templates |
| P4 | Planned | Cross-format propagation: video scene briefs, merch from tokens |

### For Agent Writers

When generating image prompts or ad briefs, check `identityBlueprint.visualFlavor` and:
1. Follow the prompt language template for that flavor system
2. Request only the documentary kinds listed for that flavor in the cross-format table above
3. Apply the material language vocabulary for that system in every prompt
4. Do not generate whole "people doing niche thing on deck" scenes — documentary modules only
5. The `forbiddenDefaults` list in the blueprint is campaign-specific; add the flavor system's generic anti-defaults on top

---

## Design North Star

> "This is a real cruise, but it feels *designed for people like me*."
>
> That feeling almost never comes from a single image. It comes from **specific words**, **chosen artifacts**, and **a designed world** that holds the image instead of asking the image to be the world.
