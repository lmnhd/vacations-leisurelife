# Phase 1 — Organic Launch Posting ✅ Implemented

**Status:** Shipped on branch `feature/shadow-groups`.
**Goal:** When the operator pushes a campaign's ads, the campaign launch is also posted
(or staged) to the agency's Instagram and Facebook Page, with the correct caption and
landing URL, so the pages carry a professional "campaign is live" heartbeat that matches
the paid ads.

---

## Design

Organic launch posts are first-class `ScheduledPost`s emitted by the distribution planner
and dispatched by the **same** route the operator already uses to push ads. No separate
runner, no new Vercel function.

```
buildDistributionSchedule()                      app/api/.../media/distribute (POST)
  └─ emits launch_announcement posts:              mode: 'dispatch', providerMode: 'live'
       • instagram_feed   (organic, existed)         └─ dispatchSupportedPlatforms()
       • facebook_page    (organic, NEW)                  └─ dispatchMarketingPost()
                                                              ├─ dispatchInstagramGraphLive()  (existed)
                                                              └─ dispatchFacebookPageLive()    (NEW)
                                                                   └─ publishFacebookPagePost()  (NEW)
                                                                        └─ POST /{page-id}/photos
```

**Gating:** launch posts use `scheduledAt = now` when `campaign.status === 'GATHERING_INTEREST'`,
else `ON_THRESHOLD` — identical to the existing `facebook_ad` gating, so they fire on the same
trigger as the ads.

**Safety:** the Facebook Page post is created **unpublished (`published=false`)** so the
operator reviews it on the Page before it goes live. Status persists as `draft_created`.
Instagram Graph has no true draft state, so the IG launch post only dispatches when the
operator includes the `instagram_feed` platform / `launch_announcement` stage in the live call.

---

## Changes (files)

| File | Change |
|---|---|
| `lib/campaigns/schema.ts` | added `'facebook_page'` to `DistributionPlatformEnum` |
| `lib/integrations/meta-ads.ts` | new `publishFacebookPagePost(config, { message, imageUrl?, link?, published? })` → `POST /{page-id}/photos` or `/feed`; reuses existing `postMetaGraphForm` + `graphErrorMessage` |
| `lib/campaigns/distribution-marketing.ts` | new `dispatchFacebookPageLive()`; `facebook_page` branch in `buildPreviewPayload()`; live + simulate dispatch branches in `dispatchMarketingPost()` |
| `lib/campaigns/distribution-planner.ts` | two `launch_announcement` drafts (IG + FB Page), preferring `manifest.images.flyerImages[0]`, falling back to the primary hero |
| `app/api/groups/campaign/[slug]/media/distribute/route.ts` | `facebook_page` added to the dispatch allow-list (excluded from the paid-ad duplicate guard since it is organic) |
| `.github/DOCS/SOCIAL_MEDIA_MANAGEMENT/ARCHITECTURE.md` | "Phase 1 (Implemented)" note |

**Reused, not rebuilt:** `dispatchInstagramGraphLive()`, `getInstagramCaption()`
(brief `heroSlogan` → carousel slide → description), `getCampaignLandingUrl()`,
`resolveAssetRecord()`, `getMetaAdsConfig()`.

---

## Operator usage

Normal live dispatch includes the launch posts automatically. To push **only** the organic
launch posts, separate from ads:

```jsonc
POST /api/groups/campaign/{slug}/media/distribute
{
  "mode": "dispatch",
  "providerMode": "live",
  "stages": ["launch_announcement"]            // or: "platforms": ["instagram_feed","facebook_page"]
}
```

The Facebook Page post lands **unpublished** — review and publish it from the Page.

### Required environment / permissions

- `META_PAGE_ID`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` in `.env.local` (Page id is the
  same one the ads path uses).
- Page access token needs **`pages_manage_posts`** (organic publishing) in addition to the
  existing ad scopes. `instagram_content_publish` is already required for the IG path.

---

## Verification performed

- `npx tsc --noEmit` — clean.
- tsx smoke test of `buildDistributionSchedule()` — confirmed both `launch_announcement`
  posts emit on the flyer asset, gated to "now" for a `GATHERING_INTEREST` campaign.
- Note: this repo has **no installed test runner** (no vitest/jest dependency, no `test`
  script). `tsc --noEmit` is the authoritative static gate. For runtime checks use tsx
  scripts (the pattern every `scripts/*.ts` follows).

### Recommended pre-campaign live check (operator-run)

1. Simulate (no live API): the POST above with `dryRun: true, providerMode: 'simulate'` —
   confirm `previews` contains an `instagram_feed` and a `facebook_page` payload with the
   right caption + landing `link`.
2. Live on a staging/test Page: same call with `providerMode: 'live'` — confirm one
   unpublished FB Page post + the IG launch post appear and statuses persist.
