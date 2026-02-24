# Channel Unified Agent Runbook

## Purpose
This runbook is the permanent guardrail for EmperorLinda so all customer channels (web chat, browser voice, phone voice, SMS) behave as one agent with one control source.

## Core Principle
One agent, multiple transport paths.

- Same business identity
- Same owner state
- Same prompt policy stack
- Same voice normalization map
- Same escalation and safety behavior

Channel differences are transport-only (HTTP, WebRTC, Twilio media stream), never policy-only.

---

## Single Source of Truth

### Source Data (authoritative)
- DynamoDB current state record (`state_id = CURRENT`) via state APIs
- Prompt assembly pipeline in `frontend/src/lib/promptBuilder.ts` and `frontend/src/lib/agentConfig.ts`

### Source Endpoints (authoritative runtime config)
- Chat config: `/api/agent-config/chat`
- Phone/voice config: `/api/agent-config/phone`

All channels must consume one of these assembled endpoints or directly use the same assembly code.

### Greeting Source Contract (Mandatory)
- The dashboard `greeting` field in DynamoDB is the only allowed source for opening greeting text.
- No channel may hardcode an alternative opening greeting for normal flows.
- If greeting is unavailable, fallback behavior is allowed, but must be generic and documented.
- Current preferred default greeting value in dashboard: `Welcome, need you phone fixed fast?`
- State writes must use atomic field updates (no read-merge-write full object puts) to avoid overwriting `greeting` during concurrent updates.

---

## Channel Map (Current System)

### 1) Web Chat
- UI path: `frontend/src/components/ChatHero.tsx`
- API path: `POST /api/chat`
- Config source: assembled prompt/state (`chat` channel)

### 2) Browser Voice (WebRTC)
- UI hook: `frontend/src/hooks/useVoiceChat.ts`
- Session API: `POST /api/realtime-session`
- Config source: `assembleAgentChannelConfig(state, 'phone')`
- Voice normalization: realtime voice map in `realtime-session/route.ts`

### 3) Phone Voice (Twilio call)
- Twilio webhook: `POST /api/twilio-voice`
- Media stream relay: `backend/realtime_voice/server.js`
- Config source: `GET /api/agent-config/phone` via:
  - `AGENT_CONFIG_PHONE_URL` (preferred)
  - fallback: `FRONTEND_URL + /api/agent-config/phone`
- Voice normalization: relay must match dashboard/web normalization map

### 4) SMS
- Twilio webhook path (Next.js or Lambda dispatcher path depending deployment)
- Must consume same owner-state fields and same business rules as chat/voice

---

## Mandatory Invariants (Non-Negotiable)

1. No channel-specific hardcoded persona/policy text that bypasses assembled prompts.
2. No channel-specific hardcoded voice values except explicit fallback behavior.
3. Legacy voice aliases map exactly the same everywhere:
   - `nova -> coral`
   - `onyx -> cedar`
   - `fable -> verse`
4. Owner dashboard changes apply to next interaction without code change.
5. Greeting behavior must be intentional and documented (never accidental override).
6. Any new channel must integrate through assembled config endpoints before release.
7. Greeting text shown/spoken at session start must come from dashboard state (`greeting`) for web chat, browser voice kickoff, and phone voice opener.

---

## Environment Contract

### Frontend (Vercel)
- `VOICE_SERVER_URL` for `/api/twilio-voice` stream target

### Realtime Relay (Render or equivalent)
- `OPENAI_API_KEY`
- `AGENT_CONFIG_PHONE_URL` (preferred)
- `FRONTEND_URL` (fallback only)
- `PORT`
- `VOICE` (fallback only)

If `AGENT_CONFIG_PHONE_URL` and `FRONTEND_URL` are missing, relay falls back and channel parity is not guaranteed.

---

## Deployment Rules

### When dashboard/agent config logic changes
Redeploy:
1. Frontend (Vercel)
2. Relay (Render) if relay behavior/env changed

### When relay config/env changes
Redeploy:
1. Relay (Render) only

### Twilio changes
No code deploy on Twilio.
- Verify webhook points to correct frontend endpoint.

---

## Regression Checklist (Run Every Release)

### Configuration parity checks
- Change dashboard voice, save, then verify:
  - web chat voice path reflects update
  - browser voice reflects update
  - phone call reflects update
- Change persona/tone instructions, verify all channels follow

### Greeting behavior checks
- Change dashboard greeting, save, and verify first opening message changes in:
   - landing chat widget
   - Hero chat surface
   - browser voice kickoff
   - phone call opener (Twilio relay)
- Confirm no unintended duplicated questions or re-introductions on handoff

### Runtime checks
- `GET /api/agent-config/phone` returns expected `voice`, `source`, `persona`
- Relay health endpoint reports reachable config source
- Frontend build passes
- Relay syntax/start check passes

---

## Incident Learnings (Today)

1. Channel drift happens when one transport path has independent mapping logic.
   - Fix: keep a shared canonical mapping and mirror it exactly where unavoidable.
2. Fallback defaults can silently mask parity bugs.
   - Fix: treat fallback as emergency path and monitor when used.
3. Greeting logic is high-sensitivity UX behavior.
   - Fix: document and lock expected opener policy before edits.
4. “Working in web” does not imply “working on phone.”
   - Fix: test all four channels after any config-path change.
5. Greeting drift creates immediate trust break.
   - Fix: enforce a dashboard-only greeting contract and prohibit channel-local opener text.
6. Read-merge-write state persistence causes lost updates under concurrency.
   - Fix: use DynamoDB atomic `UpdateExpression` writes for partial state updates.

### UX Learnings (2026-02-21)

7. Hero chat on mobile must anchor to the visual viewport, not document height.
   - Fix: size hero shell from `visualViewport` and keep input docked to visible bottom.
8. Long landing content can fight keyboard behavior during typing.
   - Fix: collapse lower sections during mobile chat lock and allow reveal only on intentional hard swipe-up.
9. Chat lock behavior should be mobile-only.
   - Fix: gate lock/collapse/swipe logic by mobile viewport checks; keep desktop fully expanded.
10. Greeting sync should never interrupt an active text conversation.
   - Fix: apply dashboard greeting only before first user turn; never overwrite active flow.
11. Subtle loading bars can read as visual glitches.
   - Fix: replace with explicit "LINDA is thinking" state indicator between text turns.
12. Readability and pacing need to adapt to long responses.
   - Fix: gradually reduce hero text size and increase typewriter speed as content length grows, with minimum size/speed floors.

---

## Change Control Policy

Before merging any change touching chat/voice behavior:
- Identify all affected channels explicitly
- Verify source-of-truth path for each channel
- Run parity checklist
- Document behavior changes in this file under a dated note

---

## Quick Triage Matrix

### Symptom: Phone voice not following dashboard voice
- Check relay env for `AGENT_CONFIG_PHONE_URL`
- Check relay health endpoint source/voice
- Confirm relay redeployed after env change

### Symptom: Web and phone openers differ unexpectedly
- Check `useVoiceChat.ts` kickoff instruction
- Check relay `sendInitialGreeting` behavior
- Confirm expected opener policy in this runbook

### Symptom: Channel has different persona/tone
- Verify channel uses assembled config endpoint or same assembly function
- Remove channel-local hardcoded policy block

---

## Ownership

- Product owner: Brandon (behavior expectation authority)
- Engineering owner: whoever edits chat/voice channel routes must run parity checklist

This document is mandatory reference for any future channel work.
