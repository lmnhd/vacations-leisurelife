# Klaviyo Email Flow — Phase 3 Implementation

Status: **Implemented**.
Scope: Section §7 of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) — the five post-booking core emails, plus the daily scheduler infrastructure that fires the two time-triggered stages.
Builds on [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md) and [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md).

---

## 1. What Shipped

Five new stages and a stateless scheduler:

| Stage | Klaviyo metric | Visual mode | Trigger |
|-------|---------------|-------------|---------|
| `booking_confirmed` | `LLL Booking Confirmed` | `cinematic_invite` | **Auto** — fires when `markLeadAsBooked()` flips `converted` to true (manual-booking-entry endpoint). |
| `travel_prep` | `LLL Travel Prep` | `field_note` | **Scheduled** — daily sweep, offsets 90/60/30 days pre-sail. |
| `final_countdown` | `LLL Final Countdown` | `field_note` | **Scheduled** — daily sweep, offsets 14/7/3/1 days pre-sail. |
| `final_itinerary_published` | `LLL Final Itinerary Published` | `celebration` | **Auto** — fires when `finalItineraryUrl` is first populated via campaign PATCH. Broadcast to converted leads only. |
| `tour_conductor_announced` | `LLL Tour Conductor Announced` | `celebration` | **Auto** — fires when `tourConductorName` is first populated via campaign PATCH. Broadcast to converted leads only. |

### New / modified code

| Path | Change |
|------|--------|
| `lib/campaigns/email/email-event-types.ts` | Extended `EmailEventStage`, `KLAVIYO_METRIC_NAMES`, `STAGE_VISUAL_MODES`, `STAGE_LEDGER_SUCCESS_TYPE`. New `PHASE_3_STAGES`. |
| `lib/campaigns/email/klaviyo-profile-builder.ts` | Profile now carries `final_itinerary_url`, `tour_conductor_name`. |
| `lib/campaigns/email/klaviyo-event-builder.ts` | New `phase3` input bag. New per-stage properties: `booking_reference`, `booking_confirmed_at`, `days_to_sail`, `scheduled_offset`, `packing_list_url`, `final_itinerary_url`, `tour_conductor_name`, `tour_conductor_bio`. |
| `lib/campaigns/email/email-event-orchestrator.ts` | Threads `phase3` through preview + dispatch. Ledger metadata now includes `scheduledOffset` when present — this is the scheduler's idempotency key. |
| `lib/campaigns/email/email-schedule-policy.ts` | **New.** Declares offsets per scheduled stage + `pickOffsetForDaysToSail()` helper. |
| `lib/campaigns/email/email-scheduler.ts` | **New.** `runEmailScheduler()` and `runCampaignEmailSchedule()`. Per-campaign sweep with ledger-based dedupe. |
| `lib/campaigns/types.ts` | `Campaign` gains `finalItineraryUrl?`, `tourConductorName?`, `tourConductorBio?`. |
| `app/api/cron/email-scheduler/route.ts` | **New.** GET endpoint for external schedulers (Vercel cron, EventBridge, GitHub Actions). Auth via `CRON_SECRET` Bearer header OR Vercel `x-vercel-cron` header. |
| `app/api/groups/campaign/[slug]/email-scheduler/route.ts` | **New.** POST endpoint scoped to one campaign, used by the operator UI's "Run scheduler" button. |
| `app/api/groups/campaign/[slug]/email-preview/route.ts` | Accepts all 13 stages. Phase 3 overrides via query params (GET) and body field `phase3` (POST). |
| `app/api/groups/campaign/[slug]/route.ts` (PATCH) | Accepts `finalItineraryUrl`, `tourConductorName`, `tourConductorBio`. Auto-fires `final_itinerary_published` and `tour_conductor_announced` broadcasts (converted leads only) when those fields first become populated. |
| `app/api/groups/campaign/[slug]/manual-booking/route.ts` | On `convertedNow=true`, now fires `LLL Booking Confirmed` (non-fatal). Response includes `bookingConfirmedEmailFired`. |
| `app/(tests)/tests/klaviyo-emails/page.tsx` | 13-tile stage grid with phase badges. Phase 3 inputs panel (scheduled offset, packing list URL). New **Scheduler Run** section. |
| `lib/campaigns/email/__tests__/klaviyo-payload-builder.test.ts` | +6 Phase 3 assertions → 18 total. |
| `lib/campaigns/email/__tests__/email-schedule-policy.test.ts` | **New.** 6 assertions covering offset windows + grace days. |

---

## 2. Scheduler Architecture

The scheduler is **stateless**. All state lives in the per-lead event ledger,
keyed by `(campaign, lead, stage, scheduledOffset)`. This means:

- The cron endpoint is safely re-runnable (idempotent).
- A missed cron day is recovered by the next run (within the grace window).
- No new persistent storage was introduced for Phase 3 scheduling.

### Sweep logic (`email-scheduler.ts`)

For each campaign returned by `scanAllCampaigns()`:

1. Skip unless `status ∈ {THRESHOLD_MET, CONVERTED}` AND `matchedSailDate` is set.
2. Compute `daysToSail = matchedSailDate - today` (UTC, integer days).
3. List `converted=true` leads on the campaign.
4. List all lead events for the campaign (single query).
5. For each (lead, scheduled policy):
   - Use `pickOffsetForDaysToSail()` to find the offset whose window
     `[offset - graceDays, offset]` contains `daysToSail`. Largest matching
     offset wins.
   - Skip if the ledger already contains a non-dryRun row with
     `metadata.stage` and `metadata.scheduledOffset` matching this firing.
   - Otherwise dispatch via `dispatchEmailEvent(slug, email, stage, {phase3: {daysToSail, scheduledOffset}})`.
6. Collect per-lead failures into the result; one failure never blocks others.

### Offset policy (`email-schedule-policy.ts`)

```ts
travel_prep:     offsets [90, 60, 30], grace 1 day
final_countdown: offsets [14, 7, 3, 1], grace 1 day
```

The grace day means a 1-day cron outage does not lose a send. Larger
outages do — that is an accepted v1 failure mode.

### Idempotency key

`appendLeadEvent()` writes `metadata.scheduledOffset = "<n>"` on every queued
and success row when the orchestrator is called with `opts.phase3.scheduledOffset`.
`hasAlreadyBeenSent()` matches on `(email, stage, scheduledOffset)` and
deliberately ignores rows with `metadata.dryRun = "true"` so a previous
preview run does not block a live send.

---

## 3. Cron Endpoint

`GET /api/cron/email-scheduler`

Headers (one of):
- `Authorization: Bearer ${CRON_SECRET}`
- `x-vercel-cron: 1` (set automatically by Vercel cron)

Query params:
- `dryRun=1` — no Klaviyo calls; ledger still records `nurture_queued` rows.
- `today=YYYY-MM-DD` — override "today" for testing.

Response shape:

```jsonc
{
  "success": true,
  "result": {
    "runAt": "2026-08-15T07:00:01.234Z",
    "today": "2026-08-15",
    "dryRun": false,
    "campaignsScanned": 12,
    "perCampaign": [ /* CampaignSweepResult[] */ ],
    "totals": { "dispatched": 7, "skippedAlreadySent": 23, "failed": 0 }
  }
}
```

### Recommended cadence

Daily, at a quiet hour in the recipient timezone. On Vercel:

```jsonc
// vercel.json
{
  "crons": [{ "path": "/api/cron/email-scheduler", "schedule": "0 13 * * *" }]
}
```

Outside Vercel: EventBridge / GitHub Actions / cron-job.org hitting the
endpoint with `Authorization: Bearer ${CRON_SECRET}` works the same. The
endpoint refuses requests without either auth path.

---

## 4. Event Property Contract — Phase 3 Additions

Profile properties:

| Property | Source |
|----------|--------|
| `final_itinerary_url` | `campaign.finalItineraryUrl` |
| `tour_conductor_name` | `campaign.tourConductorName` |

Event properties (compacted per stage; other stages don't see leaked keys):

| Property | Emitted on |
|----------|-----------|
| `booking_reference` | `booking_confirmed` |
| `booking_confirmed_at` | `booking_confirmed` |
| `days_to_sail` | `travel_prep`, `final_countdown` |
| `scheduled_offset` | `travel_prep`, `final_countdown` |
| `packing_list_url` | `final_countdown` (optional) |
| `final_itinerary_url` | `final_itinerary_published` |
| `tour_conductor_name` | `tour_conductor_announced` |
| `tour_conductor_bio` | `tour_conductor_announced` (optional) |
| `operator_note` | Any Phase 3 stage (optional) |

---

## 5. Template Briefs (Phase 3)

### `LLL Booking Confirmed` (`cinematic_invite`)

- **Subjects:** `You're in — welcome aboard {{ event.campaign_name }}` / `Booked: your place in {{ event.campaign_name }} is confirmed`
- **Modules:** confirmation banner using `{{ event.booking_reference }}` and `{{ event.booking_confirmed_at|date:"M j, Y" }}`, what-happens-next, community link, travel checklist preview, merch preview.
- **Primary CTA:** "Open Your Trip dashboard" → `{{ person.landing_page_url }}`.

### `LLL Travel Prep` (`field_note`)

- **Subjects:** Vary by `scheduled_offset` — at 90 lead with research-grade flight/hotel guidance; at 60 with bookings deadlines; at 30 with documents check.
- **Subject A (90):** `A few smart travel moves before {{ event.campaign_name }}`
- **Subject B (60):** `60 days to sail — let's lock in flights`
- **Subject C (30):** `30 days out: passports, insurance, packing prep`
- **Modules:** departure-port-specific tips using `{{ person.departure_port }}`, document reminders, hotel/flight referral links, insurance reminder.
- **Primary CTA:** "Open travel checklist" → `{{ person.landing_page_url }}#travel`.

### `LLL Final Countdown` (`field_note`)

- **Subjects:** Vary by offset.
  - `Two weeks out: what to pack for {{ event.campaign_name }}`
  - `Seven days until the group meets onboard`
  - `Final details before you sail`
  - `Tomorrow: see you at the ship`
- **Modules:** packing list (link via `{{ event.packing_list_url }}` when set), boarding reminder, community prompt, merch last call when applicable.

### `LLL Final Itinerary Published` (`celebration`)

- **Subjects:** `Your group itinerary is ready` / `Here's the plan for {{ event.campaign_name }} onboard`
- **Primary CTA:** "View final itinerary" → `{{ event.final_itinerary_url }}`.
- **Modules:** daily rhythm preview, featured meetups, who hosts what, caveat that ship operations may adjust timing.

### `LLL Tour Conductor Announced` (`celebration`)

- **Subjects:** `Meet your Tour Conductor for {{ event.campaign_name }}` / `The friendly face helping the group connect onboard`
- **Modules:** `{{ event.tour_conductor_name }}` headline, optional `{{ event.tour_conductor_bio }}`, what the TC does (and does not do), community etiquette.
- **Primary CTA:** "Meet the TC / open community channel" → `{{ person.community_channel_url }}`.

---

## 6. Operator Preview Surface (extended again)

`/tests/klaviyo-emails` now shows all **13 stages** with `P1`/`P2`/`P3` phase badges. Selecting a Phase 3 stage reveals:

- `travel_prep` / `final_countdown`: numeric `scheduledOffset` input for previewing specific cadences.
- `final_countdown`: optional `packingListUrl` input.
- All Phase 3 stages: shared `operatorNote` input.
- `final_itinerary_published` / `tour_conductor_announced`: italic notice clarifying that these auto-broadcast from campaign PATCH.
- `travel_prep` / `final_countdown`: italic notice clarifying that production firing is via the scheduler.

A new **Scheduler Run** panel at the bottom of the page lets the operator
sweep the current campaign on demand — dry-run or live, with an optional
`today` override for testing. Returns the full `CampaignSweepResult` as
JSON.

---

## 7. Auto-Wire Map

| Action in app | Email that fires |
|--------------|------------------|
| `/tests/manual-booking-entry` save (first reconciliation, `convertedNow=true`) | `LLL Booking Confirmed` |
| PATCH campaign with new `finalItineraryUrl` (from null/empty) | `LLL Final Itinerary Published` (converted leads only) |
| PATCH campaign with new `tourConductorName` (from null/empty) | `LLL Tour Conductor Announced` (converted leads only) |
| Daily cron at `/api/cron/email-scheduler` | `LLL Travel Prep` and `LLL Final Countdown` at the right offsets |

All auto-fires are non-fatal — the originating mutation (booking save / PATCH) succeeds even if Klaviyo errors. Errors land in the lead event ledger as `lead_error` rows.

---

## 8. What Was Deliberately Not Done

- **Day-of-sail (`offsetsDays: 0`) send.** Plan §7 only lists 14/7/3/1; day-of is intentionally silent.
- **Stage-specific ledger eventTypes for Phase 3.** All five use `nurture_sent`. If a future analytics need wants to count "post-booking emails" distinctly, we can add `post_booking_sent` to `LeadEventType` later — no schema migration required since all rows still carry `metadata.stage`.
- **Multi-region cron pinning.** The cron endpoint is region-agnostic; if the cron runs in two regions for redundancy, the ledger-based dedupe handles it (last-write-wins on the queue row, only one of the two wins the "no prior send" check).
- **Configurable offsets per campaign.** The policy is constant for now. Per-campaign overrides would live on the `Campaign` record and the policy lookup would be aware of `campaign.id`. Not needed yet.
- **Scheduled time-based `campaign_expired`.** Campaigns have `expiresAt` but the scheduler does NOT scan it. Expiration remains operator-driven via PATCH. Adding it would require expanding `email-schedule-policy.ts` with a non-sail-date offset family.

---

## 9. Known Risks / Follow-ups

1. **Listing all leads per campaign per sweep is O(N).** Acceptable for current scale; for thousands of leads per campaign, paginate `listCampaignWaitlistEntries`.
2. **`listCampaignLeadEvents` returns the full event ledger.** For long-running campaigns this grows. The dedupe scan filters in memory; for very large ledgers, consider a secondary index on `(campaign, stage, scheduledOffset)`.
3. **Cron freshness vs. sail date precision.** "Days to sail" is computed against UTC midnight on both sides. Travelers in distant timezones may see a 1-day skew. Acceptable for v1; if it matters, store `matchedSailDateTimezone` and adjust per-lead.
4. **No flow audit log for the scheduler beyond the per-lead ledger.** The cron response carries the full sweep summary; capturing those somewhere durable (S3 / a `scheduler-run` Dynamo entry) is a nice-to-have, not blocking.

---

## 10. Phase Progress

| Phase | Status |
|-------|--------|
| 1 — Three nurture emails | ✅ Shipped |
| 2 — Five pre-booking events | ✅ Shipped |
| 3 — Post-booking core + scheduler | ✅ Shipped (this doc) |
| 4 — Change notifications | Not started |
| 5 — Post-cruise / alumni | Not started |

The live end-to-end test pass covering Phase 3 plus the scheduler is sketched in §6 of [KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md). That section was a placeholder until now and should be filled in close to test day.
