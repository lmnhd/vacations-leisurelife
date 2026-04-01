# Phase 4 Execution Plan

## Purpose

This plan turns the Phase 4 strategy into an execution sequence that can be completed without conflating simulation, draft creation, native review, and activation.

The immediate objective is to complete the first real external publishing path with TikTok organic posting, then use that same contract shape to finish Meta draft creation and later Google Ads draft creation.

## Current Reality

The codebase already supports:

1. campaign media manifest generation
2. distribution schedule planning
3. preview payload generation for TikTok and Meta paths
4. partial live Meta ad creation
5. a deployed TikTok OAuth start route and callback route

The codebase does not yet support:

1. TikTok token persistence and refresh
2. real TikTok draft upload via the Content Posting API
3. in-app provider connection health reporting
4. consistent native review links and external ID persistence across providers
5. explicit activation controls separate from draft creation

## Primary Delivery Sequence

### Phase 4A: TikTok Sandbox And Auth Completion

Goal: prove the full TikTok OAuth roundtrip in a supported test environment.

Tasks:

1. create a TikTok Sandbox for the Leisure Life Interactive app
2. configure Login Kit Web redirect URIs in Sandbox
3. add the publishing TikTok account as a Sandbox target user
4. validate the OAuth roundtrip against the deployed `connect` and `callback` routes
5. capture the resulting `access_token`, `refresh_token`, and `open_id`

Exit criteria:

1. TikTok redirects back to the deployed callback with a real authorization code
2. token exchange succeeds
3. returned token values are visible and can be stored securely

### Phase 4B: TikTok Runtime Completion

Goal: replace the TikTok placeholder adapter with a real organic draft-upload flow.

Tasks:

1. add secure storage for TikTok access token, refresh token, and open ID
2. add token refresh handling against `POST /v2/oauth/token/`
3. replace the placeholder TikTok adapter in `lib/campaigns/distribution/platforms/tiktok.ts`
4. fetch the actual generated video asset bytes from the campaign asset URL
5. initialize a TikTok upload using `source=FILE_UPLOAD`
6. upload the video bytes to TikTok's `upload_url`
7. persist `publish_id`, post status, and returned metadata into the distribution record

Exit criteria:

1. one generated campaign seed video is uploaded as a TikTok draft
2. the distribution record stores a real TikTok publish identifier
3. the operator can see a truthful status in the review surface

### Phase 4C: Provider Status Layer

Goal: stop guessing about provider readiness.

Tasks:

1. add a shared provider-status contract for TikTok, Meta, and Google
2. add validation endpoints or server actions that check env presence, auth validity, and account reachability
3. surface provider readiness in the landing review route and distribution dashboard
4. distinguish `connected`, `misconfigured`, `unauthorized`, and `unverified`

Exit criteria:

1. the app reports why a provider cannot be used before a live action is attempted
2. operators no longer need raw provider errors to diagnose setup issues

### Phase 4D: Meta Hardening

Goal: convert the current partial Meta connector into a real paused-draft workflow.

Tasks:

1. add Meta connection validation before live draft creation
2. verify the configured ad account, page, and optional Instagram actor
3. persist `campaignId`, `adSetId`, `adCreativeId`, `adId`, and any review URL
4. rename UI actions so `Dispatch Ads` no longer implies full activation
5. preserve paused creation as the default behavior

Exit criteria:

1. a paused Meta draft can be created from generated assets
2. the native object identifiers are persisted in the schedule record
3. the operator can open the native Meta object for review

### Phase 4E: Google Ads First Adapter

Goal: add the first Google native-draft path using the same contract shape as Meta.

Tasks:

1. choose the initial Google ad product
2. add Google account connection validation
3. create paused native drafts only
4. persist Google campaign and ad group identifiers
5. expose a native review path where available

Exit criteria:

1. Google follows the same plan -> validate -> draft -> review -> activate lifecycle
2. the UI does not special-case Google beyond provider-specific details

## Cross-Cutting Engineering Rules

1. simulation remains available for preview and debugging, but never masquerades as completion
2. every live provider action must persist external identifiers immediately
3. every provider integration must report readiness before attempting mutation
4. activation remains a distinct action from creation
5. env contracts are centralized and documented once per provider

## Operator Dependencies

The implementation path depends on several manual platform-side tasks being completed correctly.

TikTok dependencies:

1. Sandbox created
2. Login Kit configured with exact redirect URI
3. target user added
4. required scopes enabled

Meta dependencies:

1. business assets linked correctly
2. ad account active
3. page assigned
4. token available with correct permissions

Google dependencies:

1. customer account chosen
2. OAuth app created
3. manager or customer linkage confirmed

## Definition Of Done

Phase 4 is considered complete only when all of the following are true:

1. the app can plan distribution without live mutations
2. the app can validate provider readiness before draft creation
3. the app can create a real native draft or organic post draft in each supported provider
4. the app stores native IDs and publish metadata in the distribution record
5. the operator can review drafts in the native platform before activation
6. activation is separate, explicit, and auditable