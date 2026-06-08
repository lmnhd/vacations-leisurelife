# Phase 2 — Inbound Engagement & Content Drip Engine ⏳ Planned

**Status:** Not started. This is the design for the work deferred from Phase 1.
**Goal:** Make the agency pages "look alive" and convert: (a) reply to inbound comments
and DMs through the existing chat pipeline, and (b) keep a steady drip of organic content
beyond the launch announcement.

Phase 2 splits into two largely independent tracks — **2a (inbound engagement)** and
**2b (content drip)** — that can ship in either order.

---

## Track 2a — Inbound Engagement (comments + DMs)

### Why it's a bigger lift than Phase 1
Phase 1 only *published*. Inbound requires *reading* Meta surfaces, *threading* a reply
through the chat pipeline, and *writing back* — and the chat pipeline does not yet model
social channels.

### Key blocker discovered during Phase 1 exploration
`lib/chat/types.ts` defines:
```ts
export type Channel = 'text' | 'voice' | 'voice_hybrid';
```
There is **no `instagram_dm` / `instagram_comment` / `facebook_comment` channel**. The
architecture doc's "run comments through the chat pipeline with an `instagram_dm` channel
type" assumes a channel that does not exist. This must be added first.

### Plan

1. **Extend the channel model** (`lib/chat/types.ts`):
   - Add `'instagram_dm' | 'instagram_comment' | 'facebook_comment'` to `Channel`.
   - Audit every `switch`/branch on `Channel` (prompt-assembler, llm-call, response-processor)
     and add handling — captions/replies for public comments must be short and push to DMs;
     DMs get the full sales-assist flow. Keep public-comment replies free of price quotes.
   - `runPipeline()` in `lib/chat/pipeline.ts` is the entry point; it takes `PipelineInput`
     (`sessionId`, `userId`, `channel`, `message`). Map one social thread → one `sessionId`
     so conversation memory persists per commenter/DM-sender.

2. **Graph read adapters** (new `lib/integrations/meta-engagement.ts`):
   - Comments: `GET /{ig-user-id}/media?fields=comments{...}` and
     `GET /{page-id}/feed?fields=comments{...}` since the last sync timestamp.
   - DMs: `GET /{page-id}/conversations?fields=messages{...}` (IG + Messenger).
   - Reuse the `postMetaGraphForm` / `graphErrorMessage` helpers already in
     `lib/integrations/meta-ads.ts` (factor the Graph fetch core into a shared module if it
     grows). Required scopes: `instagram_manage_comments`, `pages_manage_engagement`,
     `instagram_manage_messages`, `pages_messaging` (see ARCHITECTURE.md §"Required Permissions").

3. **Write-back adapters** (same module): reply to a comment
   (`POST /{comment-id}/replies`) and send a DM (`POST /{page-id}/messages`). Default to a
   **dry-run/draft mode** that logs intended replies for operator approval before any live
   reply is sent — matching the Phase 1 draft-for-approval rule. Promote to auto-reply only
   after the operator is comfortable.

4. **The runner** (`scripts/social-sync.ts`, wired as `npm run social:sync`):
   - Operator-run (or Windows Task Scheduler), consistent with `scrape-cb-deals` etc. and the
     no-new-Vercel-function constraint.
   - Steps: fetch new comments/DMs since last cursor → for each, resolve/create a chat session
     keyed to the thread → `runPipeline()` with the social channel → collect replies →
     batch dispatch (or stage for approval) → persist the new sync cursor.
   - Store the sync cursor and thread↔session mapping in DynamoDB (single-table:
     `PK: SOCIAL#<page-or-ig-id>`, `SK: CURSOR | THREAD#<thread-id>`). No webhooks — periodic
     polling only, per the doc's "no real-time required" stance.

5. **Idempotency:** never reply to the same comment/DM twice. Track replied ids in DynamoDB
   and check before dispatch (mirror the dispatcher's "already drafted" guard).

### Acceptance for 2a
`npm run social:sync` fetches the last 24h of comments/DMs, routes them through the pipeline,
and produces correct replies (staged for approval by default). A bad reply cannot reach the
public without operator action while in draft mode.

---

## Track 2b — Content Drip Engine (organic strategies 2–5)

### Design rule
Where possible, the drip engine **emits `ScheduledPost`s into the existing distribution
schedule** (same primitive Phase 1 uses) rather than calling Graph directly — so all posting
goes through one audited path (`dispatchMarketingPost`). The drip engine only adds *what* and
*when* to post; the *how* is already built.

A weekly cadence is the one place a standalone trigger is justified (it is campaign-independent).
Use a single `npm run social:drip` script (operator/Task-Scheduler-run) — or, if autonomy is
required, exactly one Vercel cron route (mind the 12-function cap).

### The four remaining strategies (from ARCHITECTURE.md)

| Strategy | Source data | New post(s) | Notes |
|---|---|---|---|
| **2 — Deal of the Week** | `lib/chat/tools/vtg-search.ts` (top deals by popular port) | `facebook_page` + `instagram_feed` price-overlay graphic | Caption drives to DMs ("DM 'DEAL'") → handed to Track 2a pipeline. **No "book" CTA.** |
| **3 — Ship vs. Ship poll** | `manifest.images.shipReferences` (two ships) | `instagram_feed` carousel / split image | Zero new asset generation; engagement bait to lower ad costs. |
| **4 — FOMO countdown** | `manifest.videos.countdown` or generated text graphic | `instagram_story` + `facebook_page` | Fire 48h before a launch/price-increase; reuse the `ON_THRESHOLD`/date gating. |
| **5 — Port highlight carousel** | `lib/campaigns/cruise-ports.ts` + SerpAPI destination images | `instagram_feed` carousel (3 photos) | Pull a port from an active campaign's itinerary. |

### Plan

1. **Drip generator** (new `lib/campaigns/social-drip.ts`): given active campaigns + a strategy,
   select assets (reuse the planner's selectors: `selectDesignedAdAssetId`, `getPrimaryHeroAssetId`)
   and synthesize a caption via the **LLM gateway** (`modelForTask()` — lighter model for
   captions). Return `PostDraft[]` shaped exactly like `distribution-planner.ts` produces.
2. **Caption safety:** run captions through the same banned-CTA rule as ad copy
   (`BANNED_CTA_SUBSTRINGS` / `sanitizeCta` in `distribution-marketing.ts`) — factor that into
   a shared util so organic and paid share one enforcement point.
3. **Cadence:** `npm run social:drip` picks one strategy per run (rotate weekly), appends the
   drafts to the campaign's distribution schedule (or a standalone "house content" schedule),
   and stages them `draft_created` for approval.
4. **Graphic generation (Strategy 2 price overlay):** reuse the existing design-system renderer
   (`lib/campaigns/design-system/renderer/satori-renderer.ts`) rather than a new pipeline.

### Acceptance for 2b
A weekly run produces an approved-pending organic post for the rotated strategy, sourced
entirely from existing campaign/VTG/port data, with a compliant caption, ready to dispatch
through the Phase 1 path.

---

## Sequencing recommendation

Track **2a (engagement)** delivers the higher conversion value (Deal-of-Week and DM CTAs
only pay off if someone is actually answering the DMs). Suggested order:

1. **2a step 1** (channel model) — unblocks everything inbound.
2. **2a steps 2–5** (read/write adapters + `social:sync` runner) in draft mode.
3. **2b** (drip engine), starting with Strategy 3 (ship-vs-ship — zero new assets, pure
   engagement) then Strategy 2 (deal-of-week — needs 2a live to handle the inbound DMs).

## Open questions to resolve before starting Phase 2
- Auto-reply vs. always-stage-for-approval as the steady state for DMs (Phase 1 chose
  stage-for-approval; confirm the same for inbound at scale).
- Whether drip content attaches to a specific campaign's schedule or a separate "house
  content" schedule decoupled from any single campaign.
- SerpAPI budget/quota for Strategy 5 port imagery.
