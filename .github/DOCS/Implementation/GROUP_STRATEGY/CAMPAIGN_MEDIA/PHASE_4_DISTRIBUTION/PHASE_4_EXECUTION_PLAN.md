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
6. successful TikTok OAuth completion for the Leisure Life Interactive business account
7. durable TikTok token persistence and automatic refresh persistence in DynamoDB
8. a verified local TikTok draft-upload run from the business account

The codebase does not yet support:

1. truthful lifecycle tracking from `publish_id` to creator inbox delivery to real publication
2. a fully automated direct-post path to a profile-visible TikTok post
3. consistent native review links and external ID persistence across providers
4. explicit activation controls separate from draft creation

## Primary Delivery Sequence

### Phase 4A: Local-First TikTok Token Persistence

Goal: remove the daily-manual-maintenance risk by moving TikTok credentials out of static env-only storage.

Tasks:

1. choose the first durable store for TikTok credentials
2. bootstrap it with the successful Leisure Life Interactive business-account token set
3. load TikTok credentials from that durable store for local dispatch
4. write refreshed token values back to that store automatically
5. keep env vars as bootstrap or fallback input, not the long-term rotating store

Exit criteria:

1. local runs can load current TikTok credentials without manual daily env edits
2. token refresh updates the durable store automatically
3. restarting the local process does not break TikTok provider readiness

### Phase 4B: TikTok Local Draft Upload Completion

Goal: keep the real organic draft-upload flow truthful and operator-visible through publication.

Tasks:

1. verify the adapter uses the business-account token set, not the temporary personal test tokens
2. keep the TikTok adapter on the real `FILE_UPLOAD` inbox-share flow
3. fetch the actual generated video asset bytes from the campaign asset URL
4. initialize a TikTok upload using `source=FILE_UPLOAD`
5. upload the video bytes to TikTok's `upload_url`
6. persist `publish_id`, post status, and returned metadata into the distribution record
7. poll TikTok status so `draft_created` and `posted` are not conflated
8. confirm the flow is runnable from the local environment

Exit criteria:

1. one generated campaign seed video is uploaded as a TikTok draft from the local environment
2. the distribution record stores a real TikTok `publish_id`
3. the operator can see a truthful status in the review surface
4. the system can distinguish `draft_created` from `posted`

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