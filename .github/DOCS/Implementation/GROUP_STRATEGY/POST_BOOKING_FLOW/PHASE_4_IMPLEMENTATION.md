# Klaviyo Email Flow — Phase 4 Implementation

Status: **Implemented**.
Scope: Section §8 of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) — the `LLL Booking Change` event with severity branches, Twilio SMS fallback on critical, and a manual-follow-up dashboard for tracking acknowledgments.
Builds on Phases 1–3.

---

## 1. What Shipped

A single new stage with operator-side tooling for the full change lifecycle:

| Capability | Where |
|------------|-------|
| New stage `booking_change` (one Klaviyo metric, severity branches inside Klaviyo) | [email-event-types.ts](../../../../lib/campaigns/email/email-event-types.ts) |
| Per-change properties (`severity`, `change_type`, `previous_value`, `new_value`, etc.) | [klaviyo-event-builder.ts](../../../../lib/campaigns/email/klaviyo-event-builder.ts) |
| `recordBookingChange()` — fires email + critical-only Twilio SMS, writes per-recipient ledger rows keyed by `changeId` | [email-event-orchestrator.ts](../../../../lib/campaigns/email/email-event-orchestrator.ts) |
| `listBookingChangesForCampaign()` + `acknowledgeBookingChange()` — read and ack the change ledger | same file |
| `POST /api/groups/campaign/[slug]/booking-change` — record + dispatch | [route.ts](../../../../app/api/groups/campaign/[slug]/booking-change/route.ts) |
| `GET /api/groups/campaign/[slug]/booking-change` — list this campaign's changes | same |
| `GET /api/booking-changes/pending` — cross-campaign worklist with severity + onlyOpen filters | [route.ts](../../../../app/api/booking-changes/pending/route.ts) |
| `POST /api/groups/campaign/[slug]/booking-change/[changeId]/ack` — mark a lead acknowledged | [route.ts](../../../../app/api/groups/campaign/[slug]/booking-change/[changeId]/ack/route.ts) |
| Operator dashboard with recorder form, severity-tinted change cards, and per-recipient ack buttons | [/tests/booking-changes](../../../../app/(tests)/tests/booking-changes/page.tsx) |
| `booking_change` tile + small Phase 4 inputs panel on the email-preview surface | [/tests/klaviyo-emails](../../../../app/(tests)/tests/klaviyo-emails/page.tsx) |
| Hub slug-route tile pointing at `/tests/booking-changes?slug=...` | [hub/page.tsx](../../../../app/(internal)/hub/page.tsx) |

---

## 2. Severity Behavior

| Severity | Email | SMS | Ledger | Follow-up |
|----------|-------|-----|--------|-----------|
| `critical` | Yes | **Yes** for leads with `phoneNumber` on record | `booking_change` with `metadata.severity=critical` | Dashboard surfaces until every recipient is acked |
| `high` | Yes | No | `booking_change` with `metadata.severity=high` | Dashboard surfaces until every recipient is acked |
| `medium` | Yes | No | `booking_change` with `metadata.severity=medium` | Dashboard surfaces until every recipient is acked |
| `low` | Yes | No | Same | Same |
| `positive` | Yes (celebratory tone) | No | Same | Same — though typically no action required |

Klaviyo handles the **delay-based** retry behavior (48h critical reminder, 72h
high reminder) inside the flow itself by reading the `severity` event
property. The app deliberately does NOT schedule reminders — Klaviyo flow
delays are the right place for that.

### SMS body for critical

The Twilio body is built as:

```
[Leisure Life] URGENT update on {campaignName}: {summary} — Contact: {supportContact}
```

Templated in `email-event-orchestrator.ts` as `CRITICAL_SMS_TEMPLATES.default`.
Tweak there if cruise-line liaison feedback wants different phrasing.

---

## 3. Idempotency Model

A change is identified by a `changeId` (UUID). Every recipient's ledger row
carries the same `changeId` in metadata. This means:

- Re-running the same change (passing the same `changeId`) is safe: it
  writes another set of `booking_change` rows (intentional — captures
  a redelivery) but the dashboard groups by `changeId` and merges them.
- Operators can detect duplicates by changeId in the dashboard.
- The follow-up scan reads every `booking_change` and
  `booking_change_acknowledged` row, joins them by `changeId`, and
  computes per-recipient ack status.

For Klaviyo de-dupe, callers who want to prevent duplicate sends must gate
**before** calling `recordBookingChange` — the orchestrator itself does
not check the ledger first.

---

## 4. Event Property Contract — Phase 4

All keys are emitted only on the `booking_change` stage. `compact()` drops
undefined values, so other stages never leak Phase 4 keys (covered by test).

| Property | Notes |
|----------|-------|
| `change_id` | UUID from the recorder. Templates rarely show this; useful for support tickets. |
| `severity` | `critical \| high \| medium \| low \| positive`. The canonical branch key in Klaviyo. |
| `change_type` | Short label — `ship_change`, `date_change`, `price_change`, `cancellation`, `positive_update`. Free-form. |
| `previous_value` | Pre-change value. Rendered verbatim. |
| `new_value` | Post-change value. Rendered verbatim. |
| `change_summary` | One-sentence headline shown above the comparison block. |
| `action_required` | Boolean. Drives a separate template module when true. |
| `action_deadline` | Free-text or ISO date. Optional. |
| `support_contact` | **Only emitted on `severity=critical`**. Forces templates to not surface support copy on lower-severity sends where it would feel alarmist. |
| `operator_note` | Optional free-form (max 500 chars). |

Ledger metadata mirrors the same shape (`changeId`, `severity`,
`changeType`, `actionRequired`, `previousValue`, `newValue`,
`changeSummary`). The follow-up dashboard reads these and re-renders the
comparison block without re-fetching anything.

---

## 5. Template Brief — `LLL Booking Change` (visual_mode `status_briefing`)

The Klaviyo flow branches on `event.severity`. Each branch should share
the same shell + comparison block but vary the tone and any reminder
delays.

**Subjects** (template authors should branch per severity):

- `critical`: `Important update on {{ event.campaign_name }} — action required` / `Urgent: change to your {{ event.campaign_name }} booking`
- `high`: `Update on {{ event.campaign_name }}: {{ event.change_summary }}` / `An update to your booking`
- `medium`: `A small update on {{ event.campaign_name }}` / `One change to share`
- `low`: `Quick update on {{ event.campaign_name }}`
- `positive`: `Good news for {{ event.campaign_name }}` / `An upgrade for your sailing`

**Body modules:**

1. Greeting using `{{ person.first_name }}`.
2. Headline: `{{ event.change_summary }}`.
3. Comparison block (template-authored):

   ```
   Previously: {{ event.previous_value }}
   Now:        {{ event.new_value }}
   ```

4. Action module (only when `{{ event.action_required }}`): explains the
   action and surfaces `{{ event.action_deadline }}` when present.
5. Severity-specific tail:
   - `critical`: support contact box using `{{ event.support_contact }}`.
   - `high`: support contact link only.
   - `medium/low`: standard footer.
   - `positive`: celebratory close, no action ask.
6. `{{ event.operator_note }}` rendered as a soft paragraph if present.

**Copy rules (plan §8) — call these out to template authors:**

- Be explicit about what changed.
- Put old vs new in a clear comparison block.
- State whether action is required.
- Never bury cancellation language.
- For critical changes, include direct support contact.

---

## 6. Endpoints

### `POST /api/groups/campaign/[slug]/booking-change`

```jsonc
{
  "severity": "critical",
  "changeType": "cancellation",
  "previousValue": "Active sailing — Carnival Celebration, Sept 12 2026",
  "newValue": "Cancelled by cruise line",
  "summary": "The sailing has been cancelled. You will receive a full refund within 7 business days.",
  "actionRequired": true,
  "actionDeadline": "2026-08-01",
  "supportContact": "support@leisurelifeinteractive.com",
  "operatorNote": "We are actively building a replacement sailing on the same dates.",
  "dryRun": false,
  "convertedOnly": true
}
```

Response:

```jsonc
{
  "success": true,
  "result": {
    "changeId": "a7f3b...",
    "campaignSlug": "retro-future-2026",
    "severity": "critical",
    "totalLeads": 14,
    "targetedLeads": 9,
    "emailDispatched": 9,
    "emailFailed": 0,
    "smsDispatched": 6,
    "smsSkipped": 3,
    "smsFailed": 0,
    "failures": []
  }
}
```

### `GET /api/booking-changes/pending`

- `?severity=critical` — filter to a specific severity.
- `?onlyOpen=0` — include changes that have zero pending acks (default `1`).

Returns the cross-campaign worklist; the dashboard at `/tests/booking-changes`
renders this.

### `POST /api/groups/campaign/[slug]/booking-change/[changeId]/ack`

```jsonc
{ "email": "lead@example.com", "acknowledgedBy": "Curtis", "note": "Spoke on phone." }
```

Appends a `booking_change_acknowledged` ledger row with the same `changeId`.
Idempotent in spirit — a second ack writes another row but the dashboard
state stays the same.

---

## 7. Operator Dashboard

`/tests/booking-changes` is the day-to-day surface:

- **Filters** at the top: only-open toggle (default on), severity dropdown.
  Linked to your name field (audit trail).
- **Open changes worklist** — every campaign's unacked changes, sorted
  newest-first, critical-first within a day. Each row shows:
  - severity pill + change-type label + action-required tag
  - campaign name + slug + UUID
  - previous → new comparison block
  - per-recipient checklist with "Mark acked" buttons
- **Recorder form** — pick a campaign, fill in severity / type / values /
  summary, optional support contact (revealed when severity=critical), dry-run
  toggle. Submits to the POST endpoint and refreshes the list.
- **Per-campaign change history** below the recorder once a campaign is
  selected, filtered by the same severity/onlyOpen toggles.

Pre-populates `?slug=` from the URL so the hub's slug-route tile lands
straight on the right campaign.

---

## 8. Auto-Wire Map

| Operator action | App effect |
|----------------|-----------|
| POST to `/api/groups/campaign/[slug]/booking-change` | For each converted lead: dispatch `LLL Booking Change` email; for `critical` severity, also send Twilio SMS to leads with phone numbers. Write `booking_change` ledger row per recipient. |
| Click "Mark acked" on a recipient | Write `booking_change_acknowledged` ledger row with matching `changeId`. Dashboard updates the recipient's tick. |

Phase 4 does NOT auto-fire from any other state transition (no inferred
ship/date/price-change detection in app). The change is operator-initiated
because the change facts come from cruise-line communication, not from
our own database.

---

## 9. What Was Deliberately Not Done

- **Guest-clickable acknowledgment link.** Plan §13 open decision #5 marks
  this as deferred. v1 is operator-driven from the dashboard.
- **Reminder scheduling.** Plan §8 says critical changes get a 48h follow-up
  if no ack, high gets 72h. The app records the change once; the **Klaviyo
  flow** is responsible for delay-based re-sends since that is where the
  open-rate logic lives. The app dashboard surfaces unacked changes for
  the operator side.
- **Severity-specific email templates in the app.** All severities use the
  same Klaviyo metric. Klaviyo flow filters on `event.severity` to branch.
- **Bulk-ack from the dashboard.** Acks are per-recipient. Bulk would
  require a separate API + UI; defer until volume demands it.
- **Push notifications / Slack pings on critical.** Not needed yet — the
  operator UI is the surface. If volume grows, add a Slack webhook in
  `recordBookingChange` after the SMS branch.

---

## 10. Known Risks / Follow-ups

1. **Listing all events per campaign for the dashboard is O(events).** Fine
   today; the dashboard is operator-only so traffic is bounded. For very
   long-running campaigns, a secondary index on `(stage, changeId)` is the
   path forward.
2. **`scanAllCampaigns()` in `/api/booking-changes/pending`** is the same
   cost as the daily scheduler scan. Acceptable; if both run in the same
   minute they each do their own scan. Cache hit-ratio not worth optimizing
   at v1 scale.
3. **No idempotency check before dispatch.** Operators can accidentally
   re-record the same change. The dashboard groups by `changeId` so the
   visual surface is fine; the underlying duplicate ledger rows are a
   minor data-quality issue. If it becomes a real problem, the recorder
   form can hash `(changeType, previousValue, newValue)` to suggest the
   existing changeId.
4. **SMS body is hard-coded.** Plan §8 doesn't specify the body format; we
   surface the campaign name + summary + support contact and call it good.
   Tune `CRITICAL_SMS_TEMPLATES.default` if cruise-line liaison feedback
   wants different phrasing.

---

## 11. Phase Progress

| Phase | Status |
|-------|--------|
| 1 — Three nurture emails | ✅ Shipped |
| 2 — Five pre-booking events | ✅ Shipped |
| 3 — Post-booking core + scheduler | ✅ Shipped |
| 4 — Change notifications + critical SMS + follow-up dashboard | ✅ Shipped (this doc) |
| 5 — Post-cruise / alumni | Not started |

Phase 4 live testing is sketched in §7 of [KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md). That section was a placeholder until now and has been expanded to cover the severity matrix walk-through plus dashboard ack tracking.
