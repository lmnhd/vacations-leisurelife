# Implementation Agent Plan

## Mission

Complete the first real TikTok organic publishing path for Phase 4 without mixing it with TikTok paid ads, Meta recovery work, or Production review packaging.

The implementation agent should treat this as a provider-integration hardening task with three outputs:

1. secure TikTok token handling
2. real TikTok draft upload via Content Posting API
3. truthful provider and distribution status reporting in the app

## Current Verified State

The following points are already verified and should be treated as fact unless the platform behavior changes again.

1. the deployed OAuth `connect` route works
2. the deployed OAuth `callback` route works
3. TikTok accepted the current sandbox client key and returned a real authorization code
4. the token exchange succeeded end to end
5. the app can now obtain `access_token`, `refresh_token`, and `open_id`

## Important Constraint

The currently successful authorization was completed with the user's personal TikTok account, not the Leisure Life Interactive TikTok account.

That means:

1. the integration plumbing is proven
2. any upload performed with the currently issued tokens will target the personal TikTok account that authorized the app
3. those tokens must not be treated as the final production business-account credential set

Use the current successful tokens only as a temporary non-production integration proof path if the user agrees. The Leisure Life Interactive TikTok account still needs its own successful authorization before this can be treated as a real business publishing path.

## Security Rules

1. never commit TikTok tokens to the repository
2. do not store raw access or refresh tokens in docs, fixtures, or test files
3. assume the already-shared personal-account tokens may need to be rotated after testing
4. centralize TikTok env and token handling in one implementation path

## Existing Relevant Files

The implementation agent should start from these files.

1. `lib/integrations/tiktok-auth.ts`
2. `app/api/integrations/tiktok/connect/route.ts`
3. `app/api/integrations/tiktok/callback/route.ts`
4. `lib/campaigns/distribution/platforms/tiktok.ts`
5. `lib/campaigns/distribution/dispatcher.ts`
6. `lib/campaigns/distribution-marketing.ts`
7. `lib/utils.ts`

## Build Order

### Step 1: Token Persistence Contract

Add a single authoritative TikTok token contract.

Required values:

1. `TIKTOK_CLIENT_KEY`
2. `TIKTOK_CLIENT_SECRET`
3. `TIKTOK_ACCESS_TOKEN`
4. `TIKTOK_REFRESH_TOKEN`
5. `TIKTOK_OPEN_ID`

Recommended persisted metadata:

1. access token expiry timestamp
2. refresh token expiry timestamp
3. granted scope string
4. account label if it can be safely resolved

Implementation requirements:

1. define one normalized server-side shape for TikTok credentials
2. do not scatter refresh logic across routes and adapters
3. make it obvious whether the token set belongs to a personal test account or the real business account

### Step 2: Refresh Token Support

Add refresh handling against TikTok's OAuth token endpoint.

Requirements:

1. refresh before live publish when the access token is expired or near expiry
2. persist the newly returned refresh token if TikTok rotates it
3. fail with a provider-status error that is readable by operators

Do not rely on the short-lived access token remaining valid between planning and live publish.

### Step 3: Replace The TikTok Placeholder Adapter

Replace the current stub in `lib/campaigns/distribution/platforms/tiktok.ts` with a real upload path.

Use the TikTok Content Posting API draft-upload flow and prefer `FILE_UPLOAD` for the first implementation pass.

Required flow:

1. fetch the generated campaign video bytes from the stored asset URL
2. call TikTok video init with `source=FILE_UPLOAD`
3. upload the bytes to TikTok's returned `upload_url`
4. persist the returned `publish_id`
5. fetch status from TikTok as needed

First-pass target behavior:

1. upload the video as a TikTok draft
2. do not build full paid-ad behavior here
3. keep the implementation compatible with later business-account authorization

### Step 4: Distribution Record Persistence

The distribution record must stop pretending a placeholder ID is a real publish result.

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

1. validate TikTok provider status using the current successful token set
2. refresh token if necessary
3. perform one live draft upload with a generated campaign seed video
4. confirm the real TikTok `publish_id` is stored
5. confirm the UI reports a truthful status
6. confirm simulation mode still works independently of live upload

## Definition Of Done

This implementation pass is done only when all of the following are true.

1. the app can securely use TikTok OAuth credentials without manual copy-paste on every run
2. the app can refresh TikTok access tokens when needed
3. the TikTok adapter creates a real draft upload instead of returning a placeholder ID
4. the distribution record stores real TikTok metadata
5. the review surface reports truthful TikTok provider and publish state
6. the code path remains usable later with the proper Leisure Life Interactive TikTok account tokens

## Handoff Note

If the implementation agent needs a temporary live test identity, it may use the currently successful personal-account token set only with explicit user awareness. That is a temporary integration proof, not the final business-account setup.