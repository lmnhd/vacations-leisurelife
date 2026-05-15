# Klaviyo Live Test Plan — Full End-to-End

> **Status: Outline.** This document is the skeleton for the end-to-end live test pass we will run once Phases 1–5 of [KLAVIYO_EMAIL_FLOW_PLAN.md](./KLAVIYO_EMAIL_FLOW_PLAN.md) are all implemented. Each section is a placeholder for the actual test recipe that should be filled in close to test day, when the in-Klaviyo flow IDs, template versions, and audience filters are known.
>
> The intent of this plan is to certify the **app → Klaviyo → guest inbox** pipeline as a whole — wiring, payload, template rendering, deliverability, suppression, and analytics — rather than re-test the unit-level payload builders (already covered by `lib/campaigns/email/__tests__/`).

---

## 1. Purpose and Scope

- [ ] Restate the goal: prove the entire lifecycle email system works under real send conditions, with real campaign data, real Klaviyo flows, and real recipients in a test audience.
- [ ] Call out non-goals: this is not a creative/copy review. Visual approval happens before this run.
- [ ] List participating systems: app event firing, Klaviyo flows, Klaviyo profile store, ESP delivery, Twilio SMS for severity-critical change events.
- [ ] List who runs each part (operator, engineering, ops, deliverability).

---

## 2. Pre-Conditions

### 2.1 Klaviyo workspace

- [ ] Verify all metric names match `KLAVIYO_METRIC_NAMES` (frozen — diff against `lib/campaigns/email/email-event-types.ts`).
- [ ] Verify each flow is wired to its metric and is **enabled** (not in draft).
- [ ] Confirm template versions are pinned: capture the live template ID per flow into this doc on test day.
- [ ] Audience: confirm there is a dedicated **test segment** ("LLL Test Recipients") with only seeded email addresses (engineering inboxes, role aliases, deliverability seed list). No real guests.
- [ ] Confirm flow-level filter blocks anything outside that segment for the duration of the run.

### 2.2 App environment

- [ ] Decide which environment we are testing: staging vs. production-with-test-campaign.
- [ ] Confirm `KLAVIYO_PRIVATE_API_KEY` is set to the workspace under test.
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` resolves to the public hostname recipients should land on.
- [ ] Seed a clean test campaign (see §3).

### 2.3 Test data

- [ ] Build a synthetic campaign blueprint with the full property surface populated: `matchedShipName`, `matchedSailDate`, `matchedDeparturePort`, both booking links, `communityChannelUrl`, `merchandiseStoreUrl`, hero image.
- [ ] Seed N test leads across booking modes (`GROUP_WAIT`, `BOOK_NOW`) and manifest states (`PENDING`, `SUBMITTED`).
- [ ] Confirm at least one lead has a phone number (for the threshold SMS path and the future critical-change SMS).
- [ ] Confirm no real guest addresses are present.

### 2.4 Observability

- [ ] Tail the Next server logs to watch `[Klaviyo]`, `[EmailOrchestrator]`, `[Waitlist]`, `[CampaignPATCH]` lines.
- [ ] Open the Klaviyo events feed for the workspace.
- [ ] Open the lead-event ledger view for the test campaign.
- [ ] Open the inbox(es) for each seeded recipient on the receiving side.

---

## 3. Test Campaign Setup Procedure

- [ ] Create the synthetic campaign via the app's standard flow (not direct DDB write) so all derived fields populate normally.
- [ ] Inject the test leads via `/api/groups/campaign/[slug]/waitlist` so attribution + ledger events look real.
- [ ] Verify the landing page renders (hero, threshold, CTAs) — this validates `hero_image_url` and `landing_page_url` will look right in email.
- [ ] Verify the test segment in Klaviyo now contains the seeded profiles.

---

## 4. Test Pass — Phase 1 (Three Nurture Emails)

For each of `waitlist_confirmation`, `nurture_day3`, `nurture_day7`:

- [ ] Preview payload via `/tests/klaviyo-emails` for at least one lead in each booking mode.
- [ ] Verify the warnings list is empty for the matched campaign (any warning indicates incomplete test data — fix the data, not the email).
- [ ] Dispatch **single live** to one engineering inbox. Inspect:
  - [ ] Subject line renders with `campaign_name`.
  - [ ] Hero image loads.
  - [ ] CTAs land on the correct URLs.
  - [ ] Threshold module renders the expected number.
  - [ ] Footer unsubscribe link works.
- [ ] Confirm a `nurture_sent` ledger entry appears with the correct stage in metadata.
- [ ] Confirm a Klaviyo event appears in the workspace events feed within 60s.

---

## 5. Test Pass — Phase 2 (Pre-Booking Lifecycle)

### 5.1 `threshold_met`

- [ ] Add one final seeded lead so the campaign auto-promotes (total entries crosses the required cabin count). Confirm the broadcast fires for every lead.
- [ ] Re-verify the safe-claim phrase (`threshold_met_claim`) is present in the rendered email — and that no template copy implies space is "secured."
- [ ] Confirm the ledger writes `threshold_met_notified` (stage-aware type), not `nurture_sent`.
- [ ] Inspect the threshold SMS path concurrently (Twilio) for any lead with a phone number.

### 5.2 `manifest_requested`

- [ ] From `/tests/klaviyo-emails`, broadcast with `manifestDeadline` set.
- [ ] Verify `manifest_url` defaults to `${landing}/manifest`.
- [ ] Re-render the email — confirm the deadline is visible and the CTA is `manifest_url`.

### 5.3 `manifest_reminder`

- [ ] Mark one seeded lead as `manifestStatus: 'SUBMITTED'`.
- [ ] Broadcast with the default `onlyPendingManifest` filter.
- [ ] Confirm the SUBMITTED lead is skipped (visible in `result.skippedByFilter`).
- [ ] Toggle the filter off and re-broadcast; confirm the SUBMITTED lead now receives a SUBMITTED-branch template.

### 5.4 `booking_link_ready`

- [ ] Broadcast after confirming `cbagenttoolsBookingLink` is populated.
- [ ] Click through the booking CTA in the rendered email; verify it loads CB Agent Tools correctly with the right group ID.
- [ ] Confirm ledger writes `booking_link_sent`.

### 5.5 `campaign_expired`

- [ ] PATCH the test campaign status to `EXPIRED`.
- [ ] Confirm the broadcast auto-fires from the PATCH endpoint.
- [ ] Verify the `adjacent_campaigns_url` CTA renders and resolves.
- [ ] Confirm ledger writes `expired`.

---

## 6. Test Pass — Phase 3 (Post-Booking Core + Scheduler)

### 6.1 `booking_confirmed`

- [ ] Navigate to `/tests/manual-booking-entry?slug=<test-campaign>`. Enter a CB reference + date for one seeded lead.
- [ ] Confirm the response payload reports `convertedNow: true` and `bookingConfirmedEmailFired: true`.
- [ ] Inspect the seeded inbox: `LLL Booking Confirmed` arrived; `booking_reference` and `booking_confirmed_at` render correctly.
- [ ] Re-save the same booking with different notes. Confirm `convertedNow: false`, `bookingConfirmedEmailFired: false` — no duplicate send.
- [ ] Ledger: one `converted` row + one `nurture_sent` row with `metadata.stage=booking_confirmed` (no second send on the re-save).

### 6.2 Scheduler — `travel_prep` and `final_countdown`

- [ ] Confirm the test campaign has `matchedSailDate` set and at least one `converted=true` lead.
- [ ] Hit `GET /api/cron/email-scheduler?dryRun=1&today=<sailDate - 90>` with the `Authorization: Bearer ${CRON_SECRET}` header. Confirm the response shows one plan dispatched at offset 90 for `travel_prep`.
- [ ] Repeat with `today=<sailDate - 89>` (within the 1-day grace). Confirm the same offset 90 plan is reported as `skippedAlreadySent` (because the dryRun queue row exists — wait, dryRun queues are filtered, so this should re-fire). **Actual expected behavior:** dryRun queues do NOT block re-sends; the row reappears as dispatched. Confirm this matches docstring in `email-scheduler.ts`.
- [ ] Switch to live (`dryRun=0`) at offset 90. Confirm Klaviyo received the event and the seeded inbox got the email.
- [ ] Re-run the same live call. Confirm `skippedAlreadySent` increases and Klaviyo did NOT receive a duplicate.
- [ ] Step `today` through 60, 30, 14, 7, 3, 1. At each, confirm the right offset fires; off-window days produce no plans.
- [ ] After offset=1, advance to `today=sailDate`. Confirm zero plans (the policy does not include a day-0 send).

### 6.3 Per-campaign manual trigger

- [ ] From `/tests/klaviyo-emails` → Scheduler Run panel: trigger a dry run for the test campaign with a `today` override. Confirm the response panel renders the plan + dispatched arrays.
- [ ] Toggle dry-run off, click again at the same `today`. Confirm no double-fire (dedupe kicks in based on the live `nurture_sent` written by the cron earlier).

### 6.4 `final_itinerary_published`

- [ ] PATCH the campaign with a `finalItineraryUrl` (previously null). Confirm the broadcast fires to all `converted=true` leads only — non-converted leads in the test segment receive nothing.
- [ ] Re-PATCH with the same URL. Confirm no re-broadcast (the populate-once guard in the PATCH endpoint).
- [ ] PATCH to null, then PATCH back to a URL. Confirm a re-broadcast (acceptable behavior; document if the team wants this gated).

### 6.5 `tour_conductor_announced`

- [ ] PATCH with `tourConductorName` + `tourConductorBio`. Confirm broadcast fires.
- [ ] Email renders the bio when present, hides the bio block when absent.

### 6.6 Cross-flow audience filtering

- [ ] Confirm the Phase 3 flows have a Klaviyo-side filter on `campaign_status ∈ {CONVERTED, THRESHOLD_MET}` so an unconverted waitlist lead can never accidentally enter a post-booking flow.
- [ ] Re-test by firing `booking_confirmed` manually from `/tests/klaviyo-emails` for a NON-converted lead. Confirm the Klaviyo flow filter blocks delivery even though the app-side dispatch succeeded.

---

## 7. Test Pass — Phase 4 (Change Notifications)

### 7.1 Severity matrix

For each severity in `critical → high → medium → low → positive`:

- [ ] From `/tests/booking-changes` recorder, file a change against the test campaign with that severity.
- [ ] Confirm the `recordBookingChange` response shows the expected `emailDispatched` count (= `targetedLeads`, since the test campaign's leads are all reachable).
- [ ] Open one seeded inbox: the email arrived, subject reflects severity, the comparison block shows `previousValue` → `newValue` correctly, the action module renders only when `actionRequired=true`.
- [ ] Confirm the Klaviyo flow branched on `event.severity` — inspect the live Klaviyo flow journey for the recipient.
- [ ] For `critical` specifically:
  - [ ] Confirm `smsDispatched > 0` for any seeded lead with a phone number on file.
  - [ ] Confirm `support_contact` renders in the email (other severities should NOT show this property — the orchestrator suppresses it server-side, but verify the rendered template too).
- [ ] Confirm the ledger writes one `booking_change` row per recipient with metadata fields (`severity`, `changeType`, `changeId`, `previousValue`, `newValue`, `changeSummary`).

### 7.2 Cancellation copy

- [ ] File a `cancellation` change at `critical` severity. Confirm the email does NOT bury the cancellation language (plan §8 copy rule: "Never bury cancellation language").
- [ ] Confirm refund language is visible above the fold if applicable.

### 7.3 Klaviyo flow reminders

- [ ] Confirm the Klaviyo flow itself is configured with a 48h reminder branch on `severity=critical` and a 72h branch on `severity=high`. The app does NOT trigger these — they're delay nodes inside Klaviyo.
- [ ] Trigger a critical change against a recipient, wait 48h (or override delay nodes), confirm the reminder fired only if no `booking_change_acknowledged` event was written in the meantime.

### 7.4 Operator follow-up dashboard

- [ ] After firing a critical change, confirm it appears in `/tests/booking-changes` under "Open Changes" with the expected `pendingAckCount = recipients.length`.
- [ ] Confirm severity filter and only-open toggle behave (critical-only filter shows only the critical rows; toggling onlyOpen off reveals acked-fully changes).
- [ ] Mark one recipient as acked from the dashboard. Confirm:
  - [ ] The recipient row now shows a green tick + ack timestamp + acked-by name.
  - [ ] `pendingAckCount` decremented by 1.
  - [ ] A `booking_change_acknowledged` ledger row was written with matching `changeId`.
- [ ] Mark every recipient acked. Confirm the change disappears from the default (onlyOpen) view but reappears when onlyOpen is toggled off.

### 7.5 Cross-campaign worklist

- [ ] File critical changes against two different test campaigns.
- [ ] Hit `GET /api/booking-changes/pending`. Confirm both appear, sorted by `occurredAt` descending with critical-first within a day.
- [ ] Pass `?severity=high` — confirm only high-severity changes appear (zero in this case).

### 7.6 Idempotency

- [ ] Record the same change twice without passing `changeId`. Confirm two separate `changeId` values are created, both appear in the dashboard.
- [ ] Record the same change twice passing the same explicit `changeId`. Confirm the dashboard merges them into a single row with combined recipients (no duplicate recipient entries — last write wins per email).

### 7.7 Cron scheduler is unaffected

- [ ] Trigger a daily scheduler run while a Phase 4 critical change is open. Confirm the scheduler ignores `booking_change` rows entirely (they should not affect `travel_prep` / `final_countdown` dedupe).

---

## 8. Test Pass — Phase 5 (Post-Cruise / Alumni) *— placeholder*

- [ ] `post_cruise_welcome_home` 24h after disembarkation simulated date.
- [ ] `post_cruise_survey` 72h after.
- [ ] `alumni_rebooking_invite` triggered by launching an adjacent niche campaign.
- [ ] Verify the alumni segment filter excludes uncovered past guests.

---

## 9. Cross-Phase Tests

These exercise behaviors that span multiple phases.

### 9.1 Suppression

- [ ] Unsubscribe one seeded recipient from one flow. Re-fire the underlying event. Confirm the recipient receives nothing for that flow, but other flows still deliver.
- [ ] Suppress at the workspace level. Confirm nothing reaches the recipient regardless of stage.

### 9.2 Profile-property freshness

- [ ] Change `preferredCabinType` on a lead. Re-fire any stage. Confirm the **next** email reflects the change, and confirm the change appears in the Klaviyo profile within seconds (write-through validates `upsertKlaviyoProfile` is running).

### 9.3 Idempotency / double-send

- [ ] Repeatedly fire `threshold_met` for the same lead. Confirm Klaviyo records duplicate events (we deliberately do not gate). Confirm the flow does not double-deliver if its "trigger filter" excludes recipients who already entered the flow.
- [ ] Document: the app does not enforce idempotency; Klaviyo flow filters do. Owners of each flow must verify.

### 9.4 Ledger integrity

- [ ] After all stage sends complete, scan `/api/groups/campaign/[slug]/events`.
- [ ] For each test lead, confirm the expected ledger types in order: `waitlist_submitted` → `nurture_queued` → `nurture_sent` / `threshold_met_notified` / `booking_link_sent` / `expired`.
- [ ] Confirm no `lead_error` entries appear (or if they do, root-cause them before declaring pass).

### 9.5 Broadcast scale

- [ ] Run a broadcast against a 100-lead test campaign and capture the latency.
- [ ] Confirm no Klaviyo rate-limit errors. If any appear, document the threshold and open a follow-up to batch.

### 9.6 Scheduler auth + safety

- [ ] Hit `/api/cron/email-scheduler` with no `Authorization` header. Confirm 401.
- [ ] Hit with `Authorization: Bearer wrong-secret`. Confirm 401.
- [ ] Hit with the correct `Bearer ${CRON_SECRET}`. Confirm 200.
- [ ] If running on Vercel, simulate a Vercel cron header (`x-vercel-cron: 1`) and confirm 200 without an Authorization header.
- [ ] Confirm `CRON_SECRET` is set in the production environment (not just staging) before enabling the daily cron in `vercel.json`.

### 9.7 Failure injection

- [ ] Temporarily set an invalid `KLAVIYO_PRIVATE_API_KEY`. Dispatch any stage. Confirm:
  - [ ] HTTP 500 surface in the operator UI.
  - [ ] `lead_error` ledger entry with the Klaviyo error message in metadata.
  - [ ] No `nurture_sent` written.
  - [ ] Klaviyo workspace shows no event (negative validation).
- [ ] Restore the key.

---

## 10. Inbound Email Parser (Booking Confirmation) *— relates to Phase 3*

If we adopt the Cruise Brothers / Resend / SendGrid inbound-webhook approach to detect agent booking confirmations and flip `converted=true`:

- [ ] Document the parser entrypoint URL and the secret used for verifying provider signatures.
- [ ] Send a known-good Cruise Brothers confirmation email through the parser. Confirm:
  - [ ] The matching lead is identified by email + campaign reference (define the matching rule before the run).
  - [ ] `converted=true` and a `converted` ledger entry are written.
  - [ ] `LLL Booking Confirmed` fires automatically.
- [ ] Send a malformed / unknown confirmation. Confirm it is rejected without writing anything, and is reported on a dead-letter / review surface.
- [ ] Send a duplicate confirmation. Confirm idempotency: no second `converted` write, no double `LLL Booking Confirmed`.

---

## 11. Deliverability and Reputation Checks

- [ ] Run a deliverability seed test through the Phase 1 nurture path to gauge inbox-vs-spam placement across Gmail / Outlook / Yahoo / Apple Mail.
- [ ] Verify SPF / DKIM / DMARC pass on the receiving side.
- [ ] Inspect Klaviyo deliverability reporting for the test sends — bounce rate, complaint rate.
- [ ] Confirm the "Why am I receiving this?" line in the footer renders correctly.

---

## 12. Analytics + Attribution

- [ ] Confirm UTM parameters on every email CTA (template-author concern — verify here).
- [ ] Open at least one CTA in a test inbox. Confirm the landing page sees the UTMs and the existing first-party attribution captures them on form submit.
- [ ] Confirm Klaviyo open / click metrics increment for the test recipient.
- [ ] Cross-reference with the conversion dashboard — the test lead should be visible with the right `sourceChannel` and `provider` stamps.

---

## 13. Rollback / Kill Switch

- [ ] Verify how to disable email firing in app without a deploy:
  - Workspace option: rotate `KLAVIYO_PRIVATE_API_KEY` to an inert value.
  - Flow option: disable the flow in Klaviyo (events still arrive, no email goes out).
- [ ] Verify how to suspend a single stage:
  - Confirm we can disable a single flow without breaking others.
- [ ] Document who has the authority to flip these switches.

---

## 14. Sign-off Criteria

The test pass is considered green only when:

- [ ] Every checkbox in §§4–9 is checked for at least one lead per relevant booking mode.
- [ ] No `lead_error` ledger entries are left unexplained.
- [ ] All Klaviyo flows under test are confirmed enabled with the pinned template versions captured in §2.1.
- [ ] Deliverability seed test came back at acceptable inbox placement.
- [ ] The kill-switch procedure has been demonstrated, not just documented.

If any check fails, open a follow-up ticket, link it from this doc, and re-run the affected section before declaring overall pass.

---

## 15. Post-Test Cleanup

- [ ] Delete the synthetic test campaign + leads (or move to an archived partition).
- [ ] Confirm test segment in Klaviyo has been cleared of synthetic profiles.
- [ ] Archive the captured template version IDs and the dated run sheet in this directory.
- [ ] File one summary issue with the test outcome and any anomalies surfaced.

---

## 16. Open Questions To Resolve Before Test Day

These are deliberately left for the engineer running the live pass to answer:

- [ ] Which environment do we test in (staging vs. production-with-test-campaign)?
- [ ] Do we need a fresh Klaviyo workspace for the run, or do we use the prod workspace with a guard segment?
- [ ] Is there a deliverability platform (e.g. GlockApps, Mail-Tester) we want to seed?
- [ ] What is the rate-limit ceiling we test against in §9.5?
- [ ] Who signs off — Engineering, Operations, or both?
