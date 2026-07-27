# Booking Flow Activity Tracking — Dashboard Integration Plan

**Status:** Implemented 2026-07-25 (except §3.4 live in-flight badge — deferred, see §5)
**Goal:** Surface booking-portal activity per deal in the Deals Operator Workbench
(Inventory tab), keeping the exact aesthetic of the existing Activity panel —
stat chips, daily bar charts with hover tooltips, table twin, day-grouped event
log, card sparkline.

---

## 1. Current state (review findings)

Two tracking systems exist today, and they do not talk to each other:

| | Deal activity events | Booking Activity Journal |
|---|---|---|
| Module | `lib/cb/deals-system/deal-events-store.ts` | `lib/booking-assistant/activity-journal.ts` |
| Keyed by | `DEAL#${dealId}#EVENTS` | `DRAFT#${draftId}` |
| Purpose | Operator analytics (charts, log) | Audit trail, PII-tiered, transactional |
| Write contract | **Best-effort** — swallowed on error, never disturbs guest UX | **Must succeed** — failed journal write fails the mutation |
| PII | None (email only on explicit contact actions) | Tier B/C/D lives here, encrypted |
| Powers | Every chart in the dashboard | Operator console per-draft views |

The public funnel currently goes **dark after `book_now_click`**. A guest who
enters `/deals/[id]/book`, fills out the assistant, reaches review, and requests
a call produces *zero* events in the deal's activity partition. The dashboard
shows "6 book clicks" and nothing after.

The booking journal is the wrong source for dashboard charts: it is per-draft
(no per-deal query without a scan), PII-scoped, and lives behind operator
concerns. The deal events partition is already the analytics spine — summary
roll-up (`computeDealActivitySummary`), zero-filled daily buckets
(`computeDealDailyActivity`), 14-day sparkline slices, the 60s-refresh panel,
and `dashboard-data.ts` assembly all hang off it.

**Design principle: the booking flow keeps its journal as the system of record;
the dashboard gets a thin, anonymous *milestone bridge* into the existing deal
events partition.** No new tables, no new query patterns, no scans (per the
Dynamo cost-controls rule), and every existing chart/aggregation picks the new
events up through the same pipeline.

---

## 2. Event bridge (data layer)

### 2.1 New `DealEventType` members (`deal-event-types.ts`)

Milestones only — one event per funnel stage crossing, not per keystroke:

```ts
// Booking portal funnel (draft linkage via metadata.draftId)
| "booking_portal_entered"   // guest landed on /deals/[id]/book (beacon, anonymous)
| "booking_contact_captured" // guest confirmed name+email in the flow (beacon, identified)
| "booking_packet_saved"     // draft created — full contact captured (server, identified)
| "booking_review_ready"     // packet reached review_ready (server)
| "booking_call_requested"   // guest pressed "call now" — signalCallIntent (server)
| "booking_confirmed"        // operator recorded a confirmed outcome (server)
| "booking_cancelled"        // draft cancelled/dismissed (server)
```

- The entry beacon and draft-stage milestones stay anonymous;
  `booking_contact_captured` and `booking_packet_saved` carry the guest's email
  (the events store's existing `email` field, same precedent as
  `link_requested`) plus `metadata.guestFirstName` — this powers the
  dashboard's Booking Leads list (§2.4). Deeper PII (phone, travelers, DOB)
  never leaves the encrypted journal/draft store. `metadata: { draftId,
  bookingStatus }` gives the operator a non-sensitive handle into the operator
  console.
- `attribution` carries the same session/source shape as `deal_page_view`, so
  the Top Sources breakdown can later answer "which ad produced actual booking
  packets", not just views.

### 2.2 Emitters

| Event | Where it fires | Mechanism |
|---|---|---|
| `booking_portal_entered` | `/deals/[id]/book` page mount | Client beacon — same pattern as `components/cb/deal-view-beacon.tsx`, posting to `/api/deals/[id]/track` (extend its zod enum). Fire once per session (sessionStorage guard, like `deal_engaged`). |
| `booking_packet_saved` | `guest-service.ts` `saveDraft`, after the transaction succeeds | Fire-and-forget `appendDealEvent` (`void`/`.catch`), `dealId` from `dealSnapshot.dealId`. |
| `booking_review_ready` | `guest-service.ts` `markReviewReady` | same |
| `booking_call_requested` | `guest-service.ts` `signalCallIntent` | same |
| `booking_confirmed` | `operator-service.ts` where a `confirmed` call outcome / `booking_confirmed` transition is recorded | same |
| `booking_cancelled` | operator dismiss / guest cancel paths | same (v1-optional) |

**Contract:** `appendDealEvent` remains best-effort; it must never sit inside the
booking transaction or fail a mutation. The journal write is the source of
truth; the deal event is a projection for analytics. One small helper in
`lib/booking-assistant` (e.g. `emitDealMilestone(dealId, type, draftId, status)`)
keeps the call sites one-line and centralizes the fire-and-forget + metadata
shape.

### 2.2.1 Partial-lead capture (identity for incomplete flows)

The flow persists to the server only after **all three** contact fields (first
name, email, phone) are confirmed — `booking-flow-experience.tsx` gates the
real `saveDraft` on the phone task. Before that, answers live only in the
browser (localStorage). A guest who types their name and email and bails
before the phone step would otherwise vanish.

Fix: the moment the guest confirms the **email** task, the flow fires a
best-effort `booking_contact_captured` beacon (`postBookingContactCaptured` in
`components/cb/deal-analytics.ts`) carrying `{ email, firstName }` to the
track route. The dashboard's Booking Leads list (§3.3.1) is built from these +
the later `booking_packet_saved` events, so the operator sees every identified
guest with the **furthest stage they reached** — including "Contact captured"
leads who never finished. The track route's public-deal gate keeps lab/mock
deal ids out of the events partition.

### 2.3 Aggregation (`deal-events-store.ts`)

Extend both shapes; the switch statements pick up the new cases:

```ts
// DealDailyActivityBucket + DealActivitySummary gain:
bookingPortalEntries: number;
bookingPacketsSaved: number;
bookingReviewReady: number;
bookingCallRequests: number;
bookingsConfirmed: number;
```

Add a funnel projection to the summary (computed over whatever event window the
caller scoped):

```ts
export interface DealBookingFunnel {
  stages: Array<{ key: string; label: string; count: number }>;
  // entered → saved → review → call → confirmed, with per-stage conversion
}
```

`totalActions` keeps its current meaning (contact actions). Bookings are their
own, more precious tier and are surfaced separately — this preserves the
meaning of every existing number on the dashboard.

`dashboard-data.ts` (`DealsSystemDealActivity`, the roll-up at ~line 630) gains
`bookingPortalEntries` / `bookingsConfirmed` totals for the card row and sort.

---

## 3. Dashboard UI (same aesthetic, three touches)

### 3.1 Inventory card (collapsed) — quiet

- Compact stats line grows two entries:
  `106 views · 106 unique · 6 book clicks · 0 actions · **4 portal · 1 booked**`.
  "booked" count renders in emerald when > 0, matching the existing badge tones.
- **In-flight badge**: when the deal has live drafts (see 3.4), a
  `BOOKING IN FLIGHT · n` badge in the existing `Badge` component, cyan tone —
  the one genuinely *live* signal on the card.
- Sparkline stays as-is; its per-day `<title>` tooltip adds
  `· n portal · n booked`. (Optionally: days with a confirmed booking swap the
  magenta action dot for an amber one — defer, keep v1 minimal.)

### 3.2 Activity panel — one new row in the charts grid

Current layout: chips row → range/view toggles → 2-col grid (Daily views |
Daily actions) → Top sources → Event log. Proposal keeps that skeleton and adds
a second row to the grid:

```
┌───────────────────────────┬───────────────────────────┐
│ DAILY VIEWS               │ DAILY ACTIONS             │   (unchanged)
├───────────────────────────┼───────────────────────────┤
│ BOOKING FUNNEL            │ DAILY BOOKING FLOW        │   (new)
│ Entered      ████████ 12  │ amber bars = portal       │
│   └ 67% ▸                 │   entries per day         │
│ Packet saved █████ 8      │ green dot = confirmed     │
│   └ 50% ▸                 │   booking that day        │
│ Review ready ████ 6       │ (DayChartFrame reuse:     │
│   └ 66% ▸                 │  same axis, gridlines,    │
│ Call requested ███ 4      │  tooltips, peak label,    │
│ Confirmed    ██ 2         │  table twin)              │
└───────────────────────────┴───────────────────────────┘
```

**Booking funnel** (left): horizontal rounded bars (same 4px data-end radius),
one stage per row, widths proportional to the top stage, direct count labels,
per-stage conversion percentage in muted ink between rows. Single hue — this is
magnitude across ordered stages of one entity, so all bars wear the booking
series color; no legend needed. Scoped to the panel's active range preset
(7d/30d/90d/All) like everything else.

**Daily booking flow** (right): built on the existing `DayChartFrame` — free
tooltips, hover layer, axis, peak annotation. Portal entries as amber bars;
confirmed bookings as a dot marker above the bar (the card sparkline already
established the bars + dot idiom). Legend present (two series); bar-vs-dot shape
difference is the secondary encoding on top of color.

**Series color:** booking identity = **`#b8791a` (amber)** — validated with the
dataviz palette script alongside the existing three on the chart surface
`#0b0f1f`:

```
node scripts/validate_palette.js "#3987e5,#008300,#d55181,#b8791a" --mode dark --surface "#0b0f1f"
→ ALL CHECKS PASS  (lightness band, chroma, CVD ΔE ≥ 8, normal-vision floor, 3:1 contrast)
```

Confirmed-booking dots reuse `SERIES_GREEN` — cross-chart reuse already exists
(blue = views in one chart, book clicks in the other), and within the booking
chart the shape difference + legend disambiguates. Add `SERIES_AMBER` to
`deal-activity-charts.tsx` next to the other three with the same validation
comment.

**Stat chips:** append `Portal entries` and `Booked` to the chips grid
(`sm:grid-cols-4` wraps them naturally; `xl` goes to `grid-cols-10` or stays 8
and wraps — visual call at implementation).

**Table view twin:** `DailyActivityTable` gains `Portal` and `Booked` columns so
the WCAG-clean twin stays complete.

### 3.3.1 Booking leads list (implemented)

Between Top Sources and the Event Log, a **Booking leads** section lists every
identified portal guest (`computeDealBookingLeads`): first name + email, a
stage chip (amber for in-progress/incomplete — "Contact captured", "Packet
saved", "Review ready", "Call requested" — emerald "Booked" when confirmed),
and last-seen day. Leads are keyed by email; draft-stage events join through
the `booking_packet_saved` event's draftId↔email link. Newest first, capped at
10 visible.

### 3.3 Event log — milestones as first-class entries

`EVENT_LABELS` additions:

```
booking_portal_entered → "Entered booking portal"
booking_packet_saved   → "Booking packet saved"
booking_review_ready   → "Packet review ready"
booking_call_requested → "Call requested"
booking_confirmed      → "Booking confirmed"
booking_cancelled      → "Booking cancelled"
```

They flow into the existing day-grouped log automatically (they're non-view
events). Two refinements:

- `booking_confirmed` rows render the label in emerald — the log's one moment
  of celebration.
- When `metadata.draftId` is present, render a small `operator console ↗` link
  to the operator page filtered to that draft — the bridge back to the
  PII-complete view.

### 3.4 Live in-flight state (the one non-event read)

Events give history; "what's happening *right now*" comes from the booking
store's existing status GSI (already queried for the operator queue). In
`dashboard-data.ts`, group active-status queue cards by `dealId` into:

```ts
bookingInFlight?: { count: number; furthestStatus: BookingDraftStatus };
```

Powers the card badge and one line at the top of the Activity panel:
`In flight now: 2 drafts · furthest: review ready`. No new index — reuses the
operator queue query, cached with the same 60s soft-refresh the tab already has.

### 3.5 Sorting

`SORT_OPTIONS` gains `{ id: "booked", label: "Most bookings" }` sorting on
`activity.bookingsConfirmed`, then `bookingPortalEntries` as tiebreak.

---

## 4. Privacy & cost notes

- **No PII enters the deal events partition.** Milestones are anonymous +
  draftId. Names, emails, phones stay in the encrypted journal/draft items;
  the log's deep link is how the operator crosses over, behind operator auth.
- **No new tables / GSIs / scans.** Rides `lll-deals-system` per-deal events
  partitions, existing queries, existing 60s refresh + read-cache patterns.
- **Never blocks the booking flow.** All emitters are fire-and-forget through
  the existing swallow-on-error `appendDealEvent`.

---

## 5. Implementation status (2026-07-25)

1. ✅ **Types + aggregation** — `DealEventType` extended; buckets/summary gain
   `bookingPortalEntries` / `bookingsConfirmed`; `computeDealBookingFunnel`
   (distinct-count per stage) + `computeDealBookingLeads` added.
2. ✅ **Emitters** — `lib/booking-assistant/deal-milestones.ts`
   (`emitBookingMilestone` + `emitBookingMilestoneForDraft`, which resolves
   dealId via a projected META point-read); hooks in `saveDraft`,
   `markReviewReady`, `signalCallIntent`, `recordCallOutcome` (confirmed),
   `dismissDraft` (cancelled); track route accepts the two client events;
   `BookingPortalBeacon` on the book page; `booking_contact_captured` fired at
   email confirmation in the flow.
3. ✅ **API passthrough** — `deal-activity` returns `bookingFunnel` +
   `bookingLeads`; `dashboard-data.ts` activity roll-up carries the two card
   counters.
4. ✅ **UI** — Portal/Booked chips; `BookingFunnelStrip` + `DailyBookingChart`
   (amber `#b8791a` bars + green confirmed dots) as the charts grid's second
   row (rendered only once booking activity exists); Portal/Booked table
   columns; Booking Leads list; event-log labels with emerald confirmed rows
   and portal-entry day roll-ups; card stats line + "Most bookings" sort.
5. ⏳ **Deferred** — §3.4 live in-flight badge (operator-queue grouping by
   dealId in `dashboard-data`), and the event-log deep link into the operator
   console.
6. **Verify** — seed milestone events against a test deal, confirm
   charts/log/funnel/leads render, confirm booking mutations still succeed
   when the analytics table write fails.
