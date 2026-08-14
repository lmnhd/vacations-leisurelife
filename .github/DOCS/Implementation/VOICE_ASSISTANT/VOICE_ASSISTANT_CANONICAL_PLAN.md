# Leisure Life Voice Assistant - Canonical Implementation Record

**Created:** August 13, 2026
**Status:** Active build (Phases A-E in progress)
**Supersedes for voice topics:** `Voice_SMS_CHAT.md`, `CHANNEL_UNIFIED_AGENT_RUNBOOK.md` (both are non-Leisure-Life demo material), and every reference to the GPT-4o Realtime preview.
**Companion documents:**
- `.github/DOCS/VOICE_CHAT_SYSTEM/LEISURE_LIFE_VOICE_ASSISTANT_ARCHITECTURE_PLAN.md` (source architecture plan)
- `.github/DOCS/VOICE_CHAT_SYSTEM/LEISURE_LIFE_VOICE_ASSISTANT_IMPLEMENTATION_PROMPT.md` (assignment)
- `.github/DOCS/Implementation/VOICE_ASSISTANT/TELEPHONY_DEPLOYMENT.md` (Twilio/OpenAI/Render/Google Voice manual steps)

---

## 1. Phase A audit - what existed before this build

### 1.1 Reusable as-is

| Asset | Verdict |
| --- | --- |
| `lib/chat/tools/*` | Reusable selectively. Guest voice uses Odysseus for cruise search, Cruise Brothers knowledge, the cached CB deal reader, pricing, and safe conversation tools. Perplexity-backed handlers are legacy and are not exposed to runtime voice skills. |
| `lib/chat/tool-cache.ts` | Reused as the DynamoDB read-through cache. Successful normalized Odysseus queries use a short freshness window; empty/error responses are never cached. |
| `app/api/voice/tool-dispatch/core-logic.ts` | Reusable pattern (typed zod payload schemas per tool). Hardened: dispatch is now bound to a server-side conversation tool policy instead of trusting any browser-supplied `toolId`. |
| Booking Assistant contracts, store, journal, flow definition (`lib/booking-assistant/**`) | Authoritative. Voice proposes Tier A values into this system; it never forks a second booking state model. |
| Prompt data assets under `lib/chat/prompt-data/` (persona, skills, tools) | Reusable as content. Loading is now deduplicated (see 1.3). |
| LLM gateway (`lib/ai/llm-gateway`) | Authoritative model registry. Realtime model IDs added here (see 3.2). |

### 1.2 Obsolete / migrated

| Asset | Problem | Disposition |
| --- | --- | --- |
| `gpt-4o-realtime-preview-2024-12-17` (in `lib/voice/realtime-session.ts`, `app/api/voice/session/core-logic.ts`, hybrid session) | Deprecated model + old `/v1/realtime/sessions` endpoint + pre-GA event names | Replaced by GA contract: `POST /v1/realtime/client_secrets` and `POST /v1/realtime/calls` with `gpt-realtime-2.1` / `gpt-realtime-2.1-mini` resolved through the gateway. Legacy client kept only behind the migration flag until validation completes, then deleted. |
| Public `startingContext` request field (voice session + `/api/chat`) | Lets any caller pick an arbitrary prompt context | Migrated behind `ConversationLaunchEnvelope`. Public callers submit identifiers and credentials only. The internal `startingContext` mechanism remains as an implementation detail reachable only from server-side resolvers. |
| Free-form `contextBlock` (chat + campaign chat route) | Caller-supplied authoritative campaign facts | Same migration. The campaign chat route now builds its context server-side from campaign records; the field is not accepted from public clients. |
| `booking-flow-experience.tsx` simulated microphone | Fake transcription | Replaced by the shared voice shell launched from `More options`. |

### 1.3 Defects recorded and fixed in this build

1. **Duplicate skill content in the assembled prompt.** `assembleSystemPrompt` reads `instructionRefs` itself *and* accepts pre-loaded `loadedSkills` produced from the same refs by `skill-loader.ts`. Callers that passed both got each skill twice. The new agent-configuration assembler loads each active skill/version exactly once and asserts uniqueness.
2. **Voice tool dispatch trusted the browser.** `/api/voice/tool-dispatch` executed any known `toolId`. It now requires a conversation reference and enforces the server-persisted tool policy (skill x mode x authorization intersection) before dispatch.
3. **Realtime sessions had no durable conversation identity.** Transport sessions now map to a logical `conversationId` with persisted skill ID/version and context snapshot ID/version per sanitized turn.
4. **Pre-existing policy violations noted, not expanded:** `lib/chat/context-resolver.ts` trigger parsing uses regex (violates `AI_POLICY.md`). New code introduces zero regex; the resolver is scheduled for a non-regex rewrite but was not modified mid-flight because unrelated dirty-tree work depends on it.
5. **SIP accepted calls but stayed silent.** Accepting a Realtime SIP call configures the session but does not create the first response. The Render sideband now sends an explicit `response.create` with the approved AI disclosure immediately after the WebSocket opens and journals `call.opening_requested`.
6. **Stale research routing overlapped authoritative cruise search.** The public skill exposed a Perplexity tool whose description included availability and pricing, so the model could choose it instead of Odysseus. Perplexity-backed tools are removed from guest runtime skills. `odysseus_search` is the sole cruise option, itinerary, availability, and starting-price search for live voice; Gemini Deep Research remains an asynchronous operator campaign facility and is not a concierge capability.

### 1.4 Documents marked non-authoritative

- `Voice_SMS_CHAT.md` - copied from other business demos (pawn/appraisal examples); banner added.
- `CHANNEL_UNIFIED_AGENT_RUNBOOK.md` - EmperorLinda-branded; banner added.
- `PAYMENT_FLOW.md` - conflicts with `AI_POLICY.md` (local card vaulting, automated card entry). Banner added: Leisure Life never collects payment locally. Payment in voice is only the labeled `Secure supplier checkout - simulated` handoff.

---

## 2. Architecture (canonical)

### 2.1 One conversation runtime, three transports

```text
verified ConversationLaunchEnvelope
  -> authorization + subject resolver
  -> ConversationContextProvider -> versioned guest-safe ConversationContextSnapshot
  -> RuntimeAgentSkill registry + SkillTransitionPolicy
  -> tool-policy intersection (skill + mode + authorization)
  -> AgentConfigurationAssembler -> shared instructions/tools/config
  -> transport adapter: text | WebRTC Realtime | SIP telephone
```

Implementation home: `lib/conversation/`.

| Module | Responsibility |
| --- | --- |
| `launch-envelope.ts` | Typed envelope + strict validation. Clients may send: channel, mode, source, opaque subject refs, `requestedSkillId` (hint only), resume credential. Clients may never send instructions, skill paths, tools, or context blobs. |
| `context-snapshot.ts` | Versioned, size-bounded, guest-safe snapshot types with provenance, source versions, freshness, evidence gaps, and an explicit exclusion list. |
| `context-providers.ts` | `showcase` (synthetic fixtures), `deal_booking` (authoritative Deal + booking draft projection), `campaign_landing` (public campaign copy). Full authorized records are loaded server-side; only the skill-needed projection enters model context. |
| `runtime-skills.ts` | Versioned registry: `public_cruise_concierge_v1`, `deal_booking_completion_v1`, `campaign_landing_chat_v1`, `active_voyage_support_v1`, `human_help_handoff_v1`. Each has stable ID/version, instruction asset, response contract, allowed transitions, max tool IDs. |
| `skill-transition-policy.ts` | Deterministic allow/deny. The model may request; only the server activates. |
| `tool-policy.ts` | Skill/mode/authorization intersection producing the per-conversation allowlist that gates every dispatch. |
| `agent-config-assembler.ts` | Produces the one shared agent configuration consumed by text, WebRTC, and SIP. Asserts each skill/version appears exactly once. |
| `conversation-store.ts` | Logical `conversationId`, transport session mapping, active skill/snapshot versions, sanitized turn metadata. |
| `trace-events.ts` | Typed, sanitized trace event contract + non-blocking ring buffer + projection for the hidden trace window. |

Route-to-skill selection is deterministic: `/voice-assistant` -> `public_cruise_concierge_v1`; `/deals/[id]/book` -> `deal_booking_completion_v1`; Group campaign page -> `campaign_landing_chat_v1`. `.github/skills/deal-campaign-generation` and all operator campaign tools are never loaded into a guest conversation.

### 2.2 Realtime transport (browser)

GA contract (verified against official docs August 13, 2026):

- Ephemeral secret: `POST https://api.openai.com/v1/realtime/client_secrets` with `{ "session": { "type": "realtime", "model": ..., ... } }`. Standard API keys never reach the browser.
- WebRTC SDP: `POST https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <ephemeral>` and `Content-Type: application/sdp`.
- Server sideband: `wss://api.openai.com/v1/realtime?call_id=...` for `session.update`, monitoring, and tools.
- GA event names (`conversation.item.input_audio_transcription.completed`, `response.output_audio_transcript.done`, `response.function_call_arguments.done`, `input_audio_buffer.speech_started/stopped`, ...).

**Agents SDK compatibility resolved.** The root now uses `zod@4.4.3`, `openai@7.4.0`, `@openai/agents@0.15.0`, and the dual-Zod-compatible `@hookform/resolvers@5.8.0`. Existing Booking Assistant, deals, and chat schemas deliberately import `zod/v3`, Zod 4's supported compatibility surface, so their runtime and inferred contracts remain unchanged during the dependency migration. The first-party typed transport (`lib/voice/realtime-transport.ts`) remains the active browser implementation for now; adopting `RealtimeAgent`/`RealtimeSession` is a contained follow-up rather than a workspace-wide schema migration.

Model policy: session profiles `quality` -> `gpt-realtime-2.1`, `fast` -> `gpt-realtime-2.1-mini`, registered in `lib/ai/llm-gateway/models.ts` (`ModelName.REALTIME_QUALITY` / `ModelName.REALTIME_FAST`, tasks `voice_realtime` / `voice_realtime_fast`). Raw Realtime model IDs appear only in the gateway registry. Selection is server-side only.

### 2.3 Telephone transport (SIP)

```text
Caller -> Twilio number -> Twilio Elastic SIP Trunk -> OpenAI Realtime SIP
OpenAI realtime.call.incoming webhook -> Render control service (services/voice-telephony)
  -> verify signature (HMAC over id.timestamp.payload, standard webhook signature scheme)
  -> deduplicate webhook IDs
  -> accept (server-controlled config from the same assembler) or reject
  -> sideband WebSocket: explicit opening response, tools, monitoring, transfer (refer), hangup
  -> sanitized journal events
```

- Caller ID never authenticates or attaches a draft. Resume requires the approved short-lived call-intent correlation or another authorized credential; otherwise the call is the anonymous cold-call concierge.
- Transfer uses `POST /v1/realtime/calls/{call_id}/refer` and is narrated as successful only after the API accepts the request.
- Raw call audio is never recorded.
- The opening is transport-triggered: after `sideband.connected`, Render sends `response.create` with the mandatory AI disclosure. Prompt text alone must never be assumed to start speech.
- Live voice has no deep-research tool. Cruise search is Odysseus-first and read-only, with successful normalized queries cached for 15 minutes. Gemini Deep Research stays in the separate operator-run campaign workflow.
- Deployment/config steps: `TELEPHONY_DEPLOYMENT.md`. No external Twilio/OpenAI/Render/Google Voice changes are made by agents; they require Nathaniel.

### 2.4 Payment boundary

Unchanged from the canonical policy: no local payment collection, no card forms, no vaulting, no automated card entry. Voice reacts to spoken payment content by warning, discarding (non-regex classifier), emitting a content-free security event, and showing `Secure supplier checkout - simulated`.

Tier policy in voice: Tier A propose-and-confirm only; Tier B/C secure forms only; Tier D never enters Leisure Life systems.

---

## 3. What future agents must not do

1. Do not restore `gpt-4o-realtime-preview-*` or `/v1/realtime/sessions`. The GA client-secret contract is canonical.
2. Do not accept `startingContext`, `contextBlock`, prompt text, skill file paths, or tool lists from public clients. Everything flows through `ConversationLaunchEnvelope` + server resolvers.
3. Do not build a separate voice/telephone booking flow. One canonical task/state machine; adapters differ only in transport and presentation.
4. Do not add Hero Chat Canvas / HyperFrames / mood backgrounds / particles to `/voice-assistant`. That visual system is a separate future feature.
5. Do not use `Voice_SMS_CHAT.md` or `CHANNEL_UNIFIED_AGENT_RUNBOOK.md` as Leisure Life product specs.
6. Do not implement `PAYMENT_FLOW.md` Plan A. It is superseded by `AI_POLICY.md` and the Booking Assistant plan.
7. Do not add regex anywhere in application code, including PII detection (use the gateway classification models).
8. Do not "modernize" a `zod/v3` import to bare `zod` in passing. The root is on Zod 4 so `@openai/agents` can be imported, while every existing Booking Assistant, deals, and chat schema stays on Zod 4's `zod/v3` compatibility entrypoint to preserve its established parsing and inference behavior. Bare `zod` now resolves to Zod 4, whose stricter behavior differs in ways a typecheck will not always catch. Migrating a schema off `zod/v3` is a deliberate, separately tested change - never a drive-by edit.
