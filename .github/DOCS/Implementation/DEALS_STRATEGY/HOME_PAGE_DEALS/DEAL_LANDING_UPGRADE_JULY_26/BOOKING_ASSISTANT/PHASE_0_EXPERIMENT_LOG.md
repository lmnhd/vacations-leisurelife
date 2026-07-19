# Booking Assistant Phase 0 Experiment Log

Status: Complete for an operator-assisted pilot

Date started: July 18, 2026

Package under test: MSC package `1553111`

## Experiment 0A - Find the first stateful selection request without sending it

Goal: Navigate from the public package page until the first category/cabin request that might mutate booking or inventory state, then block it before transmission.

Safety configuration:

- visible mobile-sized Chrome
- sanitized request and form-schema capture
- no request-header values, cookies, response bodies, or guest values persisted
- category-selection POST blocked
- cabin-selection POST blocked
- final payment/complete-reservation POST blocked
- no card data entered

Observed sequence:

1. `GET /swift/cruise/package/1553111...`
2. Read-only package and supporting JSON calls.
3. `GET /web/cruises/details.aspx...` with passenger/residency parameters.
4. Server returned a short-lived `brn` and redirected through `farecodes.aspx`.
5. `GET /web/cruises/category.aspx?brn=...` rendered the category page.
6. Clicking category Book Now attempted `POST /web/cruises/category.aspx?brn=...`.
7. The recorder aborted that POST before it reached Odysseus. Chrome displayed `ERR_BLOCKED_BY_CLIENT` as expected.

The blocked form contained these contract fields:

- Odysseus country, currency, language, culture, supplier, package, and session fields
- `__EVENTTARGET`, `__EVENTARGUMENT`, `__LASTFOCUS`
- `__ViewStateGuid` and `__VIEWSTATE`
- `FormAction`
- category code
- price rate-code ID
- price category code
- price group ID
- yield fields
- category filter/type fields
- cruise-only and country fields

Result:

- No mutation occurred because the request was blocked locally.
- The first unclassified state-changing candidate is the category-selection POST, not the earlier `details.aspx` booking-session creation GET.
- We cannot yet claim the category POST reserves inventory. We need its response and redirect to classify it.

Next controlled experiment:

Run with category selection explicitly enabled while cabin selection and final payment remain blocked. If the category POST only redirects to a cabin-selection page, capture the first cabin POST without sending it. This isolates the cabin boundary before any approval to transmit a cabin-selection request.

## Experiment 0B - Transmit category selection and stop at cabin selection

Approval: The operator explicitly approved one category-selection POST. Cabin selection and payment remained blocked.

Observed sequence:

1. The category-selection POST was transmitted.
2. Odysseus returned HTTP `302`.
3. The browser followed the redirect to `GET /web/cruises/cabin.aspx?brn=...`.
4. The cabin page rendered available cabin `9213` and stated: the 15-minute booking timer begins when a stateroom is selected.
5. Clicking the stateroom Book Now button attempted `POST /web/cruises/cabin.aspx?brn=...`.
6. The recorder aborted the cabin POST before it reached Odysseus.

The blocked cabin form contained:

- cabin number
- `BookingTime`
- category, rate-code, and price-group state
- next-page and multi-cabin routing fields
- cabin-list and deck fields
- Odysseus session and server ViewState fields

Result:

- Category selection is a stateful booking-session update, but it does not begin the displayed 15-minute stateroom timer.
- No cabin selection or inventory hold was transmitted in this experiment.
- The first strong reservation-like mutation candidate is `POST /web/cruises/cabin.aspx?brn=...`.
- The last verified safe automation state is the rendered cabin page before submitting a stateroom.

Next controlled experiment:

With explicit hold/reservation-risk approval, allow exactly one cabin-selection POST. This may select or temporarily hold the cabin and start the 15-minute timer. Continue only to the visible checkout/payment boundary; keep final payment and complete-reservation submission blocked.

## Experiment 0C - Select one cabin and reach visible payment

Approval: The operator explicitly approved exactly one cabin-selection POST with the understanding that it could select or temporarily hold a cabin and start the 15-minute timer.

Safety configuration:

- category selection enabled
- one cabin-selection POST maximum
- additional cabin-selection POSTs blocked
- final payment/complete-reservation form submit blocked
- synthetic passenger/contact data only
- no card data entered

Observed transport sequence:

1. `POST /web/cruises/cabin.aspx?brn=...` was transmitted once.
2. Odysseus returned HTTP `200`.
3. The browser requested `statement.aspx`, then `GET /web/booking/checkout.aspx?brn=...`.
4. The visible countdown began after cabin selection, confirming this as the first reservation-like timed state.
5. Checkout rendered one ASP.NET form containing 483 controls for this two-adult MSC case.
6. Passenger and contact progression used `checkout.ashx` calls including `SetCustomer`, `cruiseprice`, `setnewprice`, `setbookingcontact`, `AddUpdateCruiseUpgradeOptions`, and `getinsurance`.
7. “Continue to Payment” revealed Payment Information on the same `checkout.aspx?brn=...` URL.
8. The card form contains card type, card number, cardholder name, expiry, CVV, billing address, billing phone, bank phone/name, terms acceptance, and the final submit control.
9. No card field was filled and the final submit was not clicked.

Result:

- Required experiment 1, sanitized MSC trace to visible payment: complete for this two-adult Florida-resident path.
- Required experiment 2, first inventory/reservation mutation: `POST /web/cruises/cabin.aspx?brn=...` is the first strong reservation-like mutation and starts the displayed 15-minute timer.
- Last mutation-free automation state: the rendered cabin page before submitting a stateroom.
- Last payment-safe state after approved cabin selection: payment form visibly rendered on `checkout.aspx`, before terms acceptance, card entry, or the final `ContinueBTN` form submit.
- Payment is embedded in the same Odysseus checkout session; there was no separate guest payment URL exposed during this path.

Next controlled experiment:

Copy the prepared `checkout.aspx?brn=...` URL without logging or sharing it in chat. Open it first in a clean desktop browser profile and then on a second device. Record whether it renders the prepared checkout/payment state, redirects, expires, or requires cookies/authentication. Do not enter card data.

## Experiment 0D - Transfer prepared checkout URL to clean desktop profile

Procedure:

1. Keep the prepared payment page open in the original capture browser.
2. Copy the exact `checkout.aspx?brn=...` URL from the address bar.
3. Open a new Chrome Incognito context.
4. Paste the unchanged URL without transferring cookies or browser storage.

Observed result:

- The original browser still displayed the prepared Payment Information section with more than six minutes remaining on its timer.
- The Incognito browser immediately rendered Cruise Brothers `Session Expired`.
- The clean profile did not render passenger data, the selected cabin, or payment information.

Conclusion:

- The `brn` URL is not a transferable official payment URL.
- A live `brn` is bound to additional browser session state. Cookies are proven necessary in practice because the same URL succeeds in the original context and fails in a clean context.
- Hidden form state may still be required for some POST operations, but it was not the variable transferred in this URL-only test.
- Phase 0 Option A, as currently defined, fails for the raw Odysseus checkout URL.
- Do not email or text a raw `checkout.aspx?brn=...` URL to a guest as a payment handoff.

Next controlled experiment:

Open the same URL on a second device with a clean browser context. This is expected to fail, but the required cross-device result must be recorded independently.

## Experiment 0E - Transfer prepared checkout URL to iPhone Safari

Procedure:

1. Keep the original prepared checkout active.
2. Open the exact same `checkout.aspx?brn=...` URL in iPhone Safari without transferring the originating browser’s session state.
3. Do not enter card data.

Observed result:

- iPhone Safari displayed the same Cruise Brothers `Session Expired` result as desktop Incognito.
- The guest device did not render the prepared checkout or Payment Information section.

Conclusion:

- The clean-browser transfer failure is reproducible across both desktop and iPhone.
- The raw `brn` URL failed twice from clean guest contexts, so it cannot satisfy the Phase 0 handoff gate.
- Cookies or equivalent originating browser session state are required. The `brn` is necessary but insufficient.
- ASP.NET hidden/server state remains part of stateful submissions inside the valid session, but transferring the URL alone cannot transfer that state or the required cookie binding.
- Option A is rejected for the raw Odysseus checkout URL.
- A remote browser stream or copied cookies must not be used as a workaround because that would carry payment interaction through Leisure Life infrastructure and materially expand PCI/security scope.

## Experiment 0F - Reopen prepared checkout in a new tab in the originating browser

Procedure:

1. Refresh the prepared checkout when Odysseus prompts to refresh the timer.
2. Copy the exact `checkout.aspx?brn=...` URL.
3. Open that URL in a new tab in the same browser profile that created the booking session.
4. Do not enter card data or submit the reservation.

Observed result:

- The new tab opened the same prepared checkout rather than `Session Expired`.
- It showed the selected MSC itinerary, two passengers, category IM1, cabin 9213, deck 9, and the active checkout timer.
- The server rehydrated the prepared booking from a fresh page load in the second tab.

Conclusion:

- A live `brn` plus the originating browser's Odysseus session cookie state is sufficient to reopen the prepared checkout in another tab in that browser profile.
- The prior page's DOM and ASP.NET hidden fields are not required merely to reopen the prepared checkout with a GET. They remain required inputs for later stateful ASP.NET form submissions.
- The timer/session refresh does not make the URL transferable. The same URL still failed in clean Chrome Incognito and iPhone Safari.
- This precisely classifies Required Experiment 4: `brn` is necessary but insufficient; compatible Odysseus session cookies are required for rehydration; hidden form state is operation-specific rather than a URL-transfer requirement.
- This behavior cannot be used as the guest handoff because the guest does not possess the operator browser's Odysseus session cookies, and those cookies must not be copied or proxied.

## Experiment 0G - Classify Share-link behavior across fresh and expired state

Procedure:

1. Use the Share control that remains visible throughout the Odysseus booking flow.
2. Copy its generated link without copying the raw `checkout.aspx?brn=...` URL.
3. Open the Share link in a different browser context without transferring cookies.
4. Reopen the earlier Share link after its deeper booking state has expired.

Observed result:

- While fresh, the Share link opened a working Odysseus cabin-selection page in a clean browser context.
- The page retained the sailing, fare/category, total price, available-stateroom list, and deck-plan context.
- It did not reopen the prepared checkout or Payment Information step.
- The guest must begin again at stateroom selection. Passenger data, booking-contact data, selected-cabin state, optional-service decisions, and payment readiness are not transferred.
- When that earlier Share link was later opened on iPhone after its deeper state expired, it fell back to the Guest Information beginning rather than stateroom selection.

Conclusion:

- The Share link is a booking-entry/deep link, not an official guest payment request.
- A fresh Share link can establish a guest-owned flow at the stateroom boundary, but that depth is time/state dependent.
- After expiry it can fall back to Guest Information, so it must not be described as permanent, indefinite, or guaranteed to resume at stateroom selection.
- It supports Option C as a candidate handoff model: the guest can start an Odysseus session in their own browser with the sailing/category context already selected.
- It does not support Option A or B because it transfers none of the prepared checkout state.
- Its exact TTL and fallback rules remain undocumented and must be treated as live contract behavior.

## Experiment 0H - Repeat a fresh Share-link opening on iPhone

Procedure and approval context:

1. The operator independently selected a cabin in a new booking session, causing the red badge/timer state to appear.
2. The operator copied the newly generated Share link.
3. The operator opened that Share link in iPhone Safari.
4. No payment or final booking submission occurred.

Observed result:

- The fresh Share link opened the stateroom-selection page on iPhone.
- It did not transfer the cabin selection, red-badge/timer hold state, passenger/contact data, or payment state from the originating browser.
- The iPhone received its own guest booking context at the stateroom boundary.

Conclusion:

- The Option C entry handoff has now worked in two clean contexts: another desktop browser and iPhone Safari.
- The Share link transfers package/category navigation context only. A selected cabin and its timed state remain bound to the originating session.
- Opening the Share link is safe before cabin selection; selecting a cabin in the guest-owned session remains the first strong reservation-like mutation and requires the guest's explicit action.

## Required experiment 6 - Detect successful self-service booking

Existing verified CBAT operating evidence already answers the completion-detection question without making a new test booking:

- A completed Booking Engine purchase appears in CBAT as a Trip record.
- The Trip is marked `Imported From Odysseus`.
- The Trip exposes booking date, vendor/product, sail date, confirmation number, and financial state.
- Trip messages state that the booking came through the custom link and was uploaded into CBAT.
- Trip Search can be filtered by Date Booked and used as a read-only reconciliation feed.
- No webhook, per-click source reference, or checkout-progress feed was found.

Decision:

Use read-only CBAT Trip Search plus Trip details/messages as the authoritative first implementation for `booking_confirmed`. Match against the durable first-party handoff record using package facts, a narrow time window, and available verified identity. Store only a confirmation hash in analytics. A sent or opened handoff is never confirmation.

## Required experiment 5 - Official guest payment request capability

Observed result:

- No dedicated `Payment Request`, `Send Payment Link`, or equivalent guest-payment action was visible in the tested pre-booking flow.
- The only persistent sharing action generated the Experiment 0G booking-entry link.
- That link opens cabin selection and does not preserve a selected cabin, passenger/contact details, or payment state.

Decision:

- Treat official prepared-payment request capability as unproven and not enabled in the tested MSC checkout.
- Do not label or message the Share URL as a payment link.
- Use Option D, operator-assisted completion, for the pilot. Keep Option C as the secondary fresh guest-owned entry path.
- The Share-link opening test succeeded in both clean desktop and iPhone contexts. Required Experiment 8 was subsequently completed below.

Read-only capability audit, July 19, 2026:

- The account/platform feature map advertises `BOOKING:HOLD`, `BOOKING:HOLDWITHNOEMAIL`, `BOOKING:MAKEPAYMENT`, `BOOKING:EXTENDPAYMENT`, `BOOKING:SENDEMAIL`, `BOOKING:CUSTOMERRECEIPT`, and payment-schedule operations.
- Authenticated customer-route allowlists include `BookingEmail.aspx` and `AssociatedBookingEmail.aspx`.
- The tested checkout configuration reported `isHostedPaymentFlow: false`, `isBookBeforePayFlow: false`, and no retrieved pay-later token.
- This proves the platform separates hold, later agent payment, and booking-email operations. It does not prove that a booking email contains a guest-operated payment link.
- A definitive answer does not require creating a new booking: inspect the action/email preview on an existing unpaid booking, search authenticated generic help/training, or obtain written Cruise Brothers confirmation.

## Required experiment 8 - Booking Contact contract

Verified visible contract for the tested checkout:

- `Booking Contact Person` contains required Email and Phone fields.
- No visible booking-agent name, agency name, or agency-ID field appeared in this section.
- The sanitized request uses `setbookingcontact` and carries Email, Phone, phone metadata, destination-phone metadata, and supplier custom-field slots.
- The Share link does not transfer this completed section into a clean guest-owned session.

Decision:

- Treat the Booking Contact section as operator/system-owned for the operator-assisted pilot.
- Fill Email and Phone from a versioned, approved `BookingContactProfile`; never ask the guest to know the agent contact details.
- Do not infer whether a value was prefilled by Odysseus. Always compare the visible values with the approved profile before continuing.
- Supplier-specific extra fields remain a contract-drift condition: stop and ask the operator when an unmapped required field appears.

## Phase 0 transport decision

Selected launch model: Option D, operator-assisted completion, with Option C Share-link self-service available only as a secondary path.

Expected boundary:

1. The Booking Assistant collects, validates, and saves the guest's booking data and explicit choices.
2. The operator claims the ready draft and opens a fresh Odysseus booking flow.
3. Cabin selection is performed only after availability/price confirmation and starts the timed reservation-like state.
4. Confirmed passenger data is filled; the operator verifies legal names and supplier-required fields.
5. Booking Contact Email and Phone come from the approved operator profile.
6. The operator handles supplier-specific services, insurance, payment schedule, card entry, terms, and final submission in the Cruise Brothers-controlled surface.
7. The Booking Assistant never receives, stores, logs, or proxies card data.
8. Completion is reconciled from the resulting CBAT Trip and `Imported From Odysseus` evidence.

Phase 0 outcome:

- Pass for the operator-assisted pilot.
- No prepared-checkout URL or payment-request link is available for a seamless cross-device handoff.
- The Share link is safe as a fresh guest-owned entry path, but it can degrade from stateroom selection to Guest Information as its deeper state expires.
- Self-service payment should not be presented as prefilled or resumable until Cruise Brothers provides a supported transferable payment capability.
