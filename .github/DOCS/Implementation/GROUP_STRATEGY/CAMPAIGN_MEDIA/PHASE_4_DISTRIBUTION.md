# Phase 4: Distribution Engine
### Right Asset → Right Platform → Right Campaign Stage

**Input:** `CampaignMediaManifest` (Phase 3 complete, all assets at CDN URLs)  
**Output:** All assets deployed to their target channels, scheduled or live  
**Endpoint:** `POST /api/campaigns/[slug]/media/distribute`

---

## The Distribution Map

Every asset generated in Phase 2 has a defined destination. Distribution is triggered either on demand (UI) or automatically by campaign lifecycle events (agent). The table below is the authoritative mapping.

### By Campaign Stage

| Campaign Status | Assets Deployed | Channels |
|----------------|----------------|---------|
| `DRAFT` → pre-launch setup | OG image, landing page hero, email header | Landing page live preview, internal dashboard |
| `GATHERING_INTEREST` activated | TikTok seed video, hero images, ad creatives | TikTok organic post, Meta Ads, Google Display |
| Day 3 (nurture) | Carousel slides, countdown video (3 cabins remaining) | Instagram feed, email Stage 2 |
| Day 7 (nurture) | Countdown video (2 remaining), social proof image | TikTok re-post, email Stage 3, SMS nudge |
| Day 14 (nurture) | Countdown video (1 remaining) | TikTok re-post, Instagram Story, SMS |
| `THRESHOLD_MET` | Threshold announcement video, hype clip, merch launch | Email "Trip is GO!", SMS, social blast, Discord pin |
| Manifest confirmation | Merch store link + mockup images | Email confirmation, Discord, community channel |
| Day 30 Decision Gate | Performance report (internal only) | Dashboard |
| `EXPIRED` | Expiry pivot email header | Email Stage 5 pivot |

---

## Platform Integration Architecture

### 1. TikTok
**Mechanism:** TikTok Content Posting API (v2)  
**Auth:** OAuth 2.0 user token scoped to the campaign creator account  

```typescript
// POST /api/distribution/tiktok/post
interface TikTokPostRequest {
  campaignSlug: string;
  videoAssetId: string;          // References AssetRecord in DynamoDB
  caption: string;               // From generated captions — 150 char limit
  hashtags: string[];
  coverImageAssetId?: string;
  privacyLevel: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS';
  scheduledAt?: string;          // ISO — if omitted, posts immediately
}
```

**Flow:**
1. Upload video to TikTok via `POST /v2/post/publish/video/init/` → get `upload_url`
2. PUT video binary to `upload_url`
3. `POST /v2/post/publish/video/complete/` with caption, hashtags, cover
4. Store TikTok `post_id` in DynamoDB `MEDIA#DISTRIBUTION` record for tracking

**Rate limit:** 2 posts/day per account. The 3 countdown videos are pre-scheduled 7 days apart.

---

### 2. Instagram / Meta
**Mechanism:** Meta Graph API — Instagram Content Publishing  
**Auth:** Long-lived user access token  

**Single image post:**
```typescript
// 1. Create media container
POST /{ig-user-id}/media
  { image_url, caption, location_id? }
// 2. Publish
POST /{ig-user-id}/media_publish
  { creation_id }
```

**Reels:**
```typescript
// Same flow but with video_url and media_type: REELS
POST /{ig-user-id}/media
  { video_url, caption, media_type: 'REELS', share_to_feed: true }
```

**Carousel (7-slide static):**
```typescript
// 1. Create individual item containers (one per slide image)
for (const slide of slides) POST /{ig-user-id}/media { image_url }
// 2. Create carousel container
POST /{ig-user-id}/media
  { media_type: 'CAROUSEL', children: [...itemIds], caption }
// 3. Publish
POST /{ig-user-id}/media_publish
```

**Scheduling:** Use `published: false` + `scheduled_publish_time` on media container creation. Instagram supports scheduling up to 75 days in advance.

---

### 3. Meta Ads (Facebook / Instagram Ads)
**Mechanism:** Meta Marketing API  
**Auth:** System User token scoped to Ad Account  

Ad creative lifecycle:
1. Upload image/video assets to Ad Account's creative library
2. Create `AdCreative` referencing the asset + copy variant
3. Create `AdSet` (targeting, budget, schedule)
4. Create `Ad` referencing `AdCreative` + `AdSet`
5. Ad set to `PAUSED` by default — manually activated or triggered at `GATHERING_INTEREST`

Three ad creative variants (from Phase 2 copy generation) are created for A/B/C testing. Winner is determined by Day 7 Meta-reported CPL and surviving variants have budgets reallocated automatically.

```typescript
interface MetaAdCreative {
  campaignSlug: string;
  imageAssetId: string;
  headline: string;           // From copy.adVariants[n].headline
  primaryText: string;        // From copy.adVariants[n].primaryText
  cta: 'LEARN_MORE' | 'SIGN_UP' | 'BOOK_NOW';
  linkUrl: string;            // Campaign landing page URL
}
```

---

### 4. Email (Klaviyo)
**Mechanism:** Klaviyo API v2 — Template + Campaign creation  
**Auth:** Private API key  

Phase 4 pre-builds all Klaviyo email campaigns and automated flow templates with the generated assets embedded. `{{dynamic_token}}` variables handle the personalization layer at send time.

**Email Header Image injection:**
```typescript
// Each email template has a named image block "campaign_header"
// Phase 4 uploads the generated email header image to Klaviyo
POST /api/1.0/template-images/
  { data: base64EncodedImage }
// Returns: image URL within Klaviyo CDN
// Template update:
PATCH /api/1.0/email-templates/{templateId}/
  { html: updatedHtmlWithNewImageUrl }
```

**Pre-built email campaigns:**

| Email | Trigger | Assets Used |
|-------|---------|------------|
| Waitlist Confirmation | Form submit | Hero image, ambient audio |
| Day 3 Nurture ("Co-Creation") | +3 days from signup | Carousel slide preview |
| Day 7 Nurture ("Social Proof") | +7 days | Countdown video thumbnail |
| "Trip is GO!" | `THRESHOLD_MET` event | Threshold announcement video, hype clip |
| Manifest Confirmation | Manifest submitted | Merch mockup images, hero image |
| Day 3 Reminder (non-submitters) | +3 days from "GO!" if no manifest | Hero image |
| "This One Didn't Sail" (expiry) | Campaign `EXPIRED` | Departure image, CB link |

All campaign emails are created via Klaviyo API as `DRAFT` with the assets pre-linked. Triggers are wired to Klaviyo flow templates that listen for DynamoDB-sourced Klaviyo events fired by the same Lambda functions running the campaign lifecycle (same event bus, no additional infra).

---

### 5. Discord (Community Channel)
**Mechanism:** Discord Webhook API + Bot API  
**Auth:** Webhook URL (per channel) stored in `campaign.communityChannelUrl`  

Phase 4 pre-generates the Discord pinned message package:

```typescript
const discordWelcomeEmbed = {
  title: campaign.themeName,
  description: brief.messaging.elevatorPitch,
  color: hexToDecimal(brief.visual.colorPalette.primary),
  image: { url: heroImage_16x9_url },
  fields: [
    { name: "🗓️ Sailing", value: campaign.targetDates },
    { name: "⚓ Ship", value: campaign.shipTarget },
    { name: "🎯 Events", value: campaign.highlightEvents.join(', ') },
    { name: "🧳 Starting From", value: `$${campaign.startingPrice}/pp` }
  ],
  footer: { text: "Complete your details to lock in your cabin." }
};
```

Sent via Discord webhook at Stage 2.6 (community channel activation). Merch launch announcement and countdown clips are also dispatched to the channel via webhook.

---

### 6. SMS (Twilio)
**Mechanism:** Twilio Messaging API  
**Auth:** Account SID + Auth Token  
**Trigger:** `THRESHOLD_MET` status transition  

The 15-second hype clip audio file is attached as an MMS (where supported). SMS-only fallback for unsupported carriers.

```typescript
// POST /api/distribution/sms/blast
interface SMSBlastRequest {
  campaignSlug: string;
  recipientEmails: string[];    // Resolve to phone numbers via USER# records
  messageTemplate: 'THRESHOLD_MET' | 'MANIFEST_REMINDER' | 'LAST_CABIN';
  mediaUrl?: string;            // CDN URL of hype_clip.mp3 for MMS
}
```

---

### 7. Merch Store (Printful / Printify)
**Mechanism:** Printful API  
**Trigger:** `THRESHOLD_MET`

On threshold:
1. `PATCH /stores/{storeId}/products/{productId}` — transition all campaign merch products from `DRAFT` to `PUBLISHED`
2. Store `merchandiseStoreUrl` (Printful store URL or campaign `/merch` Next.js page) to DynamoDB `METADATA`
3. Include in "Trip is GO!" email template + Discord pinned message

Order window enforced by a scheduled Lambda that fires 21 days before sail date: all products set back to `DRAFT` to prevent late orders.

---

### 8. Pinterest
**Mechanism:** Pinterest API v5  
**Auth:** OAuth 2.0  
**Schedule:** Queue board pins at campaign activation, post weekly through Seed Phase  

Pinterest is the lowest-priority channel but generates long-tail organic discovery. Pin the aesthetic concept images with cruise-niche boards. Each pin links to the campaign landing page.

---

## The Distribution Schedule Object

Phase 4 creates a `DistributionSchedule` record in DynamoDB at campaign activation. This is the machine-readable posting calendar that all automation hooks read from.

```typescript
interface DistributionSchedule {
  campaignSlug: string;
  timezone: string;            // Audience's primary timezone, from campaign config
  
  posts: ScheduledPost[];
}

interface ScheduledPost {
  postId: string;
  platform: 'tiktok' | 'instagram_feed' | 'instagram_reels' | 'instagram_story' 
            | 'facebook_ad' | 'youtube' | 'pinterest' | 'discord' | 'sms' | 'email';
  assetId: string;             // References MEDIA#ASSET# record
  copyVariant: string;         // References copy.captions entry
  scheduledAt: string | 'ON_THRESHOLD' | 'ON_MANIFEST_SUBMIT' | 'ON_EXPIRY';
  campaignStage: string;       // 'seed_day_0' | 'seed_day_3' | etc.
  status: 'scheduled' | 'posted' | 'cancelled' | 'failed';
  externalPostId?: string;     // Platform-returned post ID after publishing
}
```

The Distribution Schedule is the single source of truth for what has been posted, what is queued, and what needs human review. It's surfaced in the Campaign Media Studio UI.

---

## Distribution Status Dashboard (Campaign Media Studio)

`/dashboard/campaigns/[slug]/media/distribution`

Displays:
- Timeline view of scheduled → posted assets
- Per-platform status (last post, next scheduled post)
- Engagement summary pulled from platform APIs (TikTok views, Meta CPL, email open rates)
- Manual post triggers for each asset (override schedule, post immediately)
- Asset swap UI — replace a scheduled asset with a regenerated version before it posts
- "Kill switch" — halt all distribution for a campaign immediately
