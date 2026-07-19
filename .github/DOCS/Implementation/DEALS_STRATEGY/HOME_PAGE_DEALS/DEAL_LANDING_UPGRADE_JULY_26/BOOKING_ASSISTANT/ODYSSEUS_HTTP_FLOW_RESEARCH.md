# Odysseus HTTP Flow Research

Status: Work in progress, July 18, 2026

## Main finding

The Odysseus booking path is not a full REST flow.

The discovery portion uses JSON endpoints under `/nitroapi/v2/`. Once a guest enters the actual booking path, Odysseus changes to a stateful ASP.NET Web Forms workflow. That workflow depends on browser cookies, a short-lived `brn` booking-session token, server-side ViewState GUIDs, hidden form fields, redirects, and supplier-specific JavaScript validation.

The Booking Assistant should therefore not be designed as a server-to-server REST client that tries to recreate a booking from a small JSON payload. It should use two coordinated layers:

1. Our own durable booking draft in DynamoDB for guest progress, resume, human handoff, and the "only ask once" promise.
2. A controlled browser session that creates or recreates the live Odysseus `brn`, selects the fare and cabin, maps the currently rendered fields, fills them, and stops at the payment boundary.

## What the repository already proves

The February 2026 archive contains:

- a network capture through package selection and the category price popup
- saved HTML for category selection, cabin selection, and passenger checkout
- the current `OdysseusEngine` prototype that reaches passenger details and deliberately stops

These artifacts prove the following transport model:

| Phase | Known HTTP behavior | State consequence |
| --- | --- | --- |
| Search and package discovery | JSON `GET` and `POST` calls under `/nitroapi/v2/` | Authenticated browser headers and cookies are required for direct search replay. |
| Public package entry | `GET /swift/cruise/package/{packageId}?siid={agentId}&lang=1` | Loads package details and client configuration. |
| Create booking session | `GET /web/cruises/details.aspx` with package, passenger count/ages, residency, and agency parameters | Server creates an opaque `brn` and redirects into the legacy booking workflow. |
| Fare-code routing | `GET /web/cruises/farecodes.aspx?skip=True&brn=...` | Selects or skips the fare-code screen for that `brn`. |
| Category selection | `GET` then stateful `POST /web/cruises/category.aspx?brn=...` | Submits the chosen category, rate code, price category, group ID, and server form state. |
| Category price detail | `GET /web/cruises/checkout.ashx?checkoutmethod=rendercategorypricepopup&...&brn=...` | Read-only price and rule display for a category/rate combination. |
| Cabin selection | `GET` then stateful `POST /web/cruises/cabin.aspx?brn=...` | Submits the selected stateroom plus server form state. This may affect live cabin availability and must be treated as reservation-sensitive. |
| Checkout render | `GET /web/booking/checkout.aspx?brn=...` | Renders passenger, contact, services, add-ons, insurance, and payment sections according to supplier rules. |
| Checkout support calls | `GET checkoutrules.aspx?section=top|bottom&brn=...` plus other conditional calls | Loads dynamic rules and optional products. Exact calls vary by cruise line, fare, passenger mix, and residency. |
| Passenger and payment submit | Stateful `POST /web/booking/checkout.aspx?brn=...` | Uses the full rendered form and hidden server state. The final submit can make payment or complete a reservation. This is the hard stop. |

Important: the saved archive is a Celebrity flow. The current example in `IDEAS_START.txt` is MSC. We must not assume that required passenger, dining, insurance, residency, or payment fields are identical between those two suppliers.

## Short-lived session lock operating rule

Operator-observed behavior indicates that creating an Odysseus `brn` session may temporarily lock the sailing/booking path for about 15 minutes while an agent completes the flow. The lock automatically closes/releases when the session expires.

This means agents may carefully test the booking process through the visible payment boundary without treating every normal session as a forbidden inventory hold.

Operating guardrails:

- use one active session per test or booking/cabin draft;
- reuse that session instead of creating replacements;
- do not create bulk, repeated, or parallel locks;
- do not enter payment information;
- do not submit the final reservation/payment action;
- let the session expire/release promptly after the test;
- stop if a named hold, booking reference, durable reservation, or unclear inventory effect appears.

This permission does not yet prove whether a specific category or cabin POST creates an additional supplier-side hold. The sanitized capture still needs to identify that mutation boundary.
## Why replaying raw HTTP calls is fragile

The saved category, cabin, and checkout pages each contain:

- a `MainForm` that posts back to the same `.aspx` page
- `__EVENTTARGET`
- `__ViewStateGuid`
- an empty client `__VIEWSTATE` paired with server-side state
- an Odysseus session ID
- the opaque `brn`

This means a request body copied from one booking cannot safely be reused for another booking. The correct request depends on the exact HTML and server state rendered for the current `brn`.

The automation rule should be:

> Read the current page contract, fill only fields that exist on that page, submit through the live browser, verify the resulting state, and never fabricate hidden Odysseus values.

## Booking Assistant state model

Our durable record should use our own ID as the primary identity. The `brn` is only a temporary execution handle.

Suggested separation:

### Durable booking draft

- `bookingDraftId`
- guest identity and contact data
- passenger roster
- legal-name confirmation status per passenger
- residency and nationality
- accessibility and service requests
- selected package, fare/category preference, and cabin preference
- insurance decision
- consent timestamps
- current assistant step
- last completed checkpoint
- human-agent handoff status

### Ephemeral Odysseus execution state

- `packageId`
- `brn`
- Odysseus session start and last activity time
- current Odysseus page
- selected fare code and category code
- selected cabin number
- latest observed total and payment schedule
- field-contract version or page fingerprint
- last successful submission
- expiry or recreation reason

Never store credit-card number, CVV, or raw payment form data in DynamoDB, logs, transcripts, or the Booking Assistant state.

## Resume rule

We should assume that a `brn` can expire or become unusable at any time. The UI timer and actual server expiry may not be identical.

If the guest returns and the old `brn` fails:

1. Keep the durable booking draft.
2. Create a fresh Odysseus booking session from the package link.
3. Revalidate current price and availability.
4. Replay fare/category/cabin selections only if still available.
5. Refill the current rendered passenger fields from the durable draft.
6. Show any price, cabin, or rule change to the guest before continuing.

This is how we can honestly promise "we only ask once" without pretending the Cruise Brothers session itself is durable.

## Field automation rules

1. Treat the rendered page as the source of truth for required fields.
2. Build a supplier-aware field contract from names, IDs, `data-ody-id` values, required flags, visible validation messages, and select options.
3. Map each Odysseus field to one canonical Booking Assistant field.
4. Normalize guest data once in our system, but preserve the exact legal-name value the guest confirms.
5. Never infer legal name, date of birth, nationality, residency, passport data, or accessibility answers.
6. Require explicit guest confirmation before passenger data is sent into Odysseus.
7. Re-read the page after every submission and verify the expected next state.
8. If a required field appears that has no safe mapping, pause and ask the guest or hand off to the human agent.
9. Optional add-ons and insurance must be explicit guest decisions, not silent defaults.
10. Stop before the final payment/reservation submit unless the guest is visibly completing payment in the Cruise Brothers-controlled payment surface.

### Booking Contact Information ownership

The current MSC flow exposes an unexpected `Booking Contact Information` step that requires the booking agent's contact information, including the operator's email. This is distinct from both the primary guest's contact fields and any per-passenger email field.

The Booking Assistant must not ask a guest to know or enter the Leisure Life agent's email. The production adapter should fill this section from an approved server-side `BookingContactProfile` associated with the active Cruise Brothers account or assigned operator.

Until the live request is captured, verify all of the following rather than relying on the visible label:

- exact field names, required values, validation, and submission boundary;
- whether Odysseus prepopulates any values from the authenticated account;
- whether the required identity is the individual agent, agency, or both;
- whether the contact must match the credentials that created the `brn`;
- whether it persists after postback, session recreation, and clean-device payment handoff;
- whether it is displayed to the guest or used for supplier notifications.

Keep `guestContact.email` and `bookingContactProfile.email` as separate canonical mappings. Never fall back from the booking-agent email to the guest email. If the configured profile is missing, mismatched, rejected, or cleared during handoff, stop and route the draft to the operator instead of exposing the field to the guest.

## What is still missing

### Share-link behavior verified July 18, 2026

Odysseus exposes a persistent Share control during the booking flow. Its generated URL is not the raw session-bound `checkout.aspx?brn=...` URL and is not a prepared-payment request.

When fresh, the Share URL reconstructed the selected sailing/category context at the cabin-selection page in both a clean desktop browser and iPhone Safari. It preserved the package, price, available-stateroom list, and deck-plan context, but not the selected cabin, red-badge/timer state, passenger/contact data, add-on/insurance decisions, or payment-ready state.

When the earlier Share link's deeper state had expired, opening it on iPhone fell back to Guest Information instead of stateroom selection. Treat a fresh Share link as the primary Option C candidate: a guest-owned Odysseus session beginning at stateroom selection. Do not call it a payment link, promise a permanent resume depth, or assume it preserves a cabin hold. Its exact TTL and fallback rules remain unknown.

The existing `manual-flow-requests.json` capture stops at the category price popup. The saved HTML proves the later form actions, but it does not contain a fresh end-to-end request/response trace for:

- category selection POST and redirect
- cabin selection POST and redirect
- MSC passenger-data validation and conditional calls
- booking-contact field ownership, authenticated-account defaults, required agent/agency values, validation, persistence, and clean-device handoff behavior
- additional services and optional add-ons
- travel-insurance decision branches
- the transition that reveals or activates payment
- the exact last safe request before payment/booking execution

We need a new sanitized trace using the current MSC example, stopping before card entry and before the final submit. We should later repeat the trace for a few major cruise lines because the checkout contract is supplier-dependent.

## Safe capture tool

Use:

```powershell
npx tsx scripts/capture-odysseus-http-flow.ts --url "https://bookings.cbagenttools.com/swift/cruise/package/1553111?siid=1049337&lang=1"
```

The tool opens a mobile-sized Chrome window and lets the operator navigate manually. It saves sanitized request/response events and rendered form schemas under `tmp/odysseus-http-flow/`.

By default, it also blocks the known category-selection and cabin-selection POSTs because either could be the first inventory mutation. Approved experiments can enable those boundaries independently with `--allow-category-selection` or `--allow-cabin-selection`.

Safety behavior:

- no cookies or authorization values are saved
- no response bodies are saved
- form values are never saved; only field names are recorded
- sensitive query values such as `brn`, phone, email, ages, residency, and session tokens are redacted
- the known final `Make Payment` / `Complete Reservation` form submit is blocked
- the operator must stop before entering any card data

## Definition of done for this research phase

We can call the HTTP-flow research complete when we have:

1. A sanitized MSC trace from package entry to the visible payment boundary.
2. A phase-by-phase request table with method, path, request field names, response status, redirect target, and mutation risk.
3. A canonical Booking Assistant field schema mapped to the MSC checkout fields.
4. Explicit variants recorded for at least the suppliers we plan to advertise most heavily.
5. Automated contract checks that fail safely when Odysseus changes field names or page structure.
6. A verified human-handoff/resume path that can recreate an expired `brn` from the durable booking draft.
7. A verified booking-contact mapping that automatically supplies the approved agent profile and never requires the guest to know the agent's email.
