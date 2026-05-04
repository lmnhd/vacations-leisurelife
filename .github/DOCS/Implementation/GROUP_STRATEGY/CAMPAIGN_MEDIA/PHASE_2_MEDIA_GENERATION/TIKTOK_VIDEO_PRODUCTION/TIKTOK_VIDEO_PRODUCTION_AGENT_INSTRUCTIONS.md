# TikTok Video Production Agent Instructions

## Overview

This document synthesizes the design principles from the Claude Design handoff (lli-TikTokVideo-handoff.zip) into specific, actionable instructions for agents building the TikTok video system for Leisure Life's "Board Games at Sea" campaign.

The core thesis: **Sell the relief of not having to explain yourself, using the only thing your AI can actually render: hands, tables, light, and the occasional porthole.**

For concrete good/bad references while refining output, use [CAMPAIGN_EXAMPLES.md](../../CAMPAIGN_EXAMPLES.md). It shows what to copy, what to avoid, and where "close but generic" usually goes wrong.

## Core Constraints

- **AI Capabilities**: Image-to-video via RunwayML/Fal, composite with ffmpeg, ElevenLabs TTS, text overlays.
- **Cannot Do**: Real people, complex multi-character interactions, true camera perspective changes.
- **Must Do**: Hands, tables, light, portholes as primary subjects.

**Text overlay reality check:** TikTok renders now include explicit overlay cards in the compositor, so visible text is part of the deliverable, not just prompt guidance. If a format relies on on-screen copy and the rendered MP4 does not show it, treat that as an incomplete asset and repair the render before moving on.

**Package-first rule:** The preferred TikTok seed path is now a packaged still-image ad, not a motion-first image-to-video cut. Use the scene images as the visual base, frame them with the overlay package, and let typography, layout, and pacing do the heavy lifting. Motion inside the source image is optional, not the main value proposition.

**Template-first rule:** Build and refine the reusable TikTok package in the media-generation flow before spending on live campaign reruns. The exported MP4 should be a full-frame 9:16 ad that keeps the source still at full size and places text around it. Do not crop or zoom the still just to make it fill the canvas. For the shared template architecture, see [TIKTOK_TEMPLATE_SYSTEM.md](./TIKTOK_TEMPLATE_SYSTEM.md).
**Editorial frame rule:** The frame should feel like a commercial layout, not an app panel. Use wide top/bottom bands, stronger text hierarchy, and a styled backdrop behind the centered still so the empty space reads as intentional design.
**Sequence planner rule:** The three presets are the visual grammar. Use them as repeating building blocks across a 6-8 beat sequence so the ad feels like a finished commercial run, not a single repeated card.
**Late-stage synthesis rule:** Do not assume the best TikTok copy was already solved in the earliest brief fields. Once scenes, designed ads, and audio direction are substantially in place, run a late-stage promotion synthesis pass that extracts the strongest phrases from the mature campaign state and turns them into the final TikTok beat package.
**No-fallback copy rule:** Production TikTok renders should use the synthesized promotion package only. Do not silently recycle `heroSlogan`, `subSlogan`, or other brief-era fields if synthesis is missing or thin. If the package is not usable, the render should fail and be repaired.
**Narration rule:** Give each beat a short `spokenText` line for ElevenLabs. Keep the copy aligned to the on-screen text, but do not rely on beat-level audio choreography as the only way to make the package work. The current render flow can also build one continuous voiceover from the full sequence.
**Audio mix rule:** The final MP4 should keep narration audible over the package and layer the music bed underneath it. If the voice gets brittle or hard to follow, simplify the script before changing the mix.

## Marketing Frame Priority

**Primary Frame (60% of output)**: Relief - "Finally, a vacation where you don't have to explain your hobby."

- Hook: Confession-style, private thought said out loud.
- Why: Recognition spike in 1.5s.

**Secondary Frame (25%)**: Identity - "Group travel for board game people."

- Hook: Proud-niche cohort, high comment rate.

**Tertiary Frame (15%)**: Social - "A cruise where the people are the point."

- Hook: FOMO + parasocial, strongest mid-funnel.

## Formats to Implement

1. **POV-TEXT** (Primary): First-person framing, full-bleed text overlays, ambient audio, 12-18s.
2. **LISTICLE**: "3 things on a board game cruise". 3-4s per beat, hard cuts, 18-25s.
3. **ASMR-AMBIENCE**: No text in first 3s. Pure diegetic sound. Text resolves tension at 6s. 15-20s.
4. **CONFESSION**: Single sustained pull-quote, slow text reveal, one image, one sound. 8-12s.

For the TikTok seed video specifically, prefer a six-beat structure over a four-beat one when the scene library is strong enough to support it. Faster cuts are better than lingering on one or two good-looking shots because they reduce AI-anomaly scrutiny and make the ad feel intentionally edited.
When the scene set is strong enough, the preferred TikTok seed is a static-package edit: still scenes, designed text cards, and quick beat changes. Do not spend credits chasing subtle motion if the package itself can carry the ad.
The current implementation favors a single continuous narration script over the whole package rather than complex per-beat dialogue timing. Use beat copy to shape the sequence, but let the overall 9:16 ad remain the primary unit.
Do not let one small brief-era slogan bundle dictate all six beats. The final beat language should be harvested from the best downstream campaign material available right before TikTok render.

## Composition Library - What to Use

**Green (Primary Compositions)**:

- Tight crop on hands + tiles: Fingers entering frame, placing meeple. No face visible.
- Over-the-shoulder, head out of frame: Board state in focus, implies person.
- Porthole + foreground game: Ship as context, wake outside, board inside.
- Dice + cards on textured table: Macro-scale objects, slight tumble/flip.
- Drink + warm light + game piece: After-hours mood, condensation, golden bulb.
- Crowded table, motion blur, no faces: Six pairs of arms, reach blur.

**Red (Reject at Source)**:

- Empty pool deck/atrium: Instant scroll.
- Centered face mid-laugh: Uncanny.
- Drone shot of ship: Every cruise line.
- Chandelier in marble lobby: Brochure energy.
- Sunset over railing: Overused.
- First-person with both arms visible: Technical fail.
- Logo card before second 25: Kills retention.

## Storyboard Templates

Implement these five videos first, then iterate:

1. **POV-TEXT · RELIEF**: "nobody on this ship is going to ask what i do for a living"
   - Frame 1: Hand places meeple, text overlay.
   - Frame 2: Porthole horizon drift.
   - Frame 3: Dice tumble.
   - Frame 4: Crowd blur.
   - Frame 5: Logo CTA.

2. **LISTICLE · IDENTITY**: "things in my carry-on for a board game cruise"
   - Carry-on opens, items slide in one by one.
   - 5 items: expansions, meeples, lucky die, cocktail, ocean.
   - Absurd reveal: "the actual entire ocean".

3. **ASMR-AMBIENCE**: "no narration. just the sounds of game night at sea."
   - Silent first 3s: dice tumble, card shuffle, ice clink.
   - Text at 6s: "sound on."
   - Resolve with brand.

4. **CONFESSION · RELIEF**: "one image. one sentence. one truth."
   - Sustained over-shoulder shot.
   - Two-line text reveal.

5. **POV-TEXT · IDENTITY**: "pov: it's 1am and we're still playing twilight imperium"
   - Late-night lounge, specific game name.

## Prompt Engineering Rules

### Source Image Prompts

- Always include: 9:16 portrait, shallow depth, warm tungsten 2700K.
- Negative: faces, multiple hands, plastic surfaces, fluorescent light, smooth tabletops.
- Example: "Tight overhead crop of human fingers entering frame from bottom-right, hovering over a hexagonal wooden game tile on a dark walnut surface. Shallow depth of field, focus on the tile. Warm tungsten 2700K key light from upper-left, soft fill. Visible wood grain on table. No face. No second hand."

### Motion Prompts

- Single in-frame action only.
- No camera moves: no zoom, pan, dolly, perspective change.
- Example: "Animate this image: a single human hand enters frame from bottom-right at 0.5x speed, fingertips approach the wooden meeple, gently set it down on the hex tile. Total motion: 1.5 seconds. Subtle handheld camera breath (0.5 degree sway)."

### Audio Rules

- Primary: Diegetic ASMR (dice clatter, card shuffle, glass).
- Ambient bed: lounge murmur, ship hum.
- Music: warm synth, ~70bpm, no lyrics.
- TTS Emergency Only: Bella/Adam, 0.85x speed, max 8 words.

## Lint Scorecard (Must Score >70 to Ship)

- Hook lands inside 1.5s (15pts)
- First frame contains hands/board/porthole (12pts)
- No face focal subject (10pts)
- Text card every 1.5-3s in first 8s (10pts)
- All motion in-frame (10pts)
- Diegetic audio in 2+ frames (8pts)
- No TTS in first 6s (8pts)
- Ship as context only (7pts)
- CTA comment trigger (7pts)
- 8-22s length (5pts)
- No emoji (4pts)
- Hard cuts only (4pts)

## Rejection Wall (Kill Immediately)

- Empty pool/atrium/dining room
- Voiceover "your people"/"discover"/"escape"
- Centered face mid-laugh/sip
- Drone shot of ship
- Sunset over railing as climax
- Slow Ken Burns pan >4s
- Same source image reused with zoom
- Logo before second 25
- Adjective stack ("luxurious cozy unforgettable")
- Music swells under narration to sunset

## Implementation Notes for Agents

- **Text First**: Text does narrative work; video is mood.
- **Hard Cuts**: No fades, no dissolves.
- **Ambient Audio**: No narration unless stakeholder forces it.
- **Ship as Punchline**: Context, not product.
- **Hands = People**: Focus on activity, not faces.
- **Test Everything**: Run through scorecard before output.
- **Iterate from Templates**: Build the five videos first, then adapt.
- **Repair Before Scale**: When a campaign still feels generic, use the recovery loop in [CAMPAIGN_REPAIR_PLAYBOOK.md](../../CAMPAIGN_REPAIR_PLAYBOOK.md) before widening scope. Fix the source artifact, regenerate only the affected family, and stop for review before moving on.
- **Overlay Cards Are Real**: TikTok seed and paid variants should render their hook/proof/CTA cards into the MP4. Prompt language is not enough. If the frame reads as clip-only, the render is incomplete.
- **Full-Frame Package Rule**: The final TikTok export is the ad. The still image should stay intact and visible inside the vertical frame, with text bands and CTA scaffolding built around it. If the image is being cropped or blown up just to fill space, the template needs repair.
- **Faster Beats Win**: Use more cuts when the source scene set is strong. Shorter beats and clearer text blocks usually beat a long clip that invites nitpicking.
- **Late Copy Harvesting Beats Early Guessing**: If the campaign's strongest language only becomes obvious after scenes, designed ads, or audio work, trust the later evidence. Build the TikTok beat package from the mature campaign state instead of forcing the renderer to live off a tiny early copy set.
- **Use Examples as a Lens**: If a shot or render feels technically correct but emotionally flat, compare it to [CAMPAIGN_EXAMPLES.md](../../CAMPAIGN_EXAMPLES.md) before changing the whole workflow. The examples page is the fastest way to see whether the issue is the source image, the overlay language, or the motion treatment.

## Final Thesis

You're not in the cruise business. You're in the "you don't have to explain yourself" business. The ship is the punchline. The board is the subject. The hands are the people. The text is the script. Anything else, kill it.</content>
<parameter name="filePath">c:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive\.github\DOCS\Implementation\GROUP_STRATEGY\CAMPAIGN_MEDIA\PHASE_2_MEDIA_GENERATION\TIKTOK_VIDEO_PRODUCTION\TIKTOK_VIDEO_PRODUCTION_AGENT_INSTRUCTIONS.md
