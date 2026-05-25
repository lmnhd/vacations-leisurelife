# Gold Standard Ad Reference - Reset by Sea

**Added:** 2026-05-24
**Reference campaign:** `wellness-and-nature-cruise`
**Reference asset:** `ad_image_detail_191x100`
**Source image:** `doc_detail_motion_plate_05`
**Status:** Canonical quality reference for the Canva/Templated rebuild.

---

## Why This One Worked

This ad is the strongest current example of the desired campaign-media standard. It should be treated as a reusable quality target, not as a reason to keep the older deterministic renderer.

The win came from three layers lining up:

1. **Image:** a cinematic cruise-native source frame with warm horizon light, ship materials, subtle wellness props, and quiet human presence.
2. **Template:** a restrained premium layout that gives the image half the canvas, then uses dark negative space, an accent rule, and a clean right-side copy panel.
3. **Copy:** short, confident, sensory writing: `Reset by Sea.` plus a concrete supporting sentence and a calm CTA.

The result feels elegant, expensive, believable, and campaign-specific without looking like a generic cruise brochure or an over-literal wellness event.

---

## Source Image Recipe

The source image that made the ad sing was:

`doc_detail_motion_plate_05`

It was generated as a `documentary_detail_image` with the `motion_plate` tag. The important prompt traits were:

- Cinematic cruise source frame.
- Ocean horizon through lounge glass.
- Warm light across wood.
- One subtle niche object.
- Premium atmosphere.
- Environment-led composition.
- Quiet background human presence, reflection, or partial silhouette.
- No action, no event setup.
- Cruise-native materials: teak, brass, glass, steel, cabin textiles, railings, portholes, sea light.
- Strong negative space so the image can sit inside a designed ad module.

The imperfect parts of the prompt should not be copied blindly. This particular record also carried stale music-like cue language (`record sleeve`, `guitar pick`, etc.). The usable lesson is the visual grammar, not every literal prompt token.

### Reusable Image Standard

For premium ad slots, ask for:

```text
Cinematic cruise-native source frame. Horizon or sea light visible through real ship architecture. Warm natural light across tactile materials like wood, linen, ceramic, brass, glass, or railings. One subtle niche cue only. Include quiet human presence as background silhouettes, reflection, hands, or partial figures; never staged posing. Premium atmosphere, environment-led composition, clean negative space for typography. No signage, logos, readable text, event setup, workshop scene, or brochure-like crowd.
```

---

## Template Recipe

The old renderer used:

`system_4_modular` -> `image_detail_ad`

Important layout traits:

- 1.91:1 landscape canvas (`1200 x 628`).
- Left image area takes about 52% of the canvas.
- Right-edge gradient blends the image into the dark panel.
- Right panel uses a deep black/navy gradient.
- Thin vertical accent rule separates image and type.
- Small outline campaign badge in the top-right.
- Tiny uppercase destination eyebrow.
- Large short headline.
- Compact supporting subhead.
- Soft pill CTA.
- Bottom metadata strip for vessel and departure.

This is the core structure to recreate in Canva/Templated as a premium display template. The new system should make it editable, but preserve the hierarchy and restraint.

---

## Copy Recipe

The copy worked because it was not trying to explain everything.

Effective pattern:

```text
Headline: Reset by Sea.
Subhead: Six Western Caribbean nights on Icon of the Seas, with sunrise stretches, slow breaths, and plenty of time to just cruise.
CTA: Reserve Your Reset
```

Reusable copy rules:

- Headline should be 2-5 words.
- Use one strong campaign verb or state: `Reset`, `Stretch`, `Breathe`, `Drift`, `Gather`, `Play`, `Unwind`.
- Tie the emotional promise to the sea, ship, horizon, table, deck, or other cruise-native anchor.
- Subhead can carry the itinerary context, but it must stay sensory and human.
- CTA should echo the promise instead of using generic urgency.

Avoid:

- Generic cruise language: `Book now`, `Luxury awaits`, `Set sail`.
- Over-literal event copy: `Join yoga classes every morning`.
- Crowded benefit stacks.
- Copy that competes with the image for attention.

---

## What To Pull Into Canva Ads

When building the Canva/Templated successor, create a first-class premium-display family that intentionally follows this example.

Suggested format:

`google_display_landscape` or `meta_feed_landscape` if added later.

Suggested slot contract:

```json
{
  "headline": "2-5 word emotional promise, no logistics",
  "subhead": "one sensory sentence, may include route/ship/duration if it stays elegant",
  "cta": "promise-led imperative",
  "eyebrow": "route or small campaign context",
  "vessel": "auto-injected",
  "departure": "auto-injected",
  "hero_image": "premium cinematic cruise-native source frame"
}
```

Suggested image slot requirements:

- `hero_image` must prefer `scene_image` or `documentary_detail_image` only when the asset has premium display suitability.
- Require tags or curation context equivalent to: `cinematic`, `headline-safe`, `travel-first`, `quiet`, `premium`, `human-presence`, `negative-space`.
- Block still-life/detail assets that are too object-forward for a full hero panel.

---

## Quality Bar

A generated ad is close to this standard when:

- It feels like a premium travel/lifestyle brand, not a template demo.
- The image could stand alone as a campaign still.
- The headline is memorable without being clever for its own sake.
- The subhead adds specificity without becoming an itinerary dump.
- The CTA feels native to the emotional promise.
- There is enough silence, darkness, margin, and negative space for the whole composition to breathe.

This reference should be used during the upcoming prompt cleanup as an example of what the whole pipeline is trying to produce.
