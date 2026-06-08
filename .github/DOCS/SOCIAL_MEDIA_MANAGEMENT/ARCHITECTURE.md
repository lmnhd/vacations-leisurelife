# Social Media Management — Vision & Reference

> **This is the original vision document and a Meta Graph API reference.** It is *not* the
> implementation plan. The canonical, current plan lives in:
> - **[ROADMAP.md](./ROADMAP.md)** — index, phase status, guiding principles
> - **[PHASE_1_LAUNCH_POSTING.md](./PHASE_1_LAUNCH_POSTING.md)** — ✅ implemented
> - **[PHASE_2_ENGAGEMENT.md](./PHASE_2_ENGAGEMENT.md)** — ⏳ planned
>
> Earlier drafts of this file proposed a standalone `social:sync` runner as the core design
> and made preliminary assumptions about existing code. Those parts were superseded once the
> codebase was explored — organic posting instead **rides the existing distribution dispatch**
> (see ROADMAP "Guiding principle"). Conflicting design detail has been removed; what remains
> below is the durable product vision and the Graph API reference the phase docs build on.

## System Overview
The social-media manager handles inbound engagement on Facebook and Instagram and keeps the
pages active with organic content, leveraging the existing `CampaignMediaManifest` (ad copy,
aesthetic briefs, and assets) so responses and posts align with active marketing campaigns.

## Meta Graph API Requirements
The system interfaces with Meta's Graph API (v22.0+):
- **Content Publishing**:
  - `POST /{ig_user_id}/media` & `POST /{ig_user_id}/media_publish`: Instagram organic posts (Images, Carousels, Reels).
  - `POST /{page_id}/photos` & `POST /{page_id}/feed`: Facebook Page organic posts.
- **Engagement (Batch Processing)**:
  - Polling `GET /{ig_user_id}/media?fields=comments` or `GET /{page_id}/conversations` on a periodic schedule to handle replies without requiring real-time webhooks.
- **Required Permissions**:
  - `instagram_manage_comments` & `pages_manage_engagement`: read and reply to public post comments.
  - `instagram_manage_messages` & `pages_messaging`: read and reply to Direct Messages.
  - `instagram_content_publish` & `pages_manage_posts`: publish organic content.

---

## Organic Content Strategies (the long-term content vision)

To make the pages "look alive," the system uses a steady drip of organic content. Strategy 1
is implemented (Phase 1); Strategies 2–5 are planned for Phase 2b — see
[PHASE_2_ENGAGEMENT.md](./PHASE_2_ENGAGEMENT.md) for how each maps onto the distribution
pipeline.

### Strategy 1: The Campaign Launch Flyer ✅ (Phase 1)
The most reliable, immediate organic content is the campaign launch itself.
- **Assets Used**: `manifest.images.flyerImages` (or primary hero if no flyer).
- **Workflow**: when a campaign launches, post the promotional flyer + a short announcement
  caption derived from the brief, to the Facebook Page and Instagram feed — a steady heartbeat
  of professional content matching the paid ads.

### Strategy 2: The VTG "Deal of the Week" (High Conversion)
Travelers follow agency pages for exclusive deals. Leverages `lib/chat/tools/vtg-search.ts`.
- Weekly: find top deals from popular ports (Miami, Port Canaveral); generate a price-overlay
  graphic; caption drives into the DMs ("DM us 'DEAL'…") where the chat pipeline closes the sale.

### Strategy 3: The "Ship vs. Ship" Engagement Poll
Polls generate comments, which the algorithm rewards.
- Pull two images from `shipReferences` (e.g. megaship vs. quiet luxury); post a carousel /
  split image; "Which is your vibe?" — zero new asset generation, trains the algorithm to favor
  the page and lowers ad costs.

### Strategy 4: The FOMO Countdown
For campaigns with a launch date or limited founder's-pricing window.
- **Assets Used**: `manifest.videos.countdown` or generated text graphics.
- 48h before a launch/price increase, post an urgency reminder ("Only 48 hours left…").

### Strategy 5: Port Highlight Carousels
Cruisers care about the destination as much as the ship.
- **Assets Used**: `cruise-ports.ts` data + SerpAPI destination images.
- Select a popular itinerary from an active campaign; post a 3-photo destination carousel.
