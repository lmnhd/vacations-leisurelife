# Implementation Agent Plan

## Mission

Realign Phase 4 with the master campaign strategy by treating TikTok paid acquisition as the primary implementation target and TikTok organic as a supporting proof-of-concept adapter.

The implementation agent should treat this as a strategy-correction and provider-integration design task with four outputs:

1. a TikTok Ads / Lead Gen architecture that maps directly to the Shadow Group waitlist model
2. a clean provider contract for advertiser connection, native draft creation, and lead webhook ingestion
3. preservation of the existing TikTok organic path as a supporting proof signal rather than the primary acquisition layer
4. truthful provider and distribution status reporting in the app

The next hard requirement beyond that is optional supporting-organic autonomy:

5. keep the existing organic adapter compatible with `video.publish` if the team still wants zero-manual organic posting as a secondary feature

The operating model for this provider should now be treated as local-first:

1. campaign generation remains local
2. provider dispatch should run locally by default
3. hosted callbacks are acceptable as a bootstrap path, but they are not the desired long-term execution environment

## Strategy Reconciliation

The master campaign strategy and the V2 campaign strategy already define the intended TikTok role.

1. TikTok organic is a zero-cost proof signal and early creative-validation surface.
2. TikTok Lead Gen Ads are the scaled post-validation path.
3. The full downstream validation target is the media, ad, and landing-page formula one campaign at a time.
4. The recent organic-only TikTok push proved useful implementation details, but it drifted away from the primary acquisition architecture.

The implementation agent should therefore not continue extending organic TikTok as if it were the main funnel.

## Current Verified State

The following points are already verified and should be treated as fact unless the platform behavior changes again.

1. the deployed OAuth `connect` route works
2. the deployed OAuth `callback` route works
3. TikTok accepted the current sandbox client key and returned a real authorization code
4. the token exchange succeeded end to end
5. the app can now obtain `access_token`, `refresh_token`, and `open_id`
6. the Leisure Life Interactive business TikTok account has now completed a successful authorization flow

## Important Constraint

The OAuth plumbing was first proven with the user's personal TikTok account, but the Leisure Life Interactive business TikTok account has now also completed authorization.

That means:

1. the integration plumbing is proven
2. the current target credential set should now be the Leisure Life Interactive business account tokens
3. the temporary personal-account token set must not remain the authoritative provider credential set

The remaining architecture flaw is not account authorization. The remaining flaw is token persistence. Static env vars are still being used as the credential store, which prevents fully autonomous long-running operation.

That constraint has now narrowed further:

1. durable token persistence is in place
2. real upload-to-TikTok is in place
3. the remaining gap for supporting-organic zero-manual posting is TikTok Direct Post approval plus a direct-post adapter using `video.publish`
4. the larger unresolved gap is still TikTok paid acquisition, which is the strategy-consistent primary path

## Security Rules

1. never commit TikTok tokens to the repository
2. do not store raw access or refresh tokens in docs, fixtures, or test files
3. rotate or discard any temporary personal-account tokens that were used during integration proofing
4. centralize TikTok env and token handling in one implementation path
5. treat `.env.local` as bootstrap configuration, not as the final rotating token store

## Existing Relevant Files

The implementation agent should start from these files.

1. `lib/integrations/tiktok-auth.ts`
2. `app/api/integrations/tiktok/connect/route.ts`
3. `app/api/integrations/tiktok/callback/route.ts`
4. `lib/campaigns/distribution/platforms/tiktok.ts`
5. `lib/campaigns/distribution/dispatcher.ts`
6. `lib/campaigns/distribution-marketing.ts`
7. `lib/utils.ts`
8. `app/api/groups/campaign/[slug]/waitlist/route.ts`
9. `lib/campaigns/waitlist-store.ts`
10. the distribution dashboard and review surfaces already used for native draft review

## Build Order

### Step 0: Re-scope TikTok In The Architecture

Before writing code, the implementation agent should treat TikTok as two separate adapters:

1. `tiktok_organic` — supporting proof-of-concept, creator-facing posting, and creative validation
2. `tiktok_paid` — primary paid acquisition path for campaign growth

The agent should preserve the existing organic work, but it must not keep evolving that path as the primary answer to multi-campaign acquisition, unique destination routing, or scalable CTA behavior.

### Step 1: Advertiser + Lead-Gen Contract

Define the primary TikTok paid contract around advertiser-side campaign creation and lead ingestion.

Required outcomes:

1. one normalized server-side shape for TikTok advertiser connection state
2. one normalized request shape for creating paused TikTok lead-gen drafts per campaign
3. one normalized webhook-ingestion contract for mapping TikTok leads into the existing DynamoDB waitlist model
4. clear separation between advertiser credentials and supporting-organic publishing credentials

Minimum data that should be represented in the contract:

1. advertiser account identifier
2. campaign slug
3. creative asset identifier
4. lead form identifier or reusable form template mapping
5. targeting preset or targeting summary derived from campaign identity keywords
6. native campaign, ad-group, and ad identifiers once created
7. activation state such as `draft`, `paused`, `active`, `error`

### Step 2: Lead Ingestion Mapping

Map TikTok leads into the existing Shadow Group pipeline instead of inventing a separate TikTok-only funnel.

Requirements:

1. TikTok lead submissions must write into the same `USER#` waitlist contract already used by other lead sources
2. source attribution should preserve provider and native IDs for reporting
3. successful lead writes should trigger the same nurture path used elsewhere
4. the mapping should support campaign-specific slugs cleanly so multiple campaigns can run simultaneously

### Step 3: Paid Draft Creation Path

Create paused TikTok paid drafts rather than immediate-live campaigns.

Requirements:

1. build or load internal distribution intent for the campaign
2. create paused native TikTok lead-gen entities in the advertiser account
3. persist native IDs and review metadata into distribution records
4. surface review/activation status in the same operator-facing review model used for other platforms

### Step 4: Preserve Organic As A Supporting Adapter

Retain the existing TikTok organic work, but demote it to the proper strategic role.

Requirements:

1. keep the current organic upload path functional for proof-of-concept and creative validation
2. do not use organic as the answer to multi-campaign click-through or primary acquisition routing
3. label organic UI and docs as supporting validation, not the main paid funnel
4. keep `video.publish` work explicitly secondary to the paid acquisition path

### Step 5: Status And Review Reporting

The UI and persisted records must expose the difference between organic proofing and paid acquisition.

Requirements:

1. provider status should distinguish advertiser readiness from organic-publishing readiness
2. distribution records should distinguish `organic_post` from `paid_lead_gen_ad`
3. review surfaces should show native paid IDs, form IDs, and activation state
4. operator messaging should stop implying that organic TikTok is the main campaign-routing mechanism

### Step 6: Supporting Organic Direct Post Upgrade Path

The system now needs an explicit second TikTok mode, not just inbox-share upload.

Required outcome:

1. support `video.publish` as a separate readiness gate from `video.upload`
2. treat zero-manual posting as unavailable until a token is granted `video.publish`
3. once TikTok approves Direct Post, re-authorize the business account and persist the upgraded scope set
4. add a direct-post adapter path that can publish to the account page without manual inbox action

Implementation requirements:

1. auth scope requests must be configurable so the app can request `video.publish` without hardcoding a permanent assumption before approval lands
2. provider status must explicitly report whether zero-manual posting is available
3. the review UI must distinguish upload-only mode from direct-post-ready mode
4. direct-post code must fail closed if `video.publish` is missing from the granted scope set

TikTok approval work that must happen outside the repo:

1. request TikTok approval for `video.publish`
2. provide the platform with a clear zero-manual posting use case and demo path
3. once approved, re-run the OAuth flow so the stored business-account token includes `video.publish`
4. confirm provider status reports `zeroManualPostingReady=true`

### Step 7: Distribution Record Persistence

The distribution record must stop pretending a supporting-organic result is the same thing as a paid-acquisition result.

Persist at minimum:

1. TikTok `publish_id`
2. provider draft type as `organic_post`
3. returned TikTok status metadata
4. any operator-facing review or status detail available from TikTok

If TikTok does not provide a useful native review URL for this flow, persist status detail instead of inventing a link.

### Step 5: Provider Status Reporting

Add truthful provider readiness reporting for TikTok.

The app should report at least:

1. missing credentials
2. expired or invalid token
3. authorized account identity if known
4. whether the current token set is a temporary personal-account test token or the intended business-account token
5. whether the current token set includes `video.publish` and therefore supports zero-manual posting

This should be visible before a live TikTok publish action is attempted.

### Step 6: UI Label Cleanup

The UI should stop using ambiguous wording that implies full deployment when the system is really creating drafts or previews.

Priority label changes:

1. replace `Dispatch Ads` with a lifecycle-accurate action for draft creation or organic publish testing
2. add `Validate Provider Connections`
3. distinguish `simulate`, `draft_created`, `awaiting_review`, and `posted`

## What Not To Do In This Pass

1. do not mix TikTok paid ads into this implementation
2. do not block TikTok runtime completion on Meta business verification
3. do not commit to the personal TikTok token set as the final production account
4. do not treat Production app review as a prerequisite for finishing the internal code path

## Recommended Validation Sequence

Use this order after implementation.

1. bootstrap the durable token store with the successful Leisure Life Interactive business-account token set
2. validate TikTok provider status using the durable token source rather than raw env vars
3. refresh token if necessary and confirm the refreshed values are persisted automatically
4. perform one live draft upload with a generated campaign seed video from the local environment
5. confirm the real TikTok `publish_id` is stored
6. confirm the UI reports a truthful status
7. restart the local process and confirm the provider still works without manual env edits
8. confirm simulation mode still works independently of live upload
9. after TikTok approval, re-authorize and confirm `video.publish` is present in the stored scope string
10. confirm provider status reports zero-manual readiness separately from upload readiness

## Definition Of Done

This implementation pass is done only when all of the following are true.

1. the app can securely use TikTok OAuth credentials without manual copy-paste on every run
2. the app can refresh TikTok access tokens when needed
3. refreshed token values are automatically persisted to a durable store
4. the TikTok adapter creates a real draft upload instead of returning a placeholder ID
5. the distribution record stores real TikTok metadata
6. the review surface reports truthful TikTok provider and publish state
7. local campaign generation and local dispatch remain the primary working path
8. the code path remains usable with the proper Leisure Life Interactive business-account tokens
9. once TikTok approves Direct Post, the provider contract can distinguish upload-only mode from direct-post-ready mode without ambiguous operator messaging

## Handoff Note

The business-account authorization has now succeeded. The next agent should stop treating sandbox auth as the blocker and instead focus on closing the autonomy gap: durable token persistence, automatic refresh persistence, and a local-first live draft upload test.

Implementation Summary
Step 1+2 — lib/integrations/tiktok-auth.ts
Added TikTokCredentials interface (all 5 required env vars + expiry timestamps, scope, accountLabel)
loadTikTokCredentials() — reads env vars, throws with actionable message when missing, defaults accountLabel to personal_test until TIKTOK_ACCOUNT_LABEL=business is set
isTokenNearExpiry(expiresAt) — 5-minute buffer check
refreshTikTokAccessToken(refreshToken) — calls TikTok token endpoint with grant_type=refresh_token, returns TikTokTokenExchangeResult
getTikTokProviderStatus() — returns a discriminated union: missing_credentials, token_expired (with canRefresh), or ready (with openId, accountLabel, isPersonalTestAccount)
Step 3 — lib/campaigns/distribution/platforms/tiktok.ts
Replaced stub with real TikTok Content Posting API FILE_UPLOAD flow
uploadTikTokVideoDraft(accessToken, videoUrl, title) — fetches video bytes → POST init → PUT upload → returns TikTokUploadResult with publishId
executeTikTokPost(campaignSlug, post) — dispatcher entry point; resolves asset URL from manifest, auto-refreshes token if near expiry, returns real publish_id
Uses SELF_ONLY privacy level — safe for personal-account testing, no accidental public posts
Step 4 — lib/campaigns/distribution-marketing.ts
Added dispatchTikTokLive() alongside existing dispatchMetaAdsLive()
dispatchMarketingPost now handles tiktok platform in live mode, returning the real publish_id as externalPostId
Step 4b — lib/campaigns/distribution-store.ts + dispatcher.ts
updateScheduledPostStatus now accepts optional metadataNotes[] which are appended to post.notes
Dispatcher passes draftType=organic_post, publish_id=…, dispatched_at=… as notes for TikTok posts
Step 5 — app/api/integrations/tiktok/status/route.ts
New GET route — returns TikTokProviderStatus JSON; 200 when ready, 503 when not
Step 6 — app/(tests)/tests/campaign-landing/[slug]/review-controls.tsx
"Dispatch Ads" → "Create Drafts"
Added "Validate Provider Connections" button — calls /api/integrations/tiktok/status, displays account identity and expiry
Post status column now shows simulate / draft_created / posted derived from externalPostId prefix and notes
Added TikTokProviderStatusResponse type; externalPostId and notes added to PlannedPost
New env vars to set after the next OAuth flow:

TIKTOK_ACCESS_TOKEN_EXPIRES_AT — ISO timestamp from callback page
TIKTOK_REFRESH_TOKEN_EXPIRES_AT — ISO timestamp from callback page
TIKTOK_ACCOUNT_LABEL=business — set this once the LLI TikTok account completes its own authorization
TIKTOK_REQUEST_VIDEO_PUBLISH=true — set this before re-authorizing once TikTok approves `video.publish`