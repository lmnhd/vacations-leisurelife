# Booking Assistant Pipeline Audit — 2026-07-26

Audit of the current codebase against `BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md`.
Every finding below was verified against actual code, not comments or naming.

## Headline

The pilot is a **working Phase 1 interaction lab plus a partial Phase 2 security
foundation**, wired to real DynamoDB for a happy-path slice. It is **not** at the
plan's "production build" or "definition of done" bar. Several items the plan
marks as *blockers before real PII* are unmet, and one is a live security hole.

**Do not point production paid-ad traffic at real-PII collection yet.** The
guest resume endpoint currently returns full decrypted PII for any draft ID with
no authentication (see Blocker 1).

Rough phase completion:

| Phase | Plan intent | State |
|---|---|---|
| 0 — Transport research | Pick completion model | ✅ Complete (call-agent chosen, documented) |
| 1 — Interaction Flow Lab | Mock end-to-end guest+operator UX | 🟡 ~80% — flow, review, call-handoff, mock journal all present; multi-traveler service-rate gap; no voice; no journey-replay view |
| 2 — Security & durable draft | Encryption, keys, state machine, journal, resume security, projector | 🟡 ~45% — encryption/keys/state-machine/store real; **resume auth, journal transactionality, redaction, analytics projector, resume tokens all missing** |
| 3 — Public guided MVP | Real autosave, server task API, reminders | 🔴 ~25% — route exists + gated; **no server task API, no per-answer autosave, no reminders/resume-email** |
| 4 — Operator queue | Protected bookings tab, verify/claim/process | 🟡 ~60% — operator lab + real queue/verify/claim/outcome exist; not integrated into Deals workbench as a tab; analytics surfaces missing |
| 5 — Odysseus worker | Future automation | ⚪ Not started (correctly — not a launch dependency) |
| 6 — Voice + AI | Hybrid voice, typed LLM contract | 🔴 Not started (voice mode is a UI stub; assistant Q&A added separately) |
| 7 — Controlled pilot | — | 🔴 Blocked on 2/3 |

---

## BLOCKERS (must fix before any real PII)

### Blocker 1 — Guest resume endpoint has NO authentication (security hole)

`app/api/booking-assistant/guest/resume/[draftId]/route.ts` takes a raw
`draftId` from the URL and returns `resumeDraft()` → `getDraft()`, which
**decrypts and returns full contact, travelers, cabins, and decisions** (all
Tier B PII). There is:

- no one-time token exchange,
- no HTTP-only session cookie,
- no ownership check,
- no re-verification.

This directly violates plan §13.1 ("Never trust a client-supplied draft ID by
itself"; "Require re-verification before displaying Tier B/C data on a new
device"), §13.2 (token→cookie exchange), and security tests §22.5 ("raw draft ID
is insufficient authorization; guest cannot enumerate or read another draft").
Anyone who knows/guesses a draft ID reads the whole packet. **There is no guest
session/token infrastructure at all** — no `resume-tokens.ts`, no `cookies()`
usage anywhere in `lib/booking-assistant` or the guest API routes.

### Blocker 2 — Journal writes are not transactional with state mutations

`guest-service.ts` calls `writeJournalEvent()` as a **separate call after** each
`updateDraftStatus()` (lines ~143, 232, 295, 367). The plan requires the
opposite (§12.3, §10.8, §22.1): "A failed journal/audit write fails a sensitive
state mutation rather than creating unobservable state" and "authoritative state
mutation, field revision, and journal result event occur transactionally." Today
a status can advance while its journal event silently fails, producing exactly
the "unobservable state" the plan forbids. `TransactWriteItems` is used in
`store.ts` for the initial save and call-key alias, but **not** to bundle journal
events with status transitions.

### Blocker 3 — "Save after every confirmed answer" is not implemented

Non-negotiable Rule #4 and §7.6/§9 require the server to be the durable source of
truth, saving after every confirmed answer. In reality
(`booking-flow-experience.tsx`), per-task confirmations only mutate local React
state and emit a **mock** journal line ("Autosaved to durable draft (mock)").
The only real DynamoDB writes are:

1. `saveDraft` — one batch write, fired **once** after name+email+phone, and
2. `markReviewReady` — one batch write at final review.

Everything between (ages, travelers, address, residency, savings, accessibility,
cabin, celebration, insurance) lives only in `sessionStorage` until the review
batch. A guest who refreshes mid-flow relies on browser storage, not the server.
This is the Phase 3 "real autosave" deliverable, and it is not done.

### Blocker 4 — Collected data is dropped on the way to the packet

`buildTravelerPayloads()` hardcodes `rateQualificationClaims: []` for every
traveler, so the military/service claim the guest enters is **never persisted to
any traveler record** — it survives only as flat `draft.serviceRate*` fields used
for the review summary and a journal line. Additionally the flow is
**single-claim / single-traveler**: `serviceRateTravelerIndex` is one scalar, so
a 2+-person booking can only capture one qualifying traveler even though
`TravelerRecord.rateQualificationClaims` is a per-traveler array by design. Other
collected fields (celebration, cabin/fare preference nuances, insurance nuance)
should be audited for the same drop-on-persist pattern. This defeats the whole
"always screen for qualifying rates" value prop at the data layer.

---

## What IS genuinely done (real, not mocked)

- **KMS envelope encryption** (`encryption.ts`) — AES-256-GCM + KMS data keys,
  clean round-trip. Real.
- **Fallback call-key security** (`fallback-call-key.ts`) — curated safe-word
  registry, `randomInt` selection, SHA-256 HMAC lookup index, constant-time
  compare, non-enumerating no-match. Matches §6A.2 well.
- **Draft store** (`store.ts`) — single-table design, per-entity encrypted items,
  optimistic concurrency on `version`, `TransactWriteItems` for save + call-key
  alias, GSI1 queue query. Solid.
- **State machine** (`contracts.ts`) — full status set + allowlisted transition
  table + guard; matches §9.1.
- **Local-operator fail-closed gate** (`local-operator-access.ts`) — mode +
  production + loopback + table + AWS account/role + short-lived-credential
  checks. This is the §13.3 blocker and it is genuinely implemented.
- **Operator service** (`operator-service.ts`) — queue poll, key lookup, caller
  verification, claim, processing, outcome, dismiss — real DynamoDB + journal.
- **Guest happy path** — save → review-ready → signal → (new) cancel, all real
  against DynamoDB.
- **Interaction lab** — Section 6A order, contact bootstrap, one-task forms,
  dynamic travelers, savings task (single-traveler), side-question (now a real
  grounded LLM assistant), More Options, Continue-later UI, resume simulation,
  mock operator pin/verify/claim/outcome, mock journal timeline. Strong Phase 1.
- **Deal-System dashboard non-call tracking** — the §20.6 milestone bridge
  (portal entered → contact → saved → review → call → confirmed) plus booking
  leads was implemented recently and is real.

---

## Missing modules (specified in plan §26, absent in code)

Not present in `lib/booking-assistant/`:
`redaction.ts`, `analytics-projector.ts`, `conversation-store.ts`,
`resume-tokens.ts`, `reminders.ts`, `continue-later-program.ts`,
`notifications.ts`, `option-registry.ts`, `rate-qualification-registry.ts`,
`age-at-sailing.ts`, `rate-comparison.ts`, `next-task.ts`, `field-catalog.ts`,
`flow-definition.ts`, `schemas.ts`, `event-registry.ts`,
`assistant-orchestrator.ts`, `knowledge-context.ts`, and the entire `odysseus/`
subtree (Phase 5 — legitimately deferred).

Not present anywhere:
- **`tests/booking-assistant/`** — the plan specifies ~15 test files
  (`state-machine.test.ts`, `fallback-call-key.test.ts`, `security.test.ts`,
  `rate-qualification.test.ts`, etc.). **Zero exist.** No unit, contract,
  integration, e2e, or security tests for the booking assistant. Given the
  security surface, this is a serious gap.
- **`components/booking-assistant/`** — the plan's shared component library
  doesn't exist; all UI lives in the two test-lab files.

---

## Other notable gaps (not launch-blockers, but part of "done")

- **No server-defined task/flow engine.** §9.2 requires a versioned
  `deal_booking_completion` flow of typed task definitions that *code* evaluates.
  Today the task list, dependencies, and validation are all hardcoded in the
  client `booking-flow-model.ts` / `booking-flow-experience.tsx`. The LLM-vs-code
  boundary (§15) isn't tested because there's no server task contract to bypass.
- **No reminder / continue-later programs** (§18, §12.4). The UI has a
  "Continue later" button; there is no reminder program record, no Klaviyo
  send, no capped-generation scheduler, no resume email. Entirely unbuilt.
- **No redaction/quarantine pipeline or PII-free analytics projector** (§11.1,
  §12.5, §20). The Deal-System milestone bridge is a hand-rolled projection, not
  the journal-stream projector with schema allowlist / dead-letter the plan
  specifies.
- **No conversation store** (§11.1, §12.1 `MESSAGE#`). Side-question turns aren't
  persisted as sanitized message envelopes.
- **Voice is a UI stub.** §7.5 hybrid STT→orchestrator→TTS is not wired; the
  "switch to voice" control toggles a mode but there's no real voice pipeline on
  the draft.
- **Operator queue is a standalone test lab**, not a "Bookings tab" integrated
  into the Deals workbench (§17), and the four analytics surfaces (§20.5) don't
  exist.
- **Journal is per-draft append-only but has no event-schema registry /
  validation / migration** (§10.8, §20.2). `bookingJournalEventTypes` is a flat
  string union, not the versioned registry with owner/privacy-class/projection
  decision the plan requires.

---

## Recommended order to reach a safe pilot

1. **Blocker 1 (resume auth)** — build `resume-tokens.ts` + the token→cookie
   exchange route + ownership check; gate `getDraft` PII behind it. Nothing real
   ships until a draft ID alone can't read a packet.
2. **Blocker 2 (journal transactionality)** — move status transition + journal
   event into one `TransactWriteItems`, fail the mutation if the journal fails.
3. **Blocker 4 (data drop)** — map the service-rate claim into the selected
   traveler's `rateQualificationClaims`; make the task repeatable per traveler;
   audit every collected field for persist coverage.
4. **Blocker 3 (per-answer autosave)** — real `confirm-field` server writes so
   the server is the source of truth, not sessionStorage.
5. **Test suite** — at minimum the §22.5 security tests and §22.1 state-machine /
   key / transition tests, before real PII.
6. Then reminders, conversation store, projector, and operator-workbench
   integration for full Phase 3/4 "done".
