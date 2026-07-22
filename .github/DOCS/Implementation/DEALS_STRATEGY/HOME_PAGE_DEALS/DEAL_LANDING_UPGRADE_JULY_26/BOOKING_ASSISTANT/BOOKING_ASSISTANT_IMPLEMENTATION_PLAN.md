# Deal Booking Assistant Implementation Plan

Status: Working implementation baseline

Date: July 19, 2026

Current pilot flow: `call_agent_to_finalize_v1`

Primary source: `IDEAS_START.txt`

Supporting sources:

- `ODYSSEUS_HTTP_FLOW_RESEARCH.md`
- `.github/DOCS/Implementation/BLUEPRINTS/CHAT_SYSTEM_BLUEPRINT.md`
- `.github/DOCS/Implementation/Voice_SMS_CHAT.md`
- `.github/DOCS/Implementation/CHANNEL_UNIFIED_AGENT_RUNBOOK.md`
- `.github/DOCS/PROCESSES/odysseus-playwright-automation.md`
- `.github/DOCS/Implementation/GUEST_INFO.json`
- Current Deal CTA, chat, voice, callback, Klaviyo, DynamoDB, and Odysseus code paths

## 1. Executive decision

Build a mobile-first Deal Booking Assistant that sits between a Curated Deal landing page and the Cruise Brothers/Odysseus payment surface.

The assistant will:

1. Replace the three public Deal CTAs with one entry point: **Start booking**.
2. Capture the guest's first name, email, and mobile number immediately.
3. Save every confirmed answer to a durable DynamoDB booking draft.
4. Guide the guest through one small task at a time using large forms, text, or voice.
5. Let the guest ask unrelated questions without losing the current booking task.
6. Let the guest pause, return by secure email link, or request human help at any time.
7. Give the operator a live booking queue inside the Deals workbench.
8. After the guest reviews the complete packet, store it and issue a short three-letter fallback call key.
9. Clearly explain that finalization happens by phone: tapping the call button first pins the packet in the protected operator dashboard; the agent verifies the caller, starts a fresh live supplier session, rechecks price/cabin/discounts, enters the information, takes payment, and completes the booking. The key is needed only if automatic matching fails.
10. Present one explicit primary action: **Call agent to finalize**. Do not imply that the booking, price, cabin, or payment is already complete.
11. Let the authenticated operator verify and claim the pinned draft, or find it by fallback key, manually complete the new Odysseus session with the caller, and reconcile the resulting booking from the official success state and CBAT Trip record.
12. Record every meaningful guest, assistant, email, operator, system, call-handoff, and Odysseus action in one privacy-safe Booking Activity Journal that drives the operator timeline and analytics.

This is a booking completion layer, not a replacement booking engine and not a general-purpose cruise shopping chatbot.

## 2. Precise product goal

The pilot succeeds when a technically uncomfortable, iPhone-only guest can provide and confirm the information needed for an operator to complete the booking without:

- facing the full Odysseus form all at once;
- losing progress after leaving or refreshing the page;
- repeating previously confirmed information;
- deciding whether to use AI, voice, email, or a human before starting;
- losing their place when they ask a side question;
- exposing payment data to Leisure Life systems; or
- becoming stranded when the Odysseus `brn` expires.

The launch product deliberately ends in a phone call. A future verified official payment-request or transferable checkout capability may add another completion adapter, but it must not require rebuilding intake, durable drafts, call-intent signaling, fallback keys, review, operator lookup, or reconciliation. `call_agent_to_finalize_v1` remains the fallback.

The initial target user is an older, low-technical-confidence guest arriving from a paid social ad, using an iPhone, ready to purchase, and likely to abandon after confusion or interruption.

## 3. Non-negotiable product rules

| Rule | Implementation consequence |
| --- | --- |
| One landing-page CTA | `DealCtaActions` routes every booking intent into the assistant. Email, callback, AI, voice, and human completion become actions inside the flow. |
| Contact first | First name, email, and phone are the first three tasks before the longer booking flow. |
| Separate guest and booking-agent contact | The guest supplies their own contact details. During the call, the Odysseus `Booking Contact Information` step uses an approved Leisure Life/Cruise Brothers agent profile and is filled by the operator (or a future approved worker), never by asking the guest to know the agent's email. |
| Save after every confirmed answer | The server, not browser memory, is the durable source of truth. |
| Tell us once | Reuse confirmed values. Ask for review again only when data is stale, legally sensitive, changed, or must be explicitly reconfirmed. |
| One primary task at a time | Never show the guest a large Odysseus-style multi-section form. |
| Progressive options without confusion | Show one primary action, one visible `Continue later` escape, and only the secondary options that are valid at the current stage. Never show unavailable future capabilities. |
| Channel continuity | Text, voice, forms, email resume, and operator actions update one draft and one timeline. |
| Complete observable journey | Every meaningful action, message, state transition, validation outcome, delivery result, and operator/supplier interaction writes a versioned journal event. Do not record raw keystrokes, payment data, or uncontrolled sensitive screen/audio capture. |
| Deterministic progression | Code and live Odysseus field contracts decide what is required. The LLM may not invent required fields or skip gates. |
| Explicit guest decisions | Legal identity, accessibility, insurance, add-ons, cabin, fare, price changes, payment amount/schedule, and required consent require explicit confirmation. |
| Always screen for qualifying rates | Derive age-based candidates from confirmed dates of birth and ask one optional military/service qualification question. Compare every live eligible rate against the best ordinary promotion; never promise eligibility, assume stackability, or force a nominal discount that produces a worse total or value. |
| No local payment collection | Never collect, proxy, log, transcribe, or store card number, CVV, or payment form values. |
| Human help is always available | The action becomes visible as soon as phone contact exists and includes the complete draft context. |
| No automatic reservation mutation | Holds, reservations, payment, and final booking execution remain operator/guest approved actions. |
| Fail closed | Unknown Odysseus fields, page-contract drift, price changes, or missing consent pause the flow. |

Recommended public promise:

> Tell us once. We save your answers and progress, and only ask you to review something if it changes or needs your confirmation.

Do not promise literally that a question can never reappear. Legal-name confirmation, expired data, supplier changes, and price changes sometimes require review.

## 4. Scope

### 4.1 In scope

- Deal-specific booking flow launched from `/deals/[id]`.
- Public booking route at `/deals/[id]/book`.
- Secure resume route that exchanges a one-time token for an HTTP-only session cookie.
- Contact bootstrap, passenger roster, booking-required fields, review, fallback-key issuance, call-intent handoff, and operator processing.
- Text entry, browser voice, large guided forms, and side-question chat.
- Durable DynamoDB state, autosave, recovery, the complete Booking Activity Journal, and capped reminders.
- A protected Booking Queue in the Deals operator workbench.
- A manual operator call checklist for launch, with a future controlled Odysseus browser worker that may read/fill/verify safe mapped fields and must stop before payment.
- Deal attribution, journey diagnostics, conversation insights, and funnel analytics derived from privacy-safe journal projections rather than raw PII.

### 4.2 Explicitly out of scope for the first production release

- Collecting or processing payment locally.
- Fully autonomous holds or reservations.
- Letting an LLM choose a cabin, fare, insurance product, or add-on.
- Building the full broad chat blueprint before the booking flow works.
- Replacing Cruise Brothers/Odysseus.
- Remote streaming of the payment page through Leisure Life infrastructure.
- Passport, redress, or known-traveler data unless the current supplier page actually requires it.
- Unlimited reminder messages.
- Multi-cabin self-service in the first pilot.

## 5. Current repository reality

| Existing capability | Reuse | Required correction or limit |
| --- | --- | --- |
| `components/cb/deal-cta-actions.tsx` | Reuse Deal context and analytics entry point. | Replace three public actions with one assistant route after prototype approval. Preserve the old actions behind a rollback flag. |
| `/tests/deals-system` | Reuse the shared local Deals workbench and Deal data. | Add a dedicated local-only Booking Queue. Real PII is read server-side only by the loopback operator console using short-lived AWS operator credentials; no production admin route or public operator API is enabled. |
| Callback request Dynamo store and Pushover | Reuse notification transport and status concepts. | Booking drafts need a richer lifecycle, claim locks, audit events, and PII-minimized notifications. |
| Klaviyo event integration | Reuse for event-triggered email delivery. | Send secure resume URLs, not sensitive answers or raw Odysseus session links. Add consent, caps, cancellation, and idempotency. |
| `lib/chat` structured prompt system | Reuse channel parity, skill loading, context, and LLM gateway patterns selectively. | The existing generic `fast_booking` flow searches, selects, and discusses courtesy holds. It is not the Deal booking-completion workflow and must not be reused unchanged. |
| Hero Chat dynamic form prototype | Reuse interaction lessons and visual components. | Production forms must be server-defined typed objects, not LLM text directives. Do not extend regex-based directive parsing; repository policy forbids regex in code. |
| `useHybridVoiceChat` and browser voice infrastructure | Reuse WebRTC/STT/TTS plumbing and common-pipeline model. | Queue turns instead of dropping speech while another turn is processing. Keep one transcript/state across voice and text. |
| `lll-chat-*` tables | Reuse storage conventions only. | Booking drafts contain higher-risk PII and a different lifecycle. Use a dedicated single-table Booking Assistant design. |
| `GUEST_INFO.json` | Reuse traveler/cabin identity concepts. | It is not a complete checkout contract. Add title, supplier-required gender, address, residency, booking contact, service/add-on decisions, consent, provenance, and field status. |
| Legacy `app/Booking/BookingInfo.js` qualifiers | Treat `military`, police, fire-department, and senior labels as discovery evidence only. | A Boolean `military` flag and generic `senior` category cannot represent supplier thresholds, cabin-occupant rules, veteran/family categories, proof deadlines, live availability, or competing promotional value. Do not reuse them as the new contract. |
| `OdysseusEngine` | Reuse package navigation, authenticated native Chrome, XHR knowledge, and selectors as research. | It is local Windows Chrome, stores shared auth state, uses dummy guest data, selects the first category/cabin, and does not provide a production task/lease boundary. Do not expose it directly to public requests. |
| HTTP-flow capture tool | Reuse as the contract discovery and regression fixture source. | Complete the MSC capture and add supplier variants before automation is trusted. |

## 6. Phase 0 completion-path proof

The decisive Phase 0 question was whether a prepared payment session could be handed from an operator-controlled browser to the guest's iPhone. The answer for the tested raw checkout URL is no, so the pilot uses the verified call-agent-to-finalize path.

The July 18, 2026 experiments proved that the raw `checkout.aspx?brn=...` URL is not transferable. It reopened the prepared checkout in a new tab in the originating browser profile, but returned `Session Expired` in both Chrome Incognito and iPhone Safari. The `brn` plus compatible Odysseus session cookies can rehydrate the checkout; the prior page's DOM/hidden fields are not required for that GET. Hidden fields remain part of later stateful ASP.NET submissions.

Phase 0 evaluated these completion models. A guest-owned model remains unavailable until its separate activation gates pass:

### Option A - transferable official payment URL

The operator/worker prepares the booking, and Cruise Brothers provides an official URL that opens correctly on a fresh guest browser without transferring agent cookies.

Status: Rejected for the raw Odysseus checkout URL. It failed twice in clean guest contexts. An independently issued official guest URL would be a different capability and remains part of Option B research.

### Option B - official Cruise Brothers payment request

The prepared reservation or booking can generate a Cruise Brothers-hosted payment request that is designed for the guest.

Status: Not proven or enabled in the tested MSC checkout. The persistent Share control creates a cabin-selection entry link, not a prepared-payment request. A July 19, 2026 read-only capability audit found account/platform features for `BOOKING:HOLD`, `BOOKING:HOLDWITHNOEMAIL`, `BOOKING:MAKEPAYMENT`, `BOOKING:EXTENDPAYMENT`, `BOOKING:SENDEMAIL`, `BOOKING:CUSTOMERRECEIPT`, and authenticated `BookingEmail.aspx` routes. These prove that holding, later agent payment, and booking email are separate supported operations; they do not prove that an email contains a clean-browser guest payment URL. The tested checkout configuration reported `isHostedPaymentFlow: false`, `isBookBeforePayFlow: false`, and no retrieved pay-later token.

### Option C - guest-owned Odysseus session

The guest creates the live Odysseus session in their own browser, and the assistant can safely guide or prefill without violating same-origin restrictions.

Status: Secondary self-service candidate. A fresh Share link opened a guest-owned cabin-selection flow in both a clean desktop browser and iPhone Safari. It carried sailing/category navigation context but not the selected cabin, red-badge/timer state, passenger/contact data, optional decisions, or payment state. After the deeper Share-link state expired, the same link fell back to Guest Information. The guest-owned flow also cannot inherit the operator-owned Booking Contact profile, so it is not the seamless prefilled launch path.

### Option D - call agent to finalize

The assistant collects and stores the complete reviewed booking packet, issues a three-letter fallback call key, and tells the guest exactly what the final phone call will involve. The call button first pins the packet in the operator dashboard. The operator verifies/claims the pinned draft, or uses the caller's fallback key, then starts a fresh Odysseus session, revalidates and manually enters the information, confirms live choices, takes payment through the approved Cruise Brothers procedure, and performs the final submit.

Status: Selected and only enabled pilot model: `call_agent_to_finalize_v1`. No `brn`, cabin timer, live hold, or prepared checkout is created before the call. Card data remains entirely inside the live phone conversation and Cruise Brothers-controlled surface under the approved operator procedure; Leisure Life does not collect, transcribe, record, or store it.

Do not build a remote browser stream that carries card data through Leisure Life infrastructure. That would materially expand security and PCI scope.

### Required experiments

Experiment evidence is recorded in `PHASE_0_EXPERIMENT_LOG.md`.

1. Complete the sanitized MSC trace from package entry to visible payment.
2. Identify the exact request that first creates a hold, reservation, or other inventory mutation.
3. Open a prepared checkout URL in a clean browser profile and on a second device, without card entry.
4. Confirm whether cookies, `brn`, and hidden state are all required after transfer.
5. Confirm whether the Cruise Brothers portal can issue an official guest payment request.
6. Confirm how a successful self-service booking can be detected: success page, booking reference, webhook, polling, or operator reconciliation.
7. Record the last safe automation action before payment/reservation execution.
8. Capture the `Booking Contact Information` field contract and prove whether the authenticated agent's name, email, phone, or agency identifier must be supplied, whether they persist into a clean-device handoff, and whether the guest can reach payment without being asked to provide them.

Verified July 18, 2026 results:

- Experiments 1 through 7 and the two-context Option C opening test are complete for the tested two-adult MSC path.
- The first strong reservation-like mutation is the cabin-selection POST, which starts the visible 15-minute timer.
- The raw checkout URL works only with the originating Odysseus browser session and fails in clean desktop and iPhone contexts.
- A fresh Share link opens a guest-owned flow at cabin selection on desktop and iPhone; it is not a payment link and transfers no selected-cabin, timer, guest, or payment state.
- After its deeper state expires, the Share link can fall back to Guest Information. Its exact TTL is not documented.
- No dedicated official guest payment-request action was found in the tested flow.
- Successful booking detection will initially use read-only CBAT Trip reconciliation and the `Imported From Odysseus` evidence; a sent/opened handoff is never confirmation.
- Experiment 8 is complete for the tested flow: Booking Contact requires Email and Phone, with no visible agent/agency-name field. During the final call, the operator uses the approved server-side `BookingContactProfile`; new required supplier fields stop manual processing for operator review.
- Phase 0 passes for the call-agent pilot. Option C remains research-only and must not be shown as a launch alternative or described as a prepared/resumable payment handoff.

For any future self-service Option C launch, Phase 0 requires the entry handoff to work twice from clean guest contexts. The selected Option D launch requires the call-intent signal/pin, fallback-key lookup, caller disclosure, authenticated operator workflow, manual fresh-session procedure, and no-card-data boundary to be tested. The earlier visible-payment trace remains contract research, not the guest-facing launch sequence.

## 6A. Authoritative pilot Booking Flow

This section is the single source of truth for launch. If another section describes a prepared checkout, transferable payment link, automated pre-call Odysseus session, or different pilot end goal, this section wins.

Current flow definition: `deal_booking_completion/call_agent_to_finalize_v1`

`Start booking -> save contact -> collect and confirm complete packet -> final review -> store packet and fallback call key -> explain phone finalization -> Call agent to finalize -> atomically signal/pin calling draft -> launch phone call -> agent verifies caller and claims pinned draft (or uses fallback key) -> fresh Odysseus session and manual booking/payment with caller -> authoritative reconciliation`

### 6A.1 Required order of operations

#### Stage 1 - Enter the booking funnel

Owner: Booking Assistant

1. Guest taps `Start booking` on `/deals/[id]`.
2. Server validates Deal, package ID, source URL, and basic link health.
3. Server creates a durable draft with Deal attribution and `flowDefinitionVersion`; it does not create an Odysseus `brn`.
4. Guest sees the sailing summary, captured price basis/time, and notice that the agent will recheck live price and availability during the final call.
5. If the Deal is no longer eligible, preserve the lead and route to agent help without opening Odysseus.

Resulting status: `started`.

#### Stage 2 - Save contact and recovery access

Owner: Guest and Booking Assistant

1. Collect first/preferred name.
2. Collect email, attach the durable draft, and send a secure Leisure Life resume link.
3. Collect mobile phone.
4. Record callback/SMS permissions separately; phone capture alone is not consent.

Resulting status: `collecting`.

#### Stage 3 - Collect the reusable booking packet

Owner: Guest, with deterministic Booking Assistant tasks

Collect and confirm, in dependency order:

1. traveler count, age-at-sailing classification, cabin count, and residency;
2. legal title, supplier-required gender, legal name, and date of birth for each traveler;
3. nationality/citizenship and primary traveler's complete mailing address;
4. optional military, veteran, first-responder, government/civil-service, interline, or related rate claim for the relevant traveler; derive age-based candidates automatically;
5. supplier-required per-traveler email/phone and optional loyalty numbers;
6. accessibility, mobility, dietary, bed, and hard cabin constraints;
7. cabin/fare preferences and acceptable tradeoffs, without claiming a live cabin;
8. celebration, linked-reservation, tour/transfer, add-on, and insurance preferences; and
9. requested human help and preferred contact method.

Rules:

- Save after every confirmed answer.
- Do not create a live Odysseus session during intake, review, call-key issuance, dashboard signaling, or the pre-call screen.
- Defaults may copy confirmed factual data; they may not invent legal identity, insurance, add-on, fare, cabin, payment, or consent decisions.
- Age/service qualification remains a candidate or claim until the agent checks live supplier rules during the call.
- Do not request/store military proof, payment data, or agent-profile fields in the ordinary assistant.
- Supplier-only choices remain `pending_live_contract`; the agent resolves them with the caller in the fresh session.
- `Continue later` saves only confirmed values and the exact next-task pointer.

#### Stage 4 - Final guest review and phone-finalization acknowledgement

Owner: Guest

1. Show passenger, contact, address, savings-qualification, preferences, and missing-field summaries.
2. Require correction of every known required field and accuracy acknowledgement for other travelers.
3. Explain that the packet will be stored for an agent to retrieve and manually enter into the cruise booking system.
4. Explain that nothing is booked, held, or charged yet; live price, cabin, discounts, optional products, payment schedule, and terms will be confirmed during the call.
5. Obtain explicit permission to store the reviewed packet and make it available to an authenticated booking agent when the guest initiates the call or supplies the fallback call key.

Resulting status: `review_ready`.

#### Stage 5 - Store the final packet and issue a fallback call key

Owner: Booking Assistant

1. Transactionally persist the reviewed packet, field revisions, `packetVersion`, acknowledgement, and journal result.
2. Generate one active three-letter fallback call key from the approved pronounceable/safe-word registry. It contains no PII or embedded draft/database identifier.
3. Collision-check against all active keys before commit. Store a normalized deterministic lookup HMAC/digest and display metadata; never use a sequential order number.
4. Bind the key to draft, version, issued time, lifecycle, and state `active`.
5. Revoke a prior key only when deliberately replaced. Refresh/repeated taps return the same active key.
6. Send a transactional `Ready to call` receipt containing the fallback key, agency phone number, pre-call explanation, secure resume link, and reminder controls. Do not place the key in a URL, email subject, analytics, or push notification.
7. Do not create a `brn`, select a cabin, start a timer, or claim inventory.

Resulting status: `ready_to_call_agent`.

#### Stage 6 - Present the final call handoff

Owner: Booking Assistant and guest

Lead with:

> Your information is saved. Call your booking agent to finalize.

Show a de-emphasized fallback card: `If your information does not appear automatically, tell your agent your three-letter call key: MAP.` Include **Copy key** and **Read key aloud**. State that it only locates saved information; it is not identity proof or booking confirmation.

Immediately above the primary button, state:

> When you tap the button, we will alert your agent and place your saved information at the top of the agent's booking screen before your phone starts the call. The agent will verify who you are, start a new live cruise booking session, recheck the current price, cabin and any discounts, enter your information, review the final choices and terms with you, take your payment information by phone, and complete the booking. If the agent cannot see your information automatically, give the agent your three-letter call key. Nothing is booked, held, or charged yet, and prices or cabins may change before the agent completes the booking.

Tell the guest to have the fallback key, traveler documents needed to verify spelling/details, and payment card available. Never request payment data in Leisure Life.

Actions:

1. Primary: **Call agent to finalize**. First complete the server-side `begin-call` command; only after its acknowledgement launch the approved `tel:` number on supported phones.
2. Secondary: **Copy key**.
3. Secondary: **Call later**, leaving `ready_to_call_agent` and the loop-safe call reminder active.
4. More Options: review/correct saved information, resend ready-to-call email, request callback, change/stop reminders, or cancel/delete.

The primary tap transactionally records `call_launch_requested`, creates a short-lived `callAttemptId`, moves the draft to `call_signal_pending`, and publishes an authenticated operator-dashboard signal containing only the internal draft reference plus a masked expected-caller summary. The online dashboard must pin/render the draft and acknowledge that same attempt ID. Only that authenticated consumer acknowledgement may move the draft to `calling_now` and authorize the browser to launch `tel:`. A broker/server publish acknowledgement alone is insufficient. If the dashboard acknowledgement fails or times out, return to `ready_to_call_agent`; do not silently dial or claim automatic population. Show the phone number and fallback key with Retry. `calling_now` still means only that the guest initiated the handoff after the dashboard received it. It never proves ringing, connection, caller identity, agent claim, payment, or booking.

#### Stage 7 - Agent retrieves and manually completes the booking

Owner: Authenticated operator using the protected Leisure Life workspace and Cruise Brothers-controlled browser

1. Protected Booking Queue receives the pending call-intent signal, pins/renders the expected draft with a masked caller summary and countdown, and acknowledges the same attempt ID; only then does the draft become `calling_now`. It does not claim the draft automatically.
2. Operator compares the Google Voice caller ID with the saved masked number when available. Caller ID is supporting evidence only and may be blocked, spoofed, forwarded, or different.
3. For a direct call, mismatched/unavailable caller ID, expired signal, multiple simultaneous attempts, or dashboard failure, caller reads the three-letter fallback key and the authenticated operator performs exact-key lookup.
4. System returns one masked match or non-enumerating not-found/expired result. The signal, caller ID, and key are locators, not authentication and never authorize PII reveal.
5. Operator verifies caller under approved procedure, claims the draft with a lease, and reveals only needed fields.
6. Operator confirms saved sailing/material facts; corrections retain operator provenance and required guest confirmation.
7. Operator starts one fresh Odysseus session. This is the first live `brn` for launch.
8. Operator rechecks availability, price, taxes/fees, schedule, cabin/fare rules, and plausible ordinary/qualifying rates.
9. Operator manually enters saved information and resolves live supplier-only choices with the caller.
10. Operator explains material differences and obtains approval for exact rate, cabin, add-ons/insurance, amount, schedule, and terms.
11. Caller provides card information by phone under the approved Cruise Brothers procedure. Operator enters it only in official Odysseus. Leisure Life does not record, transcribe, persist, proxy, or analyze card data/payment activity.
12. Operator manually performs official payment/reservation submit.
13. Decline, validation error, price change, unavailable cabin, dropped call, or expired session never marks booked or triggers duplicate submit.

Resulting status: `agent_processing`, `needs_guest`, `payment_failed`, or `reconciliation_review` until authoritative success.

#### Stage 8 - Confirm, reconcile, and communicate

Owner: Operator and Booking Assistant

1. Capture official success and booking reference through protected operator workflow.
2. Reconcile against CBAT Trip and `Imported From Odysseus` evidence.
3. Set `booking_confirmed` only after authoritative success or verified reconciliation.
4. Stop Continue-later and call-to-finalize reminders.
5. Mark fallback key `consumed`/terminally closed; retain only approved digest/audit metadata.
6. Send approved confirmation and next steps.
7. Destroy/expire ephemeral `brn`, cookies, ViewState, and live-session data.

### 6A.2 Fallback call-key contract

- Three case-insensitive letters displayed as one short word, for example `MAP`.
- Draw only from a versioned, curated registry of easily spoken, non-offensive three-letter words; exclude confusable spellings, abbreviations, sensitive terms, and words likely to be misheard.
- Select with cryptographically secure randomness and collision-check against every active key. Processing one call at a time does not imply only one ready/paused draft exists.
- Encode no PII, Deal/date/phone suffix, sequence, DynamoDB key, or `brn`.
- One active key per draft; idempotent reads return it and intentional rotation revokes the old key.
- Index only a server-side deterministic HMAC/digest. Exclude raw keys from logs, analytics, URLs, traces, and push notifications.
- If the product must redisplay the same key after secure resume, store the raw value only as a separately envelope-encrypted Tier B secret under the draft; never store it in the lookup alias. Authorized guest display and the transactional ready-to-call email body are its only permitted reveals.
- Operator lookup is authenticated, rate-limited, journaled, and unavailable publicly.
- The key locates a draft but never authenticates the caller or authorizes sensitive reveal. Its intentionally low entropy is acceptable only because public lookup is impossible, operator lookup is throttled/audited, and caller verification is mandatory.
- Expired/not-found responses do not reveal whether a similar code/draft exists.

### 6A.3 Recovery behavior

- Before final review: resume exact task; no Odysseus state exists.
- `Continue later`: retain confirmed values and the one three-day intake reminder program.
- After key issuance: retain the same key and switch to `call_to_finalize_v1`; create no supplier session.
- `calling_now` signal expires after a short configured window and returns to `ready_to_call_agent` unless the operator claims it. Expiry does not rotate the key or discard the draft.
- Lost key: recover through secure resume or resend ready-to-call email. Rotate only for suspected compromise/policy.
- Material correction after key issuance: retain key, increment `packetVersion`, return to review, and block stale packet use until reconfirmed.
- Dropped call: preserve key/draft, record outcome, let live session expire/close, and allow callback with the same key without hold promises.
- Expired/not-found: use approved recovery; never guess by name/phone or expose matches.
- Price/rule change: explain exact difference and require caller approval.
- Payment failure: keep payment data outside Leisure Life and avoid duplicate submit.
- Uncertain success: reconciliation review before retry.

### 6A.4 Ownership boundary

| Actor | Owns | Must not do |
| --- | --- | --- |
| Guest | Facts, preferences, review, call initiation, fallback key, live decisions, payment authorization | Treat the signal/key as confirmation or enter card data into Leisure Life |
| Booking Assistant | Intake, autosave, review, fallback key, disclosure, atomic call-intent signal, resume, reminders, operator packet | Claim a connected call, create pre-call `brn`, claim inventory, collect card data, accept terms, submit |
| Operator | Pinned-draft or fallback-key lookup, caller verification, claim, fresh session, manual entry, comparisons, payment, terms, submit, confirmation | Treat button tap, caller ID, or key alone as authentication, copy card data into Leisure Life, report unsupported success |
| Cruise Brothers/Odysseus | Official inventory, pricing, payment, reservation, confirmation | Be represented as durable by raw session URL |
| Controlled worker | Future-only contract capture/approved adapter | Participate in launch call flow or create pre-call session |

### 6A.5 Versioned future pivot

Stages 1-5 remain common. Stage 6 onward is selected by `completionMode`; the three-letter call key remains the human fallback.

| Completion mode | Launch state | Behavior |
| --- | --- | --- |
| `call_agent_to_finalize_v1` | Enabled/default/only public launch mode | Button signals/pins the draft before dialing; agent verifies and claims it, or uses the fallback key, then starts fresh Odysseus, takes payment by phone, and completes manually. |
| `official_payment_request_v1` | Disabled/unproven | Send only a separately verified official guest payment URL after authorized reservation state. |
| `transferable_checkout_v1` | Disabled; raw `brn` rejected | Requires clean-browser capability without agent-cookie transfer. |
| `guest_owned_share_v1` | Research-only | Guest restarts from Stateroom/Guest Information; not prepared payment handoff. |

Store flow/mode/version/capability snapshot, selection time/actor/fallback reason, `callKeyVersion`, `packetVersion`, and call-disclosure version.

A new mode requires proven support, repeat clean-device tests when applicable, documented state/expiry/fallback, supplier/payment coverage, no Leisure Life card-data exposure, authoritative reconciliation, full tests, and feature flag. `call_agent_to_finalize_v1` remains rollback.

Do not migrate an active phone completion into another mode. Change only before completion begins or after the attempt ends and material facts are revalidated.
## 7. Guest experience

### 7.1 Entry from a Deal landing page

The single CTA should read **Start booking** or **Start booking now**. It routes to `/deals/[id]/book` and carries only the Deal ID and non-PII attribution.

Before personal information or conversation content is collected, provide concise data-use copy explaining that confirmed answers and booking-assistant conversations are saved to complete the booking, support the guest, and improve the booking experience, with a link to the full privacy/retention explanation. Do not describe this as payment or audio/video recording; those are not performed by Leisure Life in the pilot.

The assistant loads a compact, verified Deal summary:

- cruise line and ship;
- sailing date and nights;
- departure port and itinerary label;
- selected Deal angle;
- latest pricing basis and captured-at time;
- availability caveat; and
- a clear statement that final price and availability are confirmed before payment.

The assistant must not make the guest search for the same package again.

### 7.2 Contact bootstrap

Collect these as three fast, large tasks:

1. First name.
2. Email address.
3. Mobile phone number.

After email capture:

- create or attach the durable draft;
- send a secure resume link;
- show `Saved just now`;
- allow the guest to continue without leaving the page.

After phone capture:

- reveal **Get help now** in More Options;
- do not treat phone capture alone as consent to call or text;
- require a separate explicit help/callback action or communication consent.

### 7.2.1 Odysseus booking contact is system-owned

The unexpected Odysseus `Booking Contact Information` step is an agent/agency-contact requirement, not a question the guest should have to answer. A guest cannot reasonably be expected to know the Leisure Life booking agent's email.

Implementation rules:

- Maintain an approved, server-side `BookingContactProfile` for the Cruise Brothers account or assigned operator, including only the exact name, email, phone, and agency identifiers the live form requires.
- Associate the profile with the authenticated Cruise Brothers credential/tenant. Do not hard-code a personal email in browser code, prompts, Deal manifests, or guest-visible configuration.
- During the call, the authenticated operator fills this step from the approved profile while manually entering the fresh Odysseus session. A future adapter may automate only after separate approval. The LLM may not invent, select, or modify booking-agent contact data.
- Keep the guest's email and the booking agent's email as different canonical fields. Never substitute one for the other unless a captured supplier contract explicitly identifies the field as guest contact.
- Store only the profile ID and configuration version on the booking audit trail; do not copy the agent profile into every guest answer record.
- If the approved profile is missing, mismatched, or rejected during the call, mark the agent workflow `blocked` and resolve it before payment/final submit.
- Before manual completion, verify that this section is complete. A future guest-owned mode must prove that the profile survives transfer and never asks the guest to type the agent's email.

Guest-facing language, if this step must be acknowledged, should be simple: `We will add your booking agent's contact information for you.` Do not present it as another guest task.

### 7.3 Progressive booking tasks

Default order:

1. Number of travelers.
2. Traveler ages or age-at-sailing classification.
3. Number of cabins.
4. Legal identity for traveler 1.
5. Legal identity for each additional traveler.
6. Nationality and residency required by the current supplier.
7. Savings eligibility: automatically acknowledge the age-based check, then ask one optional military/service question.
8. Primary mailing address.
9. Per-traveler contact fields only when the supplier requires them.
10. Past-passenger/loyalty number if applicable and optional.
11. System fills and verifies the approved agent booking-contact profile; no guest input is requested.
12. Accessibility or service requests.
13. Cabin/fare choice confirmation.
14. Additional services and optional add-ons.
15. Travel insurance decision.
16. Full passenger and trip review.
17. Explicit permission to store the reviewed packet and place it in the authenticated operator dashboard through call-intent signaling, with fallback-key lookup when needed.
18. Retrieval-code and phone-finalization explanation.
19. **Call agent to finalize** handoff; live price/rate/cabin/rule decisions occur with the agent during the call.

This is a default dependency order, not a rigid conversational order. The guest may jump to another available section. Completion rules remain deterministic, and Section 6A controls the actual execution order after guest review.

### 7.3.1 Savings and special-rate qualification

The product promise is **we always check**, not **you definitely qualify**. The assistant must screen for potential eligibility, the live supplier contract must reveal an available rate, and the guest must choose the final rate after an exact comparison.

Supplier evidence captured July 19, 2026 shows why this requires a rule registry:

- [MSC Senior Club](https://www.msccruisesusa.com/cruise-deals/cruises-for-seniors) currently requires every guest sharing the stateroom to be age 65 or older and requires date of birth during booking.
- [Royal Caribbean special pricing](https://www.royalcaribbean.com/sgp/en/faq/questions/qualifications-special-pricing) currently describes senior rates for guests age 55 or older on selected sailings and requires at least one qualifying guest per stateroom for a discounted program.
- [MSC military pricing](https://www.msccruisesusa.com/cruise-deals/military-discount-rates) currently lists active and retired U.S./Canadian military, specified service groups, some government/civil-service/interline personnel, and defined family relationships, with organization ID required and capacity/combinability restrictions.
- [Carnival military pricing](https://help.carnival.com/app/answers/detail/a_id/2856/kw/cruises%26) currently uses different eligibility and proof rules, including short post-booking proof deadlines. Royal Caribbean separately lists qualifying honorably discharged veterans under its own conditions.

These pages are evidence for the model, not permanent application constants. Supplier terms can change, promotional rate codes can be sailing-specific, and even supplier-owned pages may describe combinability differently. Each rule therefore needs a source URL, market, supplier, captured time, effective window when known, reviewer, and version.

**Age-based flow**

1. Calculate each traveler's age on the sailing date from the confirmed date of birth. Store the calculation version and sailing date used.
2. Evaluate the current supplier rule at both traveler and cabin level. Some rules require one qualifying occupant; MSC Senior Club currently requires all occupants to qualify.
3. Tell the guest once: `We'll automatically check age-based rates for everyone.` Do not ask `Are you a senior?` or require a self-label.
4. Mark the result only as `candidate` until a live rate exists for the sailing and cabin.

**Military, veteran, and service-related flow**

Ask one optional question after identities/residency:

> Could anyone in your party qualify for a military, veteran, or service-related cruise rate?

Offer large single-choice answers: `Yes`, `No`, and `Not sure - check with my agent`. If `Yes`, ask only:

- which traveler may qualify;
- broad category: active duty, retired military, veteran/honorably discharged, Reserve/National Guard, Canadian Armed Forces, Department of Defense/government/civil service, first responder, airline/interline personnel, eligible family member, or other/not sure; and
- proof readiness: available later, need help, or not sure.

This is a claim, not a verified entitlement. Never imply that every veteran qualifies with every cruise line. Do not ask for a service number, military ID number, discharge details, disability percentage, document image, or DD214 upload in the pilot. If a supplier requires proof, the operator presents the exact current requirement and uses an approved supplier/agency document path outside ordinary chat and analytics. A future secure-upload feature requires its own authorization, encryption, retention, redaction, and deletion review.

**Live comparison and guest approval**

For every plausible qualifying rate, create a normalized `RateCandidate` containing:

- supplier rate code/label and captured-at time;
- qualified traveler and cabin mapping;
- complete total including taxes/fees and the comparable ordinary-rate baseline;
- deposit and payment schedule;
- cabin/category inventory;
- cancellation/change rules;
- included benefits, credits, drinks, Wi-Fi, or other materially different value;
- combinability/exclusivity result;
- proof type, presentation channel, and deadline when the supplier exposes them; and
- verification status and rule/source version.

The deterministic comparison must retain the best ordinary promotion as a baseline. During the call, the operator presents a small set such as `Lowest total`, `Military/service rate`, and `Standard promotion with benefits`, with exact differences. Never choose a special rate merely because its label contains a discount or percentage. The caller selects the rate; the operator revalidates it in the same fresh session before application. Preserve the reason when a special rate is unavailable, unverified, non-combinable, or worse.

For future multi-cabin trips, qualification is mapped per cabin and per qualifying occupant. Never assume one eligible traveler automatically qualifies every cabin; supplier rules differ.

### 7.4 Side questions without losing position

**Ask a question** opens a simple overlay or bottom sheet above the current task.

Rules:

- preserve the active field and unsent value;
- answer in one to three short sentences;
- use approved Deal facts, current pricing context, and Cruise Brothers knowledge;
- say when the answer is unknown;
- never change a confirmed booking value because of a side question;
- close back to the exact task and scroll position;
- offer human help for policy, accessibility, legal, or uncertain pricing questions.

### 7.5 Voice and text switching

Use the hybrid pattern:

`microphone -> speech-to-text -> same booking orchestrator -> typed response -> text-to-speech`

Do not run a separate voice-only booking brain.

Voice interaction rules:

- microphone starts only after a guest tap and browser permission;
- show obvious `Listening`, `Thinking`, and `Speaking` states;
- allow barge-in and a large Stop button;
- display the transcript immediately;
- show the interpreted value in an editable confirmation card;
- save only after confirmation;
- keep text input available as a one-tap fallback;
- never drop queued speech because another turn is processing;
- do not speak sensitive values back unless the guest explicitly requests it.

High-risk fields should use secure deterministic forms by default, not an LLM transcript. See Section 11.

### 7.6 Continue later and resume

After the guest confirms a valid email address, show a persistent secondary button labeled **Continue later** beside the primary **Continue** action. Its nearby helper text is `We'll save your confirmed answers and email you a secure link every 3 days.`

`Continue later` behavior:

1. Transactionally save every already-confirmed answer, the current draft version, the current task ID, and the next valid task ID.
2. Never silently accept text that is merely present in the current input. If it is valid but unconfirmed, ask one focused question: `Save this answer too?` If it is invalid or incomplete, leave it unfinished without blocking the pause.
3. Set `paused_by_guest`, close the active guest-edit lease, and arm or update the one `continue_later_v1` reminder program for this draft.
4. Send one immediate save receipt with a secure resume link. This receipt is not one of the recurring reminders.
5. Show a confirmation screen with the saved completion percentage, the next unfinished task, the first reminder date, one primary `Continue now` action, and quiet `Change email reminders` / `Stop reminders` links.
6. Make no claim that price, promotion, category, or cabin is held. State that all live details will be checked again.

Do not rely on the page remaining open. The same result must occur if the guest closes the browser after the pause confirmation is committed.

Resume behavior:

1. A one-time email token is exchanged for an HTTP-only session cookie.
2. The browser is redirected to a clean URL without the token.
3. The assistant validates the Deal before showing a still-bookable message.
4. The assistant loads the saved summary and returns to the exact next valid task. If flow rules changed, it explains the newly required task rather than restoring an invalid pointer.
5. Any unsent low-risk browser draft is offered for recovery; sensitive unsent values are not kept in local storage.
6. An email open pixel does not count as activity. A link click suppresses a send while the guest is active, but only a confirmed answer or explicit reminder action moves the next three-day due date.

### 7.7 More Options action matrix

| Available when | Actions |
| --- | --- |
| Always | Ask a question, switch voice/text, view progress, privacy and data use. |
| Email captured, before fallback-key issuance | Continue later, email my resume link, change/stop reminders. `Continue later` is also visible outside this sheet. |
| Phone captured | Get help now, ask for a callback. |
| Passenger count known | Jump to a specific traveler, adjust travelers. |
| Traveler identities known | Review or update savings eligibility; explain that age-based rates are checked automatically. |
| Some fields complete | Review what you have, request help, mark a non-blocking item `I don't have this yet`. |
| Guest-review ready | Review all details, correct an answer, confirm storage/call handoff. |
| Ready to call/key issued | Call agent to finalize, Copy key, Read key aloud, Call later, resend ready-to-call email, review/correct saved information. |
| Agent is processing | View call/processing status, provide a requested correction, or call back with the same key. No payment fields appear in Leisure Life. |
| Deal/package is no longer eligible | Keep my saved details, ask for similar options, request a callback, cancel/delete according to retention policy. |

Unavailable actions are hidden rather than disabled unless hiding would make the state confusing.

### 7.8 Progressive option registry and future-proofing

Do not hard-code a growing button list into individual screens. Define options in a versioned registry with:

- stable action ID and user-facing label;
- applicable statuses, task types, supplier capabilities, and actor;
- whether it is primary, visible secondary, or inside More Options;
- preconditions and the plain-language outcome shown before selection;
- state transition, audit event, return-task behavior, and cancellation behavior;
- whether confirmation is required;
- feature flag and minimum flow-definition version.

Design now for these likely later options:

| Option | When it helps | Guardrail that prevents confusion or rework |
| --- | --- | --- |
| `I don't have this yet` | Guest lacks a loyalty number or other deferrable answer. | Only optional or safely deferrable tasks can move to the end; required checkout fields remain visibly outstanding. |
| `Review or change an answer` | Guest notices a mistake. | Return to the same point afterward and re-open dependent answers only when the changed value invalidates them. |
| `Continue on another device` | Guest wants a larger screen or help from their own second device. | Send only a Leisure Life secure resume link; never send raw `brn` state. |
| `Ask another traveler for their details` | One adult should supply their own legal information. | Future scoped invite grants access only to that traveler record, expires, and requires the primary guest to review completion. |
| `Have my agent continue` | Guest prefers human completion. | Move the full confirmed packet into the operator queue; do not make the guest repeat answers. |
| `Schedule a call` | Immediate help is unavailable. | Offer real availability windows and timezone; do not promise an instant response. |
| `Pause or change reminders` | Guest needs more or less time. | Change only the reminder program, not the booking draft or marketing consent. |
| `Choose a different cabin or fare` | Live inventory or price changed. | Present exact differences and require a new explicit decision; never auto-substitute. |
| `Review savings eligibility` | Guest remembers military/service eligibility or wants to correct the qualifying traveler/category. | Return to the one qualification task, invalidate dependent live rate candidates, preserve unrelated answers, and require a new live comparison. Never request proof in the ordinary assistant. |
| `Consider a similar sailing` | Original Deal expired or became unavailable. | Preserve the profile but create a reviewed replacement draft with new attribution and pricing; never silently rewrite the original. |
| `Cancel this booking attempt` | Guest no longer wants to proceed. | Stop reminders immediately and explain whether saved information will be retained or deleted. |
| `I already booked` | Guest completed by phone, another device, or another agent. | Stop reminders immediately and place the draft into reconciliation review; do not mark confirmed without authoritative evidence. |
| `Delete my saved information` | Guest wants a privacy exit. | Separate from cancel, require confirmation, and run the approved deletion workflow. |
| `Accessibility or language help` | The standard interaction is difficult to use. | Change presentation/support mode without changing confirmed booking facts. |
| `Explain this choice` / `I'm not sure` | Fare, cabin, insurance, or supplier wording is unclear. | Explain only the live available choices, preserve the current task, and offer an operator without selecting for the guest. |
| `Use saved traveler details` | A returning guest wants less typing. | Show field-level freshness and confirmation; never silently reuse legal, residency, accessibility, or consent data. |
| `Share a read-only summary` | Guest wants a spouse or companion to review progress. | Use a separate expiring, redacted view token with no edit or payment access. |
| `Add another cabin or a linked reservation` | Party no longer fits the pilot shape. | Preserve the current draft and route to the parent/child cabin workflow or operator; never stretch one `brn` across cabins. |
| `Deposit or full payment` | The live supplier contract offers both. | Present the current schedule and exact charge only at completion; never infer the selection from affordability or a prior booking. |
| `Decide on insurance/add-ons later` | Supplier rules permit a post-booking choice. | Offer only when the live contract and operator procedure prove it can be deferred; otherwise require the explicit current decision. |
| `Save these travelers for a future trip` | Guest wants faster later bookings. | Separate post-booking profile consent from this draft and apply field-level retention/freshness rules. |

Option-presentation rules:

1. Keep **Continue** as the only primary action for the current task.
2. Keep **Continue later** as the one persistent secondary escape after email-field confirmation.
3. Show at most four context-relevant actions in More Options before `View all available help`.
4. Do not use two labels for the same outcome, such as `Pause`, `Save for later`, and `Take a break` simultaneously.
5. State the consequence before any action that releases live inventory, changes a decision, contacts an operator, cancels, or deletes data.
6. Preserve a deterministic return pointer after questions, edits, device transfer, reminders, and human help.
7. The LLM may explain an available option but may not invent, enable, rank above a safety gate, or execute one outside the registry.

## 8. Mobile-first interaction specification

### 8.1 Layout

- Compact sticky header: back, Deal name, secure/saved status, Help.
- Small Deal summary card that can collapse after the first task.
- One primary task card in the center.
- One large input or a maximum of three tightly related inputs.
- Persistent progress text such as `Passenger details - 3 items left`.
- Sticky bottom action area with primary **Continue**, secondary **Continue later** after email-field confirmation, and More Options. Keep the visual hierarchy unmistakable and do not give all three equal weight.
- Ask-a-question control visually separate from the primary task.
- No dashboard chrome on the public flow.

### 8.2 Accessibility targets

- Minimum 48 by 48 pixel touch targets; prefer 56 pixels for primary actions.
- Minimum 18 pixel body/input text on mobile.
- Visible labels; placeholders are examples, not labels.
- High contrast in light and dark modes.
- Support 200 percent browser zoom and Dynamic Type without horizontal scrolling.
- Proper input modes for email, phone, numeric age, and dates.
- Screen-reader announcements for save, validation, listening, and task changes.
- Reduced-motion support.
- No timer that pressures the guest. Odysseus expiry is managed behind the scenes.
- Error copy must state what happened and what the guest should do next.

### 8.3 Prototype usability targets

Before backend expansion, test the prototype with at least five realistic mobile sessions.

Targets:

- start to saved contact in under 90 seconds;
- no participant needs explanation of voice/text switching;
- every participant can find human help within 10 seconds;
- side question returns to the correct field every time;
- accidental refresh loses no confirmed values;
- no screen presents more than one primary decision;
- every participant understands that Continue later saves confirmed answers but does not hold price or cabin;
- every participant can stop or change three-day reminders without cancelling the draft;
- every participant understands that tapping the call button places the saved draft at the top of the agent's screen before dialing;
- every participant can read/copy the three-letter fallback key and explain that it is needed only when automatic matching fails and is not a booking confirmation;
- every participant understands, before tapping the button, that the agent will start a fresh live booking, recheck price/cabin/discounts, take card information by phone, and complete the booking;
- every participant can identify **Call agent to finalize** as the only primary action on the completed screen;
- no participant sees more than four context-relevant More Options actions before requesting the full list;
- at least four of five participants can resume from email without coaching.

## 9. Deterministic workflow state

### 9.1 Draft lifecycle

| Status | Meaning | Allowed next states |
| --- | --- | --- |
| `started` | CTA opened; no verified contact yet. | `collecting`, `cancelled`, `abandoned` |
| `collecting` | Durable draft exists and fields are in progress. | `paused_by_guest`, `needs_guest`, `human_requested`, `review_ready`, `reconciliation_review`, `cancelled`, `abandoned` |
| `paused_by_guest` | Guest explicitly saved confirmed progress for later; no live Odysseus session is active. | `collecting`, `needs_guest`, `human_requested`, `review_ready`, `reconciliation_review`, `cancelled`, `abandoned` |
| `needs_guest` | A missing/changed answer is required from the guest. | `paused_by_guest`, `collecting`, `human_requested`, `review_ready`, `reconciliation_review` |
| `human_requested` | Guest explicitly requested help before finishing intake. | `agent_claimed`, `collecting`, `cancelled` |
| `review_ready` | Required intake fields and review acknowledgement are complete. | `ready_to_call_agent`, `paused_by_guest`, `needs_guest`, `human_requested`, `cancelled` |
| `ready_to_call_agent` | Reviewed packet and one active fallback key exist; no live Odysseus session exists. | `call_signal_pending`, `agent_claimed`, `needs_guest`, `cancelled`, `abandoned` |
| `call_signal_pending` | One idempotent call attempt is waiting for authenticated operator-dashboard receipt acknowledgement; dialing is not yet authorized. | `calling_now`, `ready_to_call_agent`, `cancelled` |
| `calling_now` | Guest completed the atomic call-intent signal and the draft is pinned for the operator; no connection or identity is implied. | `agent_claimed`, `ready_to_call_agent`, `needs_guest`, `cancelled` |
| `agent_claimed` | Authenticated operator matched the pinned draft or fallback key, verified the caller, and owns the draft lease. | `agent_processing`, `needs_guest`, `cancelled` |
| `agent_processing` | Operator is manually entering/revalidating the fresh live Odysseus session with the caller. | `needs_guest`, `payment_failed`, `reconciliation_review`, `booking_confirmed`, `expired` |
| `payment_failed` | Official payment attempt failed; no card data is stored in Leisure Life. | `agent_processing`, `needs_guest`, `cancelled`, `reconciliation_review` |
| `guest_completion_sent` | Future verified official guest completion request delivered/opened. Disabled in `call_agent_to_finalize_v1`. | `booking_confirmed`, `reconciliation_review`, `needs_guest`, `agent_processing`, `expired` |
| `reconciliation_review` | Completion is claimed or plausible but authoritative confirmation is not yet established. | `booking_confirmed`, `needs_guest`, `cancelled` |
| `booking_confirmed` | Booking reference or authoritative confirmation exists. | Terminal |
| `abandoned` | No explicit pause remains active and the draft passed the configured inactivity/retention rule. | `collecting`, `cancelled` |
| `expired` | Package/session can no longer be continued. | `collecting`, `cancelled` |
| `cancelled` | Guest or operator ended the draft. | Terminal |

All transitions must be implemented as an allowlisted state machine with actor, reason, timestamp, expected version, and idempotency key.

### 9.2 Flow definition

Create a versioned `deal_booking_completion` flow rather than altering generic `fast_booking`.

Each task definition contains:

- stable task ID;
- applicable supplier/market conditions;
- canonical field keys;
- dependency fields;
- required/optional rule;
- supported input modes;
- validation schema;
- confirmation policy;
- help copy;
- sensitive-data tier;
- More Options contributions;
- next-task resolver hint; and
- flow-definition version.

Code evaluates task conditions. AI can recommend presentation order among currently allowed tasks but cannot create a new canonical field or bypass a requirement.

## 10. Canonical booking data model

Do not treat `GUEST_INFO.json` as the booking schema without extension.

### 10.1 Draft metadata

- `bookingDraftId`
- `personId`
- `dealId`
- `packageId`
- `siid`
- `status`
- `urgency`
- `flowDefinitionVersion`
- `bookingFlowVersion`
- `completionMode`
- `completionModeVersion`
- `completionCapabilitySnapshot`
- `completionModeSelectedAtIso`
- `completionFallbackReason`
- `packetVersion`
- `callDisclosureVersion`
- `callKeyVersion`
- `callKeyState`
- `callKeyIssuedAtIso`
- `callKeyExpiresAtIso`
- `readyToCallAtIso`
- `callLaunchRequestedAtIso`
- `activeCallAttemptId`
- `callIntentExpiresAtIso`
- `odysseusContractVersion`
- `createdAtIso`
- `updatedAtIso`
- `lastGuestActivityAtIso`
- `lastMeaningfulGuestActivityAtIso`
- `lastOperatorActivityAtIso`
- `lastConversationAtIso`
- `currentInteractionSessionId`
- `journalSequence`
- `lastJournalEventAtIso`
- `pausedAtIso`
- `pausedFromStatus`
- `resumeTaskId`
- `version`
- `attribution`
- `assignedOperatorId`
- `claimLeaseExpiresAtIso`
- `completionSummary`
- `nextTaskId`

### 10.1.1 Fallback call-key record

- exact-match server-side HMAC/digest used by the authenticated lookup index;
- key version, state (`active`, `revoked`, `consumed`, or `expired`), issued/expiry/closed times;
- current `packetVersion` and call-disclosure version;
- issuance/rotation/closure actor and reason;
- no raw key in ordinary logs, analytics, URLs, push notifications, or general journal payloads; and
- raw display value available only in the authorized guest ready screen/transactional email generation path under the approved retention design.

The key is a locator, not authentication. Sensitive reveal still requires operator authorization, caller verification, and an audited reveal action.

### 10.2 Deal and price snapshot

- immutable Deal identity at entry;
- cruise line, ship, sailing, nights, itinerary, ports;
- displayed cabin/fare context;
- displayed price, currency, tax/fee basis, and captured-at time;
- source booking URL and link-health state;
- current observed total and payment schedule;
- material-change comparison result.

Never compare a base fare with a tax-inclusive total as though they were the same price basis.

### 10.3 Contact record

- first/preferred name;
- email;
- phone in E.164 form;
- preferred contact channel;
- email verification status;
- phone verification status if added later;
- transactional email consent record;
- callback consent record;
- SMS consent record, separate from phone capture;
- marketing consent record, separate from booking operations.

### 10.4 Traveler record

- stable traveler ID;
- primary traveler flag and relationship;
- adult/minor classification, derived age at sailing, calculation date, and calculation-rule version;
- title and supplier-required gender value;
- exact confirmed legal first, middle, last, suffix;
- date of birth;
- nationality/citizenship;
- residency country and state/province;
- address fields;
- email/phone only when required;
- past-passenger/loyalty data;
- rate-qualification claims with type, broad category, source, claim status, proof-readiness status, rule version, and confirmed time; no proof document or credential number;
- accessibility/service needs;
- field-level status, source, confirmation, and updated time.

### 10.5 Cabin record

- stable cabin ID;
- assigned traveler IDs;
- category/fare/cabin preferences;
- exact selected category, rate, and cabin when known;
- qualifying traveler IDs and versioned cabin-level qualification results;
- normalized live rate candidates, ordinary-rate baseline, selected rate-candidate ID, savings/value comparison, and not-selected reasons;
- proof-requirement snapshot and verification status for the selected rate;
- price snapshot;
- accessibility requirement;
- selection confirmation time.

One cabin is one booking transaction unless Cruise Brothers proves otherwise. Multi-cabin parties route to the operator in the first pilot.

### 10.6 Decisions and consents

- booking-contact profile ID and configuration version (system-owned, not guest-entered);
- services decision set;
- add-on decision set;
- travel-insurance decision and disclosure version;
- passenger-data review confirmation;
- permission to store the reviewed packet and expose it to an authenticated operator through the call-intent/fallback-key workflow;
- call-finalization disclosure version and acknowledgement/tap evidence;
- price/cabin change confirmations;
- qualifying-rate comparison presented version and explicit selected-rate confirmation;
- terms presented version;
- selected completion mode acknowledgement;
- confirmed payment amount/schedule instruction when known;
- required terms/authorization evidence recorded by the approved operator procedure.

The Leisure Life assistant must not record acceptance of Cruise Brothers terms on the guest's behalf. Final supplier terms remain on the supplier-controlled surface.

### 10.7 Field status contract

Each canonical field has:

- `status`: `missing`, `proposed`, `confirmed`, `stale`, `not_applicable`, or `blocked`;
- `source`: guest form, guest voice, guest chat, imported profile, operator, or Odysseus;
- `confidence`: useful only for proposed AI extractions;
- `confirmedBy`;
- `confirmedAtIso`;
- `lastUpdatedAtIso`;
- `sensitiveTier`;
- `supplierMappings`;
- `validationErrors`;
- `revision`.

Only `confirmed` and still-applicable values may be sent to Odysseus.

### 10.7.1 Versioned rate-qualification rule registry

Keep supplier-specific qualification logic out of UI components. Each `RateQualificationRule` records:

- supplier, sales market, residency scope, sailing/promotion scope, and effective window;
- qualification type and supplier rate code when known;
- age threshold and whether one or every cabin occupant must qualify;
- allowed service/employment/family categories and required occupant relationship;
- cabin-count extension rules;
- combinability/exclusivity rules;
- accepted proof classes, proof channel, and deadline without storing the proof itself;
- authoritative source URL or captured Odysseus contract reference;
- captured/reviewed times, reviewer, rule version, and current confidence/status.

Unknown or stale rules produce `needs_operator_verification`; they never default to eligible or ineligible. A marketing label such as `Military Rate` is evidence that a candidate should be inspected, not sufficient proof of qualification, savings, or availability.

### 10.8 Booking Activity Journal

The Booking Activity Journal is the canonical chronological account of the booking journey. It must answer, for any draft and point in time:

- what the guest was shown;
- what meaningful action the guest took;
- what the guest and assistant/operator said in supported digital channels, or the clearly labeled outcome/summary for an unrecorded call;
- which task, field, option, or booking stage was active;
- what changed in durable state and who caused it;
- what validation, delivery, supplier, or system result occurred;
- whether the guest was waiting, confused, blocked, inactive, or transferred to a human; and
- what the next expected action was.

Every journal event uses a versioned envelope:

- `journalEventId` and `eventSchemaVersion`;
- `bookingDraftId`, `personId` alias, Deal/package attribution, and flow version;
- `occurredAtIso`, `receivedAtIso`, and monotonic sequence within the draft;
- `actorType`: `guest`, `assistant`, `operator`, `system`, `email_provider`, `odysseus`, or `reconciliation`;
- protected `actorId` when applicable;
- `channel`: form, text, voice, email, callback, operator UI, worker, or supplier;
- `eventType`, `outcome`, and privacy-safe reason/error code;
- `sessionId`, `interactionId`, `correlationId`, `causationEventId`, and idempotency key;
- current stage, task ID, option/action ID, field key, and draft status before/after when applicable;
- `contentRef`, `fieldRevisionRef`, or supplier-execution reference instead of copying sensitive values;
- device class, browser family, viewport class, locale, network state, and accessibility mode without fingerprinting;
- duration/wait time when measurable;
- `privacyClass`, redaction result, retention class, and payload integrity hash.

Journal coverage includes:

1. **Guest interface:** funnel entry, page/session start and end, task/option presented, section viewed, meaningful control selection, validation error, field proposed/confirmed/corrected/deferred, question opened, Continue later, resume, reminder preference, help request, cancel/delete request, and inactivity timeout.
2. **Conversation:** every guest text turn, assistant response, side question, clarification, refusal/uncertainty, escalation, operator message, and channel transition, subject to the transcript policy below.
3. **Voice:** permission result, listening/processing/speaking states, interruption, fallback, sanitized transcript turn, proposed interpretation, correction, and confirmation. Raw microphone audio is not retained by default.
4. **Email/reminders:** template/version, scheduled window, send claim, provider acceptance, delivery, bounce/suppression, open, link click, token exchange, preference change, retry, and stop reason. An open is observable but is not treated as guest intent or booking progress.
5. **Operator activity:** call-intent receipt/pin/expiry, fallback-key lookup, masked match, caller-ID comparison, caller verification, queue/detail view, claim/release, sensitive-field reveal, call attempt/outcome, note, guest contact, field edit, agent-processing start, live-choice approval, completion checkpoint, booking-reference entry, and cancellation/deletion action.
6. **Odysseus/worker:** session creation/expiry, page/contract version, qualification rules evaluated, normalized rate candidates compared, proof requirement presented, choices shown, guest approval reference, mutation class, safe apply, validation result, price/cabin/rule diff, contract drift, timer state, last safe checkpoint, and sanitized completion/reconciliation result.
7. **System/security:** state transition, lease conflict, authorization denial, concurrency conflict, token issue/consume/revoke, reminder suppression, redaction/quarantine action, retention/deletion job, and integration failure/recovery.

Tracking completeness does not mean indiscriminate surveillance. Do not capture individual keystrokes, mouse coordinates, clipboard contents, raw DOM/HTML, unrestricted screenshots, payment-page activity, card data, passwords, cookies, ViewState, microphone audio, or third-party session-replay video. A structured journey replay built from the journal is the approved default.

Each state-changing command and its resulting journal event must commit transactionally when possible. Read-only client observations may arrive asynchronously, but they are schema-allowlisted, rate-limited, deduplicated, and never trusted as authoritative state changes.

## 11. Sensitive-data policy

| Tier | Examples | Allowed collection path | LLM/transcript policy |
| --- | --- | --- | --- |
| A - operational contact | First name, email, phone, guest count, broad ages | Secure form; voice/text allowed with confirmation | May be used only when needed; redact from logs. |
| B - booking PII | Legal names, date of birth, home address, nationality, residency, broad military/service qualification claim | Secure deterministic form by default | Do not send to the LLM in the first release. Store only status/field keys in conversation context. Aggregate analytics may use only a coarse, de-identified qualification type. |
| C - highly sensitive travel data | Accessibility/medical needs, passport, redress, known-traveler data, military/service proof documents or credential numbers | Dedicated secure form only if required | Never place in chat prompts, voice transcripts, analytics, push notifications, or ordinary logs. Special-rate proof is not collected by Leisure Life in the pilot. |
| D - payment | Card number, CVV, bank details, payment form values | Cruise Brothers-controlled surface only | Never collect, store, proxy, log, or transcribe. |

### 11.1 Conversation and recording policy

Preserve the complete conversational story without turning the transcript into a second PII database:

- Store each guest, assistant, and operator turn separately with actor, channel, timestamp, active task, reply-to turn, delivery state, topic, intent, resolution, escalation state, and redaction annotations.
- Normalize every supported text, voice-transcript, operator-message, and future inbound email/SMS turn through the same message envelope. Inbound channels must use a protected draft correlation alias; unmatched messages enter operator triage and are never attached by guesswork.
- Persist the exact allowed conversational wording for ordinary questions and Tier A interactions in the protected conversation store. Analytics receives topic/outcome classifications and counts, not raw text.
- Run deterministic input classification/redaction before conversation persistence and before any LLM request. If a guest types or speaks Tier B/C data in a free-form channel, replace the transcript content with a typed placeholder such as `[sensitive traveler detail provided]`, quarantine it from analytics/LLMs, and move the confirmed value only into its canonical encrypted field through the secure workflow.
- Never persist Tier D content. If payment-like content reaches a Leisure Life input unexpectedly, discard/quarantine the request, show a warning to use only the official payment surface, and emit a content-free security event.
- Record assistant model/provider, prompt-template version, knowledge/skill version, response latency, tool/action IDs, and outcome. Do not persist a reconstructed prompt containing protected values.
- Record the exact privacy-safe email/SMS copy version the guest was sent, along with provider state, so the operator can see what communication preceded a response.
- Raw voice audio and operator-call audio are off by default. Future call/audio recording requires a separate approved capability, jurisdiction-aware consent procedure, restricted storage, and retention policy; a call outcome and operator summary remain journaled without recording audio.
- If a channel is not captured verbatim, such as an unrecorded phone call, label it explicitly as `operator_summary`; never present the summary as a full transcript. Outbound email must either support correlated reply capture or plainly direct the guest back to the secure assistant instead of implying that unmonitored replies are part of the conversation.
- Operator notes are timestamped, attributable, append-only by revision, and visibly distinguished from guest statements and system facts.

### 11.2 General controls

Additional controls:

- DynamoDB server-side encryption plus application-level envelope encryption for Tier B/C values.
- AWS KMS key scoped to Booking Assistant service roles.
- HMAC-normalized email/phone lookup keys; never use raw PII as a DynamoDB key.
- No PII in URLs, query strings, analytics, error monitoring, or Pushover messages.
- Redacted structured logging with an explicit field allowlist.
- Operator audit trail for every reveal, edit, export, and Odysseus submission.
- Journal access and conversation-content reveal are separately audited; viewing the timeline does not automatically reveal protected field values.
- Abandoned Tier B/C data deleted after the approved retention period.
- Post-booking retention reduced to what is genuinely needed for service and future bookings.
- Guest access, correction, and deletion workflow.
- Privacy policy and consent copy updated before real PII collection begins.

Recommended retention default pending business/legal approval:

- unverified starts: 24 hours;
- abandoned drafts with verified email: 90 days;
- ephemeral Odysseus execution state: no longer than 30 minutes after expiry/closure;
- structured journal/audit metadata: one year with PII removed;
- protected conversation content: 90 days for abandoned drafts and up to one year for confirmed/operator-serviced drafts, pending approval; then delete the text while retaining de-identified topic/outcome aggregates;
- raw voice/call audio: not retained because recording is disabled in the pilot;
- de-identified aggregate analytics: retain under the approved analytics policy without a reversible person/draft identifier;
- reusable guest profile: retained only with disclosed purpose and deletion controls;
- Tier C values: delete as soon as operationally unnecessary.

## 12. DynamoDB design

Use one dedicated table: `lll-booking-assistant`.

### 12.1 Item layout

| PK | SK | Purpose |
| --- | --- | --- |
| `DRAFT#<id>` | `META` | Status, Deal snapshot, completion, assignment, version. |
| `DRAFT#<id>` | `CONTACT` | Encrypted contact and consent data. |
| `DRAFT#<id>` | `TRAVELER#<id>` | Encrypted traveler record. |
| `DRAFT#<id>` | `CABIN#<id>` | Cabin assignment and selection. |
| `DRAFT#<id>` | `DECISIONS` | Insurance, add-on, review, and completion-mode decisions. |
| `DRAFT#<id>` | `EVENT#<time>#<id>` | Append-only Booking Activity Journal event envelope and privacy-safe payload. |
| `DRAFT#<id>` | `SESSION#<time>#<id>` | Guest/operator interaction-session summary, device class, active interval, and last task. |
| `DRAFT#<id>` | `MESSAGE#<time>#<id>` | Protected sanitized guest/assistant/operator conversation turn referenced by the journal. |
| `DRAFT#<id>` | `FIELDREV#<field>#<revision>` | Encrypted field-revision metadata/value history under field-tier access rules. |
| `DRAFT#<id>` | `CALL#<time>#<id>` | Call request/attempt/outcome and operator summary; no audio in the pilot. |
| `DRAFT#<id>` | `EXECUTION#<id>` | Encrypted short-lived Odysseus execution state and worker outcome. |
| `DRAFT#<id>` | `NOTIFICATION#<id>` | Reminder/completion notification state and idempotency. |
| `DRAFT#<id>` | `CALL_KEY` | Three-letter fallback-key version/state, lookup-digest reference, packet version, issuance/rotation/consumption metadata; no public lookup capability. |
| `CALLKEY#<hmac>` | `DRAFT#<id>` | Exact-match active-key alias for authenticated operator fallback lookup; contains no raw key or PII. |
| `PERSON#<id>` | `PROFILE` | Reusable, consented encrypted guest profile and freshness metadata. |
| `CONTACT#<hmac>` | `PERSON#<id>` | Contact-to-person alias without raw PII. |

### 12.2 Indexes

- GSI 1: active operator queue by status/urgency and updated time.
- GSI 2: drafts by person and most recent activity.
- Do not create a global raw-email or raw-phone index.

### 12.3 Write rules

- Conditional writes on `version` prevent guest/operator/multiple-tab overwrite.
- Every mutation requires an idempotency key.
- Authoritative state mutation, field revision, and journal result event occur transactionally when possible.
- A failed journal/audit write fails a sensitive state mutation rather than creating unobservable state.
- Journal corrections append a superseding event; they never rewrite history.
- Client observation events are allowlisted and rate-limited. They cannot create state transitions or field revisions.
- PII-free analytics projections are asynchronous and deduplicated by `journalEventId`; projection failure never deletes or rewrites the canonical journal.
- Notification jobs use a stable key such as `draftId:notificationType:scheduledWindow`.
- Final packet persistence, active-key alias creation, fallback-key metadata, and journal result are one transaction. A retry returns the same active key and packet version.
- Key rotation transactionally revokes the old alias before enabling the replacement. The key HMAC uses a dedicated rotatable secret and constant-time exact-match comparison.
- `begin-call` conditionally moves `ready_to_call_agent` to `call_signal_pending`, writes one `CALL` attempt and journal chain, and publishes one idempotent operator signal. Only an authenticated online-dashboard acknowledgement for the same `callAttemptId` moves it to `calling_now` and returns permission to launch `tel:`. Publish-only acknowledgement is insufficient. Timeout returns it to ready without deleting the draft or key.
- TTL applies to resume-token, execution, and unverified-start items, not the durable draft by accident.

### 12.4 Continue-later reminder program

Store at most one canonical booking-progress program per draft rather than pre-creating an unbounded series of jobs. Before fallback-key issuance its type is `NOTIFICATION#CONTINUE_LATER`; after key issuance it is transactionally replaced by `NOTIFICATION#CALL_TO_FINALIZE`. The two programs are mutually exclusive. It contains:

- `programVersion` and `generation`;
- `state`: `armed`, `suppressed_active`, `suspended_limit`, `stopped`, or `completed`;
- `cadenceHours`, default `72`;
- `nextDueAtIso`, `lastSentAtIso`, and `lastEvaluatedAtIso`;
- `sentCountInGeneration` and `maxSendsPerGeneration`;
- `lastMeaningfulGuestActivityAtIso`;
- `timeZone` and allowed local send window;
- `suppressionReason` and `stoppedReason`;
- `emailPreferenceVersion`; and
- optimistic `version` for conditional send claims.

Queue messages contain only the draft ID, reminder-program generation, scheduled window, and idempotency key. The program record remains authoritative.

### 12.5 Journal projection pipeline

Use the DynamoDB journal write stream or an equivalent durable change stream:

`protected EVENT/MESSAGE write -> schema/redaction projector -> de-identified analytics event -> aggregate dashboards`

Requirements:

- State changes wait only for their canonical journal transaction, not the downstream analytics system.
- The projector checkpoints stream position, deduplicates by `journalEventId`, and supports replay by schema/projection version.
- Projection rejects/quarantines unexpected properties and can never fetch Tier B/C field values merely because an event contains a `fieldRevisionRef`.
- Client observations carry a per-session sequence and may be submitted in bounded batches. Server events remain individual and authoritative.
- Projection failures go to a dead-letter path with alerting; the protected journal remains intact and replayable.
- Aggregate data never provides a path back to protected conversation content or a raw person/draft lookup.

## 13. Session, identity, and resume security

### 13.1 Guest identity

- Do not force Clerk signup at entry.
- Create an opaque anonymous guest session in an HTTP-only, Secure, SameSite cookie.
- Attach the session to the verified email after the resume link is used.
- Never trust a client-supplied `userId` or draft ID by itself.
- Require re-verification before displaying Tier B/C data on a new device.

### 13.2 Resume links

- One-time, short-lived, signed opaque token.
- Store only a token hash and expiration server-side.
- Exchange token for a cookie, invalidate it, and redirect to a clean URL.
- Set a restrictive referrer policy so tokens cannot leak.
- Allow the guest to request a replacement token; revoke older unused tokens.
- Do not put email, phone, Deal title, `brn`, or booking data in the token payload or URL.

### 13.3 Operator identity and local-only access

The pilot has one operator and no production operator dashboard. Clerk is not required. The operator works only from the local development environment, while the guest funnel and its narrowly scoped public APIs run in production.

Provisioned local-operator infrastructure (July 20, 2026):

- AWS account/region: `622703699030` / `us-east-1`;
- DynamoDB table: `lll-booking-assistant` with on-demand billing, `GSI1`, `GSI2`, KMS SSE, and point-in-time recovery;
- KMS alias: `alias/lll-booking-assistant`;
- one-hour assumable role: `arn:aws:iam::622703699030:role/LeisureLifeBookingAssistantLocalOperator`;
- reproducible IAM policy documents: `infrastructure/booking-assistant/**`.
Required implementation:

- run the operator console only on the operator's managed computer and bind it to loopback (`localhost`), never `0.0.0.0`, a LAN address, a tunnel, or a public preview deployment;
- obtain short-lived AWS credentials through the approved AWS SSO/IAM operator role; do not store permanent AWS access keys in `.env.local`;
- give that role access only to the Booking Assistant table, required indexes, the specific KMS decrypt/encrypt operations, and the journal writes needed for operator actions;
- perform queue reads, exact fallback-key lookup, caller verification, protected-field reveal, claim/release, edits, and outcome writes server-side from the local process;
- copy no production draft or decrypted PII into a development database, fixture, browser persistence, analytics payload, terminal output, screenshot, or ordinary application log;
- require an audited caller-verification action before decrypting or rendering the full packet;
- use short-lived reveal state and remask the packet when processing ends, the claim expires, or the console is idle;
- fail closed when the AWS identity, role, KMS grant, table identity, environment marker, or loopback-host check is missing or unexpected.

The three-letter key, caller ID, a hidden route, `NODE_ENV`, and `VERCEL_ENV` are locators or deployment hints, not operator authorization. If the local console is ever replaced by an internet-accessible operator surface, that future surface requires a separately approved identity system and server-side authorization before it may read real drafts.

## 14. API surface

Keep business logic under `lib/booking-assistant/**`. Route handlers validate, authorize, and delegate.

To respect the Vercel function budget, consolidate handlers:

### 14.1 Public API handler

`app/api/booking-assistant/[...action]/route.ts`

Actions:

- `start`
- `snapshot`
- `record-observation`
- `confirm-field`
- `propose-from-text`
- `messages`
- `request-help`
- `send-resume`
- `continue-later`
- `update-reminder-preferences`
- `stop-reminders`
- `review`
- `issue-call-key`
- `ready-to-call`
- `begin-call`
- `resend-ready-to-call`
- `cancel`

Every mutation accepts `expectedVersion` and `idempotencyKey`. Authoritative command/result events are written server-side. `record-observation` accepts only a small versioned enum of non-PII UI observations, supports bounded batching, and cannot accept free-form payloads or cause state changes.

### 14.2 Resume handler

`app/api/booking-assistant/resume/route.ts`

- validates and consumes the one-time token;
- establishes the guest cookie;
- redirects to the clean draft route.

### 14.3 Local operator command adapter

Do not deploy `app/api/admin/booking-assistant/**` for the pilot. The local operator console calls the shared server-side booking service directly from the loopback development process using the short-lived AWS operator role. Production guest handlers never expose operator commands.

Local operator commands:

- `queue`
- `detail`
- `timeline`
- `conversation`
- `journey-replay`
- `acknowledge-call-intent`
- `lookup-call-key`
- `verify-caller`
- `claim`
- `release`
- `update-field`
- `request-guest-field`
- `send-resume`
- `start-agent-processing`
- `record-completion-checkpoint`
- `record-call-outcome`
- `send-guest-completion` (future verified modes only)
- `prepare-odysseus` (future automation only; disabled for launch)
- `status`
- `audit`

Timeline/conversation reads are paginated and journaled. Protected content reveal requires a separate verified-caller action and an active local operator claim. Analytics views use only de-identified projections. The adapter must refuse to start outside the explicit local-operator mode, refuse non-loopback requests, and verify the active AWS identity before any database read.

### 14.4 Worker API handler

`app/api/internal/booking-assistant-worker/[...action]/route.ts`

- service-authenticated task lease;
- heartbeat;
- sanitized progress report;
- versioned journal events for every worker checkpoint/action/result;
- contract-drift report;
- completion/failure report.

The public browser never receives agent cookies, raw hidden fields, or worker credentials. The launch flow does not invoke the worker; this handler exists only for a separately approved future automation phase.

## 15. AI responsibility boundary

### 15.1 AI may

- answer concise side questions using approved context;
- classify a guest request as answer, field proposal, navigation request, or human-help request;
- extract a proposed Tier A value from free text or voice;
- choose friendly wording for the next already-allowed task;
- recommend which currently available incomplete section may be easiest next;
- summarize progress for guest or operator without exposing sensitive values;
- flag uncertainty and suggest operator help.

### 15.2 AI may not

- define required fields;
- mark a legal or sensitive value confirmed;
- infer legal name, DOB, nationality, residency, accessibility, consent, or insurance choice;
- select fare, cabin, add-on, or insurance;
- accept supplier terms;
- decide that a price/cabin change is acceptable;
- construct hidden Odysseus values;
- execute a hold, reservation, or payment;
- write arbitrary fields into the booking record;
- put Tier B/C/D data into prompts or transcripts.

### 15.3 Structured output

Use a typed LLM response contract through the repo LLM Gateway:

- `message`
- `intent`
- `proposedFieldUpdates`
- `navigationRequest`
- `helpRequest`
- `confidence`
- `knowledgeCitations`

Validate against an allowlisted schema. Never parse `[Form: ...]` or other inline directives with regex. The server returns the actual form/task separately from assistant prose.

## 16. Odysseus contract adapter

Launch boundary: `call_agent_to_finalize_v1` does not create or automate an Odysseus session before the phone call. The authenticated agent manually starts a fresh session only after matching the pinned call intent or fallback key, verifying the caller, claiming the draft, and confirming that the caller is ready to continue. The remaining adapter/worker design in this section is future automation and a manual-agent checklist; it is not a launch dependency.

### 16.1 Just-in-time session creation

Do not create a live `brn` when the guest clicks Start booking, finishes review, receives a fallback key, opens an email, publishes a call-intent signal, or taps the phone link.

During the live finalization call, the agent may create the first/fresh `brn` only when:

- the package is still eligible;
- passenger count/ages/residency needed for session creation are confirmed;
- cabin/fare intent is known enough to proceed;
- the pinned call-intent draft or fallback call key resolves to a claimed draft and caller verification is recorded;
- the guest understands that live price, cabin, discounts, choices, terms, and payment will be handled during this call; and
- the agent is ready to keep processing promptly.

This minimizes expiry, stale price, and inventory side effects.

### 16.2 Working decision session

Yes: downstream availability and choices require a live Odysseus working session. Category, rate, cabin, dining, services, add-ons, insurance, and payment rules are not one static package payload. They are revealed sequentially from the current `brn`, browser cookies, submitted choices, passenger mix, residency, and supplier rules.
#### Temporary lock permission

Creating one normal Odysseus `brn` working session is allowed during careful testing or an active finalization call. Operator-observed behavior indicates that the session may temporarily lock the sailing/booking path for about 15 minutes and automatically releases when it expires.

This temporary lock is not treated as a prohibited durable hold. Guardrails:

- create one session per active test or booking/cabin draft;
- reuse it instead of opening replacements;
- avoid bulk, repeated, or parallel locks;
- log session creation, last activity, and expected expiry;
- stop before payment entry and final reservation/payment submission;
- allow the session to close/release promptly when work ends;
- escalate if a booking reference, named hold, durable reservation, or unclear inventory effect appears.


For launch, the agent uses the following as a manual call checklist. A future approved worker may automate only the already classified safe steps. Use one isolated decision session per booking/cabin and advance it through an explicit loop:

1. **Discover** the options rendered at the current page without inventing hidden state.
2. **Normalize** them into typed choices with rate code/label, comparable total, benefits, restrictions, qualification/proof requirements, source page, capture time, and short expiry.
3. **Filter** hard constraints such as occupancy, accessibility, connecting-cabin need, bed configuration, and verified rate eligibility.
4. **Compare and rank** the best ordinary promotion alongside every qualifying-rate candidate using total, payment schedule, rules, included value, and the guest's confirmed preferences.
5. **Present** a small shortlist plus View more, not the full Odysseus page.
6. **Confirm** the guest's exact choice.
7. **Apply** that choice to the same live session only after its mutation class is known and approved.
8. **Verify** the resulting page, total, rules, and next option set.
9. Repeat until the documented phone-payment/manual-submit boundary is reached while the caller remains present.

Important consequences:

- Collect party size, ages, residency, cabin count, accessibility requirements, and hard cabin preferences before creating the session.
- Derive age-based candidates from confirmed date of birth and sailing date. Carry military/service answers only as claims until the live rate and proof rule are verified.
- The existing category POST carries a rate code, but the current MSC capture does not yet prove how every senior/military/service candidate is exposed or selected. Phase 5 must capture and fixture the actual fare-code/category behavior before enabling automatic application.
- Do not try to precompute every cabin/dining/add-on combination. That creates branch explosion, stale prices, and possible inventory side effects.
- Category submission is stateful. Cabin submission is reservation-sensitive until Phase 0 proves the exact mutation boundary.
- Dining and later checkout choices may not exist until a specific cabin path reaches checkout. Treat the live rendered checkout contract as authoritative.
- Treat `Booking Contact Information` as a separate agent-profile namespace. During the call, fill it from approved server-side configuration and verify it before payment; never source it from the passenger or guest contact record by label similarity.
- Store normalized option snapshots and confirmed choice IDs durably; keep cookies, hidden form state, and `brn` encrypted and ephemeral.
- Preserve the ordinary-rate baseline and an explicit reason whenever a qualifying rate is not found, cannot be verified, is non-combinable, or loses the guest-approved comparison.
- Revalidate an option immediately before applying it. A displayed cabin is not guaranteed merely because it appeared in an earlier snapshot.
- Use one child decision session per cabin for multi-cabin travel. A parent journey coordinates the children; one `brn` must not be assumed to cover every cabin transaction.
- The operator claim lease serializes the launch session. A future worker additionally requires its own task lease before it may advance a decision session.

The ranking engine should be deterministic. AI may explain tradeoffs in guest-friendly language, but it may not decide which cabin, dining time, insurance option, fare rule, or add-on the guest accepts.

### 16.3 Completion-mode router

The router controls the public handoff after the common saved-packet stages. It does not assume that a guest payment link exists.

For `call_agent_to_finalize_v1`:

1. persist the reviewed packet and issue/reuse its active fallback call key;
2. return the clear `ready_to_call_agent` guest screen with the required disclosure and **Call agent to finalize** action;
3. create no pre-call supplier session, timer, cabin selection, or inventory claim;
4. publish/pin the call intent before dialing, then let an authenticated operator match, verify, claim, and manually process the booking with the caller; and
5. accept only a protected call outcome and authoritative success/reconciliation result afterward.

For a future guest-transfer mode, generate or reveal a guest link only through an approved supplier capability adapter. A raw `checkout.aspx?brn=...` URL is never a durable link and must not be emailed or texted as payment access.

Every mode implements the same typed interface:

- `isApplicable(draft, supplierContract)`;
- `prepareCompletion(execution)`;
- `describeGuestExpectation()`;
- `getExpiryAndReissuePolicy()`;
- `getFallbackMode()`;
- `detectCompletion()`;
- `sanitizeAuditResult()`.

The completion router is deterministic and configuration-driven. The LLM cannot select or invent a completion mode.

### 16.4 Worker boundary

The future Odysseus worker is a separate controlled process, not a Vercel request handler. It is disabled for the launch call flow and must never be required to issue a fallback key, publish the call-intent signal, or present the call CTA.

Responsibilities:

1. Lease one task.
2. Load protected CB authentication.
3. Create/recreate the package booking session.
4. Capture the current rendered field contract.
5. Compare it with an approved supplier mapping.
6. Revalidate price, fare, category, cabin, and payment schedule.
7. Stop and report any material change.
8. Fill only confirmed canonical values into fields that exist.
9. Re-read validation and resulting page state after each submit.
10. Stop at the documented manual phone-payment boundary before card entry, terms acceptance, or final submit.
11. Return a sanitized result and destroy/expire execution state.

### 16.5 Prohibited worker behavior

- no dummy guest values in production;
- no `first()` category or cabin selection;
- no fabricated hidden fields or reused ViewState;
- no silent default for insurance or add-ons;
- no automatic acceptance of non-refundable fare warnings;
- no final submit;
- no card entry;
- no screenshots or HTML dumps containing guest values outside a protected, time-limited diagnostic mode;
- no shared `.playwright-state.json` copied into app storage or exposed to public APIs.

### 16.6 Contract drift

Each supplier mapping includes:

- captured field name/ID/`data-ody-id`;
- canonical field mapping;
- allowed option values;
- required/visible conditions;
- safe submit action;
- expected next page/state;
- mutation classification;
- fixture version and last verified date.

If a required live field has no approved mapping, the worker stops with `contract_drift`; it does not ask the LLM to guess.

### 16.7 Change policy

Always block for guest/operator confirmation when:

- total price increases;
- tax/fee basis changes;
- deposit/payment schedule changes;
- selected cabin becomes unavailable;
- fare becomes non-refundable or more restrictive;
- itinerary/sailing changes;
- insurance/add-on rules change;
- a new required legal field appears.

A price decrease is still shown before payment but does not require the same escalation unless another rule changed.

## 17. Operator Booking Queue

Add a **Bookings** tab to the local Deals workbench. Its browser requests terminate only in the loopback development process; that server-side process reads the protected production table using the short-lived AWS operator role. Do not deploy the queue, its commands, or its protected-data reveal surface to production.

Place a **Calling now** slot above the queue. The latest unexpired call-intent signal pins/opens its draft with a masked expected-caller summary and countdown. If multiple guests initiate close together, show an ordered mini-queue rather than silently replacing one. Beside it, provide exact fallback-key lookup. Key lookup is authenticated, rate-limited, abuse-monitored, and fully journaled. A signal, caller ID, or key is a locator, not authentication: the operator must verify the caller before revealing or using protected values.

### 17.1 Queue columns/cards

- guest first name or privacy-safe label;
- Deal, ship, and sail date;
- status and percent/section completion;
- urgency;
- last activity;
- missing-section summary;
- price/session warning;
- assigned operator;
- next recommended action;
- channel availability: phone/email.
- savings-qualification status: automatic age check, service claim, proof/verification blocker, and live rate-found indicator.
- call-intent/pin state, fallback-key state, packet version, ready-to-call age, and latest call outcome; never expose the raw key in broad queue exports or analytics.

### 17.2 Detail workspace

- Deal and current price snapshot;
- call-intent/pin, fallback-key lookup, caller-verification/claim state, and reviewed packet version;
- passenger/cabin progress with sensitive values masked until reveal;
- missing and blocked fields;
- complete redacted timeline;
- conversation and side-question history;
- email/reminder delivery history;
- Odysseus execution status and last safe checkpoint;
- current price/cabin differences;
- age/service qualification summary, rule/source version, proof readiness, live rate comparison, savings versus baseline, and reason a candidate was not selected;
- operator notes;
- explicit audit history.

The top of the detail workspace must answer **What is happening now?** without requiring the operator to read the whole history:

- current stage/status and exact active task;
- active channel/device class and whether the guest is presently active;
- last meaningful guest action and elapsed time;
- current blocker, most recent validation/error, and who owns the next action;
- latest Deal/price/cabin verification age;
- latest qualification-rule and rate-candidate verification age;
- operator assignment/lease and reminder/completion state; and
- recommended deterministic next step.

### 17.2.1 Timeline, conversation, and journey replay

Provide three synchronized views over the same journal:

1. **Timeline:** chronological event cards showing actor, channel, action, outcome, state/task change, elapsed wait, and safe before/after summary.
2. **Conversation:** threaded sanitized guest/assistant/operator turns with delivery state, reply relationships, active-task context, redaction markers, topic/outcome tags, and channel switches.
3. **Journey replay:** a structured reconstruction of the screen/task/option state and action sequence. It is not a pixel/video session replay and never reconstructs protected field values or the payment surface.

Filters include All, Guest actions, Conversations, Forms/fields, Voice, Email/reminders, Operator, Odysseus, State changes, Errors/blockers, and Security/access. Search is limited to allowed metadata and protected conversation search under operator authorization; it must not create a broad raw-PII index.

The workspace updates near-real-time from journal sequence checkpoints, visibly reports gaps/out-of-order late events, and allows an operator to add an issue classification or note without modifying historical events.

### 17.3 Operator actions

- claim/release draft;
- call guest;
- email secure resume link;
- send a link requesting only remaining fields;
- edit a field with source `operator` and required confirmation policy;
- mark guest response needed;
- accept the pinned calling draft or look up the caller's fallback key and show a masked match;
- record caller verification, then claim the draft;
- start `agent_processing` and open a fresh official Odysseus session manually;
- recheck and review price, cabin, rate qualifications, payment schedule, and supplier choices with the caller;
- start or continue the approved call-finalization checklist;
- record the manual completion checkpoint without recording card data;
- record call outcome, including disconnected, callback needed, declined, unavailable, payment failed, or completed;
- send an official guest payment request only when a verified future completion mode is enabled;
- record booking reference/confirmation;
- cancel/close with reason.

The launch mode is fixed to `call_agent_to_finalize_v1`. A future authorized operator may change to another verified `completionMode` only before phone processing/live Odysseus begins, or after that session has expired and the booking has been revalidated. Every change requires a reason and a current capability snapshot.

### 17.4 Concurrency and presence

- Claim lease prevents two operators from changing the draft at once.
- Guest remains able to add answers while claimed.
- Conflicting edits show a comparison; neither silently overwrites the other.
- The UI shows when the guest is active and when an operator is editing.
- Operator actions use optimistic concurrency and idempotency.

### 17.5 Side-by-side Odysseus workflow

For the initial implementation, open the controlled browser separately and show its sanitized checkpoint/status in the dashboard. Do not iframe or proxy the payment page.

If a future safe operator desktop integration is built, it must still keep payment entirely inside the official browser and outside Leisure Life capture.

## 18. Notifications and reminders

### 18.1 Operator urgency levels

| Level | Trigger | Delivery |
| --- | --- | --- |
| Informational | Booking flow started/contact saved | Dashboard only or batched summary. |
| Normal | Guest replies, draft becomes review-ready, reminder failure, price change | Dashboard plus normal push/email as configured. |
| Urgent | Guest taps Get help now | Pushover emergency priority with authenticated dashboard link, retry/expiry, and acknowledgement. |

Push notifications contain no DOB, address, accessibility data, full phone, or raw booking-session URL.

### 18.2 Guest reminder programs

Only one booking-progress reminder program may be active for a draft.

The Leisure Life application owns recurrence and eligibility. Klaviyo is a single-message renderer/transport for an already-authorized send; no Klaviyo flow, email-open event, click event, or delivery webhook may schedule the next Continue-later reminder.

Ordinary inactivity, when the guest has not selected `Continue later`:

1. Send the immediate resume email after contact capture.
2. Send one one-hour inactivity reminder.
3. Send one 24-hour reminder.
4. Send one 72-hour final reminder.
5. Stop the ordinary inactivity program.

Explicit `Continue later` supersedes and cancels the ordinary inactivity program:

1. Send an immediate save receipt.
2. Set the first reminder for 72 hours after the guest selected `Continue later`.
3. While the program is eligible, send the next reminder no sooner than 72 hours after the later of the last successful reminder or last meaningful guest activity.
4. Continue at the three-day cadence until authoritative booking completion or another stop condition occurs.
5. To prevent a configuration defect from creating an infinite email loop, use renewable capped generations. Recommended default: ten recurring reminders, covering 30 days. The tenth explains that automatic reminders will pause and offers `Keep reminding me every 3 days`. That explicit action starts a new generation; no response sets `suspended_limit` while preserving the draft under the retention policy.

Issuing the fallback key transactionally completes any pre-key program and starts the mutually exclusive `CALL_TO_FINALIZE` program:

1. Send one immediate `Ready to call` receipt with the fallback key in the email body, approved phone number/hours, exact finalization disclosure, secure resume link, and reminder controls.
2. If the guest chooses `Call later`, or remains ready without agent processing, send at most one reminder every 72 hours under the same capped-generation rules.
3. Never put the key in the subject line, URL, analytics parameters, push text, or provider metadata beyond the minimum authorized message body.
4. Stop/suppress while an operator has claimed the draft or `agent_processing` is active. A disconnected call may return to reminders only through an explicit operator or guest action.
5. Confirmation, cancellation, ineligibility, opt-out, deletion, hard bounce, or the generation ceiling ends/suspends the program exactly once.

The cadence and generation limit are configuration, not hard-coded UI assumptions. The guest can stop reminders or change the allowed cadence without cancelling the booking draft.

Before every send, conditionally claim the due window and re-check all of the following:

- the reminder program and generation still match the queued job;
- the draft is incomplete and not cancelled, abandoned, or pending deletion;
- no authoritative confirmation or plausible external-completion match is waiting for reconciliation;
- the Deal/package is still eligible for a truthful booking reminder;
- no `call_signal_pending`/`calling_now` attempt, operator claim, help request, live Odysseus execution, agent processing, or future guest-completion request is active;
- the guest-confirmed booking-progress email has not hard-bounced, been provider-suppressed, or opted out;
- no meaningful guest activity occurred inside the preceding 72 hours;
- the generation send ceiling has not been reached; and
- no other draft for the same person and Deal is already sending an equivalent reminder in that window.

Recurring sends occur inside the configured guest-local daytime window. If timezone is unknown, use a conservative account default until the guest confirms it. Enforce a contact-level throttle across all drafts so one person cannot receive several booking-progress messages on the same day; an eligible lower-priority draft waits for the next safe window.

Suppress or stop reminders when:

- the guest is actively editing; reschedule from the last meaningful confirmed action rather than sending mid-session;
- the operator claims the draft or help is requested;
- `call_signal_pending`, `calling_now`, live Odysseus execution, or any completion flow begins;
- the booking is authoritatively confirmed;
- the guest stops reminders, cancels, or requests deletion;
- the Deal/package becomes invalid, reaches the booking cutoff, or departs;
- email hard-bounces or the provider suppresses the address; or
- the current generation reaches its configured ceiling.

Guest-presence suppression is temporary and lease-based: after the active-session lease expires, return the program to `armed` with its due date calculated from the last meaningful action. Operator claim, help request, or live execution stops the program; releasing the draft does not silently restart it. The operator or guest must explicitly return it to guest follow-up. Terminal/ineligible states set `completed` or `stopped`; the generation ceiling sets `suspended_limit`.

An email open, provider webhook, analytics event, retry, or duplicate `Continue later` tap must never create a new reminder program or reset its counter. A repeated tap updates the existing program idempotently. A delivery retry reuses the same scheduled-window key and counts as one reminder only after provider acceptance.

Transport failure uses bounded retry with backoff and a dead-letter/alert path. It never advances the three-day schedule on failure and never creates a second reminder generation.

Before key issuance, each email contains one **Continue booking** CTA, a safe progress/remaining-section summary, the availability recheck warning, and links to change or stop reminders. After key issuance, each email contains one **Call agent to finalize** CTA plus the fallback key and phone expectation described above. Neither includes sensitive answers or implies that a price or cabin is held.

Each reminder gets a new one-time resume token. When a newer reminder replaces an older unused token, the older link must lead to a safe `This link has been replaced` page that can send a fresh link; it must never strand the guest or expose the draft.

Changing the booking-progress email increments `emailPreferenceVersion`, revokes outstanding tokens/jobs for the old address, confirms the new displayed address, and recalculates the next safe send. Merging duplicate drafts stops the superseded draft's program transactionally before the surviving program can send.

### 18.3 Communication consent

- Transactional booking-progress email is disclosed separately from marketing.
- Selecting `Continue later` explicitly arms booking-progress reminders and displays the cadence before commitment; it does not create marketing consent.
- Capturing a phone number does not authorize SMS marketing.
- Get help now records explicit callback consent and timestamp.
- SMS, if added, uses separate opt-in, STOP/HELP behavior, and quiet hours.
- The UI must display realistic response expectations based on operator availability. Do not promise an immediate call when no operator is available.

## 19. Completion and recovery rules

### 19.1 Expired `brn`

1. Keep the durable draft.
2. Mark the execution expired.
3. Recreate the booking session just in time.
4. Revalidate price, availability, fare/category/cabin, and rules.
5. Refill only confirmed values.
6. Require confirmation for material changes.
7. Resume at the last safe Odysseus checkpoint.

Never restore card fields from a draft or prior execution. If payment entry had begun, the approved Cruise Brothers procedure must collect the payment details again inside the official surface.

### 19.2 Package no longer available

- stop reminders that imply bookability;
- tell the guest plainly;
- alert the operator;
- preserve the draft;
- allow the operator to attach a replacement package only with the guest's review;
- never silently redirect to another sailing.

### 19.3 Booking completion

Do not mark a booking confirmed because operator completion started or because a future payment/completion link was sent or opened.

Confirmation requires one of:

- authoritative Odysseus success state plus booking reference;
- supported Cruise Brothers webhook/event;
- reliable read-only booking reconciliation;
- operator entry of a verified booking reference.

Once confirmed:

- stop reminders;
- write the booking-confirmed event once;
- trigger the existing booking-confirmed communication path;
- remove ephemeral execution state;
- retain only approved guest/profile data;
- show next-step support information.

## 20. Analytics and observability

### 20.1 Journal and analytics architecture

Use one event source with two deliberately different consumers:

1. The protected **Booking Activity Journal** preserves the per-draft operational history, authorized conversation content, causality, and audit evidence.
2. The **analytics projection** receives only allowlisted, de-identified dimensions/measures and powers aggregate dashboards, funnels, issue trends, and experiments.

Do not send raw journal payloads or conversation text directly to a general analytics vendor. Projection code strips person/draft identifiers or replaces them with short-lived non-reversible cohort keys, removes free text, buckets time/device/location fields, and records the projection/schema version.

Maintain an event registry/data dictionary defining the owner, producer, required properties, privacy class, retention class, allowed analytics dimensions, and expected preceding/following events for every event type. Unknown event types or payload properties fail schema validation rather than silently entering analytics.

Journal sequencing supports late/out-of-order observations while preserving authoritative server command order. Dashboards show projection lag and journal gaps. Target 100 percent coverage for state-changing commands and at least 99.9 percent accepted coverage for allowlisted client observations after offline retry/deduplication.

### 20.2 Required event taxonomy

The event registry includes, at minimum:

- `booking_assistant_opened`
- `booking_draft_started`
- `interaction_session_started`
- `interaction_session_ended`
- `page_viewed`
- `section_viewed`
- `navigation_performed`
- `client_connectivity_changed`
- `task_presented`
- `task_interaction_started`
- `task_completed`
- `task_abandoned`
- `option_menu_opened`
- `option_selected`
- `validation_failed`
- `validation_passed`
- `field_proposed`
- `field_confirmed`
- `field_corrected`
- `field_deferred`
- `rate_qualification_derived`
- `rate_qualification_claimed`
- `rate_qualification_needs_verification`
- `rate_qualification_verified`
- `rate_qualification_rejected`
- `rate_candidates_compared`
- `qualifying_rate_found`
- `qualifying_rate_not_available`
- `qualifying_rate_selected`
- `qualifying_rate_not_selected`
- `proof_requirement_presented`
- `guest_message_received`
- `assistant_response_presented`
- `operator_message_sent`
- `message_delivery_state_changed`
- `conversation_clarified`
- `conversation_escalated`
- `contact_captured`
- `resume_email_sent`
- `email_delivery_state_changed`
- `email_open_observed`
- `email_link_clicked`
- `continue_later_selected`
- `continue_later_receipt_sent`
- `reminder_program_armed`
- `reminder_sent`
- `reminder_suppressed`
- `reminder_preferences_changed`
- `reminder_program_suspended`
- `reminder_program_stopped`
- `draft_reactivated`
- `voice_started`
- `voice_permission_result`
- `voice_transcript_sanitized`
- `voice_interpretation_corrected`
- `voice_fallback_to_text`
- `voice_ended`
- `side_question_asked`
- `human_help_requested`
- `operator_claimed`
- `operator_draft_viewed`
- `operator_timeline_viewed`
- `operator_released`
- `operator_sensitive_field_revealed`
- `operator_call_attempted`
- `operator_call_outcome_recorded`
- `operator_note_added`
- `operator_field_edited`
- `state_transitioned`
- `review_ready`
- `booking_packet_reviewed`
- `fallback_call_key_issued`
- `fallback_call_key_reused`
- `fallback_call_key_rotated`
- `fallback_call_key_expired`
- `ready_to_call_presented`
- `ready_to_call_email_sent`
- `call_disclosure_presented`
- `call_launch_requested`
- `call_intent_signal_published`
- `operator_call_draft_pinned` (the authenticated receipt acknowledgement)
- `call_intent_signal_expired`
- `call_later_selected`
- `fallback_call_key_lookup_attempted`
- `fallback_call_key_lookup_result`
- `caller_verification_recorded`
- `agent_processing_started`
- `call_outcome_recorded`
- `fallback_call_key_consumed`
- `checkout_prepare_requested` (future automated modes only)
- `odysseus_session_created`
- `odysseus_recreated`
- `odysseus_session_expired`
- `odysseus_choices_presented`
- `odysseus_choice_approved`
- `odysseus_mutation_applied`
- `odysseus_validation_result`
- `odysseus_checkpoint_reached`
- `odysseus_contract_drift`
- `material_change_detected`
- `completion_mode_selected`
- `ready_for_completion` (future automated modes only)
- `operator_completion_started` (future automated modes only)
- `operator_completion_checkpoint_recorded`
- `guest_completion_sent`
- `guest_completion_opened`
- `external_completion_claimed`
- `reconciliation_review_started`
- `booking_confirmed`
- `draft_abandoned`
- `draft_cancelled`
- `deletion_requested`
- `journal_payload_redacted`
- `authorization_denied`
- `resume_token_issued`
- `resume_token_consumed`
- `resume_token_revoked`
- `concurrency_conflict_detected`
- `client_error_observed`
- `server_operation_failed`

Event metadata is allowlisted and contains no PII or free-form guest text.

### 20.3 Operational and product measures

Current-state dashboard:

- guests active now by Deal, flow stage, task, channel, and device class;
- drafts waiting on guest, operator, supplier, or system;
- drafts blocked by validation, missing information, material change, contract drift, or help response;
- time since last meaningful action and time owned by each actor;
- current reminder, live-session, and completion-mode state;
- recent error, confusion, escalation, and abandonment spikes.

Journey/product measures:

- landing CTA to saved contact conversion;
- saved contact to review-ready conversion;
- median time to saved contact;
- median time to review-ready;
- abandonment by task;
- error and correction rate by field;
- task exposure-to-start, start-to-confirm, defer, repeat-view, and abandonment rate;
- median/p90 task time and waiting time by owning actor;
- validation-loop and repeated-correction hotspots;
- option-menu opens, option selection, and return-to-task success;
- voice start/completion/fallback rate;
- side-question resolution versus human escalation;
- conversation topics, clarification turns, unresolved questions, operator escalations, and response latency using versioned privacy-safe classifications;
- channel/device switching and cross-device resume success;
- email resume return rate;
- Continue-later selection and return-to-booking rate;
- three-day reminder return and completion rate by reminder ordinal;
- reminder stop, suppression, hard-bounce, and generation-renewal rates;
- help-request response time;
- Odysseus recreation success rate;
- contract drift rate by supplier;
- review-ready to operator-claim latency;
- ready-to-call to call launch, operator claim, agent processing, and verified confirmation time;
- guest-completion open rate when a future guest-owned mode is enabled;
- review-to-key issuance, call-button-to-signal acknowledgement, operator pin latency, signal expiry/failure, normal matched flow versus fallback-key use, key lookup success/failure, ready-to-agent-claim time, call outcomes, dropped-call recovery, key rotation/recovery, and call-to-confirmed-booking conversion;
- verified booking conversion;
- conversion and friction by Deal, supplier, flow definition, option-registry version, completion mode, campaign attribution, device class, and experiment variant;
- qualification screening completion, candidate-to-live-rate success, verification failure, qualifying-rate selection, gross savings versus the ordinary baseline, and conversion impact by supplier/rule version using only coarse de-identified dimensions;
- zero-PII-log compliance.

Conversation topic/sentiment/confusion classifications run only on the sanitized allowed text or typed metadata and are analytical annotations, not facts about the guest. Store the classifier/version/confidence, permit operator correction, and never let an automated label change booking state or guest treatment.

### 20.4 Operational alerts

- urgent help not acknowledged within configured SLA;
- worker lease stuck;
- contract drift;
- repeated Odysseus authentication failure;
- reminder delivery failure;
- duplicate reminder claim for the same draft/window;
- more than one active reminder program for a draft or equivalent person/Deal pair;
- reminder sent after a terminal, operator-owned, or ineligible state;
- abnormal reminder-generation renewal or send volume suggesting a loop;
- ready-to-call or agent processing stalled beyond the configured service window;
- verified future guest-completion request expiry;
- completion capability snapshot no longer matches the enabled mode;
- unusually high task abandonment;
- PII redaction test failure;
- missing journal result for an accepted state-changing command;
- journal sequence gap, event-schema rejection spike, or analytics projection lag;
- protected content appearing in an analytics projection;
- abnormal client-event volume suggesting an instrumentation loop;
- conversation/field redaction or quarantine failure;
- journey replay state differing from the authoritative draft snapshot.

### 20.5 Operator analytics surfaces

Add four views under the protected Bookings workspace:

1. **Live Activity:** active guests, current task/channel, last action, current owner, blocker, wait time, and urgent help.
2. **Journey Analytics:** funnels, time/abandonment by task, validation/correction loops, Continue-later/reminder results, device/channel switching, and conversion by Deal/flow version.
3. **Conversation Insights:** privacy-safe question topics, unresolved/clarification rates, escalation causes, response time, and operator-corrected classification examples. Raw protected text is available only from an authorized individual draft, never from the aggregate dashboard.
4. **System Health:** journal coverage/gaps, schema rejections, projection lag, redaction/quarantine failures, integration errors, worker drift, and reminder-loop protection.

Every chart links back only to an authorized filtered draft list or de-identified cohort. Analytics filters must never expose a single guest through overly narrow segmentation.

## 21. Implementation phases

### Phase 0 - Complete the booking transport research

Current result: Passed for the `call_agent_to_finalize_v1` Option D pilot. Option C is retained only as research for a possible future fresh-start path.

Deliverables:

- sanitized MSC trace to visible payment;
- mutation-risk request map;
- clean-browser/cross-device handoff result;
- official payment-request capability result;
- completion-detection decision;
- MSC field-contract fixture and canonical mapping;
- pilot scope decision.

Exit gate:

- the agent-driven path reaches visible payment and the documented manual phone-payment boundary in repeated dry runs;
- clean-device Share-link behavior and its restart limitations are documented;
- last safe automation boundary is documented;
- no card data or real booking is submitted during research.

### Phase 1 - Interaction Flow Lab

Build first, before durable business logic:

- `/tests/deals-system/booking-assistant` prototype;
- mocked Deal and draft state;
- the Section 6A order of operations with only `call_agent_to_finalize_v1` enabled;
- contact bootstrap;
- large one-task forms;
- dynamic traveler tasks;
- automatic age-based candidate feedback and the optional military/service qualification task, including Yes/No/Not sure branches;
- text/voice switch using the hybrid path;
- editable voice confirmation;
- side-question overlay;
- More Options progression;
- Continue later, pause confirmation, reminder preferences, and exact-task resume simulation;
- human-help simulation;
- iPhone viewport and WebKit tests;
- operator preview panel showing collected/missing fields;
- final reviewed-packet save, stable mock three-letter fallback key, required call disclosure, atomic call-intent signal, `call_signal_pending`, authenticated mock dashboard acknowledgement, `calling_now`, **Call agent to finalize**, Copy key, Read key aloud, and Call later states;
- mocked operator Calling-now pin, signal expiry/mini-queue, fallback-key lookup, masked match, caller verification, claim, fresh-session start, call outcome, and confirmation states with no real Odysseus or payment action;
- mocked Activity Journal timeline, conversation view, and structured journey replay for every prototype action.

No real Tier B/C PII is persisted in this phase.

Exit gate:

- usability targets in Section 8.3 pass;
- operator approves the interaction model and exact public copy.

### Phase 2 - Security and durable draft foundation

Deliverables:

- `lll-booking-assistant` infrastructure;
- KMS/envelope encryption helper;
- typed booking schema and field status model;
- cryptographically random curated three-letter call-key selector, dedicated HMAC lookup index, collision/idempotency/rotation rules, lookup-abuse rate limits, and protected operator lookup authorization;
- transactional `begin-call` command, short-lived call-attempt record/signal, delivery through the protected table to the local operator console, Calling-now pin/mini-queue, acknowledgement-before-dial behavior, and expiry recovery;
- versioned supplier rate-qualification registry, age-at-sailing calculator, qualification-claim model, and normalized rate-candidate schema;
- deterministic state machine;
- guest session cookie and resume-token exchange;
- optimistic concurrency/idempotency;
- versioned event registry and append-only Booking Activity Journal;
- protected conversation/session/field-revision stores;
- redaction/quarantine pipeline and PII-free analytics projector;
- short-lived AWS SSO/IAM local-operator role gate, loopback-only console guard, identity preflight, reveal audit, and fail-closed KMS/table checks;
- retention/deletion jobs;
- privacy and consent updates.

Exit gate:

- security tests pass;
- no real PII can be read from public test routes, client logs, URLs, analytics, push messages, fixtures, or a copied development database;
- guest authorization and local-operator IAM/loopback/reveal-gate tests pass.

### Phase 3 - Public guided collection MVP

Deliverables:

- `/deals/[id]/book` production route behind a feature flag;
- single CTA integration behind rollback control;
- real autosave and resume;
- contact, passenger roster, legal details, residency/address, savings qualification, review;
- server-defined task/forms API;
- saved/completion indicators;
- secure resume email;
- mutually exclusive ordinary inactivity/Continue-later and ready-to-call reminder programs with idempotent three-day recurrence;
- complete guest/form/email lifecycle instrumentation;
- Deal attribution and journal-derived analytics.

Exit gate:

- refresh, close/reopen, multi-tab, and email resume preserve confirmed state;
- one-adult/one-cabin pilot draft reaches `ready_to_call_agent`, displays/reuses its fallback key, transitions to `calling_now` only after acknowledged dashboard signaling, and creates no Odysseus session.

### Phase 4 - Calling-now operator queue and manual call finalization

Deliverables:

- protected Bookings tab;
- queue/detail workspace;
- authenticated Calling-now pin/mini-queue plus exact fallback-key lookup, masked result, caller-verification gate, lookup rate limiting, and audit;
- claim lease and presence;
- call/email/request-field actions;
- Pushover urgency routing;
- operator edits with audit and guest confirmation rules;
- qualification/proof-readiness status and exact live rate-comparison workspace;
- near-real-time current-state panel, synchronized timeline/conversation views, and structured journey replay;
- call-finalization checklist, fresh-session/manual-entry guidance, call outcomes, and fixed launch-mode display;
- guarded future-mode selector that is disabled after live execution begins;
- booking-reference reconciliation.

Exit gate:

- operator receives the expected draft before dialing, or locates it from the fallback key, then verifies/claims/processes it without asking the guest to repeat confirmed answers;
- urgent help is acknowledged and tracked end to end.

### Phase 5 - Future Odysseus preparation automation (not a launch dependency)

The launch may proceed after Phases 1-4 without this worker. Until separately approved, the operator performs the fresh Odysseus session manually during the call. Enabling this phase may shorten operator entry time but may not change the guest's code/call flow or cross the payment/final-submit boundary.

Deliverables:

- service-authenticated worker lease protocol;
- approved MSC contract adapter;
- just-in-time `brn` creation/recreation;
- exact fare/category/cabin selection inputs;
- captured MSC fare-code/category fixtures for ordinary, age-based, and military/service candidates when exposed;
- deterministic qualifying-rate evaluation and comparable ordinary-rate baseline;
- live field scan and fail-closed drift detection;
- confirmed-value fill;
- price/cabin/rule diff;
- documented manual phone-payment checkpoint with a hard automated payment/final-submit stop;
- sanitized operator progress.

Exit gate:

- repeated sandbox/non-payment dry runs reach the verified last safe step;
- unknown fields and changes block correctly;
- no first-available selection or dummy value remains in production paths.

### Phase 6 - Production voice and AI assistance

Deliverables:

- hybrid voice on the real draft;
- serialized voice turn queue;
- editable Tier A proposals;
- typed assistant response contract;
- side-question knowledge grounding;
- booking-specific skill/context;
- human escalation and uncertainty behavior;
- PII suppression from LLM context;
- complete sanitized turn-level conversation/voice journal events and analytical annotations.

Exit gate:

- text/voice/form modes produce identical confirmed draft state;
- Tier B/C values never enter LLM requests or persisted transcripts;
- every turn is attributable, ordered, linked to its active task, and visible in the protected conversation timeline;
- interruption/resume tests pass.

### Phase 7 - Controlled pilot and supplier expansion

Recommended pilot envelope:

- MSC only;
- one cabin;
- one to four adult US-resident travelers;
- one approved Curated Deal at a time;
- business-hours human fallback;
- no pre-call checkout preparation or `brn`;
- `completionMode=call_agent_to_finalize_v1`;
- approved Cruise Brothers manual payment and final-submit procedure;
- no autonomous hold/reservation.

After pilot success, add supplier contract and rate-qualification fixtures one cruise line at a time. Minors, international addresses, multiple cabins, and accessibility-heavy bookings graduate only after dedicated rule and operator tests. Never carry an MSC threshold, eligible relationship, proof rule, or rate code into another supplier without its own captured rule version.

## 22. Test plan

### 22.1 Unit tests

- field applicability and dependency rules;
- canonical validation without regex;
- state transition allowlist;
- only-confirmed-values adapter;
- stale-field behavior;
- price-basis comparison;
- age on sailing date around the qualifying birthday boundary;
- MSC fixture: every cabin occupant is 65 or older produces an age-based candidate; one 64-year-old does not;
- Royal Caribbean fixture: the selected-sailing 55-or-older rule remains separate from the MSC rule;
- service-related `No`, `Yes`, and `Not sure` branches; broad claim category and proof readiness never become verified automatically;
- one-occupant versus all-occupant qualification and multi-cabin mapping rules;
- qualifying fare that is costlier or loses valued benefits remains visible but is not auto-selected;
- non-combinable and stale-rule results fail closed to operator verification;
- material-change rules;
- reminder scheduling/cancellation;
- `Continue later` saves confirmed values but never an unconfirmed current input;
- repeated `Continue later` taps update one reminder program idempotently;
- recurring reminders cannot send more than once in a 72-hour scheduled window;
- reminder generation ceiling, renewal, preference change, and stop behavior;
- email open versus meaningful guest activity scheduling behavior;
- operator claim stops the program and release does not silently restart it;
- consent separation;
- token expiry/one-time consumption;
- encryption round trip and key denial;
- redaction allowlist;
- journal event-schema validation, payload-property rejection, and event-version migration;
- journal causation/correlation, idempotency, sequence, and superseding-event behavior;
- analytics projection allowlist removes content, direct identifiers, and disallowed dimensions;
- conversation redaction/quarantine for Tier B/C and unconditional discard for Tier D;
- conversation analytical annotations record classifier version/confidence without changing state;
- idempotency and optimistic concurrency;
- claim lease expiry;
- operator authorization;
- fallback key comes from the approved three-letter safe-word registry, survives case normalization, contains no PII/IDs, collision-checks across active keys, and is cryptographically selected;
- key issuance is idempotent for one packet version; deliberate rotation revokes the old alias; HMAC secret rotation and constant-time lookup remain valid;
- `begin-call` transaction/signal is idempotent, authenticated dashboard receipt acknowledgement precedes dialing, broker acknowledgement alone cannot authorize dialing, duplicate taps cannot create duplicate active attempts, and timeout/expiry safely returns to `ready_to_call_agent`;
- Section 6A stages cannot be skipped or reordered across review, packet/key storage, disclosure, call signaling, caller verification, claim, and agent processing;
- completion mode locks when agent processing begins and changes only after expiry/revalidation;
- unverified completion modes remain disabled and fall back to `call_agent_to_finalize_v1`;
- completion event fires once.

### 22.2 Contract tests

- sanitized MSC page fixtures;
- required-field mapping;
- visible/conditional field variants;
- select option validation;
- fare-code/rate-label discovery and comparable ordinary-rate baseline;
- supplier-specific qualification, cabin-occupant, combinability, and proof-requirement fixtures;
- live special-rate absence is represented as checked/not available rather than silently omitted;
- safe-submit target;
- expected redirect/state;
- drift on new/missing/renamed fields;
- booking-contact fields map only to the approved agent profile, never to guest contact by label similarity;
- explicit final-submit block.

### 22.3 Integration tests

- DynamoDB state/field-revision/journal transaction and timeline;
- protected message write plus content-free journal reference;
- late/offline client observation ordering, deduplication, and non-authoritative enforcement;
- analytics projection retry/deduplication and canonical-journal independence;
- resume token to cookie exchange;
- Klaviyo event with fake transport;
- continue-later program claim, send, retry, suppression, and terminal-state cancellation;
- equivalent person/Deal draft deduplication;
- email change and draft merge revoke the old program/jobs before another send;
- replaced resume-token recovery from an older reminder email;
- Pushover urgency with fake transport;
- worker lease/heartbeat/timeout;
- operator claim and guest concurrent update;
- transactional packet/key/journal write, call-attempt signal and operator pin, exact-key fallback lookup, masked match, caller verification, claim, and agent-processing transition;
- price/cabin change approval loop;
- supplier-rule lookup, age-at-sailing derivation, qualification claim, live rate comparison, proof-requirement presentation, and selected-rate approval loop;
- call-agent manual completion checkpoint without card-data persistence;
- future completion-mode capability loss and fallback;
- booking reconciliation.

### 22.4 End-to-end guest tests

- iPhone SE and current iPhone viewport;
- Chromium and WebKit;
- text-only completion;
- voice-to-text and text-to-voice completion;
- microphone denial fallback;
- side question during an incomplete field;
- refresh after every task;
- close and email resume on a second device;
- Continue later from each pre-Odysseus stage and exact-task resume;
- pause with a valid unconfirmed field and choose save versus leave unfinished;
- reminder preference change, stop, and renewable-generation flow;
- no Continue later promise while a live cabin timer is active;
- expired token replacement;
- offline/network error and retry;
- duplicate taps/idempotency;
- final screen presents one stable three-letter fallback key, the exact automatic-handoff/call/payment explanation, and one primary **Call agent to finalize** action;
- Copy key, Read key aloud, Call later, refresh, close/reopen, second-device resume, and ready-email resend preserve the same active key;
- the button waits for successful `begin-call` acknowledgement, pins the correct mock draft, then simulates dialing; failed acknowledgement shows Retry plus number/key and does not silently dial;
- `call_signal_pending`, `calling_now`, and phone-link tap never mark connected, caller-verified, agent-claimed, processing, paid, or booked;
- direct call, different phone, blocked/mismatched caller ID, expired signal, two near-simultaneous call attempts, and dashboard-delivery failure all recover through the fallback key without exposing another draft;
- no pre-call action creates a `brn`, timer, cabin selection, inventory hold, or payment session;
- multiple tabs/conflict recovery;
- complete structured journey replay matches the actual task/action sequence after refresh, resume, channel switch, and operator takeover;
- every text/voice/assistant/operator turn appears once in the protected conversation view with the correct active-task context;
- Get help now;
- Deal becomes unavailable;
- material price change;
- automatic age-based check without asking the guest to self-identify as a senior;
- military/service Yes, No, and Not sure paths return to the exact next task;
- review shows candidate/claim status without promising a discount;
- ordinary and qualifying-rate comparison requires explicit guest selection;
- guest is never asked for the booking agent's email, including after resume or clean-device handoff;
- accessibility, zoom, reduced motion, and screen reader smoke.

### 22.5 Security tests

- guest cannot enumerate or read another draft;
- raw draft ID is insufficient authorization;
- operator endpoints reject anonymous/non-operator users;
- public/guest endpoints cannot search by fallback key or use a key to reveal protected data;
- a guest session can signal only its own authorized draft; repeated/forged call attempts are rate-limited and cannot pin another draft or flood the operator queue;
- only the authenticated operator dashboard may acknowledge a call attempt; a forged, stale, mismatched, or publish-only acknowledgement cannot authorize `tel:` launch;
- fallback-key lookup is exact-match, authenticated, rate-limited, abuse-monitored, and audited; a valid key, caller ID, or call-intent signal alone cannot pass caller verification;
- raw fallback keys are absent from URLs, subjects, analytics, logs, traces, push notifications, exports, and error payloads;
- resume token cannot be reused;
- tokens do not leak in referrer or logs;
- a stale queued reminder cannot send after confirmation, operator claim, opt-out, Deal invalidation, cancellation, or deletion request;
- provider webhooks and duplicate jobs cannot recursively schedule reminders;
- Tier B/C values absent from prompts, transcripts, analytics, errors, and notifications;
- military ID numbers, DD214/discharge documents, disability details, and proof images are rejected from ordinary assistant persistence and excluded from transcripts/analytics;
- card number, CVV, expiry, and raw payment form values are never accepted or persisted by Leisure Life;
- payment markers and final submit remain blocked;
- worker cannot run an unapproved mutation command;
- retention deletion removes encrypted values and aliases.
- fallback-key rotation/expiry/deletion removes or revokes every old lookup alias.

### 22.6 Activity Journal and analytics tests

- every accepted state-changing API command writes exactly one command/result chain or fails the mutation;
- each flow action has a registered event contract, owner, privacy class, and analytics projection decision;
- current-state panel matches the authoritative draft after late or out-of-order observation events;
- journal gap and analytics-projection lag are visible and alertable;
- structured journey replay never contains keystrokes, raw DOM, screenshots, cookies, hidden state, audio, or payment-surface activity;
- operator timeline/conversation/reveal access is authorized, paginated, and itself audited;
- supported inbound messages correlate through a protected alias, and unmatched messages go to triage rather than attaching to the wrong guest;
- unrecorded call summaries are labeled as summaries and never rendered as verbatim transcripts;
- analytics dashboards can reconstruct funnels, task friction, wait ownership, channel switches, reminder outcomes, and conversation-resolution rates without raw text or reversible guest identity;
- deletion/retention removes protected content on schedule while preserving only approved de-identified aggregates and audit metadata;
- simulated instrumentation loops are rate-limited and raise alerts without corrupting the canonical journal.

## 23. Rollout and rollback

### 23.1 Feature flags

- `BOOKING_ASSISTANT_ENABLED`
- `BOOKING_ASSISTANT_DEAL_ALLOWLIST`
- `BOOKING_ASSISTANT_CLIENT_OBSERVABILITY_ENABLED`
- `BOOKING_ASSISTANT_ANALYTICS_PROJECTION_ENABLED`
- `BOOKING_ASSISTANT_CONTINUE_LATER_ENABLED`
- `BOOKING_ASSISTANT_CALL_AGENT_FINALIZATION_ENABLED`
- `BOOKING_ASSISTANT_VOICE_ENABLED`
- `BOOKING_ASSISTANT_ODYSSEUS_WORKER_ENABLED` (future only)
- `BOOKING_ASSISTANT_GUEST_SHARE_COMPLETION_ENABLED`
- `BOOKING_ASSISTANT_OFFICIAL_PAYMENT_REQUEST_ENABLED`
- `BOOKING_ASSISTANT_TRANSFERABLE_CHECKOUT_ENABLED`

The completion-mode registry is authoritative. A feature flag can disable a supported mode, but it cannot enable a mode whose current capability snapshot has not passed the Section 6A activation gates.

The authoritative server-side journal for mutations and protected-data access is not optional while the Booking Assistant is enabled. Flags may disable nonessential client observations or pause analytics projection, but the system must fail a sensitive mutation if it cannot write its required journal/audit result.

### 23.2 Rollout sequence

1. Internal mock prototype.
2. Internal real draft with synthetic PII.
3. Operator-only real Odysseus dry run with payment blocked.
4. One allowlisted Deal with the assistant CTA available only to internal testers.
5. Small percentage of public Deal traffic.
6. One full Deal at a time.
7. Supplier expansion after contract stability.

### 23.3 Rollback

One flag restores the existing three CTA experience without deleting drafts. Existing guests can still resume or receive operator help. Worker shutdown never deletes durable drafts.

## 24. Gap and risk register

| Priority | Gap/risk | Required resolution |
| --- | --- | --- |
| Resolved for pilot; product capability still open | Raw Odysseus checkout URL is not transferable; post-booking hold, payment, and email features exist but a guest payment URL is unproven. | Use `call_agent_to_finalize_v1` for launch. Treat every self-service mode as disabled research until independently proven. Never transfer cookies or proxy card entry. |
| Resolved in Phase 0 research | First reservation-like mutation boundary was unknown. | Cabin-selection POST starts the visible 15-minute timer; require explicit operator approval before it. |
| Resolved for tested flow | MSC checkout and Booking Contact contract required verification. | The trace reached visible payment; Booking Contact requires Email and Phone from the approved operator profile. Stop on new supplier fields. |
| Blocker before real PII | Local operator access is not yet protected by a dedicated AWS role, loopback guard, identity preflight, and audited reveal gate. | Do not deploy a production operator route. Add the short-lived AWS SSO/IAM operator role and fail-closed local console controls before connecting the workbench to the real table. |
| Future automation blocker; not a call-flow launch blocker | Local Windows Chrome engine is not a production worker. | Keep launch manual. Before enabling Phase 5 automation, build explicit task lease, protected auth, and controlled worker deployment. |
| Resolved for first implementation | Booking completion source was unknown. | Use read-only CBAT Trip reconciliation and `Imported From Odysseus` evidence; do not treat sent/opened links as confirmation. |
| High | Current generic fast-booking flow assumes search/hold behavior. | Create isolated Deal booking-completion flow. |
| High | Existing form directives and some voice cleanup use regex. | Use typed structured responses and deterministic renderers; do not copy those parsers. |
| High | `GUEST_INFO.json` omits checkout-required fields and lifecycle metadata. | Create canonical booking schema and supplier mappings. |
| High | Existing callback records are too shallow for takeover. | Use a booking draft, queue, assignment, audit, and execution history. |
| High | A guest may mistake the fallback key for a reservation, hold, confirmation, or price guarantee. | Label it `three-letter call key`, de-emphasize it as fallback only, and immediately state that nothing is booked/held/charged and that the agent must recheck and complete the booking by phone. Test comprehension, not just button discovery. |
| High | A low-entropy key may be guessed, shared, photographed, or read to the wrong person. | Make it a locator only: curated random active-unique key, HMAC exact lookup, operator authentication, rate limits, caller verification, masked pre-verification result, rotation/revocation, and full audit. Public lookup is prohibited. |
| High | A phone-link tap or `calling_now` signal does not prove that a call connected or that an agent started processing. | Record the signal/pin only; require separate operator-authored caller verification, claim, processing, call outcome, and booking-confirmed events. |
| High | Manual re-entry increases agent workload and transcription mistakes. | Provide a field-by-field reviewed packet, fixed call checklist, caller reconfirmation of live choices/material changes, training, error/outcome metrics, and later optional safe-entry automation behind the same handoff. |
| High | Multi-cabin bookings are separate transactions. | Route to human in pilot; add a parent journey with one child draft per cabin later. |
| High | Price/cabin availability changes while the guest pauses. | Revalidate just in time and require material-change confirmation. |
| High | Senior/military/veteran rules, proof, rate availability, and combinability vary by supplier, market, sailing, cabin, and promotion. | Use a sourced/versioned qualification registry, derive age at sailing, collect only a guest claim for service eligibility, compare live candidates against the ordinary baseline, and fail closed to operator verification. Never hard-code a universal senior age or veteran promise. |
| High | A nominal qualifying discount can cost more or remove benefits compared with the best ordinary promotion. | Compare full total, payment schedule, cancellation rules, cabin inventory, and included value; show the exact tradeoff and require the guest's explicit rate selection. |
| High | Military/service proof can contain identity numbers, discharge details, disability information, or other sensitive data. | Do not collect proof in the pilot. Store only broad claim/proof-readiness status and route exact proof through an approved supplier/agency path. A future upload flow requires separate security and retention approval. |
| High | Free-form voice/chat can leak sensitive PII to providers/logs. | Tier fields and keep Tier B/C out of LLM/transcripts. |
| High | "Track everything" could create a second PII database, PCI exposure, or invasive session replay. | Journal every meaningful action through typed events and protected content references; prohibit keystrokes, raw DOM/video/audio, secrets, and payment-surface capture. Separate protected operations from de-identified analytics. |
| High | Missing, duplicated, late, or looping instrumentation could give a false picture of the guest journey. | Transactional server events, versioned schemas, idempotency, causation/sequence metadata, client-event limits, completeness dashboards, projection lag/gap alerts, and replay-vs-state tests. |
| High | Conversation analytics could mislabel guest intent or sentiment and influence service incorrectly. | Treat annotations as versioned probabilistic analytics only, allow operator correction, and prohibit automated state/service decisions from labels. |
| High | Phone capture does not equal call/SMS consent. | Add explicit callback and SMS consent records. |
| High | Immediate-call promise may be operationally impossible. | Availability-aware copy, urgent queue, acknowledgement, and fallback expectation. |
| Medium | Three-day Continue-later reminders could duplicate, recurse, outlive the Deal, or become spammy. | Use one versioned program per draft, conditional scheduled-window claims, pre-send lifecycle checks, person/Deal deduplication, renewable send ceilings, preference controls, and terminal-state cancellation. |
| Medium | More Options could grow into a confusing menu and force later screen-by-screen refactors. | Use the versioned progressive option registry, one primary action, one Continue-later escape, context filtering, stable action IDs, and deterministic return behavior. |
| Medium | Guest and operator can edit simultaneously. | Claim lease, field revision, optimistic concurrency, conflict UI. |
| Medium | A guest may provide information for other adults. | Add representation/accuracy acknowledgement and per-traveler review policy. |
| Medium | Minors, international residents, accessibility, and supplier variants add rules. | Keep pilot narrow; add explicit rule packs and fixtures. |
| Medium | Browser storage may expose sensitive drafts. | Store only opaque session and low-risk unsent state; server is authoritative. |
| Medium | Package may expire after an ad click. | Validate at start and before checkout; preserve draft and route alternatives through operator. |
| Medium | Vercel function count is constrained. | Consolidate route handlers and keep worker outside Vercel. |

## 25. Decisions to lock before production build

Recommended defaults are included so implementation can proceed without broad ambiguity.

| Decision | Recommended default |
| --- | --- |
| Public CTA label | `Start booking` |
| Public route | `/deals/[id]/book` |
| Prototype route | `/tests/deals-system/booking-assistant` |
| Durable store | Dedicated `lll-booking-assistant` single table |
| Public identity | Anonymous HTTP-only session plus verified email resume; no forced account |
| Operator identity | Local-only console using a short-lived, least-privilege AWS SSO/IAM role; no Clerk and no production operator route |
| Voice architecture | Hybrid STT -> common orchestrator -> TTS |
| AI scope | Side questions and Tier A proposals only |
| Activity tracking model | Complete structured Booking Activity Journal plus protected conversation content and separate PII-free analytics projection |
| Conversation capture | Exact sanitized turns for supported digital channels; unrecorded phone calls are explicitly labeled operator summaries |
| Analytics identity | De-identified projection with no raw text or reversible guest identifier |
| Session replay | Structured journal replay only; no third-party pixel/video replay in the pilot |
| Voice/call recording | Disabled; retain sanitized transcripts and call outcomes only |
| Pause action label | `Continue later`; do not introduce competing Pause/Save/Take a break labels |
| Ordinary inactivity cadence | Immediate receipt, 1 hour, 24 hours, 72 hours, then stop |
| Continue-later cadence | Immediate save receipt, then every 72 hours; ten-send renewable generation by default |
| Human help label | `Get help now` with availability-aware expectation |
| `brn` creation | Only during the authenticated finalization call after pinned-draft/key matching, caller verification, and agent claim; never on review/key issuance/call tap |
| Pilot | MSC, one cabin, adult US residents, one to four guests |
| Savings qualification | Derive age-based candidates automatically; ask one optional military/veteran/service question with Yes, No, and Not sure; verify and compare live rates before guest selection |
| Special-rate proof | No Leisure Life document upload in the pilot; operator uses the current approved supplier/agency process and records only verification status, rule version, and deadline |
| Normal call handoff | `begin-call` atomically records/publishes a short-lived attempt; an authenticated online operator dashboard pins/renders and acknowledges the same attempt ID; only then enter `calling_now` and launch `tel:` |
| Fallback call key | Three-letter curated safe word such as `MAP`; random, collision-checked across active keys, one active key per packet, HMAC-indexed, no PII/IDs/`brn`, and never treated as authentication |
| Public final action | `Call agent to finalize` with the phone/payment/manual-processing disclosure immediately above it |
| Pilot completion mode | `call_agent_to_finalize_v1` using a fresh official Cruise Brothers/Odysseus session during the call |
| Future completion pivot | Preserve common Stages 1-5 and call-intent/fallback-key/operator recovery; replace only the post-save handoff/completion adapter after capability gates pass, with call-agent mode retained as fallback |
| Abandoned draft retention | 90 days after verified contact, pending approval |
| Supplier expansion | One captured and tested contract at a time |

Business decisions still needed:

- approved agency phone number, operator business hours, after-hours behavior, and realistic call-duration/response expectations;
- caller-verification procedure before protected packet reveal;
- fallback-key expiry/retention, rotation/recovery policy, approved safe-word registry, and approved raw-key display/email-body handling;
- approved phone-payment procedure, including whether calls are recorded (default: no), how PCI-sensitive portions are handled, and dropped-call recovery;
- approved retention periods;
- approved conversation-content, journal-metadata, and de-identified analytics retention periods;
- whether transactional SMS is in the first release;
- whether inbound email replies are supported and correlated in the first release or emails direct all replies back to the secure assistant;
- approval of the ten-reminder/30-day generation ceiling and which guest-selectable cadences are allowed;
- the first public pilot Deal;
- the approved Cruise Brothers process for inspecting and applying MSC senior/military/service rate codes and for receiving any required proof without placing documents in Leisure Life chat, email, logs, or analytics;
- which supplier-specific service categories may be advertised publicly versus merely screened as `Not sure - check with my agent`;
- top supplier order after MSC;
- the authoritative booking-confirmation source Cruise Brothers can support.

## 26. Suggested file structure

```text
app/
  (landing)/deals/[id]/book/page.tsx
  api/booking-assistant/[...action]/route.ts
  api/booking-assistant/resume/route.ts
  api/admin/booking-assistant/[...action]/route.ts
  api/internal/booking-assistant-worker/[...action]/route.ts
  (tests)/tests/deals-system/booking-assistant/page.tsx

components/booking-assistant/
  booking-assistant-shell.tsx
  deal-summary.tsx
  task-card.tsx
  field-renderer.tsx
  voice-control.tsx
  side-question-sheet.tsx
  more-options-sheet.tsx
  progress-summary.tsx
  saved-status.tsx
  review-passengers.tsx
  fallback-call-key-card.tsx
  ready-to-call-screen.tsx
  savings-qualification-task.tsx
  rate-comparison-card.tsx
  material-change-review.tsx
  operator-booking-queue.tsx
  operator-booking-detail.tsx
  operator-calling-now.tsx
  operator-call-key-lookup.tsx
  booking-activity-timeline.tsx
  booking-conversation-history.tsx
  booking-journey-replay.tsx
  booking-live-activity.tsx
  booking-analytics-dashboard.tsx

lib/booking-assistant/
  types.ts
  schemas.ts
  field-catalog.ts
  flow-definition.ts
  option-registry.ts
  fallback-call-key.ts
  call-intent.ts
  call-finalization.ts
  rate-qualification-registry.ts
  age-at-sailing.ts
  rate-comparison.ts
  next-task.ts
  state-machine.ts
  authorization.ts
  encryption.ts
  redaction.ts
  store.ts
  events.ts
  event-registry.ts
  activity-journal.ts
  conversation-store.ts
  analytics-projector.ts
  resume-tokens.ts
  reminders.ts
  continue-later-program.ts
  notifications.ts
  analytics.ts
  assistant-orchestrator.ts
  knowledge-context.ts
  operator-service.ts
  odysseus/
    contract-types.ts
    contract-registry.ts
    field-mapper.ts
    change-detector.ts
    worker-protocol.ts
    safety-gates.ts
    suppliers/
      msc.ts

scripts/booking-assistant-worker/
  worker.ts
  odysseus-session.ts
  contract-capture.ts

tests/booking-assistant/
  state-machine.test.ts
  fields.test.ts
  store.test.ts
  resume.test.ts
  security.test.ts
  reminders.test.ts
  option-registry.test.ts
  fallback-call-key.test.ts
  call-intent.test.ts
  call-finalization.test.ts
  rate-qualification.test.ts
  rate-comparison.test.ts
  activity-journal.test.ts
  conversation-store.test.ts
  analytics-projector.test.ts
  operator.test.ts
  odysseus-contract.test.ts
  payment-boundary.test.ts
  e2e/
```

## 27. Final definition of done

The feature is complete only when all of the following are true:

- Every eligible Deal has one booking CTA into the assistant.
- Contact is saved before the long flow begins.
- Confirmed progress survives refresh, page close, email resume, and Odysseus expiry.
- Text, voice, forms, email, and operator actions share one draft.
- Every meaningful guest, assistant, operator, email, system, and Odysseus action has a versioned, attributable Booking Activity Journal event with causality and outcome.
- The protected operator workspace can show what is happening now, the full sanitized conversation, the chronological timeline, and a structured journey replay without exposing payment or uncontrolled sensitive content.
- Aggregate dashboards explain funnel progression, task friction, validation/correction loops, conversation resolution, channel switching, wait ownership, reminders, errors, and completion using PII-free journal projections.
- State-changing command coverage is complete; observation gaps, projection lag, schema failures, and instrumentation loops are visible and alertable.
- The guest can ask a side question and return to the exact task.
- The guest can request human help at any time after phone capture.
- The guest reviews and stores the complete packet, receives one stable three-letter fallback key, and sees exactly what the automatic dashboard handoff, phone call, manual re-entry, live recheck, payment, and final submission will involve.
- The ready screen has one primary **Call agent to finalize** action plus de-emphasized Copy key, Read key aloud, and Call later; it never implies a hold, reservation, payment, or confirmation.
- The acknowledged call-button action places the correct draft in the protected Calling-now operator slot before dialing; signal failure/expiry is recoverable and never claims a connected call.
- The authenticated operator can use the pinned draft or fallback key, see only a masked result before caller verification, verify/claim it, and continue without asking the guest to repeat confirmed answers.
- Required fields come from deterministic rules plus the live supplier contract.
- Every guest is screened for age-based candidates from confirmed date of birth/sailing date, and every guest can answer one optional military/veteran/service qualification question without being forced to self-label or provide proof in chat.
- The operator can see which qualifying rates were checked, the rule/source version, proof status, live candidate, ordinary-rate baseline, exact value difference, selected rate, and reason a candidate was unavailable or not selected.
- No senior, military, veteran, family, government, or other special-rate eligibility is promised from a generic label or stale rule; an unknown contract fails to operator verification.
- Unknown or changed Odysseus contracts fail closed.
- Price/cabin/rule changes are presented before continuation.
- No autonomous hold, reservation, terms acceptance, or payment occurs.
- No card data reaches Leisure Life infrastructure.
- Tier B/C data is encrypted, access-controlled, audited, and absent from LLMs/logs/analytics/notifications.
- Raw keystrokes, DOM/video session replay, unrestricted screenshots, voice/call audio, secrets, hidden supplier state, and payment-surface activity are never part of the journal.
- Reminder messages are secure, capped, cancellable, and state-aware.
- Continue later saves only confirmed values, returns to the exact next task, and maintains no more than one loop-safe reminder program per draft.
- Option availability comes from the progressive registry; unavailable or unsafe actions are not presented as choices.
- The `call_agent_to_finalize_v1` checklist carries every pilot draft from `ready_to_call_agent` through call-intent signaling/pin or fallback-key lookup, caller verification, a fresh manual Odysseus session, phone payment, final submit, and reconciliation without exposing card data to Leisure Life.
- A guest-owned completion mode is never promised or enabled until its Section 6A capability gates pass.
- Booking completion is based on an authoritative confirmation, not a sent/opened link.
- Pilot metrics and usability targets meet the approved thresholds.
- The old CTA path can be restored immediately by feature flag without losing existing drafts.

## 28. Recommended first build action

Phase 0 is complete for the selected call-agent pilot. Start with two parallel-but-independent artifacts, without production PII:

1. Amend the Phase 1 mobile Interaction Flow Lab directly from the Section 6A stages, preserving the current collection/review experience and replacing its end goal with the call-intent/fallback-key phone-finalization experience in Section 29. Every prototype action emits a registered mock journal event.
2. Implement the versioned flow definition, option registry, call-intent/fallback-key contracts, event registry/activity-journal contract, and completion-mode registry with only `call_agent_to_finalize_v1` enabled.

Do not start the durable PII store, production CTA replacement, or future Odysseus worker until the interaction prototype and call-finalization procedure are approved. A later verified Cruise Brothers guest-payment capability changes the post-save completion adapter and feature flags, not the upstream booking draft, task engine, call-intent/fallback-key recovery, or operator workflow.

Implementation status (July 20, 2026): the amended mock Interaction Flow Lab is in progress, and the first shared contract slice now lives under `lib/booking-assistant/**`. It fixes the pilot completion mode, lifecycle transitions, privacy-safe call-intent/acknowledgement shapes, local-only operator surface, and required journal vocabulary. The durable PII store remains disconnected until the local-operator security preflight is implemented and approved.

## 29. Prototype amendment brief for implementation agents

This is the immediate prototype assignment. Preserve the current mobile-first intake, voice/text continuity, task order, progress, review/edit, savings-qualification, side-question, More Options, Continue later, resume, and mock journal behavior. Replace the prototype's post-review ending with an acknowledged web-to-operator call-intent handoff. The guest should not normally need to say a code; the three-letter call key is a visible fallback.

### 29.1 Guest flow changes

1. After final review and acknowledgement, simulate an atomic packet save.
2. Move the mock draft from `review_ready` to `ready_to_call_agent`.
3. Generate one stable mock fallback call key for that draft, displayed as `MAP` in the default scenario. Refresh, back/forward navigation, and prototype resume must return the same key until the scenario is deliberately reset or rotated.
4. Show this final screen hierarchy:
   - eyebrow/status: `Information saved`;
   - headline: `Your information is saved. Call your booking agent to finalize.`;
   - phone-finalization disclosure immediately above the primary button;
   - one primary button: **Call agent to finalize**;
   - short expectation: `We will place your saved information on your agent's screen before the call starts.`;
   - de-emphasized fallback card: `If needed, your three-letter call key is MAP`;
   - secondary actions: **Copy key**, **Read key aloud**, **Call later**, then the existing progressive More Options affordance.
5. Use this meaning-preserving disclosure in the prototype; agents may improve line wrapping, but may not remove any promise boundary:

> When you tap the button, we will alert your agent and place your saved information at the top of the agent's booking screen before your phone starts the call. The agent will verify who you are, start a new live cruise-booking session, recheck the current price, cabin availability, and any discounts, enter your information, review the final choices and terms with you, take your payment by phone, and complete the booking. If the agent cannot see your information automatically, give the agent your three-letter call key. Nothing is booked, held, or charged yet, and price or availability may change before the agent completes the booking.

6. The phone number comes from one configuration value. Until the real agency number/hours are approved, the lab must simulate the tap instead of dialing a real number and visibly label the interaction as a prototype. In production, use a `tel:` action with the approved number.
7. A primary-button tap first disables duplicate submission, emits `call_disclosure_presented`, calls the mocked `begin-call`, creates one idempotent `callAttemptId`, enters `call_signal_pending`, publishes the operator signal, and waits for the mock operator panel to pin/render and acknowledge that same attempt. A generic server/publish success is not enough. Only then move to `calling_now` and simulate launching `tel:`.
8. If acknowledgement fails or times out, remain `ready_to_call_agent` and show `We could not alert your agent yet`, **Try again**, the phone number, and the fallback key. Never silently place the call while claiming the agent has the packet.
9. `calling_now` must not set `agent_claimed`, `agent_processing`, `payment_started`, or `booking_confirmed`. An unclaimed mock signal expires after the configured short window and returns the draft to `ready_to_call_agent` without changing the key.
10. **Call later** preserves the key, shows the ready-to-call receipt/reminder state, and never sends a real message in the lab. **Copy key** gives accessible success feedback. **Read key aloud** reads `M-A-P` and falls back to visible text if speech synthesis is unavailable.

### 29.2 Mock operator flow changes

Add an operator scenario panel that demonstrates the complete handoff without opening Odysseus or collecting payment:

1. Receive the mocked call-intent signal and pin/open the matching draft in a **Calling now** slot before the simulated dial action completes.
2. Display masked expected caller, Deal/sailing, packet version, signal age/countdown, and **Awaiting caller verification**. Do not display the raw key in this broad card.
3. If two signals arrive close together, show a small ordered Calling-now queue; do not replace or merge them.
4. Provide signal expiry, retry, and `No call received` behavior that safely returns the draft to ready-to-call follow-up.
5. Provide exact three-letter fallback-key lookup with no-match, expired/replaced, rate-limited, or masked-match states for direct calls, a different calling phone, blocked/mismatched caller ID, or signal failure.
6. Let the operator mark caller ID as `matched`, `different`, `blocked`, or `unavailable`; caller ID is never authentication and the prototype does not claim a Google Voice API connection.
7. Record caller verification before revealing the full mock packet, then claim/release the draft.
8. Start `agent_processing` and display the explicit checklist: open a fresh supplier session; recheck Deal/package, price, taxes/fees, cabin, special rates, payment schedule, optional services/insurance, and required terms; manually enter confirmed data; collect payment by the approved phone procedure; submit manually; record the result.
9. Simulate call outcomes: no call received, disconnected/call back, needs guest decision, unavailable/material change, payment failed, declined, completed pending reconciliation, and confirmed.
10. Never render card fields, accept card-like text, call a real supplier/Google Voice endpoint, create a `brn`, or imply that the prototype completed a real booking.

### 29.3 Mock journal requirements

At minimum, the lab must visibly journal:

- `booking_packet_reviewed`;
- `fallback_call_key_issued` or `fallback_call_key_reused`;
- `ready_to_call_presented`;
- `call_disclosure_presented`;
- `call_launch_requested`, `call_intent_signal_published`, and `operator_call_draft_pinned`, or `call_later_selected`;
- `call_intent_signal_expired` when applicable;
- `fallback_call_key_lookup_attempted` and `fallback_call_key_lookup_result` when fallback is used;
- `caller_verification_recorded`;
- `operator_claimed`;
- `agent_processing_started`;
- `call_outcome_recorded`; and
- `booking_confirmed` only after the separate mock reconciliation action.

The raw key may be visible in the guest fallback card and the operator's active fallback input for the lab, but it must be redacted from event payloads, analytics preview, URLs, errors, and exported replay.

### 29.4 Prototype acceptance checklist

- Existing collection/review behavior remains intact; the change begins only after final review acknowledgement.
- One primary end action is visible: **Call agent to finalize**.
- In a five-second scan, the guest can say: `Tapping the button sends my information to the agent before the call; the agent rechecks everything, takes payment by phone, and completes the booking.`
- The screen plainly says nothing is booked, held, or charged yet.
- Reload/resume preserves both reviewed answers and the same fallback key.
- No pre-call state contains a `brn`, cabin timer, selected live inventory, or payment state.
- The key is never called a booking number, reservation number, confirmation number, hold number, payment code, or authentication code.
- The call-button sequence visibly signals and pins before dialing; failure does not make a false automatic-handoff claim.
- `call_signal_pending` is visibly distinct from `calling_now`; both are distinct from connected, verified, claimed, processing, paid, and booked.
- Normal matched flow does not require the guest to say the key; every failure/direct-call path can use it.
- The operator cannot reveal the full packet until caller verification is recorded.
- Every guest and operator action appears once in the mock timeline with the correct actor, state, and outcome.
- iPhone SE/current iPhone, keyboard-only, screen-reader labeling, zoom, copy feedback, and speech-unavailable fallback pass.

### 29.5 Future-pivot seam

Keep Stages 1-5 and their components independent of the completion adapter. The final screen is selected from the versioned completion-mode registry. Only `call_agent_to_finalize_v1` is enabled now. Future verified modes may add a guest payment request, transferable supplier checkout, or safe preparation automation, but they must reuse the reviewed packet, call-intent signal, fallback key, journal, recovery, operator lookup, and reconciliation contracts. Disabling a future mode must immediately fall back to the call-agent screen without losing data or changing the guest's key.

### 29.6 Google Voice constraint and optional Contacts experiment

Research conclusion as of July 20, 2026: do not design launch around a Google Voice incoming-call webhook. The supported [Google Workspace Events API](https://developers.google.com/workspace/events) lists Chat, Drive, and Meet resources, not Voice calls. Voice audit/activity rules occur after logged events, and Premier's [Voice activity export](https://support.google.com/voice/answer/9249103) is reporting rather than a supported pre-answer application webhook. A standard [`tel:` URI](https://datatracker.ietf.org/doc/rfc3966/) addresses the phone call/extension; it does not transfer an arbitrary Leisure Life draft payload into Google Voice.

Therefore the web application signal, not the telephone network, performs automatic population. The guest button sends the internal call intent to Leisure Life, the protected dashboard pins the draft, and Google Voice remains the voice channel. The operator may visually compare Google Voice caller ID with the saved masked phone, but caller ID is neither a reliable connection event nor identity proof. Do not scrape undocumented Google Voice browser endpoints or require a Chrome extension.

Optional experiment, disabled by default:

1. With explicit Workspace authorization, create a temporary Google Contact through the official [People API](https://developers.google.com/people/api/rest/v1/people/createContact) using a minimal label such as `BOOKING - Nate - MAP` and the confirmed phone number. Google Voice [synchronizes Google Contacts](https://support.google.com/voice/answer/9098007).
2. Measure time from contact creation to correct display in Google Voice web, forwarded phone, and iPhone app across repeated clean tests. A test passes only if the label consistently appears before an immediate call.
3. Test update/deletion propagation, reused phone numbers, duplicate contacts, international formatting, caller-ID blocking, calls from another number, and privacy-safe cleanup.
4. Store the Google contact resource ID only in protected integration metadata; delete the temporary contact after completion/cancellation/retention expiry.
5. Even if the experiment passes, use the contact label only as operator convenience. The web call-intent signal and fallback key remain authoritative recovery paths, and caller verification remains mandatory.
