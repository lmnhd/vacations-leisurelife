# Klaviyo Email Flow — Phase 1 Implementation

Status: **Implemented**.
Scope: Section 12 ("First Slice Recommendation") of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md).
This document records exactly what shipped so Phase 2+ can pick up cleanly.

---

## 1. What Shipped

Phase 1 upgrades the three existing pre-booking emails (`LLL Waitlist Confirmation`,
`LLL Nurture Day 3`, `LLL Nurture Day 7`) with the expanded profile contract from
plan §3 and a richer per-stage event payload. No new lifecycle states were added.

### New code

| Path | Purpose |
|------|---------|
| `lib/campaigns/email/email-event-types.ts` | Canonical Phase 1 stage union, Klaviyo metric names, visual-mode hints. |
| `lib/campaigns/email/klaviyo-profile-builder.ts` | Builds the upsert payload from campaign + lead + optional landing model. Drops undefined keys so Klaviyo never overwrites existing properties with nulls. |
| `lib/campaigns/email/klaviyo-event-builder.ts` | Builds the per-stage event property bag including threshold snapshot, suggested share copy, and visual-mode hint. |
| `lib/campaigns/email/email-event-orchestrator.ts` | `dispatchEmailEvent()` (live + dryRun) and `buildEmailEventPreview()` (no provider calls, no ledger writes). |
| `lib/campaigns/email/__tests__/klaviyo-payload-builder.test.ts` | 6 assertions covering payload shape, fallbacks, and stage routing. Run with `npx tsx`. |
| `app/api/groups/campaign/[slug]/email-preview/route.ts` | GET → preview payload or list waitlist leads. POST → dispatch (dry or live). |
| `app/(tests)/tests/klaviyo-emails/page.tsx` | Operator preview surface. Linked from `/tests`. |

### Refactored code

- `lib/campaigns/nurture-orchestrator.ts` — now a thin facade. The three email
  stages delegate to `dispatchEmailEvent()`. The Twilio threshold-SMS path is
  unchanged (different channel, no payload sharing benefit). Public exports
  (`sendWaitlistConfirmation`, `sendDay3Nurture`, `sendDay7Nurture`,
  `sendThresholdSms`, `dispatchNurtureStage`, `NurtureStage`) are preserved so
  existing callers (`app/api/groups/campaign/[slug]/waitlist/route.ts`,
  `app/api/groups/campaign/[slug]/nurture/route.ts`) need no edits.

- `app/(tests)/tests/page.tsx` — registers the new preview page under
  "Distribution & Ads".

---

## 2. Profile Property Contract (live as of Phase 1)

Sent on every Klaviyo profile upsert. snake_case, additive — **never rename keys
without coordinating with Klaviyo template authors**.

| Property | Source | Notes |
|----------|--------|-------|
| `email` | lead | identity |
| `firstName`, `lastName`, `phoneNumber` | lead | top-level Klaviyo attributes |
| `campaign_slug` | campaign | identity |
| `campaign_name` | campaign | greeting |
| `campaign_status` | campaign | flow branching (e.g. suppress nurture after CONVERTED) |
| `campaign_stage_label` | landing view model or fallback map | guest-readable status text |
| `first_name` | lead | template greeting |
| `booking_mode` | lead | flow branching (GROUP_WAIT vs BOOK_NOW) |
| `passenger_count` | lead | template personalization |
| `preferred_cabin_type` | lead | template personalization |
| `hero_image_url` | landing view model | email header visual |
| `landing_page_url` | derived from `NEXT_PUBLIC_SITE_URL` + slug | primary CTA |
| `booking_link_url` | CB link, falls back to Odysseus retail | threshold/booking CTA |
| `community_channel_url` | campaign | community CTA |
| `merchandise_store_url` | campaign | merch CTA |
| `ship_name`, `sail_date`, `departure_port` | campaign (post-match) | travel details |

Undefined fields are dropped, **not** sent as nulls. This is critical so a
later send for an already-matched campaign doesn't accidentally clear `ship_name`.

---

## 3. Per-Stage Event Property Contract

Sent as the Klaviyo `event.*` payload alongside the profile upsert. Always
includes everything in this table; `visual_mode` and `metricName` are the
stage-specific knobs templates branch on.

| Property | Notes |
|----------|-------|
| `stage` | `waitlist_confirmation` \| `nurture_day3` \| `nurture_day7` |
| `visual_mode` | `cinematic_invite` (confirmation), `field_note` (day 3), `status_briefing` (day 7) |
| `campaign_slug`, `campaign_name`, `campaign_status`, `campaign_description` | campaign snapshot |
| `first_name`, `booking_mode`, `passenger_count`, `preferred_cabin_type`, `waitlist_joined_at` | lead snapshot |
| `threshold_required_cabins`, `threshold_joined_entries`, `threshold_joined_passengers`, `threshold_converted_entries`, `threshold_percent`, `threshold_remaining_cabins` | threshold snapshot (powers Day 7 momentum module) |
| `landing_page_url`, `booking_link_url` | CTA overrides |
| `ship_name`, `sail_date`, `departure_port` | populated post-match |
| `share_invite_copy` | suggested one-line invite for the Day 7 invite-a-friend module |

`threshold_remaining_cabins` is clamped at 0 once the campaign is over threshold.

---

## 4. Sample Payloads

The operator preview surface (`/tests/klaviyo-emails`) renders these in full.
Below is an indicative shape only — exact values come from live campaign +
lead records.

```jsonc
// metricName
"LLL Waitlist Confirmation"

// profile properties (Klaviyo profile upsert)
{
  "email": "lead@example.com",
  "firstName": "Avery",
  "campaign_slug": "retro-future-2026",
  "campaign_name": "Retro-Future Cruise 2026",
  "campaign_status": "GATHERING_INTEREST",
  "campaign_stage_label": "Now Forming",
  "first_name": "Avery",
  "booking_mode": "GROUP_WAIT",
  "passenger_count": 2,
  "preferred_cabin_type": "Balcony",
  "hero_image_url": "https://cdn.example/hero.png",
  "landing_page_url": "https://www.leisurelifeinteractive.com/groups/retro-future-2026",
  "booking_link_url": "https://bookings.cbagenttools.com/group/abc",
  "community_channel_url": "https://discord.gg/example",
  "ship_name": "Carnival Celebration",
  "sail_date": "2026-09-12",
  "departure_port": "PCV"
}

// event properties
{
  "stage": "waitlist_confirmation",
  "visual_mode": "cinematic_invite",
  "campaign_slug": "retro-future-2026",
  "threshold_required_cabins": 8,
  "threshold_joined_entries": 5,
  "threshold_remaining_cabins": 3,
  "threshold_percent": 63,
  "share_invite_copy": "I just added myself to the waitlist for Retro-Future Cruise 2026..."
}
```

---

## 5. Template Briefs

Klaviyo template authors should pull the campaign personalization from the
properties above. Three template briefs follow.

### Brief 1 — `LLL Waitlist Confirmation` (visual_mode `cinematic_invite`)

- **Subject line A:** `You're on the list for {{ event.campaign_name }}`
- **Subject line B:** `Your spot is saved — now let's see if this sailing becomes real`
- **Pre-header:** `{{ event.campaign_description|truncate:140 }}`
- **Hero:** Background = `{{ person.hero_image_url|default:'leisure-life-fallback.jpg' }}`. Overlay = `{{ event.campaign_name }}`.
- **Body modules:**
  1. Greeting — "Hi {{ person.first_name }}, your waitlist entry is saved."
  2. Threshold explanation — "This sailing becomes a real group trip if {{ event.threshold_required_cabins }} cabins lock in. You're 1 of {{ event.threshold_joined_entries }} so far."
  3. What happens next — list (status updates, threshold met → booking path, no spam).
  4. Share invite — `{{ event.share_invite_copy }}` + link to `{{ person.landing_page_url }}`.
- **Primary CTA:** "Return to your campaign page" → `{{ person.landing_page_url }}`
- **Footer:** Standard LLL footer + "You're getting this because you joined the {{ event.campaign_name }} waitlist."

### Brief 2 — `LLL Nurture Day 3` (visual_mode `field_note`)

- **Subject line A:** `The kind of people this sailing is being built for`
- **Subject line B:** `This is not a generic cruise crowd`
- **Pre-header:** `Day 3 update on {{ event.campaign_name }}.`
- **Hero:** Smaller, editorial — overlay the campaign name and a single italic
  word from the design system (template author picks per campaign).
- **Body modules:**
  1. Greeting — "Hi {{ person.first_name }}."
  2. Theme story — 2 short paragraphs of theme atmosphere. Static per template,
     personalized via campaign name + description.
  3. Guest idea prompt — "Drop a moment you'd want on board" → link to the
     idea-board chat at `{{ person.landing_page_url }}#ideas`.
  4. Sample onboard rituals — bullet list (template-authored per campaign).
- **Primary CTA:** "Drop an idea in the campaign chat" → `{{ person.landing_page_url }}#ideas`
- **Footer:** Same as Brief 1.

### Brief 3 — `LLL Nurture Day 7` (visual_mode `status_briefing`)

- **Subject line A:** `A quick status check on {{ event.campaign_name }}`
- **Subject line B:** `Where this sailing stands right now`
- **Pre-header:** `{{ event.threshold_joined_entries }} of {{ event.threshold_required_cabins }} cabins so far.`
- **Hero:** Status-card style — large numeric progress, threshold bar.
- **Body modules:**
  1. Greeting — "Hi {{ person.first_name }}."
  2. Threshold progress — `{{ event.threshold_percent }}%` bar, `{{ event.threshold_remaining_cabins }}` cabins to go.
  3. Social proof — "Other guests on this list booked from {{ static list of cities or a placeholder }}".
  4. Next step — branch on `{{ event.booking_mode }}`:
     - `GROUP_WAIT` → "Invite one likely guest" + `{{ event.share_invite_copy }}`.
     - `BOOK_NOW` → "Skip the wait and book directly" → `{{ event.booking_link_url }}`.
- **Primary CTA:** branched per `booking_mode` (see above).
- **Footer:** Same as Brief 1.

---

## 6. Operator Preview Surface

`/tests/klaviyo-emails`:

1. Pick a campaign (selector reuses the Phase A discovery campaign list).
2. Pick a lead (auto-loaded from the campaign waitlist; free-text fallback when empty).
3. Pick a stage.
4. **Preview payload** — fetches `GET /api/groups/campaign/[slug]/email-preview?email=...&stage=...`
   and renders profile + event property bags + any warnings (missing hero,
   not-yet-matched campaign, no community URL, etc.).
5. **Dispatch (dry-run)** — `POST` with `dryRun: true`. Writes a
   `nurture_queued` ledger event, no Klaviyo call.
6. **Dispatch (LIVE)** — confirmation modal → real Klaviyo event + ledger
   `nurture_sent`.

---

## 7. What Was Deliberately Not Done

Per plan §11 and §12, Phase 1 stops short of:

- Adding new stages (`threshold_met`, `manifest_*`, `booking_link_ready`, post-booking).
- A separate event-ledger entry type per email stage. We still write
  `nurture_queued` / `nurture_sent` / `lead_error`, with the stage name in the
  metadata. Phase 2 may want stage-specific event types once they earn distinct
  downstream consumers.
- HTML generation in-app. Templates live in Klaviyo; the app only pushes
  properties. (Plan §13 open decision #1.)
- Acknowledgment-link tracking for critical changes (Phase 4 concern).

---

## 8. Open Decisions Resolved by Phase 1

| Plan §13 # | Decision | Resolution |
|------------|----------|------------|
| 1 | Email template ownership | Klaviyo. App sends properties only. |
| 2 | Asset source for hero image | Landing view model (`landing.heroImage.url`). |
| 3 | Preview tooling location | New `/tests/klaviyo-emails` page. |
| 4 | Flow naming | Keep `LLL ...` names. No version suffix until a v2 actually exists. |
| 5 | Critical-change acknowledgment | Deferred to Phase 4. |

---

## 9. Known Gaps & Phase 2 Pre-Reqs

- Several profile fields stay `undefined` for un-matched campaigns:
  `ship_name`, `sail_date`, `departure_port`, `community_channel_url`,
  `merchandise_store_url`. The preview surface surfaces these as warnings.
- Phase 2 will need to extend `EmailEventStage` and add new metric names. The
  builders are designed to be additive — just add new entries to
  `KLAVIYO_METRIC_NAMES` and `STAGE_VISUAL_MODES`.
- The `nurture-orchestrator.ts` facade will eventually be retired; for now it
  preserves the public surface for the waitlist + nurture API routes.
