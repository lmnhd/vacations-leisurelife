# Klaviyo Email Flow — Phase 5 Implementation

Status: **Implemented**. Final phase of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) — all 13 lifecycle email stages now ship.
Scope: Plan §7 (Post-Cruise + Alumni). Three new stages:

- `post_cruise_welcome_home` — fires 1 day after disembarkation.
- `post_cruise_survey` — fires 3 days after disembarkation.
- `alumni_rebooking_invite` — operator-triggered cross-campaign invite from past converted guests to a new campaign.

Builds on Phases 1–4.

---

## 1. What Shipped

| Capability | Where |
|------------|-------|
| Three new `EmailEventStage` values + metric names + visual modes (`afterglow`, `cinematic_invite`) | [email-event-types.ts](../../../../lib/campaigns/email/email-event-types.ts) |
| `phase5` input bag on `BuildKlaviyoEventInput` covering both post-cruise and alumni-invite fields | [klaviyo-event-builder.ts](../../../../lib/campaigns/email/klaviyo-event-builder.ts) |
| `phase5` extension on `EmailEventOptions`; `scheduledOffset` now flows from either `phase3` or `phase5` into the same ledger metadata key | [email-event-orchestrator.ts](../../../../lib/campaigns/email/email-event-orchestrator.ts) |
| Schedule policy generalized with `reference: pre_sail \| post_disembark` and new helpers `pickOffsetForDaysSinceDisembark`, `pickOffsetForSweep` | [email-schedule-policy.ts](../../../../lib/campaigns/email/email-schedule-policy.ts) |
| Scheduler sweeps post-cruise stages by computing `daysSinceDisembark = today - (sailDate + matchedNights)` | [email-scheduler.ts](../../../../lib/campaigns/email/email-scheduler.ts) |
| `sendAlumniInvite()` orchestrator helper — de-dupes recipients across source campaigns | [email-event-orchestrator.ts](../../../../lib/campaigns/email/email-event-orchestrator.ts) |
| `POST /api/groups/campaign/[slug]/alumni-invite` — slug is the TARGET (new) campaign | [route.ts](../../../../app/api/groups/campaign/[slug]/alumni-invite/route.ts) |
| `/tests/alumni-rebooking` operator page — multi-source picker with dry-run preview | [page.tsx](../../../../app/(tests)/tests/alumni-rebooking/page.tsx) |
| Hub slug-route tile + tests-index entry | [hub/page.tsx](../../../../app/(internal)/hub/page.tsx), [tests page](../../../../app/(tests)/tests/page.tsx) |
| `/tests/klaviyo-emails` extended with 3 Phase 5 tiles + emerald `P5` phase badge | [page.tsx](../../../../app/(tests)/tests/klaviyo-emails/page.tsx) |
| 4 new payload-builder tests + 7 new schedule-policy tests (40 total passing) | [\_\_tests\_\_/](../../../../lib/campaigns/email/__tests__/) |

---

## 2. Scheduler — Post-Disembark Math

The plan called for two scheduled post-cruise emails. Rather than fork the
scheduler, Phase 5 generalizes the existing schedule policy to support a
second reference point:

```ts
interface ScheduledStagePolicy {
    stage: EmailEventStage;
    reference: 'pre_sail' | 'post_disembark';
    offsetsDays: number[];
    graceDays: number;
}
```

### Disembark date

Computed per campaign as `matchedSailDate + matchedNights` (UTC midnight).
`matchedNights` is parsed with `/\d+/` from a free-form string (`"7"`,
`"7-Night"`, `"7 nights"` all yield `7`). When `matchedNights` is missing
or unparseable, post-disembark stages are skipped for that campaign and
`daysSinceDisembark` stays `null` in the sweep result.

### Window math

| Reference | Fires when |
|-----------|------------|
| `pre_sail` | `daysToSail ∈ [offset - grace, offset]` (cron may fire slightly *late*) |
| `post_disembark` | `daysSinceDisembark ∈ [offset, offset + grace]` (cron may fire slightly *late*) |

In both modes the grace window pads in the same direction — we accept a
miss by sending later than canonical, never earlier. Asymmetry across the
two references is intentional: a `pre_sail` email at "60 days out" arriving
one day late is fine, but firing it one day early would mean we miss the
day-of date entirely.

### Idempotency

Same model as Phase 3. The orchestrator stamps `scheduledOffset` onto
every ledger row when either `phase3.scheduledOffset` OR
`phase5.scheduledOffset` is supplied. `hasAlreadyBeenSent()` matches on
`(email, stage, scheduledOffset)` regardless of which phase bag carried
the value, so post-cruise sends dedupe cleanly.

---

## 3. Eligibility Rules

| Condition | Effect |
|-----------|--------|
| Campaign status NOT in `{CONVERTED, THRESHOLD_MET}` | Whole campaign skipped, `skippedReason` populated. |
| `matchedSailDate` missing | Whole campaign skipped. |
| Sail in the future, `matchedNights` missing | Pre-sail stages run normally; post-disembark stages naturally never match (daysSinceDisembark stays null). |
| Sail in the past, `matchedNights` missing | Whole campaign skipped with `skippedReason='sail date in the past with no matchedNights set'`. This is the v1 escape hatch — operators must populate `matchedNights` to unlock post-cruise sends. |
| `converted === false` lead | Skipped (post-cruise + alumni both require a successful booking). |

---

## 4. Event Property Contract — Phase 5 Additions

Profile properties: unchanged. Event properties are emitted only on the
relevant stage; `compact()` drops undefined values.

| Property | Emitted on |
|----------|-----------|
| `days_since_disembark` | `post_cruise_welcome_home`, `post_cruise_survey` |
| `scheduled_offset` | `post_cruise_welcome_home`, `post_cruise_survey` |
| `photo_share_url` | `post_cruise_welcome_home` (optional, operator-supplied at fire time) |
| `survey_url` | `post_cruise_survey` (optional) |
| `target_campaign_slug` | `alumni_rebooking_invite` |
| `target_campaign_name` | `alumni_rebooking_invite` |
| `target_landing_url` | `alumni_rebooking_invite` (derived from `NEXT_PUBLIC_SITE_URL`) |
| `target_sail_date` | `alumni_rebooking_invite` (target campaign's `matchedSailDate`) |
| `target_pitch` | `alumni_rebooking_invite` (operator-supplied) |
| `alumni_window` | `alumni_rebooking_invite` (operator-supplied access-window copy) |
| `operator_note` | Any Phase 5 stage (optional) |

Note on `visual_mode`:
- `post_cruise_welcome_home` and `post_cruise_survey` use `afterglow` — soft,
  warm closing aesthetic.
- `alumni_rebooking_invite` uses `cinematic_invite` — same hero treatment as
  `waitlist_confirmation` since the lead is being invited into a new sailing.

---

## 5. Template Briefs (Phase 5)

### `LLL Post Cruise Welcome Home` (visual_mode `afterglow`)

- **Subjects:** `Welcome home from {{ event.campaign_name }}` / `That was a real one`
- **Pre-header:** Branch on `event.days_since_disembark` for the tone — typically `1`.
- **Modules:**
  1. Greeting using `{{ person.first_name }}`.
  2. Warm-close paragraph; references the cruise in past tense.
  3. Photo-share CTA → `{{ event.photo_share_url }}` (if set) — otherwise direct guests to the campaign community link.
  4. Tease of next steps (survey arriving in 2 days, alumni invites later).
- **Primary CTA:** "Share a moment" → `{{ event.photo_share_url }}` (falls back to `{{ person.community_channel_url }}`).

### `LLL Post Cruise Survey` (visual_mode `afterglow`)

- **Subjects:** `Tell us what made the sailing work` / `Five quick questions about {{ event.campaign_name }}`
- **Modules:**
  1. Greeting.
  2. Brief honest framing — what we use the answers for (testimonials + future campaign tuning).
  3. Survey CTA → `{{ event.survey_url }}`.
- **Primary CTA:** "Take the survey" → `{{ event.survey_url }}`.

### `LLL Alumni Rebooking Invite` (visual_mode `cinematic_invite`)

- **Subjects:** `Alumni first look: {{ event.target_campaign_name }}` / `Want first pick on the next group cruise?`
- **Modules:**
  1. Greeting plus a "you sailed with us on {{ event.campaign_name }}" callback to the SOURCE campaign (which is the ledger campaign for this send).
  2. `{{ event.target_pitch }}` headline.
  3. Target campaign card — hero, name, sail date pulled from `{{ event.target_campaign_name }}`, `{{ event.target_sail_date }}`.
  4. Alumni window callout: `{{ event.alumni_window }}` when present.
- **Primary CTA:** "Open the alumni invite" → `{{ event.target_landing_url }}`.

---

## 6. Operator Surfaces

### `/tests/alumni-rebooking`

The recorder for alumni invites:

1. Pick the **target** campaign (the new sailing). Pre-populates from `?slug=` so the hub tile lands ready to go.
2. Add one or more **source** campaigns. Each source has a per-row "converted only" toggle (default on).
3. Optional pitch + alumni window + operator note.
4. Dry-run toggle; LIVE send requires confirmation.

Returns aggregate `AlumniInviteResult`:

```jsonc
{
  "targetCampaignSlug": "cat-lovers-2027",
  "sources": [{ "slug": "retro-future-2026", "convertedOnly": true }],
  "uniqueRecipients": 14,
  "dispatched": 14,
  "skippedDuplicateRecipient": 2,
  "failed": 0,
  "failures": []
}
```

Duplicates across sources are de-duplicated in-memory — a guest who sailed
with us twice gets one invite, attributed to the first source seen.

### `/tests/klaviyo-emails` — Phase 5 tiles

All three Phase 5 stages now appear in the stage grid with an emerald `P5`
badge. Tile descriptions point operators at the canonical surfaces:

- `post_cruise_welcome_home` / `post_cruise_survey` — "Scheduler fires N days after disembarkation." Production firing is via the cron endpoint; the email-preview tool still lets you inspect the rendered payload.
- `alumni_rebooking_invite` — "Use /tests/alumni-rebooking to fire from past campaigns to a new target." Single-lead preview is supported via the existing GET preview path.

---

## 7. Auto-Wire Map

| Operator action | App effect |
|----------------|-----------|
| Daily cron at `/api/cron/email-scheduler` | For each campaign with `matchedSailDate + matchedNights` and converted leads: fires `post_cruise_welcome_home` at day-1 post-disembark, `post_cruise_survey` at day-3 post-disembark. Idempotent. |
| POST to `/api/groups/campaign/[slug]/alumni-invite` (with `sources[]` in body) | For each unique converted guest across the listed source campaigns: fires `alumni_rebooking_invite` carrying the target campaign's info. |

Phase 5 does NOT auto-fire from any state transition.
`alumni_rebooking_invite` is operator-initiated because launching a new
campaign and deciding *which* past campaigns are adjacent are editorial
judgments, not state-machine triggers.

---

## 8. What Was Deliberately Not Done

- **Auto-fire alumni invites on new campaign launch.** Plan §7 hints at this; v1 keeps it operator-controlled because deciding "which past campaigns are adjacent" requires niche/destination matching logic the system doesn't have yet. When we add that signal (likely from the discovery dossier), an auto-fire path becomes safe.
- **Per-recipient survey idempotency beyond the scheduler dedupe.** A second post-cruise sweep at the same offset won't re-send (ledger dedupe), but if the operator manually re-fires via the email-preview endpoint, it WILL fire again. Acceptable since manual fires are deliberate.
- **Cross-campaign alumni dashboard.** No equivalent of `/tests/booking-changes` for alumni — the alumni page itself shows recent send results inline. If multi-month reporting is needed later, build it on top of the existing ledger query.
- **Suppression of alumni invites for guests already booked on the target.** If a guest already converted on the target campaign and is on the source campaign too, they'll still receive an invite. Klaviyo flow filters should exclude them — gating in the app would require a cross-campaign lookup per recipient.
- **Sail-date timezone awareness.** `daysSinceDisembark` is UTC-based, same as Phase 3. A guest in HKT seeing "yesterday's" welcome-home email is acceptable.

---

## 9. Known Risks / Follow-ups

1. **Free-form `matchedNights` parsing.** Today we accept `"7"`, `"7-Night"`, `"7 nights"`, etc. via `/\d+/`. If the data pipeline ever produces an ambiguous value (`"7 to 9-Night"`), we'd pick `7` and post-cruise emails would fire 2 days early. Tightening the source schema is the right fix.
2. **No `getCampaignBlueprint` for source campaigns.** `sendAlumniInvite` reads the *target* campaign but treats source slugs as opaque strings — `dispatchEmailEvent` will still 404 if a source slug doesn't exist. Acceptable: failures aggregate into the result. A pre-flight existence check would be a nicety.
3. **`scanAllCampaigns` cost.** Phase 5 didn't add new scans; the scheduler already scans daily. The alumni page does not scan — it relies on operator-typed slugs. If we add a "suggest source campaigns" feature, that would add a scan.
4. **Day-of-disembark vs day-1 distinction.** Plan §7 says welcome_home fires "1 day after disembarkation". Our `daysSinceDisembark` is integer days, so a cruise that disembarks at 8am UTC and a sweep that runs at 13:00 UTC same-day still computes `daysSinceDisembark=0`. Disembark+1 fires correctly on the next day. This matches the plan's intent.

---

## 10. Final Phase Progress

| Phase | Stages | Status |
|-------|--------|--------|
| 1 — Pre-booking nurture | `waitlist_confirmation`, `nurture_day3`, `nurture_day7` | ✅ Shipped |
| 2 — Pre-booking lifecycle | `threshold_met`, `manifest_requested`, `manifest_reminder`, `booking_link_ready`, `campaign_expired` | ✅ Shipped |
| 3 — Post-booking core (+ scheduler) | `booking_confirmed`, `travel_prep`, `final_countdown`, `final_itinerary_published`, `tour_conductor_announced` | ✅ Shipped |
| 4 — Change notifications | `booking_change` (severity branches + critical SMS + ack tracking) | ✅ Shipped |
| 5 — Post-cruise + alumni | `post_cruise_welcome_home`, `post_cruise_survey`, `alumni_rebooking_invite` | ✅ Shipped (this doc) |

All 13 lifecycle email stages from [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) are now live in app code. The end-to-end live test pass is sketched in [KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md); Phase 5 fills in §8 (was a placeholder).

---

## 11. End-to-End Implementation Map

For one definitive index of every endpoint, page, and trigger across all
five phases:

| Lifecycle moment | Stage | Trigger | Code |
|------------------|-------|---------|------|
| Waitlist signup | `waitlist_confirmation` | App-side, immediate | `app/api/groups/campaign/[slug]/waitlist/route.ts` |
| Day 3 post-signup | `nurture_day3` | Klaviyo flow delay | (Klaviyo) |
| Day 7 post-signup | `nurture_day7` | Klaviyo flow delay | (Klaviyo) |
| Threshold reached | `threshold_met` | Auto (waitlist + PATCH) | `waitlist/route.ts`, `[slug]/route.ts` |
| Manifest collection opens | `manifest_requested` | Operator broadcast | `email-broadcast/route.ts` |
| Manifest reminder | `manifest_reminder` | Operator broadcast w/ filter | `email-broadcast/route.ts` |
| Booking path live | `booking_link_ready` | Operator broadcast | `email-broadcast/route.ts` |
| Campaign expired | `campaign_expired` | Auto on PATCH → EXPIRED | `[slug]/route.ts` |
| Lead manually booked | `booking_confirmed` | Auto on `convertedNow=true` | `manual-booking/route.ts` |
| 90/60/30 pre-sail | `travel_prep` | Daily cron | `cron/email-scheduler/route.ts` |
| 14/7/3/1 pre-sail | `final_countdown` | Daily cron | `cron/email-scheduler/route.ts` |
| Itinerary published | `final_itinerary_published` | Auto on PATCH set | `[slug]/route.ts` |
| TC assigned | `tour_conductor_announced` | Auto on PATCH set | `[slug]/route.ts` |
| Operator records change | `booking_change` | Recorder dashboard | `booking-change/route.ts` |
| 1 day post-disembark | `post_cruise_welcome_home` | Daily cron | `cron/email-scheduler/route.ts` |
| 3 days post-disembark | `post_cruise_survey` | Daily cron | `cron/email-scheduler/route.ts` |
| New campaign launches | `alumni_rebooking_invite` | Operator dashboard | `alumni-invite/route.ts` |

Operator surfaces:

- [/tests/klaviyo-emails](../../../../app/(tests)/tests/klaviyo-emails/page.tsx) — 13-stage payload preview + dispatch + scheduler runner.
- [/tests/booking-changes](../../../../app/(tests)/tests/booking-changes/page.tsx) — Phase 4 change recorder + cross-campaign worklist + ack tracking.
- [/tests/alumni-rebooking](../../../../app/(tests)/tests/alumni-rebooking/page.tsx) — Phase 5 alumni invite recorder.
- [/tests/manual-booking-entry](../../../../app/(tests)/tests/manual-booking-entry/page.tsx) — Booking reconciliation (Phase 3 prereq).
- [/hub](../../../../app/(internal)/hub/page.tsx) — Per-campaign slug-route grid (8 tiles per campaign).

Cron + env requirements documented in [PHASE_3_IMPLEMENTATION.md §3](./PHASE_3_IMPLEMENTATION.md).
