# HTML Ad System — Distribution Integration

How HTML screenshot ads flow from the manifest into the distribution system.

---

## Asset Tags

Every HTML screenshot ad is stored in `manifest.images.designedAdArtifacts` with
these tags:

```ts
tags: [
  'designed_ad',                    // universal — all designed ads have this
  'html_screenshot',                // provider family tag
  'provider:html_screenshot',       // exact provider — used for preference scoring
  `format:${format}`,               // e.g. 'format:meta_feed_square'
  'workflow:group_campaign',
  // + one or more platform routing tags:
  'meta',          // for all meta_* formats
  'google_display',// for all google_display_* formats
  'story',         // for story/reel formats
  'reel',          // for story/reel formats
  'carousel',      // for carousel formats
]
```

The key difference from the legacy satori path is the `provider:html_screenshot`
tag. The distribution planner uses this to prefer HTML screenshot ads over older
artifacts when both share a platform tag.

---

## Distribution Planner Selection Logic

`lib/campaigns/distribution-planner.ts` → `selectDesignedAdAssetId(manifest, preferredTags)`

The function runs a two-pass selection:
1. **Pass 1:** Find an asset whose tags include ALL of `preferredTags` AND has `provider:html_screenshot`
2. **Pass 2:** Find an asset whose tags include ANY of `preferredTags` AND has `provider:html_screenshot`
3. **Pass 3 (legacy fallback):** Same as pass 1 but without the `provider:html_screenshot` requirement
4. **Pass 4 (legacy fallback):** Same as pass 2 but without the `provider:html_screenshot` requirement

### Per-platform selection

| Platform | Primary tag search | Fallback |
|---|---|---|
| `facebook_ad` | `['meta']` | `['facebook']` (legacy tag) |
| `google_display` | `['google_display']` | hero image |
| `instagram_feed` | `['instagram_feed']` | `['instagram_square']`, then square crop |
| `instagram_story` | `['story']` | hero image |

---

## Distribution Marketing Layer

`lib/campaigns/distribution-marketing.ts` → `dispatchMarketingPost()`

The dispatch function accepts an optional `brief?: CampaignAestheticBrief` parameter.
When the brief is present, it enforces three rules:

### 1. CTA sanitization

The manifest's stored ad copy (`manifest.copy.adVariants`) may have been generated
before the CTA ban was enforced. The `sanitizeCta()` function intercepts any CTA
that matches a banned phrase:

```ts
BANNED_CTA_SUBSTRINGS = ['book', 'buy now', 'purchase', 'reserve a cabin']
```

If the stored CTA matches, it is replaced with `brief.messaging.ctaVariants.waitlist`
(or `'Get First Access'` as a last-resort fallback). This means even stale manifest
copy can never reach live ad platforms with booking language.

### 2. Headline alignment

`getMetaAdCopy()` uses `brief.messaging.heroSlogan` as the `headline` field
in the dispatch payload. This ensures the text headline sent to the ad platform
matches what is baked into the image — important for Google Display responsive
placements where both can appear side-by-side.

### 3. Instagram caption

`getInstagramCaption()` uses `brief.messaging.heroSlogan` as the primary caption
source. The manifest's `carouselSlides[0]` is used only when no brief is available.
This keeps Instagram captions in sync with brief regenerations automatically.

---

## Brief Fetch in Dispatch Routes

Both dispatch entry points fetch the brief once per dispatch call:

**`app/api/groups/campaign/[slug]/media/distribute/route.ts`:**
```ts
const brief = await getAestheticBrief(campaign.id).catch(() => null);
// Non-fatal — dispatch still proceeds without brief-level overrides
```

**`lib/agent-api/campaign-actions.ts`:**
```ts
const brief = await getAestheticBrief(campaign.id).catch(() => null);
```

The brief is passed to `dispatchMarketingPost(campaign, manifest, post, mode, brief)`.

---

## Simulated Dispatch Preview Checklist

Before going live, verify the simulated dispatch shows:

| Field | Expected |
|---|---|
| `mediaUrl` | Path contains `/ads/html/` (HTML screenshot) NOT `/ads/image_detail_` (legacy satori) |
| `cta` | Waitlist-forward language — `"Join the List"`, `"Get First Access"`, etc. NOT `"Book the Sailing"` or `"Book Now"` |
| `headline` | Matches `brief.messaging.heroSlogan` |
| Instagram `caption` | Matches `brief.messaging.heroSlogan` |
| `destinationUrl` | `https://leisurelifeinteractive.net/groups/{slug}` |
| Google `activationState` | `"paused"` — never starts live |
| TikTok `activationState` | `"paused"` |

---

## Provider Tag Reference

| Provider | Tag | Notes |
|---|---|---|
| HTML screenshot (current default) | `provider:html_screenshot` | Preferred by planner |
| Templated.io | `provider:templated` | Active when `AD_RENDER_PROVIDER=templated` |
| Legacy satori | *(no provider tag)* | Old artifacts; no `provider:` prefix |
