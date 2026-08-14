# Voice Assistant - Implementation Handoff

**Date:** August 13, 2026
**Branch:** `feature/shadow-groups` (working tree; nothing committed)

Companion documents:
- `VOICE_ASSISTANT_CANONICAL_PLAN.md` - architecture and Phase A audit
- `TELEPHONY_DEPLOYMENT.md` - exact manual Twilio/OpenAI/Render/Google Voice steps
- `VOICE_EVALUATION_SUITE.md` - scenario matrix for the two Realtime profiles

---

## 1. Architecture implemented, and deviations

Implemented as specified: one server-owned conversation runtime
(`lib/conversation/`) that resolves a typed launch envelope into an
authorization decision, a versioned runtime skill, a bounded guest-safe
context snapshot, and a tool-policy intersection - then hands the SAME
assembled agent configuration to text, browser WebRTC, and SIP telephone.

**Agents SDK dependency compatibility is now resolved:** the main app uses
`zod@4.4.3`, `openai@7.4.0`, `@openai/agents@0.15.0`, and the dual-compatible
`@hookform/resolvers@5.8.0`. Existing Booking Assistant, deals, and chat schemas
use Zod 4's supported `zod/v3` compatibility entrypoint, preserving their established behavior while making
`@openai/agents/realtime` safely importable. `lib/voice/realtime-transport.ts`
still implements the GA contract directly; replacing it with
`RealtimeAgent`/`RealtimeSession` is now an optional contained follow-up.

## 2. Browser voice route

`/voice-assistant` (`app/(landing)/voice-assistant/`) - audio-first, mobile
first, restrained. Contains: header with a persistent `Demo mode` badge, an
explicit "what is and is not real" disclosure, a large microphone control,
six explicit states (Ready/Connecting/Listening/Thinking/Speaking/
Interrupted/Reconnecting/Error), Stop speaking / End conversation / Switch to
typing controls, live transcript distinguishing partial from final speech,
tool status rows with sanitized timing, editable confirmation cards, a
compact session-facts panel, suggested prompts, a `How this works` panel, and
the hidden `View agent trace` drawer.

Verified absent: Hero Chat Canvas, HyperFrames, cinematic headlines,
typewriter animation, hero slideshows, mood backgrounds, particles (grep
confirms the only occurrences are the comment documenting the exclusion).

Demonstrable scenarios: cruise discovery, comparison, itinerary/ship/excursion
explanation, synthetic preference save and recall, synthetic trip history,
synthetic booking-draft preparation, and the simulated payment handoff.

## 3. OpenAI migration

| Concern | Before | Now |
| --- | --- | --- |
| Model | `gpt-4o-realtime-preview-2024-12-17` hardcoded in two files | `gpt-realtime-2.1` / `gpt-realtime-2.1-mini` via `ModelName.REALTIME_QUALITY` / `REALTIME_FAST` in the gateway registry |
| Session creation | `POST /v1/realtime/sessions` | `POST /v1/realtime/client_secrets` with nested `session` object |
| SDP exchange | `POST /v1/realtime?model=...` | `POST /v1/realtime/calls` |
| Events | pre-GA names | GA names, with both old and new audio-transcript event names handled |
| Model selection | in a route handler | server-side only, through the gateway (`voice-model-policy.ts`) |
| SDK dependencies | OpenAI SDK 4 with root Zod 3 | OpenAI SDK 7 + Agents SDK 0.15 with root Zod 4; legacy schemas isolated on `zod/v3` |

The legacy routes (`/api/voice/session`, `/api/voice/hybrid-session`) now
**fail closed with HTTP 410** unless `LEGACY_VOICE_SESSION_ENABLED=true`.
They remain only so the `/tests/voice-*` developer consoles work during
migration validation, and both carry a deprecation banner pointing at
`/api/conversation/launch`. Delete them once those consoles are ported.

## 4. Booking Assistant integration

The simulated microphone in `booking-flow-experience.tsx` (a `setTimeout` that
faked a transcript) is gone, replaced by `booking-voice-panel.tsx` using the
same `useConversationVoice` hook as the public page. `Switch to voice` stays
inside `More options`; no second public booking CTA was added.

The safety chain: voice calls `booking_field_propose` -> the server returns a
proposal (never a save) -> an editable confirmation card renders -> the guest
confirms -> the value lands in the same `working` state a typed answer uses ->
the existing deterministic `Continue` action commits it. Voice cannot mark
anything confirmed, and a proposal for a task other than the active one is
rejected and journaled rather than applied.

Tier policy: voice proposes Tier A only (first name, email, phone, party size,
ages). Tier B/C remain secure-form-only; Tier D never enters the system.

## 5. Telephony service

`services/voice-telephony/` - its own package, tsconfig, `render.yaml`, and
`.gitignore`. Implements: `/healthz`, the signed `realtime.call.incoming`
webhook with replay and duplicate rejection, accept/reject with a
server-controlled configuration fetched from
`/api/conversation/telephone-launch`, a sideband WebSocket for tools and
safety, transfer via `refer`, hangup, call-duration ceiling, concurrency cap,
and graceful shutdown with a spoken wrap-up.

Manual setup steps: `TELEPHONY_DEPLOYMENT.md`. **No external change was made** -
no Twilio number, no SIP trunk, no OpenAI webhook, no Render service.

## 6. Google Voice

Documented as an optional, supported auto-attendant transfer to the Twilio
number (Standard/Premier only; ordinary linked-number forwarding does not
work for automated systems). Nothing was scraped, no incoming-call webhook was
invented, and no number was ported.

## 7. Security and payment evidence

- Public clients cannot inject instructions, skill paths, tools, or context:
  the envelope schema is `.strict()`, and tests assert rejection of
  `instructions`, `contextBlock`, `tools`, `startingContext`, and `skillPath`.
- Tool dispatch is bound to the conversation's persisted allowlist;
  `NEVER_GUEST_EXPOSED` tools are rejected even if an allowlist is corrupted.
- Deal-booking launches require a guest session cookie valid for that exact
  draft; authorization is never read from the request body.
- Payment: no card form, no vault, no proxy, no Stripe cruise fare. Spoken card
  content is discarded by the existing non-regex classifier, never echoed or
  stored, and emits a content-free security event (a test asserts the digits
  `4111` appear nowhere in the serialized event).
- Trace window: an allowlist drops prompts, transcripts, and PII before an
  event is buffered; trace failure cannot break a conversation.
- No regex was added anywhere (grep-verified across all new files).

## 8. Test commands and results

```
npm run test:voice                       # both suites below
npm run test:voice:runtime               # 9 groups, all passing
npm run test:voice:telephony             # 6 groups, all passing
npx tsc --noEmit -p tsconfig.json        # clean
cd services/voice-telephony && npx tsc -p tsconfig.json --noEmit   # clean
```

Regression spot-checks (unchanged, passing):
`npx tsx tests/booking-assistant-contracts.ts`,
`npx tsx tests/booking-assistant-security-redaction.ts`.

Runtime verification of the telephony service (built, started on a scratch
port, then stopped): `/healthz` returned `status: ok` with every `configured`
flag correctly `false` in an unconfigured environment; an unsigned webhook
returned **401** and logged `webhook.rejected / missing_signature_headers`; an
unknown route returned **404**.

Not run: any live OpenAI Realtime session, and therefore no latency or
scenario numbers. Those bill the account and need approval. The scenario
matrix is written and ready in `VOICE_EVALUATION_SUITE.md`.

## 9. Changed files

**New - conversation runtime**
```
lib/conversation/launch-envelope.ts
lib/conversation/runtime-skills.ts
lib/conversation/context-snapshot.ts
lib/conversation/context-providers.ts
lib/conversation/showcase-fixtures.ts
lib/conversation/tool-policy.ts
lib/conversation/tool-definitions.ts
lib/conversation/tool-execution.ts
lib/conversation/skill-transition-policy.ts
lib/conversation/agent-config-assembler.ts
lib/conversation/conversation-registry.ts
lib/conversation/trace-events.ts
lib/conversation/transcript-safety.ts
lib/conversation/voice-model-policy.ts
lib/conversation/session-launcher.ts
lib/chat/prompt-data/runtime-skills/*.md   (5 skill assets)
```

**New - transport, API, UI**
```
lib/voice/realtime-transport.ts
app/api/conversation/launch/route.ts
app/api/conversation/tool/route.ts
app/api/conversation/trace/route.ts
app/api/conversation/telephone-launch/route.ts
app/hooks/useConversationVoice.ts
app/(landing)/voice-assistant/page.tsx
app/(landing)/voice-assistant/voice-assistant-experience.tsx
app/(landing)/voice-assistant/agent-trace-drawer.tsx
app/(tests)/tests/deals-system/booking-assistant/booking-voice-panel.tsx
```

**New - telephony service and tests**
```
services/voice-telephony/{package.json,tsconfig.json,render.yaml,.gitignore}
services/voice-telephony/src/{server,webhook-verification,call-policy,realtime-sip-client,call-session}.ts
tests/voice-conversation-runtime.ts
tests/voice-telephony.ts
```

**Modified**
```
lib/ai/llm-gateway/models.ts                     Realtime profiles + task mappings
lib/campaigns/media/media-pipeline-config.ts     exhaustive map updated for new ModelName values
app/api/voice/session/core-logic.ts              deprecated, fails closed behind a flag
app/api/voice/hybrid-session/core-logic.ts       deprecated, fails closed behind a flag
app/(tests)/.../booking-flow-experience.tsx      real voice panel replaces the simulation
package.json                                     three test scripts (no dependency changes)
tsconfig.json                                    excludes services/ (own tsconfig)
PDR.md                                           voice architecture section
.github/DOCS/Implementation/Voice_SMS_CHAT.md    non-authoritative banner
.github/DOCS/Implementation/CHANNEL_UNIFIED_AGENT_RUNBOOK.md   non-authoritative banner
.github/DOCS/Implementation/PAYMENT_FLOW.md      obsolete-where-conflicting banner
```

Untouched: every unrelated dirty-tree file (deals-system, campaign caches,
operator work). No commits were made. No destructive git commands were used.

## 10. Remaining actions requiring Nathaniel

1. **Approve a live Realtime test** so the evaluation suite can be run and real
   latency numbers recorded.
2. **Telephony external setup** - Render service, OpenAI webhook, Twilio number
   and SIP trunk, per `TELEPHONY_DEPLOYMENT.md`. All billable.
3. **Set `TELEPHONY_SERVICE_TOKEN`** identically in Vercel and Render.
4. **Decide the human transfer destination**, or leave it unset (the agent then
   honestly declines to transfer).
5. **Google Voice** - confirm the subscription tier, then configure the auto
   attendant if desired.
6. **Deploy `/voice-assistant`**, then hand the exact production URL to the
   Simple Portfolio team.
7. **Two known gaps before a public phone launch**, deliberately not faked: the
   call-intent correlation store (issue/consume + spoken code capture) and
   secure web continuation delivery from the phone path. Until they exist,
   every inbound call is the anonymous concierge, which is the safe default.
8. **Optional cleanup:** once `/tests/voice-*` consoles are ported or retired,
   delete `lib/voice/realtime-session.ts`, `app/api/voice/session/`,
   `app/api/voice/hybrid-session/`, `app/hooks/useVoiceChat.ts`, and
   `app/hooks/useHybridVoiceChat.ts`.
9. **Pre-existing item worth scheduling:** `lib/chat/context-resolver.ts` uses
   regex in trigger parsing, violating `AI_POLICY.md`. It predates this work
   and unrelated dirty-tree code depends on it, so it was left alone rather
   than changed mid-flight. New code adds no regex.
10. **Optional follow-up, now unblocked:** with Zod 4 and `@openai/agents@0.15.0`
    installed, `lib/voice/realtime-transport.ts` could be replaced by
    `RealtimeAgent`/`RealtimeSession`. This is a contained swap behind the
    existing `useConversationVoice` interface - the server-side runtime
    (envelope, skill, snapshot, tool policy) is unaffected either way. Worth
    doing for less transport code to maintain; not urgent, since the current
    transport implements the same GA contract and is covered by tests. Do it
    as its own change with the evaluation suite run before and after, so any
    latency or barge-in regression is attributable.

## 11. Dependency migration verification (August 13, 2026)

The Zod 4 / OpenAI SDK 7 / Agents SDK migration was verified independently
after it landed:

- Installed and resolving: `zod@4.4.3`, `openai@7.4.0`, `@openai/agents@0.15.0`
  (with `@openai/agents-core` and `@openai/agents-realtime` at 0.15.0), and
  `@hookform/resolvers@5.8.0`.
- `import("@openai/agents/realtime")` succeeds and exports both
  `RealtimeAgent` and `RealtimeSession` as functions. (Note: `require()` of
  these packages fails by design - they are ESM-only with restrictive export
  maps. That is expected, not a broken install.)
- Import split is clean and total: 110 files on `zod/v3`, zero on bare `zod`.
- `zod/v3` schemas still enforce `.strict()` unknown-key rejection under Zod 4.
- The LLM gateway loads and resolves both Realtime profiles to the correct
  provider ids (`gpt-realtime-2.1`, `gpt-realtime-2.1-mini`).
- An OpenAI v7 client constructs successfully. No `zodResponseFormat`,
  `zodTextFormat`, or `zodFunction` helpers are used anywhere in the app, which
  removes the most common v4-to-v7 breakage vector.
- Root typecheck clean; `npm run test:voice` green (15 groups); Booking
  Assistant contracts, redaction, field-flow, and option-registry suites green.
