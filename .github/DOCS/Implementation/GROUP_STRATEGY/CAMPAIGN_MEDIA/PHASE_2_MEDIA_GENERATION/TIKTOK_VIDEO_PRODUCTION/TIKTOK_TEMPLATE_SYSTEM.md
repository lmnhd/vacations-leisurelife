# TikTok Template System

**Status:** working draft
**Purpose:** define the reusable, full-frame TikTok ad template system that turns campaign stills into packaged vertical promos without relying on motion-first video generation.

## 1. Core Idea

The ad is the full 9:16 video.

The video should be built from:

- full-resolution still images
- text overlays / banners / CTA scaffolding
- light motion on the composition
- optional narration or sound design

The still image is the truth layer. Do not crop, zoom, or re-frame the image just to fill the canvas.
When the still does not fill the vertical frame, use a styled backdrop or softened duplicate of the same image behind it so the empty bands feel designed instead of dead.

## 2. What We Are Building

We are building a reusable template engine that:

1. takes a campaign's approved still images
2. places them into a fixed vertical package
3. adds text bands and CTA zones
4. applies limited motion if needed
5. renders a TikTok-ready MP4

This is closer to a Canva-style presentation system than a motion-video generator.

## 3. Composition Rules

- Keep the source image intact and fully visible.
- Use vertical spacing around the image for text, CTA, and pacing.
- Use the empty frame space as part of the design; if needed, add a blurred or color-treated backdrop behind the centered still.
- Use consistent template zones so campaign swaps are cheap.
- Prefer type, layout, and sequencing over heavy image animation.
- If motion is used, keep it subtle and deterministic.
- Treat the typography as commercial copy, not metadata. Headline blocks should feel like ad statements, not inspector labels.
- Favor wide editorial bands, stronger hierarchy, and generous breathing room over compact rounded widgets.

## 4. Template Layers

### Layer 1: Full-resolution image

The image should remain untouched and readable.

### Layer 2: Text presentation

Text can sit above, below, or alongside the image depending on the template.
Text should carry the hook, proof, or CTA.

### Layer 3: Package frame

The surrounding design makes the ad feel intentional and commercial.
At this stage, the frame should feel like a polished poster or mini editorial spread, not an app mockup.

### Layer 4: Optional motion

Light fades, slides, text reveals, and simple transitions are fine.
Heavy scene animation is optional, not required.

## 4. Current Working Direction

The current best version of the template is:

- a full-frame 9:16 export
- a full-resolution still preserved in the center lane
- a styled backdrop filling the remainder of the frame
- a top hook band and bottom CTA / proof band
- typography that feels like campaign copy rather than technical metadata

This is the direction to refine until the template feels like a finished commercial package.

## 5. Sandbox Workflow

Use the sandbox to:

- test template presets
- edit overlay copy
- adjust color tokens
- swap scene images
- confirm the full-frame composition before live generation

The sandbox is for template development. It is not the final export shape.

## 6. Build Order

1. Create or refine the reusable template.
2. Render preview clips from approved stills.
3. Review the preview in the sandbox.
4. Lock the template.
5. Reuse the template across campaigns by swapping image and copy inputs.

## 7. Handoff Rule

When the template looks good:

- document the template decision in the TikTok production plan
- update the TikTok agent instructions
- update the campaign generation skill so later agents follow the same flow
- stop using live generation as a design lab
