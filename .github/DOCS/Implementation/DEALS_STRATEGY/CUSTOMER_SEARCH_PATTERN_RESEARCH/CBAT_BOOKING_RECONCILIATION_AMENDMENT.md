# Amendment: CBAT Booking Reconciliation

**Applies to:** `SEARCH_INTENT_TO_BOOKING_IMPLEMENTATION_PLAN.md`
**Status:** Verified operating evidence, 2026-07-13

## Decision

Use CB Agent Tools (CBAT) Trip records and Trip messages as the authoritative
post-booking confirmation source. Pending commission remains a later financial
validation, not the primary conversion signal.

## Verified CBAT behavior

Read-only research in the operator's authenticated CBAT account established:

1. A completed Booking Engine purchase is uploaded into CBAT as a Trip record.
2. The Trip record is marked `Imported From Odysseus` and exposes booking date,
   vendor, ship/product, sail date, confirmation number, financial state, and
   commission state.
3. The Trip message log states that the booking was made through the agent's
   custom link and was successfully uploaded into CBAT.
4. Trip Search supports a `Date Booked` range and therefore provides a timely,
   read-only confirmation feed.

A Trip Search for bookings dated 2026-06-01 through 2026-07-13 returned no
records. This is evidence of no CBAT-confirmed bookings in that window, not
only an absence of pending commission.

## Boundaries

CBAT did not expose a webhook, a per-click source-reference field, or a view
of a visitor's progress through the individual Booking Engine checkout pages.
The platform can confirm a completed booking after CBAT upload; it must not
claim which external checkout page an unmatched visitor reached.

## Required implementation change

Add a durable first-party handoff before the current CB booking URL:

```text
Landing page
  -> /go/deals/<dealId> records a handoff
  -> existing CB booking URL
  -> CBAT Trip Search and Trip message
  -> confirmed booking reconciliation
```

The redirect must preserve the exact current CB package URL and guest checkout
experience. It creates no hold, reservation, payment, or booking.

### `DealBookingHandoff` contract

```text
DealBookingHandoff
  id, dealId, packageId, occurredAtIso, status
  sessionId, intentClusterId, campaign/ad/ad-set attribution, UTM/fbclid
  bookingUrlFingerprint, linkHealthSnapshot, isInternalTest
  cbatTripId optional, confirmationHash optional, matchConfidence optional,
  confirmedAtIso optional, reconciliationNotes optional
```

Allowed status values:

- `handed_off`
- `cbat_confirmed`
- `ambiguous`
- `completion_unknown`

`completion_unknown` is a visibility state, not proof of checkout abandonment.

## Read-only reconciliation flow

1. Query CBAT Trip Search by `Date Booked` from the previous successful sync.
2. Inspect each new Trip's vendor, ship/product, sail date, booking time, and
   Booking Engine/custom-link message.
3. Match a Trip to a handoff using package facts and a narrow handoff time
   window. For a visitor who requested an emailed link, use the supplied
   identity as an additional matching signal.
4. Mark an unambiguous match `cbat_confirmed`; retain an explanation and
   confidence for ambiguous matches.
5. Store only a confirmation-number hash in the analytics record. Trip and
   guest details remain in CBAT, never in public events or Meta parameters.

Use an explicit internal-test marker. Test handoffs remain visible for
diagnostics and are excluded from performance rates by default.

## Superseded event vocabulary

Replace the planned `booking_start` / generic `booking_complete` events with:

| Event | Meaning |
| --- | --- |
| `booking_handoff` | Server-recorded redirect to the CB booking URL |
| `booking_confirmed` | A CBAT Trip and custom-link Booking Engine message matched the handoff |
| `booking_completion_unknown` | No confident CBAT match exists after the observation window |

Do not report `booking_confirmed` to Meta as a purchase until reconciliation
is complete. Do not report a purchase for a handoff alone.

## Phase changes

### Phase 0 - Handoff and CBAT truth audit

- Audit active ads, destination URLs, UTMs, optimization event, package
  availability, and CTA handoff.
- Record the verified CBAT Trip Search/Trip-message confirmation path.
- Run a controlled, non-booking handoff test marked internal.
- Deliverable: handoff count, CBAT-confirmed count, ambiguous count, and
  completion-unknown count by Deal and campaign.

### Phase 4 - Measurement and decisions

- Add the redirect, handoff ledger, CBAT Trip Search reconciliation, and
  per-intent-cluster funnel.
- Show `landing view -> booking handoff -> CBAT confirmed` rather than
  presenting clicks as bookings.
- Scale only from confirmed bookings and contribution margin; investigate
  high-handoff/low-confirmation clusters as checkout or offer-friction cases.

## Acceptance criteria added to the parent plan

- Every Book Now handoff is server-recorded before redirect.
- CBAT-confirmed bookings can be reconciled to a Deal with documented match
  confidence.
- Internal test traffic is separated from customer traffic.
- The dashboard never converts an unmatched handoff into a false booking or
  false abandonment claim.
- The reconciliation is read-only and never creates a CB hold, reservation,
  payment, or booking.
