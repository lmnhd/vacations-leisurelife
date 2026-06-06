# Social Media Management Architecture

## System Overview
The SOCIAL-MEDIA-MANAGER is an autonomous agent designed to handle inbound engagement on Facebook and Instagram, as well as automatically schedule and publish organic content to keep the pages active. It leverages the existing `CampaignMediaManifest` (ad copy, aesthetic briefs, and assets) to ensure responses and posts align with active marketing campaigns.

## Meta Graph API Requirements
To operate autonomously, the system must interface with Meta's Graph API (v22.0+):
- **Content Publishing**: 
  - `POST /{ig_user_id}/media` & `POST /{ig_user_id}/media_publish`: For Instagram organic posts (Images, Carousels, Reels).
  - `POST /{page_id}/feed`: For Facebook Page organic posts.
- **Engagement (Batch Processing)**:
  - Polling `GET /{ig_user_id}/media?fields=comments` or `GET /{page_id}/conversations` on a periodic schedule (e.g., via cron or a local agent runner) to handle replies without requiring real-time webhooks.
- **Required Permissions**: 
  - `instagram_manage_comments` & `pages_manage_engagement`: To read and reply to public post comments.
  - `instagram_manage_messages` & `pages_messaging`: To read and reply to Direct Messages.
  - `instagram_content_publish` & `pages_manage_posts`: To publish organic content.

## Leveraging Existing Systems

### 1. Organic Content Generation (`CampaignMediaManifest`)
Every campaign generates a wealth of media (hero images, aesthetic concepts, merch mockups, ship references) that currently sits idle if not used in a paid ad.
**Reusability**: We can build a `ContentScheduler` that mines the `CampaignMediaManifest`. It can take an unused `aestheticConcept` image, feed it to an LLM along with the campaign's `heroSlogan` and `nicheAffinity`, and generate an organic Instagram post or Reel caption.

### 2. Marketing Dispatcher (`lib/campaigns/distribution-marketing.ts`)
You already have robust Graph API logic for uploading images, building Instagram Graph containers, and publishing.
**Reusability**: The logic in `dispatchInstagramGraphLive` can be directly reused for organic posting. We simply bypass the `createMetaAdSet` logic and directly publish the Instagram container or Facebook feed post.

### 3. Landing Page Chat (`lib/chat/pipeline.ts`)
For processing inbound comments and messages, the existing 10-stage chat pipeline is highly mature.
**Reusability**: By running a scheduled job locally (e.g., every 4 hours), the agent can fetch new comments/DMs, run them through the chat pipeline (with an `instagram_dm` channel type), and bulk-dispatch replies.

---

## Architectural Focus: Organic Content Automation

To make the pages "look alive" without manual intervention, the system will use a **Content Drip Engine**.

### Strategy 1: The Campaign Launch Flyer
The most reliable and immediate source of organic content is the campaign launch itself.
- **Assets Used**: `manifest.images.flyerImages` (or primary hero image if flyer is unavailable).
- **Workflow**: 
  1. When a campaign transitions to the active/launched state, the system flags it for an organic announcement.
  2. The agent takes the generated promotional flyer and combines it with a short, punchy announcement caption derived from the `CampaignAestheticBrief` (e.g., "New Voyage Announced: [Headline]").
  3. The post is pushed directly to the Facebook Page and Instagram feed. This creates a steady heartbeat of professional content matching the paid ads.

### Strategy 2: The VTG "Deal of the Week" (High Conversion)
Travelers follow agency pages primarily for exclusive deals. We can leverage your existing VTG integration (`lib/chat/tools/vtg-search.ts`).
- **Workflow**:
  1. Once a week, the local agent runner triggers the `vtg-search` tool to find the top 3 deals departing from popular ports (e.g., Miami, Port Canaveral).
  2. It generates a simple graphic (or uses a stock ship image from your references) overlaying the price.
  3. Caption: "Deal Drop ⚓️ 7-Night Caribbean on [Ship] starting at $[Price]. DM us 'DEAL' to claim this rate before it's gone!"
  4. **Why it works**: It explicitly drives users into the DMs where your chat pipeline takes over to close the sale.

### Strategy 3: The "Ship vs. Ship" Engagement Poll
Social media algorithms heavily reward comments. Polls are the easiest way to generate them.
- **Workflow**:
  1. The agent pulls two images from your `shipReferences` library (e.g., an Oasis-class ship vs. an Excel-class ship, or a lively pool deck vs. a quiet adults-only area).
  2. It creates an Instagram Carousel or a side-by-side split image.
  3. Caption: "Which is your vibe? 🌊 A) Action-packed megaships or B) Quiet luxury? Let us know below!"
  4. **Why it works**: Zero new asset generation required. It trains the algorithm that your page gets high engagement, lowering your ad costs.

### Strategy 4: The FOMO Countdown
For campaigns that have a specific launch date or a limited "founder's pricing" window.
- **Assets Used**: `manifest.videos.countdown` or generated static text graphics.
- **Workflow**:
  1. 48 hours before a major campaign launch or price increase, the agent schedules a reminder post.
  2. Caption: "Only 48 hours left to secure early access to the [Campaign Name] voyage. Link in bio."
  3. **Why it works**: Creates urgency and capitalizes on existing campaign data without any manual effort.

### Strategy 5: Port Highlight Carousels
Cruisers care just as much about the destination as the ship.
- **Assets Used**: `cruise-ports.ts` data combined with SerpAPI destination images.
- **Workflow**:
  1. The agent selects a popular itinerary from an active campaign (e.g., Cozumel, Nassau, Perfect Day at CocoCay).
  2. It generates an Instagram Carousel featuring 3 photos of the destination.
  3. Caption: "3 reasons why [Port Name] should be on your bucket list... Have you been here?"

---

## Data Flow for Periodic Engagement (No Webhooks)
Since real-time is not required, we avoid webhook complexity:
1. **Local Agent Runner**: A local script (run manually by you or via Windows Task Scheduler) executes `npm run social:sync`.
2. **Fetch**: The script calls Graph API to fetch unread DMs and unreplied comments from the last 24 hours.
3. **Process**: 
   - Comments: Sent through a lightweight summarizer to generate a short, friendly reply + DM prompt.
   - DMs: Sent through `lib/chat/pipeline.ts` for full sales assistance.
4. **Dispatch**: Replies are pushed back to Meta in a batch.
