# Proactive Tour Conductor — Operator Posting + TC Pulse

**Status:** Implemented (2026-06-17)
**Owner:** Curtis (product + the Tour Conductor) / Claude Code (implementation)
**Problem solved:** The landing-page Group Chat Hall was 100% reactive — the TC
only spoke when a verified guest posted. With early signups arriving and zero
chat interactivity, there was no way to (a) see chat activity from ops, (b) post
as the TC, or (c) have the TC nudge quiet/growing rooms on its own.

This system adds both the **manual** (operator-as-TC) and **autonomous** (TC
Pulse) sides of proactive posting, sharing one writer.

---

## 1. Architecture at a glance

```
                 ┌─────────────────────────────┐
 operator types  │  Conversion dashboard        │
 a TC message →  │  Chat tab (page.tsx)         │
                 └──────────────┬──────────────┘
                                │ POST /chat/operator   (no LLM, verbatim)
                                ▼
 npm run tc-pulse ─► tc-pulse.ts (engine) ─► postTcTurn() ─► appendConversationTurn()
 (autonomous, LLM)                              ▲                     │
                                                │                     ▼
                                   getPostedPulseDedupeKeys()   shared chat session
                                   (idempotency scan)        (campaign-chat://<slug>)
                                                                      │
                                              public GET /chat ◄──────┘
                                              (15s poll → live guest room)
```

Both paths write an `assistant` turn with `displayName: 'Tour Conductor'` into the
campaign's shared session, so they render identically to live TC replies and
surface in the public hall on its existing 15s poll. No websockets, no new
real-time infra.

---

## 2. Files

| File | Role |
|---|---|
| [lib/campaigns/chat/post-tc-turn.ts](../../../../../../lib/campaigns/chat/post-tc-turn.ts) | **Shared writer.** Only path that writes an assistant turn without an LLM call. Stamps provenance (`source: operator \| pulse`, `dedupeKey`, `author`) into the turn's `extractedFacts.tcTurn`. Exposes `getPostedPulseDedupeKeys()` for idempotency. |
| [app/api/groups/campaign/[slug]/chat/operator/route.ts](../../../../../../app/api/groups/campaign/%5Bslug%5D/chat/operator/route.ts) | **Operator-as-TC route.** `POST { message, channel }` → posts verbatim as the Host. No LLM, unlike the public `/chat` route. |
| [app/dashboard/campaigns/[slug]/conversion/page.tsx](../../../../../../app/dashboard/campaigns/%5Bslug%5D/conversion/page.tsx) | **Chat tab.** 4th dashboard tab (`overview / traffic / leads / chat`). Reads the public `GET /chat` history (15s poll), renders per-channel, and posts as the TC via the operator route. Doubles as the daily activity check. |
| [lib/campaigns/chat/tc-pulse.ts](../../../../../../lib/campaigns/chat/tc-pulse.ts) | **TC Pulse engine.** Stateless idempotent sweep (mirrors `email-scheduler.ts`). Reads engagement, evaluates 3 rules, generates copy via the LLM, posts via `postTcTurn`. |
| [scripts/tc-pulse.ts](../../../../../../scripts/tc-pulse.ts) | **CLI.** `npm run tc-pulse:report` (dry-run readout) / `npm run tc-pulse` (live). |

---

## 3. Operator-as-TC (manual)

- Open the campaign **Conversion Ops** dashboard → **Chat** tab.
- Pick a channel (`main / ideas / logistics / meetups`), type, **Post** (or ⌘/Ctrl+Enter).
- Your text is posted **verbatim** as the Host/Tour Conductor — the AI does not
  rewrite it or respond to it. (Decision 2026-06-17: "Direct TC turn, no LLM".)
- It appears in the live guest room within ~15s via the public hall's poll.

**Why a separate route:** the public `POST /chat` runs a *guest* message through
the LLM and replies. Posting *as* the TC must skip that and land directly as the
assistant turn — hence `/chat/operator` calling `postTcTurn` with `source: 'operator'`.

---

## 4. TC Pulse (autonomous, review-then-send)

Run from dev — **not** a production cron (matches CBAT/Odysseus operator-run model).

```bash
npm run tc-pulse:report                  # dry-run: engagement + exact copy it WOULD post
npm run tc-pulse                          # live: posts the chosen messages
npm run tc-pulse:report -- --slug=<slug>  # scope to one campaign
npm run tc-pulse -- --slug=<slug>
```

Dry-run is the default and **generates the real LLM copy** so you review tone
before anything goes public.

### Rules (`evaluateRules`, pure + unit-testable)

| Rule | Fires when | Channel | Dedupe key |
|---|---|---|---|
| **milestone** | verified signups cross a multiple of 3 (3,6,9…) | main | `milestone:N` |
| **loneliness** | signups ≤ 2 AND chat silent ≥ 3 days | main | `loneliness:<window>` (`far/soon/closing/open` from `expiresAt`) |
| **encouragement** | signups > 2 AND ≤ 2 guest ideas AND chat silent ≥ 3 days | main | `encouragement:<tier>` (re-arms as the room grows) |

- **Precedence:** at most one autonomous post per campaign per sweep; milestone
  wins (factual, time-sensitive).
- **Eligibility:** only `GATHERING_INTEREST` campaigns.
- **Rate cap:** ≤ 1 autonomous post per campaign per 24h (reads the session's
  last pulse turn).

### Idempotency

Every pulse post carries a `dedupeKey` stamped into the turn. Before posting, the
engine reads the keys already posted into the session
(`getPostedPulseDedupeKeys`) and skips any rule whose key is present. Re-running
the sweep any number of times never double-posts. **State lives in the
conversation log + campaign record** — no separate "lastNudgedAt" field to drift,
exactly like the email scheduler keys off its event ledger.

### Tunables (top of `tc-pulse.ts`)

`MILESTONE_EVERY=3`, `LONELINESS_SIGNUP_CEILING=2`, `SILENCE_DAYS=3`,
`PULSE_RATE_CAP_HOURS=24`, `SESSION_SCAN_LIMIT=200`.

---

## 5. Data model notes

- **Session id** is deterministic: `campaign-chat://<slug>` (mirrors
  `view-model.ts`), so the engine derives it from the campaign without loading
  the full landing view-model.
- **Turn provenance** lives in `extractedFacts.tcTurn = { source, dedupeKey,
  author, postedAt }`. The UI may later badge autonomous posts off `source`.
- **Verified-signup count** (not raw entries) is the milestone/threshold basis —
  matches what counts toward the public threshold.

---

## 6. Known gaps / follow-ups

- **Auth:** `/chat/operator` follows the same trust model as the sibling `reset`
  route — it relies on the `/dashboard` surface being operator-only and has no
  per-request guard. If these dashboard routes gain a shared operator guard,
  wire it into the operator route too.
- **UI badge:** the dashboard does not yet visually distinguish autonomous pulse
  posts from manual operator posts (both show as "Tour Conductor"). The `source`
  field is persisted and ready when we want the badge.
- **Unit tests:** `evaluateRules` is pure and the obvious first test target
  (milestone boundaries, silence + expiry windows, dedupe skip). Not yet written.
- **Tests routes parity:** the `/tests/campaign-landing` preview surface does not
  expose the operator composer; it's dashboard-only by design.
