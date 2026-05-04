# TikTok Template System

**Status:** production template system
**Purpose:** define the reusable, full-frame TikTok ad template system that turns campaign stills and late-stage campaign synthesis copy into packaged vertical promos without relying on motion-first video generation.

## 1. Core Idea

The ad is the full 9:16 video.

The video should be built from:

- full-resolution still images
- text overlays / banners / CTA scaffolding
- light motion on the composition
- optional narration or sound design

The still image is the truth layer. Do not crop, zoom, or re-frame the image just to fill the canvas.
When the still does not fill the vertical frame, use a styled backdrop or softened duplicate of the same image behind it so the empty bands feel designed instead of dead.

## 2. What This System Does

The current production system uses a reusable template engine that:

1. takes a campaign's approved still images
2. places them into a fixed vertical package
3. adds text bands and CTA zones
4. applies limited motion if needed
5. renders a TikTok-ready MP4

This is closer to a Canva-style presentation system than a motion-video generator.

## 3. Composition Rules

- Keep the source image intact and fully visible.
- Use vertical spacing around the image for text, CTA, and pacing.
- Use the empty frame space as part of the design; the backdrop is a dimmed, blurred duplicate of the same still.
- Soften the seam between contained still and backdrop with a feathered alpha edge — never a hard letterbox cut.
- Use consistent template zones so campaign swaps are cheap.
- Prefer type, layout, and sequencing over heavy image animation.
- If motion is used, keep it subtle and deterministic. The backdrop carries the motion (slow parallax zoom); the foreground photo stays anchored.
- Treat the typography as commercial copy, not metadata. Headline blocks should feel like ad statements, not inspector labels.
- Favor wide editorial bands, stronger hierarchy, and generous breathing room over compact rounded widgets.

## 4. Template Layers

### Layer 1: Backdrop (Layer 0 in the render pipeline)

A cover-fit, blurred, color-graded duplicate of the same still. Receives the slow parallax zoom that gives the clip motion. Implemented in `createContainedStillVerticalClip` ([video-composer.ts](../../../../../../lib/campaigns/media/video-composer.ts)).

### Layer 2: Foreground photo

The campaign still, contained-fit (no crop), centered. Top/bottom edges feathered (alpha gradient) so the seam against the backdrop is invisible.

### Layer 3: Text presentation (cards)

Three card variants drive the entire system. They are all 9:16-aware and fade in (~0.28s) at clip start, fade out (~0.35s) at clip end.

| Variant | Role | Footprint | Type weight | Anchor |
|---|---|---|---|---|
| `tag` | Hook tag at top — draws the eye, names the beat. Lower visual weight than the statement so the photo still owns the frame. | ~940×200 | 14pt mono badge / 34pt sans headline / 18pt sans subline | top-aligned content, accent strip on the LEFT edge |
| `statement` | The dominant message. Bottom-of-frame anchor with the largest type and full presence. | ~940×320 | 18pt mono badge / 64pt sans-black headline / 24pt sans subline | bottom-aligned content, accent strip on the TOP edge |
| `cta` | Pill-shaped action. Filled accent background, dark text, arrow puck on the right. | ~800×110 | 16pt mono badge / 38pt sans-black headline | center-aligned, fully rounded (height/2 radius) |

Card styling:
- Backgrounds use a near-black gradient (`rgba(6,8,14,0.78→0.62)`) for dark cards; CTA is filled with the accent color directly.
- Borders use the per-card `accentColor` at reduced alpha (NOT a hardcoded gold). Each card spec carries `accentColor` plus an `accentMuted` variant for two-step intensity.

### Layer 4: Brand lockup

A small fixed wordmark + tagline (e.g. `LEISURE LIFE — CRUISES THAT FIT`) anchored top-left, persistent across the full clip (does not fade with cards). Sits in the backdrop band above the contained photo.

### Layer 5: Film grain finisher

A 4–8 strength temporal+uniform `noise` pass over the composed frame unifies type and photo so the cards don't read as pasted-on. Optional but on by default in the production preview render.

## 6. Sequence Layer

The template is not just one panel. It is a repeatable sequence of panels.

- Build each beat as a standalone package: still, backdrop, typography, CTA.
- Give each beat a `spokenText` line that the ElevenLabs voice can read; keep it short enough to fit naturally inside the visual beat.
- The current production workflow favors one continuous narration script built from the full sequence, not fragile beat-by-beat audio stitching.
- Keep the package duration predictable. The working preview uses an approximately 35-second window and distributes the beats evenly across that span.
- The exported MP4 should keep narration audible over the package, then mix the music bed underneath it.
- Chain beats together with light crossfades or hard cuts depending on the preset.
- Keep the still image intact inside every beat; the transition should move the composition, not crop the source.
- Prefer 6–8 beats for the strongest TikTok packages so the ad feels deliberate and fast enough to avoid lingering on one frame.
- Allow one beat to be the hook, one to be social proof, one to be the payoff, and one to be the CTA close.
- Treat the sequence order as part of the template decision, not an afterthought.

## 7. Safe Areas (1080×1920)

Reserve from each edge so cards don't collide with TikTok's UI chrome:

| Edge | Reserve (px) | What lives there |
|---|---|---|
| Top | 200 | status bar, top tabs (Following / For You) |
| Bottom | 380 | caption text, username, follow button |
| Right | 130 | like / comment / share / profile rail |

The preview render shows dashed rose guides at these boundaries when "Show safe-area guides" is on.

## 8. Motion Language

- **Backdrop:** ~5% zoom over clip duration via `zoompan`. Feels cinematic, not animated.
- **Foreground:** static. Image truth requires it.
- **Cards:** fade in (0.28s), fade out (0.35s). No slide-in or position animation — the type is the ad, not the choreography.
- **Brand lockup:** no fade, persistent.

## 9. Three Working Presets

The preview ships three named presets that demonstrate one of each card variant in its natural composition:

| Preset | Cards | Use |
|---|---|---|
| `hook` | One `tag` at top | First-beat punch. Photo owns the frame. |
| `social` | `tag` at top + `statement` at bottom | Two-card workhorse. Hook + payoff. |
| `cta` | `statement` mid-frame + `cta` pill below | The closer. Drives the action. |

All three include the brand lockup. Accent colors per preset establish a campaign palette (board-games-at-sea: gold / mint / amber).
These presets are the reusable visual grammar. The sequence planner repeats and varies them across 6-8 beats to create the finished ad.

## 10. Sandbox Workflow

Use the media-generation preview to:

- pick a campaign scene and apply a template preset
- adjust copy, accent colors, and per-card placement
- toggle safe-area guides to verify chrome clearance
- toggle preview-grain to anticipate the final render look
- render a real 1080×1920 MP4 via the same pipeline production will use

The media-generation preview path matches the final render coordinate system (1080×1920) — no design-canvas indirection.
The preview includes a sequence planner that cycles the three presets across multiple beats so you can shape the final flow before live TikTok generation.

## 11. Operating Order

1. Refine the reusable template in the preview when the layout system needs work.
2. Render preview clips from approved stills when validating the package.
3. Review and lock the template behavior.
4. Run the late-stage TikTok promotion synthesis pass against the mature campaign state.
5. Reuse the template across campaigns by swapping image inputs and synthesized beat copy.

## 11A. Late-Stage Promotion Synthesis

The sequence should not be built from one or two early slogans repeated across every beat.

For production TikTok, treat the overlay language as a late-stage promotion synthesis layer:

- the campaign should already be substantially built before the final TikTok package copy is generated
- the TikTok system should harvest the strongest phrases, tensions, proof points, and CTA language from the campaign's mature state
- the reusable part is the layout grammar and beat roles, not a tiny fixed text bundle

Preferred source order for production beat copy:

1. a dedicated late-stage TikTok promotion package created after scenes, designed ads, and audio are in good shape
2. approved campaign brief messaging and social concepts
3. production-bible storyboard and narration material
4. manifest copy and designed-ad language

Production rule:

- there is no fallback copy path for production TikTok renders
- the reusable system should render from the synthesized TikTok promotion package only
- if the package is missing, too thin, or fails to generate, the TikTok render should fail rather than recycle early brief-era slogans

Suggested output contract:

- `role`: `hook`, `proof`, `social`, `payoff`, or `cta`
- `headline`
- `subline`
- `spokenText`
- optional `badge`
- optional `cta`
- optional `sceneHint`

## 12. Maintenance Rule

Once the template behavior is settled:

- document the template decision in the TikTok production plan
- update the TikTok agent instructions
- update the campaign generation skill so later agents follow the same flow
- stop using live generation as a design lab
- keep the late-stage promotion synthesis step separate from early discovery and brief speculation
