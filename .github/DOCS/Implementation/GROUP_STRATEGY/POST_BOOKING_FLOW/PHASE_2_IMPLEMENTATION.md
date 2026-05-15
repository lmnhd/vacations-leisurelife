# Klaviyo Email Flow — Phase 2 Implementation

Status: **Implemented**.
Scope: Section §4 + §6 of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) — the five missing pre-booking events.
Builds on [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md). Phase 2 is additive — no Phase 1 contract was changed.

---

## 1. What Shipped

Phase 2 adds the five pre-booking lifecycle events:

| Stage (app) | Klaviyo metric | Visual mode | Trigger |
|-------------|---------------|-------------|---------|
| `threshold_met` | `LLL Threshold Met` | `celebration` | **Auto** — waitlist auto-promote + campaign PATCH (status → THRESHOLD_MET) |
| `manifest_requested` | `LLL Manifest Requested` | `status_briefing` | **Operator** — broadcast endpoint |
| `manifest_reminder` | `LLL Manifest Reminder` | `status_briefing` | **Operator** — broadcast endpoint, defaults to PENDING-manifest leads only |
| `booking_link_ready` | `LLL Booking Link Ready` | `status_briefing` | **Operator** — broadcast endpoint, after CB/Odysseus link is live |
| `campaign_expired` | `LLL Campaign Expired` | `field_note` | **Auto** — campaign PATCH (status → EXPIRED) |

### New / modified code

| Path | Change |
|------|--------|
| `lib/campaigns/email/email-event-types.ts` | Extended `EmailEventStage` union, `KLAVIYO_METRIC_NAMES`, `STAGE_VISUAL_MODES`. New `PHASE_2_STAGES`, `ALL_IMPLEMENTED_STAGES`, `STAGE_LEDGER_SUCCESS_TYPE`. |
| `lib/campaigns/email/klaviyo-event-builder.ts` | New `phase2` input bag. New per-stage properties: `threshold_met_claim`, `manifest_status`, `manifest_deadline`, `manifest_url`, `adjacent_campaigns_url`, `operator_note`. |
| `lib/campaigns/email/email-event-orchestrator.ts` | Threads `phase2` through preview + dispatch. New `dispatchEmailBroadcast(slug, stage, opts, filter)` helper. Ledger success-type is now stage-aware (via `STAGE_LEDGER_SUCCESS_TYPE`). |
| `app/api/groups/campaign/[slug]/email-preview/route.ts` | Accepts all 8 stages. Phase 2 overrides via query params (GET) and body field `phase2` (POST). |
| `app/api/groups/campaign/[slug]/email-broadcast/route.ts` | **New.** POST-only operator endpoint to broadcast a stage to every (filtered) lead. |
| `app/api/groups/campaign/[slug]/waitlist/route.ts` | Auto-fires `threshold_met` broadcast in the auto-promote block. Non-fatal. |
| `app/api/groups/campaign/[slug]/route.ts` (PATCH) | Auto-fires `campaign_expired` on transition to EXPIRED, and `threshold_met` on manual transition to THRESHOLD_MET. Non-fatal. |
| `app/(tests)/tests/klaviyo-emails/page.tsx` | New Phase 2 tile grid with phase badges; conditional input panel for `manifestDeadline`, `manifestUrl`, `adjacentCampaignsUrl`, `operatorNote`; broadcast dry/live buttons + result summary. |
| `lib/campaigns/email/__tests__/klaviyo-payload-builder.test.ts` | Extended to 12/12 assertions (added 6 Phase 2 cases). |

---

## 2. Trigger Map

Where each stage gets fired in production.

### `threshold_met` — auto, two paths

1. **Auto-promote from waitlist signup** ([app/api/groups/campaign/[slug]/waitlist/route.ts](../../../../app/api/groups/campaign/[slug]/waitlist/route.ts)) — when a new signup pushes total entries ≥ required cabins, the route already auto-promotes status to THRESHOLD_MET and now also calls `dispatchEmailBroadcast(slug, 'threshold_met')`. Fires once per auto-promote. Non-fatal: errors are logged, the HTTP response is unaffected.
2. **Manual status transition** ([app/api/groups/campaign/[slug]/route.ts](../../../../app/api/groups/campaign/[slug]/route.ts) PATCH) — when an operator sets `status: 'THRESHOLD_MET'` and the previous status was anything else, the PATCH fires the broadcast. Useful when threshold logic is overridden manually (e.g. for unusual cabin counts).

The two paths are mutually exclusive in practice because path 1 changes the campaign's stored status before path 2 can match `patch.status !== campaign.status`.

### `campaign_expired` — auto

Fires from the PATCH endpoint when status transitions to EXPIRED. No automatic time-based expiration trigger exists in app code today — operators set EXPIRED manually (or via the future expiration scheduler).

### `manifest_requested`, `manifest_reminder`, `booking_link_ready` — operator

Fire via `POST /api/groups/campaign/[slug]/email-broadcast`. The Phase 2 plan keeps these operator-controlled because they require an explicit decision about timing (manifest cutoff, when reminders go out, when booking is genuinely live).

---

## 3. Event Property Contract — Phase 2 Additions

All Phase 1 event properties remain unchanged. Phase 2 adds the following keys, **only** on the stages that need them. `compact()` drops undefined values so other stages do not see leaked phase-2 keys (tested).

| Property | Emitted on | Source |
|----------|-----------|--------|
| `threshold_met_claim` | `threshold_met` | Hard-coded canonical safe phrase, see plan §6: "The internal demand threshold has been reached for this campaign." Templates must not imply CB space is permanently secured. |
| `manifest_status` | `manifest_requested`, `manifest_reminder` | Lead's `manifestStatus` (PENDING/SUBMITTED). Templates can branch on it. |
| `manifest_deadline` | `manifest_requested`, `manifest_reminder` | Operator-supplied string (ISO date or human-readable). |
| `manifest_url` | `manifest_requested`, `manifest_reminder` | Operator override; defaults to `${landing_page_url}/manifest`. |
| `adjacent_campaigns_url` | `campaign_expired` | Operator-supplied URL to a list of similar campaigns. |
| `operator_note` | Any Phase 2 stage | Optional free-form (≤500 chars) appended to the template. |

Profile properties are unchanged in Phase 2.

---

## 4. Ledger Contract — Stage-Aware Success Types

Phase 1 wrote `nurture_sent` for all email events. Phase 2 keeps that for the
three nurture stages but switches to canonical lifecycle types where they
exist, so the conversion dashboards can filter without grepping metadata.

| Stage | Ledger success eventType |
|-------|--------------------------|
| `waitlist_confirmation`, `nurture_day3`, `nurture_day7` | `nurture_sent` |
| `threshold_met` | `threshold_met_notified` |
| `booking_link_ready` | `booking_link_sent` |
| `campaign_expired` | `expired` |
| `manifest_requested`, `manifest_reminder` | `nurture_sent` (no dedicated type — added in a future phase if needed) |

`nurture_queued` (pre-call) and `lead_error` (on failure) are unchanged.

---

## 5. Broadcast Endpoint

`POST /api/groups/campaign/[slug]/email-broadcast`

```jsonc
{
  "stage": "manifest_requested",
  "dryRun": false,
  "phase2": {
    "manifestDeadline": "2026-06-15",
    "manifestUrl": "https://www.leisurelifeinteractive.com/groups/retro-future-2026/manifest",
    "operatorNote": "Suite-class cabins require a passport scan."
  },
  "filter": { "onlyBookingMode": "GROUP_WAIT" }
}
```

Response:

```jsonc
{
  "success": true,
  "result": {
    "stage": "manifest_requested",
    "campaignSlug": "retro-future-2026",
    "totalLeads": 12,
    "attempted": 9,
    "skippedByFilter": 3,
    "succeeded": 9,
    "failed": 0,
    "failures": []
  }
}
```

Per-lead failures do not block the rest of the broadcast — they accumulate in `failures[]`.

**Filter defaults:** `manifest_reminder` defaults `onlyPendingManifest: true` even if the caller omits `filter`. All other stages default to no filter.

---

## 6. Template Briefs (Phase 2)

### `LLL Threshold Met` (visual_mode `celebration`)

- **Subject A:** `It's happening: {{ event.campaign_name }} reached the threshold`
- **Subject B:** `The group is real — next step inside`
- **Pre-header:** `{{ event.threshold_joined_entries }} of {{ event.threshold_required_cabins }} cabins locked.`
- **Body:**
  1. Greeting using `{{ person.first_name }}`.
  2. Lead with the safe claim: `{{ event.threshold_met_claim }}` (do NOT replace with "your spot is secured" copy).
  3. What changes next — group block coordination, manifest collection coming up, expected timeline.
  4. Soft-CTA preview: manifest / booking path explained at a high level.
- **Primary CTA:** "Open the campaign page" → `{{ person.landing_page_url }}`.

### `LLL Manifest Requested` (visual_mode `status_briefing`)

- **Subject A:** `Next step: tell us who's sailing with you`
- **Subject B:** `Your traveler details are needed for {{ event.campaign_name }}`
- **Pre-header:** `Deadline: {{ event.manifest_deadline }}.`
- **Body:**
  1. Greeting.
  2. Why we need this — passport/DOB/cabin pairing per cruise-line requirement.
  3. Deadline block: `{{ event.manifest_deadline }}`, with the consequence of missing it (offer rolls to next-best lead).
  4. Privacy reassurance — short paragraph.
- **Primary CTA:** "Complete manifest" → `{{ event.manifest_url }}`.

### `LLL Manifest Reminder` (visual_mode `status_briefing`)

- **Subject A:** `Quick reminder: manifest still open for {{ event.campaign_name }}`
- **Subject B:** `One step left to lock your cabin`
- **Pre-header:** `Deadline {{ event.manifest_deadline }}.`
- **Body:**
  1. Greeting.
  2. Branch on `{{ event.manifest_status }}` — when SUBMITTED (rare; broadcast filter usually catches), show a thank-you note. When PENDING (default), explicit reminder.
  3. Deadline + consequence (same as Manifest Requested).
  4. Help line for guests with unusual cases (accessibility, name discrepancies).
- **Primary CTA:** "Finish manifest" → `{{ event.manifest_url }}`.

### `LLL Booking Link Ready` (visual_mode `status_briefing`)

- **Subject A:** `Your booking path is ready`
- **Subject B:** `Ready to book {{ event.campaign_name }}?`
- **Pre-header:** Short line about how the booking path works.
- **Body:**
  1. Greeting.
  2. Group block vs independent retail — clarify which path this link is.
  3. What the booking page asks for, what happens after they book.
  4. Support contact for booking issues.
- **Primary CTA:** "Open booking link" → `{{ event.booking_link_url }}`.

### `LLL Campaign Expired` (visual_mode `field_note`)

- **Subject A:** `This one won't sail as a group — but here's what's next`
- **Subject B:** `An update on {{ event.campaign_name }}`
- **Body:**
  1. Greeting.
  2. Honest close — sailing didn't reach threshold / became unavailable. Use `{{ event.operator_note }}` if present.
  3. What this means for the lead (no charges, no further action).
  4. Adjacent / similar campaigns block (template pulls a curated list, or links to `{{ event.adjacent_campaigns_url }}`).
- **Primary CTA:** "Browse nearby sailings" → `{{ event.adjacent_campaigns_url }}` (falls back to `{{ person.landing_page_url }}` parent).

---

## 7. Operator Preview Surface (extended)

`/tests/klaviyo-emails` now shows all 8 stages with `P1` / `P2` phase badges. Selecting a Phase 2 stage reveals:

- Manifest stages: `manifestDeadline`, `manifestUrl` (defaults to `${landing}/manifest`).
- `campaign_expired`: `adjacentCampaignsUrl`.
- All Phase 2 stages: optional `operatorNote`.
- `manifest_reminder`: a checkbox to scope the broadcast to PENDING manifests (defaults on).

Action buttons:

- Single dry-run / live (Phase 1 + 2 stages).
- Broadcast dry-run / live (Phase 2 stages only). Returns the aggregate `BroadcastResult`.

---

## 7b. Manual Booking Reconciliation (backup for Phase 3 auto-fire)

Because we have not yet confirmed whether Cruise Brothers sends agent-side
confirmation emails for group bookings, the default booking-detection path
is manual until further notice. The operator reconciles against the CB Agent
Tools dashboard once a day:

- **API:** `POST /api/groups/campaign/[slug]/manual-booking` (`GET ?list=leads` enumerates state).
- **UI:** `/tests/manual-booking-entry`.
- **Store helper:** `markLeadAsBooked()` in `lib/campaigns/waitlist-store.ts` — idempotent. Subsequent calls update metadata without re-firing the ledger.
- **Ledger:** writes a single `converted` lead-event on the initial flip (`convertedNow=true` in the response). No-op writes on metadata updates.
- **Lead fields:** `bookingReference`, `bookingConfirmedAt`, `bookingAmount?`, `bookingNotes?`, `bookingEnteredBy?` are added to `CampaignWaitlistEntry`. All optional.

**Phase 3 handoff:** when `LLL Booking Confirmed` ships, the endpoint should
additionally call `dispatchEmailEvent(slug, email, 'booking_confirmed')` on
the `convertedNow=true` branch. The current response includes
`phase3NotImplemented: true` and an `advisory` string so the operator UI
makes that gap obvious.

**Future automation:** if Cruise Brothers does send agent confirmation
emails, the inbound-webhook parser described in §10 of
[KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md) can call the same
`markLeadAsBooked()` helper, so swapping manual → automated does not require
touching the conversion data model.

---

## 8. What Was Deliberately Not Done

- **Scheduled manifest_reminder.** Plan §4 implies "after delay". Phase 2 ships only the operator trigger; the scheduler is deferred until cron/queue infrastructure decisions are made (likely DynamoDB streams or a small in-process scheduler).
- **booking_link_ready auto-fire on link populate.** The CB link can be flaky to validate; we keep this operator-triggered until inventory-health logic is wired through. There is no per-campaign signal today that says "the link has been validated and is safe to share."
- **Per-stage ledger eventType for manifest stages.** Phase 1 had no manifest events; Phase 2 reuses `nurture_sent`. If conversion dashboards start needing to filter manifest-email engagement separately, add `manifest_email_sent` / `manifest_reminder_sent` to `LeadEventType` and remap.
- **`campaign_expired` time-based auto-trigger.** Campaigns have `expiresAt`, but no scheduler reads it yet.

---

## 9. Known Risks / Follow-ups

1. **Double-fire on `threshold_met`.** Waitlist auto-promote saves the campaign first (status now THRESHOLD_MET) and only then fires the broadcast. If an operator immediately PATCHes status to THRESHOLD_MET again (no-op), the PATCH path's check (`patch.status !== campaign.status`) prevents the broadcast. Verified by inspection.
2. **Re-firing `campaign_expired`.** An operator who toggles status back and forth (EXPIRED → THRESHOLD_MET → EXPIRED) will fire `campaign_expired` twice. Acceptable for now; the broadcast endpoint can be used to re-send anyway.
3. **Large broadcasts are serial.** `dispatchEmailBroadcast` iterates leads sequentially to keep Klaviyo within rate budget. For lists > 500 it may need batching / queueing. Not a current scale concern.
4. **Idempotency.** No idempotency key is sent to Klaviyo. Repeated dispatch will produce duplicate Klaviyo events. The plan accepts this since templates control delays/splits; for paranoid use cases, gate via the ledger before firing.

---

## 10. Phase Progress

| Phase | Status |
|-------|--------|
| 1 — Three nurture emails | ✅ Shipped |
| 2 — Five pre-booking events | ✅ Shipped (this doc) |
| 3 — Post-booking core | Not started |
| 4 — Change notifications | Not started |
| 5 — Post-cruise / alumni | Not started |

The live end-to-end test plan covering all phases (once complete) lives in [KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md).
