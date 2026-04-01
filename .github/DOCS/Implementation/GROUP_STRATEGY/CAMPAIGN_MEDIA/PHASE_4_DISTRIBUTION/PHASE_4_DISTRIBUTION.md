# Phase 4: Distribution Engine
### Right Asset → Right Platform → Right Campaign Stage

**Input:** `CampaignMediaManifest` (Phase 3 complete, all assets at CDN URLs)  
**Output:** All assets deployed to their target channels, scheduled or live  
**Endpoint:** `POST /api/campaigns/[slug]/media/distribute`

## Current Direction For The Ad Phase

Supporting execution docs in this directory:

- `IMPLEMENTATION_AGENT_PLAN.md`
- `PHASE_4_EXECUTION_PLAN.md`
- `NEXT_STEPS.md`

This document now distinguishes between:

- organic social publishing
- paid ad creation
- native platform review
- final activation

The immediate goal of the ad phase is no longer "send ads everywhere from one button." The goal is to create real native-platform drafts that can be inspected inside each advertising platform before anything is activated.

### Primary Objectives

1. Create real connections to Meta, Google, and TikTok at the account level.
2. Validate those connections in the app before any draft creation is attempted.
3. Create paused native drafts in the target ad platform rather than treating simulated dispatch as completion.
4. Return external IDs and native review links so the operator can inspect ads in-platform.
5. Separate draft creation from activation. Creation is safe; activation is explicit.

### Operating Principles

- `Plan Ads` should mean internal schedule planning only.
- `Create Native Drafts` should mean creating real paused drafts in ad platforms.
- `Preview Dispatch` remains useful for payload inspection, but it is not a substitute for native review.
- `Activate Ads` must be a separate action from draft creation.
- Distribution status must distinguish `simulated`, `draft_created`, `awaiting_review`, `approved`, and `active`.

### Implementation Order

1. Meta Ads first. This path already exists partially and should be hardened into the first real native draft workflow.
2. Google Ads second. This requires a new adapter and a concrete product choice, likely Responsive Display or Demand Gen.
3. TikTok third. The selected first implementation path is TikTok organic posting through the Content Posting API.

### Explicit Non-Goal For This Pass

Discord is not part of the immediate paid-ad implementation focus and should be ignored while building the native ad review workflow.

---

## The Distribution Map

Every asset generated in Phase 2 has a defined destination. Distribution is triggered either on demand (UI) or automatically by campaign lifecycle events (agent). The table below is the authoritative mapping.

### By Campaign Stage

| Campaign Status | Assets Deployed | Channels |
|----------------|----------------|---------|
| `DRAFT` → pre-launch setup | OG image, landing page hero, email header | Landing page live preview, internal dashboard |
| `GATHERING_INTEREST` activated | TikTok seed video, hero images, ad creatives | Native draft creation for Meta Ads, Google ads, and the selected TikTok path |
| Day 3 (nurture) | Carousel slides, countdown video (3 cabins remaining) | Instagram feed, email Stage 2 |
| Day 7 (nurture) | Countdown video (2 remaining), social proof image | TikTok re-post, email Stage 3, SMS nudge |
| Day 14 (nurture) | Countdown video (1 remaining) | TikTok re-post, Instagram Story, SMS |
| `THRESHOLD_MET` | Threshold announcement video, hype clip, merch launch | Email "Trip is GO!", SMS, social blast, Discord pin |
| Manifest confirmation | Merch store link + mockup images | Email confirmation, Discord, community channel |
| Day 30 Decision Gate | Performance report (internal only) | Dashboard |
| `EXPIRED` | Expiry pivot email header | Email Stage 5 pivot |

---

## Platform Integration Architecture

## Ad-Phase Scope Clarification

The existing distribution map mixes organic posting, paid ads, lifecycle messaging, and community dispatch. For the next implementation pass, the priority is the paid-ad path only.

That means the core workflow is:

1. build or load the internal `DistributionSchedule`
2. validate provider connection status
3. create paused native drafts in supported ad platforms
4. persist native IDs and review URLs
5. review inside the native platform
6. explicitly approve and activate

This is the authoritative direction for the ad phase going forward.

### 1. TikTok
**Status:** `organic_only` selected for first implementation pass  

TikTok is no longer undecided for the immediate roadmap.

The selected first implementation path is:

1. **Organic posting path** via TikTok Content Posting API (v2)

TikTok paid ads remain a separate future path and should not be mixed into the first implementation pass.

For this phase, the goal is to publish and track real organic TikTok posts using generated campaign video assets and captions.

**Selected objective:** `organic_only`

**Deferred objective:** TikTok Ads Manager / paid ads integration

**Mechanism:** TikTok Content Posting API (v2)  
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

**First-pass implementation requirements:**

1. Add TikTok provider connection validation in the app.
2. Store TikTok OAuth credentials and user token securely.
3. Publish generated TikTok seed videos through the Content Posting API.
4. Persist returned TikTok `post_id` values and any review URLs or publish metadata.
5. Distinguish simulated payload preview from real organic posting.

**Deferred TikTok paid-ads work:**

1. TikTok Ads Manager / Marketing API integration
2. Draft ad creation inside TikTok Ads Manager
3. Paid-ad review and activation flow

## TikTok Organic Connection Completion Plan

TikTok is now the primary external platform target because it aligns with the existing asset pipeline and avoids the current Meta business-access deadlock.

The immediate goal is to publish real organic TikTok posts from generated campaign seed videos, not to create paid TikTok ads.

### TikTok End State

When TikTok organic is fully connected, the system should be able to:

1. verify TikTok creator/app connectivity from inside the app
2. upload the generated TikTok seed video asset
3. publish the post with generated caption and hashtags
4. persist the returned TikTok `post_id` and any publish metadata
5. distinguish simulated preview from real organic publish

### Current Code Status

The repository already contains most of the upstream campaign pieces needed for TikTok organic.

Already present:

1. TikTok seed video generation
2. TikTok caption and hashtag generation in the media manifest
3. TikTok scheduling in the distribution planner
4. Preview payload generation for TikTok in distribution preview mode

Currently missing:

1. real TikTok OAuth/token validation in the app
2. real TikTok upload + publish implementation
3. persistence of real TikTok `post_id` values from the live API
4. provider-status reporting for TikTok connection health

### Operator Tasks In TikTok Developer Setup

These are the manual setup tasks required outside the app.

1. Create or confirm a TikTok developer app for Leisure Life Interactive.
2. Ensure the TikTok account you plan to publish from is the correct creator or business account.
3. Enable access for the TikTok Content Posting API if TikTok requires product/use-case selection for the app.
4. Configure the app's redirect URI(s) for OAuth.
5. Capture the TikTok client key and client secret.
6. Complete the OAuth flow with the publishing account to obtain the user access token.
7. Capture the TikTok account identifier or `open_id` returned by TikTok.

### App / Agent Tasks

These are the implementation tasks that should happen in code and UI.

1. Add TikTok connection-status validation before any live publish action.
2. Validate required TikTok env vars before attempting API calls.
3. Replace the current TikTok placeholder adapter with a real Content Posting API implementation.
4. Fetch the actual campaign video asset bytes instead of returning a simulated external ID.
5. Persist returned TikTok post IDs and publish metadata into the distribution records.
6. Add a review/status display for TikTok organic posts in the review UI and distribution dashboard.

### Current Runtime Env Contract

The expected TikTok env contract for the first implementation pass is:

- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_OPEN_ID`

If TikTok requires additional token refresh or account metadata fields during implementation, extend this contract in one place and update the docs at the same time.

### Recommended Verification Sequence

Use this order when finishing TikTok setup.

1. Confirm the TikTok developer app exists.
2. Confirm the correct TikTok publishing account is being used.
3. Complete OAuth and store the initial access token.
4. Place the TikTok env vars into the local environment.
5. Add or run TikTok provider connection validation from the app.
6. Run a single live TikTok publish for one generated seed video.
7. Confirm the returned TikTok post ID is stored in the distribution record.

### Success Criteria For TikTok Organic

TikTok organic is considered complete for this phase only when all of the following are true:

1. the app can verify the TikTok connection before publish
2. a generated seed video can be uploaded and published through TikTok's real API
3. the distribution record stores a real TikTok post ID
4. simulated payload preview remains available for debugging
5. organic TikTok posting works without depending on the future paid-ads path

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

This organic Instagram publishing path is separate from Meta paid ads. It should remain separate in code and UI.

---

### 3. Meta Ads (Facebook / Instagram Ads)
**Mechanism:** Meta Marketing API  
**Auth:** System User token scoped to Ad Account  

**Implementation priority:** First paid-ad connector to complete.

## Meta Connection Completion Plan

Meta is the first provider that should be finished end-to-end because it is the closest to working already and it gives the cleanest path to native draft review.

This setup has to be completed jointly:

- the operator completes account and permission steps inside Meta Business Manager / Ads Manager
- the implementation agent completes validation, draft creation, persistence, and review-link handling in the app

### Meta End State

When Meta is fully connected, the system should be able to:

1. verify the Meta business connection from inside the app
2. confirm the ad account, page, and optional Instagram actor are readable
3. create paused native ad drafts for campaign creatives
4. persist Meta IDs and review links back to the distribution records
5. let the operator open the native Meta draft before activation

### Operator Tasks In Meta Dashboard

These are the expected manual tasks to complete in Meta before the app-side live connector will be reliable.

1. Confirm the business account is fully established in Business Manager.
2. Confirm the Facebook Page that will own the ads is present and assigned to the business.
3. Confirm the Ad Account exists, is active, and is assigned to the business.
4. Confirm the user account you will use has admin-level access to the business, page, and ad account.
5. If Instagram ads are in scope, link the Instagram Business account to the Facebook Page and confirm it appears as an Instagram actor.
6. Confirm billing and payment setup are complete in Ads Manager so paused draft creation does not fail for account-readiness reasons.
7. Confirm the app or system user that will create drafts has the required ad permissions on the target ad account.
8. Generate the access token that the app will use and confirm its permissions are sufficient for ad creative and ad creation.

### App / Agent Tasks

These are the implementation tasks that should happen in code and UI.

1. Add a Meta connection status check before any live draft-creation action.
2. Validate all required env vars are present before attempting Meta API calls.
3. Add a lightweight Meta verification call to confirm the token can read the ad account and page.
4. Expose the verified account label, ad account ID, page ID, and Instagram actor ID in the review UI.
5. Persist `campaignId`, `adSetId`, `adCreativeId`, `adId`, and a native review URL where available.
6. Keep draft creation paused by default.
7. Add a separate activation step after native review.

### Current Runtime Env Contract

The current runtime code expects the following env vars for live Meta draft creation:

- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_AD_SET_ID`
- `META_PAGE_ID`
- `META_INSTAGRAM_ACTOR_ID` (optional)

Important: some older reference docs use names like `META_LONG_LIVED_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, and `META_IG_USER_ID`. Those may still be useful for setup and token management, but the current live dispatch code path is keyed to the env names above. The implementing agent should normalize documentation and runtime naming so one authoritative env contract exists.

### Recommended Verification Sequence

Use this exact order when finishing the Meta connection.

1. Confirm the business, page, ad account, and optional Instagram business account are all linked correctly in Meta.
2. Place the runtime env vars into the local environment.
3. Add or run a Meta connection check from the app before trying draft creation.
4. Run a single-platform live request for `facebook_ad` only.
5. Confirm the result appears in Ads Manager as a paused draft or paused ad.
6. Persist the returned native IDs and verify the review link opens the correct object.

### What We Should Validate In-App

The Meta connection check should return enough information to tell the operator what is wrong without reading raw API errors.

Recommended validation outputs:

- token present / missing
- ad account reachable / unreachable
- page reachable / unreachable
- Instagram actor reachable / optional / missing
- permission denied versus configuration missing
- native account labels for confirmation

### Success Criteria For Meta

Meta is considered complete for this phase only when all of the following are true:

1. the app can verify the Meta connection before draft creation
2. a campaign can create paused Meta drafts from generated assets
3. the distribution record stores real Meta object IDs
4. the operator can open the draft inside Meta Ads Manager
5. activation is separate from draft creation

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

**Required next-step hardening:**

1. Add account connection validation before draft creation.
2. Create paused native drafts only.
3. Persist `campaignId`, `adSetId`, `adCreativeId`, and `adId` where available.
4. Persist a native review URL back to Ads Manager.
5. Add a separate activation step after manual review.

Meta is the reference implementation for the full ad-phase workflow.

---

### 4. Google Ads
**Mechanism:** Google Ads API  
**Auth:** Google Ads OAuth + manager/customer account configuration  

**Implementation priority:** Second paid-ad connector to complete.

Google is currently named in the campaign strategy but has no real runtime adapter yet. That gap must be closed with a concrete product decision before implementation.

**Decision required:** choose the first supported Google ad product.

Recommended default:

- Responsive Display Ads, or
- Demand Gen if the asset mix and targeting model fit better

**Target behavior:**

1. create paused native drafts in Google Ads
2. attach generated campaign assets and copy variants
3. persist Google campaign/ad group/ad IDs
4. persist native review links where possible
5. require explicit activation after review

Google should follow the same contract shape as Meta even if the provider API details differ.

---

### 5. Email (Klaviyo)
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

### 6. Discord (Community Channel)
**Mechanism:** Discord Webhook API + Bot API  
**Auth:** Webhook URL (per channel) stored in `campaign.communityChannelUrl`  

This remains part of broader distribution but is not part of the immediate ad-platform implementation scope.

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

### 7. SMS (Twilio)
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

### 8. Merch Store (Printful / Printify)
**Mechanism:** Printful API  
**Trigger:** `THRESHOLD_MET`

On threshold:
1. `PATCH /stores/{storeId}/products/{productId}` — transition all campaign merch products from `DRAFT` to `PUBLISHED`
2. Store `merchandiseStoreUrl` (Printful store URL or campaign `/merch` Next.js page) to DynamoDB `METADATA`
3. Include in "Trip is GO!" email template + Discord pinned message

Order window enforced by a scheduled Lambda that fires 21 days before sail date: all products set back to `DRAFT` to prevent late orders.

---

### 9. Pinterest
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
  status: 'scheduled' | 'simulated' | 'draft_created' | 'awaiting_review' | 'approved' | 'posted' | 'active' | 'cancelled' | 'failed';
  externalPostId?: string;     // Platform-returned post ID after publishing
  externalReviewUrl?: string;  // Native platform deep link for operator review
  providerDraftType?: 'organic_post' | 'paid_ad';
}
```

The Distribution Schedule is the single source of truth for what has been posted, what is queued, and what needs human review. It's surfaced in the Campaign Media Studio UI.

## Provider Connection Layer

Before any ad draft is created, the system should validate provider connectivity.

Each provider should expose a connection status object like:

```typescript
interface ProviderConnectionStatus {
  provider: 'meta' | 'google' | 'tiktok';
  status: 'connected' | 'misconfigured' | 'unauthorized' | 'unverified';
  accountLabel?: string;
  accountId?: string;
  lastValidatedAt?: string;
  warnings?: string[];
}
```

The landing review surface and distribution dashboard should display this status before showing any live draft-creation controls.

## Review And Activation Workflow

The ad phase should follow this explicit workflow:

1. `Plan Ads`
2. `Validate Provider Connections`
3. `Create Native Drafts`
4. `Open Native Review`
5. `Approve Drafts`
6. `Activate Ads`

The current `Dispatch Ads` terminology is too broad for this workflow and should be replaced in the UI with explicit actions that match the real platform behavior.

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

Additional ad-phase requirements:

- Provider connection status for Meta, Google, and TikTok
- Native draft IDs and native review links
- Draft review state (`draft_created`, `awaiting_review`, `approved`)
- Separate controls for `Create Native Drafts` and `Activate Ads`
- Clear distinction between simulated payload preview and real provider draft creation

---

## Immediate Test Playbook (Phase 2 -> Phase 4)

Use this sequence to test ad and promotion dispatch directly from generated `CampaignMediaManifest` assets.

### 1) Confirm Phase 2 manifest exists

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:3000/api/groups/campaign/<slug>/media/manifest"
```

If this returns `404`, run Phase 2 generation first.

### 2) Preview schedule plan for ad platforms

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/groups/campaign/<slug>/media/distribute" -ContentType "application/json" -Body '{"mode":"plan","dryRun":true,"caller":"human","platforms":["tiktok","instagram_feed","facebook_ad"]}'
```

### 3) Simulate dispatch (recommended first)

`forceDispatch: true` bypasses time/event gates so you can test immediately.

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/groups/campaign/<slug>/media/distribute" -ContentType "application/json" -Body '{"mode":"dispatch","dryRun":true,"providerMode":"simulate","forceDispatch":true,"caller":"human","platforms":["tiktok","instagram_feed","facebook_ad"]}'
```

Inspect the returned `previews` array. Each item contains the exact platform payload derived from manifest asset URLs and campaign copy.

### 4) Live Meta Ads dispatch (PAUSED ad creation)

Live mode currently supports `facebook_ad` only. TikTok/Instagram remain simulation-only in this phase.

Required environment variables:

- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_AD_SET_ID`
- `META_PAGE_ID`
- `META_INSTAGRAM_ACTOR_ID` (optional)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/groups/campaign/<slug>/media/distribute" -ContentType "application/json" -Body '{"mode":"dispatch","dryRun":false,"providerMode":"live","forceDispatch":true,"caller":"human","platforms":["facebook_ad"]}'
```

Behavior:

- Creates a Meta Ad Creative from Phase 2 manifest media URL + generated copy.
- Creates an Ad in **PAUSED** status for safety.
- Persists `externalPostId` onto the distribution schedule post.

## Implementation Plan For The Next Agent

The next implementation agent should treat the ad phase as a native-draft system, not a one-click final publisher.

### Phase A: Meta Hardening

1. rename UI/actions so `Dispatch Ads` no longer implies cross-platform live launch
2. add provider connection validation for Meta
3. persist draft metadata and native review URLs
4. separate draft creation from activation

### Phase B: Google Ads Integration

1. choose the initial Google ad product
2. add Google provider connection validation
3. create paused native drafts and persist IDs
4. expose native review links in the review UI and dashboard

### Phase C: TikTok Decision + Implementation

1. decide between organic posting, paid ads, or both as separate adapters
2. implement only the selected path(s)
3. preserve the same draft-review-activate workflow shape

### Definition Of Done For The Ad Phase

- the app can verify platform connectivity before draft creation
- the operator can create real paused drafts in supported platforms
- the operator can open those drafts inside the native platform UI
- the system persists native IDs and review links
- activation is separate and explicit
- simulated payload preview remains available for debugging but is no longer mistaken for live ad deployment

### 5) Verify status and executions

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:3000/api/groups/campaign/<slug>/media/distribution"
```

Check:

- `schedule.posts[].status`
- `schedule.posts[].externalPostId`
- `executions[]` summary counters
