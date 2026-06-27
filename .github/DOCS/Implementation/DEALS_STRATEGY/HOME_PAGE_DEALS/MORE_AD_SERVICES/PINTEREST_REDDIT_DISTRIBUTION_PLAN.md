# Pinterest and Reddit Distribution Plan

## Goal

Add Pinterest and Reddit as first-class ad/distribution channels for Home Page Deals without rebuilding the existing campaign system from scratch.

The key design principle is to split the work into two layers:

1. Shared creative and approval logic.
2. Channel-specific delivery adapters for paid and organic publishing.

That lets us reuse the existing deal funnel, copy, image, and review pipeline while keeping Pinterest and Reddit implementation details isolated.

## What Can Be Reused

We should reuse the same upstream assets that already power Meta and Google:

- Deal funnel synthesis output: landing page copy, carousel copy, and curated image sets.
- Creative generation patterns: prompt interpolation, editable text fields, image generation, history, and revert.
- Approval and validation behavior: warn on limits, do not silently truncate, and keep operator review in the loop.
- Distribution scheduling concepts: a plan first, then a dispatch step.
- Community discovery and research: the repo already searches Reddit and other community-native sources for audience signals.

For Pinterest specifically, the existing design system already proves that Pinterest can sit inside the broader campaign media pipeline as a caption and asset target. The repo also already treats Pinterest as a long-tail discovery surface in the distribution schedule.

For Reddit, the repo already has community search and Reddit placement logic in the Google Ads targeting layer. That is a useful signal source, but it should not be confused with a Reddit-native publishing system.

## Recommended Architecture

### 1. Shared channel contract

Create a common distribution interface that all channels implement, something like:

- `buildPlan(input)`
- `validatePlan(plan)`
- `publish(plan, mode)`
- `loadStatus(id)`
- `revertLastPublish(id)`

This keeps the app from hardcoding Pinterest or Reddit logic into the lab UI, API routes, or cache layer.

### 2. Separate organic and paid adapters

Each platform should have two execution paths:

- Organic: create and schedule native posts, pins, or community content.
- Paid: create ad objects, campaigns, targeting, and reporting records.

The two paths should share creative inputs but never share the same publish contract, because the platform rules are different.

### 3. Shared creative package

Build one normalized creative package from the funnel synthesis and let each platform map from that package into its own shape.

Suggested shared fields:

- `dealId`
- `synthesisId`
- `headline`
- `body`
- `cta`
- `primaryImage`
- `secondaryImage`
- `landingUrl`
- `utmTemplate`
- `audienceSignals`
- `boardOrCommunityHints`

Pinterest can map this into pin title, pin description, board choice, and image crop.
Reddit can map this into post title, body, subreddit or placement hints, and link formatting.

## Pinterest Suggestions

### Organic

Pinterest organic is the better fit for automation and reuse.

Why:

- It is visual-first.
- It tolerates evergreen travel inspiration better than most social feeds.
- The existing campaign media pipeline already produces strong image-led assets.
- The repo already frames Pinterest as long-tail discovery.

Suggested implementation:

- Use the funnel synthesis hero and gallery images as source material.
- Generate a small set of pin titles and descriptions from the deal copy.
- Add board routing by theme, destination, traveler type, or occasion.
- Schedule pins on a cadence instead of trying to emulate real-time social posting.
- Keep one canonical landing URL per deal and append UTM parameters per pin.

Best practice:

- Treat organic Pinterest as evergreen distribution, not a one-time launch blast.
- Reuse the same visual asset across several boards only if the pin copy and audience angle change.
- Prefer a small number of high-quality pins over high-volume reposting.

### Paid

Pinterest paid should be implemented as a separate adapter, not as a variant of the organic pin flow.

Suggested implementation:

- Build a Pinterest ad draft object from the shared creative package.
- Generate ad-ready crops and dimensions for the platform's promoted pin formats.
- Store ad account IDs, campaign IDs, ad group IDs, and pin IDs separately from organic pin records.
- Add audience targeting fields for interests, keywords, retargeting, and optional lookalikes if available.
- Make the first version pause-by-default and require operator approval before launch.

Reuse potential:

- Creative assembly, validation, prompt generation, and image generation can be shared.
- Only the final payload shape and publishing API should be Pinterest-specific.

## Reddit Suggestions

### Organic

Reddit organic should be handled carefully. It is viable, but only if we treat it as community participation rather than content syndication.

Suggested implementation:

- Use Reddit only where the deal topic genuinely fits an existing community.
- Pull subreddit suggestions from research signals, not from keyword invention.
- Require manual review before posting, because tone and authenticity matter more than on Pinterest.
- Publish as community-native content: discussion prompt, helpful trip framing, or experience-driven post, not a hard sell.
- Keep a log of subreddit, post type, and moderation outcome.

Important guardrail:

- Do not automate spammy cross-posting.
- Do not fabricate subreddit fit from broad travel keywords.
- Do not force every deal into Reddit just because it can accept links.

Suggested implementation shape:

- A Reddit post composer that builds title, body, link, and CTA variants from the deal creative package.
- A community fit scoring step that surfaces candidate subreddits from real research.
- A manual publish queue with approval state.
- A post-performance record that tracks upvotes, comments, removals, and traffic.

### Paid

Reddit paid should be handled as a separate paid media adapter.

Suggested implementation:

- Build Reddit campaign/ad group/ad creative entities from the shared creative package.
- Support placement or community targeting where Reddit allows it.
- Use different copy rules than Pinterest: Reddit copy should sound native and conversational.
- Keep images optional but supported, because Reddit can be text-led.
- Record moderation risk, subreddit suitability, and conversion intent as part of the planning step.

Reuse potential:

- Deal funnel synthesis can still provide the source angle, imagery, and landing page.
- The targeting and delivery layer must be Reddit-specific.

## Shared Data Model Recommendation

Create one top-level distribution record with per-channel children.

Example shape:

- `channel`: `pinterest` or `reddit`
- `mode`: `organic` or `paid`
- `status`: `draft`, `planned`, `scheduled`, `published`, `failed`
- `creativeId`
- `sourceSynthesisId`
- `targeting`
- `destinationUrl`
- `publishMetadata`
- `performance`

This makes it possible to compare organic and paid results across both platforms without mixing their operational details.

## Implementation Order

1. Add shared distribution contracts and data types.
2. Build Pinterest organic first.
3. Build Reddit organic second, with manual approval and community-fit checks.
4. Add Pinterest paid as a draft-only adapter.
5. Add Reddit paid as a draft-only adapter.
6. Add dashboard cards and a review/status panel per channel.
7. Add reporting fields so organic and paid performance can be compared.

## Practical Recommendation

If the goal is fastest value with the least new surface area, do this order:

- Pinterest organic first.
- Reddit paid second.
- Pinterest paid third.
- Reddit organic last.

Reason:

- Pinterest organic can reuse the most existing creative infrastructure.
- Reddit paid is more controllable than Reddit organic.
- Pinterest paid is the cleanest paid extension once the organic pin model exists.
- Reddit organic has the most brand-safety and community-fit risk.

## Bottom Line

We do not need four separate systems. We need one shared creative engine and four delivery modes:

- Pinterest organic.
- Pinterest paid.
- Reddit organic.
- Reddit paid.

The shared part should handle creative generation, validation, and approval. The channel-specific part should handle posting rules, ad object creation, targeting, moderation, and reporting.
