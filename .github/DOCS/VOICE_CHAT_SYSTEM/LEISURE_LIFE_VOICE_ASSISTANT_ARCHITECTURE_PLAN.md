# Leisure Life Voice Assistant - Architecture and Product Plan

**Prepared:** August 11, 2026
**Target repository:** `C:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive`
**Recommended public route:** `/voice-assistant`

## Executive Recommendation

Build a public, voice-first Cruise Concierge experience that is simultaneously:

1. a real browser-based OpenAI Realtime application;
2. a safe demonstration of cruise discovery, preference memory, itinerary planning, and booking-draft preparation;
3. an optional voice mode inside the existing Booking Assistant; and
4. the web companion to a real inbound telephone agent reached through Twilio.

The public portfolio link should point directly to this focused route, not the Leisure Life homepage. The page should make the voice system immediately usable, expose enough of the live transcript and tool activity to demonstrate engineering depth, and clearly label simulated booking/payment outcomes.

Do not build a fake autonomous credit-card collector. That is less credible to serious employers than a system that demonstrates correct payment boundaries. The portfolio demo should show the agent preparing a complete booking packet and initiating a **simulated secure supplier payment handoff**. It must never request, accept, repeat, persist, or transmit real card data.

### Explicit visual scope decision

`/voice-assistant` is an **audio-interaction demonstration**, not the production home of the existing Hero Chat Canvas concept.

- Do not integrate or recreate `.github/DOCS/Implementation/Complete/HERO_CHAT_CANVAS.md` on this page.
- Do not add cinematic response headlines, typewriter/word-stream presentation, contextual hero slideshows, mood-reactive backgrounds, ambient particles, or agent-directed visual atmosphere.
- Do not use HyperFrames as the page runtime or add rendered HyperFrames sequences merely for decoration.
- Keep the visual design simple, branded, accessible, and technically credible so attention remains on listening, speaking, interruption, tool activity, context/skill behavior, telephone parity, and recovery.
- Preserve the Hero Chat Canvas and HyperFrames-oriented visual ideas as a separate future feature with its own plan and implementation scope.

This decision does not remove functional visual aids required for safe interaction: voice state, transcript, editable confirmations, compact session facts, errors, controls, and the hidden trace remain in scope.

## What Already Exists

The repository contains much more than a blank voice experiment:

- Browser microphone and WebRTC lifecycle in `lib/voice/realtime-session.ts`.
- Ephemeral Realtime session creation in `app/api/voice/session/`.
- Pure Realtime, hybrid voice, and simulator test pages under `app/(tests)/tests/voice-*`.
- Tool definitions and a server-side tool dispatcher for cruise research, Cruise Brothers knowledge, excursions, live Odysseus search, and pricing comparison.
- An assembled chat prompt system with channel-specific context.
- A structured context resolver, runtime skill loader, and context-scoped tool registry in `lib/chat/**`.
- Existing support for a forced `startingContext` and a runtime campaign context block. The Group campaign chat route already uses both, which proves the original context-injection idea is viable.
- A mature Booking Assistant data model, DynamoDB store, recovery model, activity journal, operator queue, and public Deal booking route.
- A simulated voice interaction inside `booking-flow-experience.tsx` and an existing `More options` surface.

The current voice implementation is nevertheless stale and incomplete:

- It targets `gpt-4o-realtime-preview-2024-12-17`.
- It manually manages Realtime WebRTC events instead of using the current OpenAI Agents SDK voice layer.
- It uses the older `/v1/realtime/sessions` contract rather than the current client-secret flow described in OpenAI documentation.
- Browser voice is still primarily test infrastructure, not a polished public product surface.
- The Booking Assistant's microphone interaction is simulated.
- The context/skill implementation is still a prototype boundary: `/api/chat` accepts caller-supplied `startingContext` and free-form `contextBlock`, while the voice session accepts `startingContext` but does not hydrate the Deal/booking dataset.
- The current pipeline loads referenced skill markdown and then passes the same loaded content back to an assembler that reads those references again, so skill instructions can be duplicated in one prompt.
- Voice tool dispatch is not yet bound to a persisted session-level authorization/tool-policy snapshot, and pure Realtime sessions do not yet share the durable Booking Assistant conversation identity.
- Leisure Life does not currently contain a deployable Twilio telephone service.
- `.github/DOCS/Implementation/Voice_SMS_CHAT.md` contains material copied from other business demos, including pawn/appraisal examples, and must not be treated as an accurate Leisure Life product specification.
- `.github/DOCS/Implementation/CHANNEL_UNIFIED_AGENT_RUNBOOK.md` is branded for EmperorLinda and is not a clean Leisure Life source of truth.
- `.github/DOCS/Implementation/PAYMENT_FLOW.md` conflicts with the canonical `AI_POLICY.md` and the newer Booking Assistant plan by proposing local card vaulting and automated card entry. The canonical rule wins: Leisure Life does not collect payment locally.

## Architecture Decision: Keep the Context and Agent Skill System

The original approach in `CHAT_SYSTEM_BLUEPRINT.md` remains the right way to make one Leisure Life agent useful across discovery, Deal booking, campaign landing pages, active voyages, and future support tasks. Preserve the separation between:

- **Context** - trusted, task-specific facts for this session, such as a Deal, campaign, booking draft, current task, guest-safe preferences, and freshness metadata.
- **Agent skill** - a versioned runtime behavior pack containing instructions, output contracts, allowed transitions, and the maximum tool set for one job.
- **Tool** - server-side business logic with a typed input/output contract. A skill may expose a tool; it does not contain the tool implementation.
- **Channel directive** - presentation-only differences for text, browser voice, or telephone. Channel directives must not create different business rules.

These runtime agent skills are application prompt assets under `lib/chat/prompt-data/skills/`. They are not the repository automation skills under `.github/skills/`, which guide coding and operator agents.

### Required session launch contract

Every conversation starts or resumes through a server-owned, typed launch envelope. The browser may submit opaque identifiers and a resume credential, but it must never submit raw system instructions, a skill file path, an arbitrary tool list, or an authoritative campaign data blob.

```ts
type ConversationLaunchEnvelope = {
  conversationId: string
  channel: 'text' | 'browser_voice' | 'telephone'
  mode: 'showcase' | 'deal_booking' | 'campaign_landing' | 'guest_support'
  source: 'voice_assistant' | 'booking_assistant' | 'campaign_page' | 'telephone'
  subjectRefs: {
    dealId?: string
    campaignSlug?: string
    bookingDraftId?: string
  }
  requestedSkillId?: string
  resumeCredential?: string
}
```

The server validates the envelope, verifies authorization, resolves the authoritative records, selects the skill from an allowlisted registry, and creates a versioned `ConversationContextSnapshot`. Client-supplied `requestedSkillId` is only a routing hint; server policy makes the final selection.

### Context providers and snapshots

Do not interpret "inject the full campaign" as concatenating every database record into the system prompt. A context provider should load the complete authorized source dataset, then project a bounded, typed snapshot for the agent. Keep source references so tools can retrieve additional approved details on demand.

For a Booking Assistant launch from `/deals/[id]/book`, the snapshot should include:

- immutable Deal, package, campaign/source attribution, ship, sailing, itinerary, and selected campaign angle;
- approved public copy, promotion terms and qualification status, price basis, freshness, link health, and known evidence gaps;
- the authorized Booking Assistant draft ID/version, active task, confirmed Tier A fields, completion state, and safe journal/resume metadata;
- IDs and versions for the source Deal records, manifest, funnel synthesis, and booking flow; and
- an explicit exclusion list for operator-only notes, credentials, commissions, ad-distribution controls, Tier B/C values, payment data, and unrelated campaign records.

This yields complete task coverage without dumping unsafe or irrelevant raw data into model context. Snapshot creation and refresh must be deterministic, auditable, size-bounded, and freshness-labeled. Durable business state remains in the Deal and Booking Assistant stores; the model context is a projection, never a second source of truth.

### Initial runtime skill registry

Use stable IDs and explicit versions rather than file paths supplied by a caller:

| Skill ID | Intended use | Key boundary |
| --- | --- | --- |
| `public_cruise_concierge_v1` | Anonymous showcase discovery and comparison | Synthetic memory; read-only public tools |
| `deal_booking_completion_v1` | Voice/text assistance inside a Deal Booking Assistant draft | Uses the Deal snapshot and deterministic task engine; proposes Tier A changes only |
| `campaign_landing_chat_v1` | Public Group campaign questions and ideas | Campaign-grounded, public-safe, no booking mutations |
| `active_voyage_support_v1` | Authorized help for an active trip | Read-only itinerary/help scope until separately approved |
| `human_help_handoff_v1` | Help request or approved call transfer | Must verify tool success before claiming handoff |

Do not load `.github/skills/deal-campaign-generation` or expose campaign-generation/publication tools to a guest voice session. "Deal campaign skill" in the guest experience means `deal_booking_completion_v1`: it understands the selected campaign and helps complete that Deal's booking draft. Operator campaign creation remains a separate, protected workflow.

### Skill selection, switching, and channel continuity

The source route establishes the initial skill deterministically. `/deals/[id]/book` selects `deal_booking_completion_v1`; a Group campaign page selects `campaign_landing_chat_v1`; `/voice-assistant` selects `public_cruise_concierge_v1` unless an authorized resume changes the mode.

The model may request a skill transition, but it cannot activate one directly. A server-side transition policy checks the current mode, authorization, subject references, and allowed transition graph. On approval, the server builds a new context snapshot and updates instructions and tools. On denial, the current skill remains active and the assistant offers the permitted alternative.

Text, browser voice, and telephone must share one logical `conversationId`, active skill, context snapshot version, and sanitized history. A Realtime connection may have its own transport session ID, but it maps to that logical conversation. Switching channels must not silently re-resolve to onboarding or lose the Deal/draft binding.

All channels use one server-side Agent Configuration Assembler:

```text
verified launch envelope
  -> authorization and subject resolver
  -> context provider -> versioned safe snapshot
  -> skill registry and transition policy
  -> tool-policy intersection (skill + mode + authorization)
  -> shared prompt/agent configuration
  -> text, WebRTC Realtime, or SIP transport
```

The current free-form `contextBlock` and `startingContext` inputs are useful prototypes, not the public production boundary. Migrate them behind the typed resolver; do not allow public clients to author prompt content or choose arbitrary contexts.

### One logical flow, two voice transports

Use the exact same application-level flow for browser Realtime voice and telephone calls:

```text
launch/correlation
  -> authorization and disclosure
  -> context snapshot
  -> active skill
  -> canonical task/state machine
  -> allowlisted tools
  -> proposal
  -> confirmation
  -> persisted result or handoff
```

Do not create a telephone flow definition that competes with the browser flow. The active skill, context snapshot, task IDs, transition rules, tool policy, confirmation policy, journal, and business outcomes remain identical.

The transport adapters are necessarily different:

| Concern | Browser Realtime/WebRTC | Telephone Realtime/SIP |
| --- | --- | --- |
| Connection | Browser WebRTC with server-minted client secret | Inbound SIP call, signed webhook, server accept/reject, sideband WebSocket |
| Identity/correlation | Authorized route, session, and resume credential | Public anonymous call or an existing short-lived call-intent/resume correlation; caller ID is supporting evidence only |
| Presentation | Voice plus transcript, cards, buttons, trip canvas, and trace window | Audio only; one question at a time and short spoken summaries |
| Confirmation | Editable visual card before commit | Explicit verbal confirmation for permitted Tier A actions; otherwise send/open a secure web continuation |
| Sensitive/complex work | Secure deterministic form | Move to the secure web continuation or a human agent |
| Recovery | Reconnect, switch to typing, or continue in form | Repeat, send secure link, request human help, transfer, or end call |

This is "same logical flow," not identical dialogue. Channel directives may shorten wording and choose a different presentation adapter, but they may not change facts, skip required tasks, broaden tools, or invent a different booking state machine.

The current SDK improves this substantially but does not make the transports identical. Use `RealtimeAgent`/`RealtimeSession` for the browser voice client. SIP still requires the incoming-call webhook, accept/reject lifecycle, and server monitoring connection. Both transports consume the same output from the Agent Configuration Assembler and report normalized events into the same conversation runtime.

### Recommended telephone product role

The telephone route should not be positioned as a duplicate of the visual voice app. Its strongest use case is **screen-free access and continuity**:

- a traveler only has a normal phone, has weak data service, cannot comfortably use the web UI, or prefers a familiar phone call;
- an older or less technical guest wants to ask questions without navigating a site;
- a traveler calls after hours for Deal questions, itinerary help, or to prepare the next booking step;
- a guest begins from a Deal or Booking Assistant and uses the approved call-intent/resume path to continue the same logical conversation; or
- the AI handles discovery and routine questions, then transfers an eligible caller to a human without making them repeat the public Deal context.

For the portfolio, demonstrate one coherent cross-channel scenario:

1. A visitor opens a selected public Deal in the browser and sees the voice assistant resolve `deal_booking_completion_v1` with the correct context snapshot.
2. The visitor asks questions, compares a cabin or price basis, and creates or resumes a safe booking draft.
3. The visitor chooses `Continue by phone`; Leisure Life creates a short-lived, consented call-intent correlation without exposing booking data in the URL or telephone network.
4. The visitor calls the published number. The SIP webhook resolves the pending correlation when permitted; otherwise the call remains an anonymous concierge session. Caller ID alone never authenticates or attaches a draft.
5. The telephone agent loads the same logical conversation, skill, context version, task, and tools, gives the AI disclosure, and continues without a new introduction or repeated discovery.
6. When visual review, sensitive information, or detailed terms are required, the agent sends or points the guest to the secure web continuation. It may transfer to a human only through the approved tool and only claims success after confirmation.

Also support a clean cold-call path: an unrecognized caller can ask public cruise/Deal questions and receive a secure continuation link, but cannot access an existing guest draft or private trip history.

### Hidden trace and observability window

Add a developer/reviewer trace window to the public `/voice-assistant` experience. It is hidden by default and opened from a restrained `View agent trace` control inside `How this works`. On mobile it opens as a full-height sheet; on desktop it opens as a right-side drawer. Opening it must not pause or restart the conversation.

The trace is a sanitized projection of the canonical server event stream, not a browser console and not raw OpenAI event traffic. Show high-value events such as:

- logical conversation created/resumed and transport connected/reconnected;
- launch source and mode resolved;
- context snapshot built/refreshed, subject type, safe source versions, freshness, and size;
- skill selected, transition requested, approved/denied, and prior/new skill IDs;
- active task and state transition;
- tool requested, policy decision, started, cache/live source, completed/failed, and sanitized duration;
- proposal created, confirmation requested, confirmed/corrected/cancelled, and persistence outcome;
- browser/SIP sideband connected, transfer requested/accepted/failed, and call ended; and
- warning, guardrail, rate-limit, timeout, reconnect, and fallback events.

Each row should include timestamp, severity, category, short event label, correlation ID, channel, active skill/version, and a small sanitized detail object. Provide filters for `Context`, `Skill`, `Tools`, `State`, `Transport`, `Safety`, and `Errors`, plus pause-follow, copy selected event, and download sanitized trace JSON in demo/development mode.

Never show raw prompts, chain-of-thought, unrestricted transcripts, raw model/provider payloads, tool credentials, API keys, phone/email, booking PII, payment content, supplier secrets, or operator-only campaign data. Public production traces use a strict allowlist and short retention; richer protected traces belong in the authenticated operator surface. Trace failures must never break the assistant.

## Current Platform Findings

### OpenAI Realtime

Current official OpenAI guidance supports:

- TypeScript voice agents using `RealtimeAgent` and `RealtimeSession` from `@openai/agents/realtime`.
- Direct browser WebRTC for natural low-latency speech, barge-in, turn taking, and realtime tool use.
- Server-minted ephemeral client secrets so standard API keys never reach the browser.
- A server-side sideband connection for secure tools, instruction updates, and monitoring.
- Direct SIP telephony through a SIP provider such as Twilio.
- Inbound call accept/reject, WebSocket monitoring, transfer through the Realtime `refer` endpoint, and hangup controls.

The current quality-first model is `gpt-realtime-2.1`. The current lower-cost, faster option is `gpt-realtime-2.1-mini`. Both support WebRTC, WebSocket, SIP, audio/text, reasoning, and function tools. The old GPT-4o Realtime preview used in the repository is deprecated.

Official sources:

- [OpenAI voice-agent guide](https://developers.openai.com/api/docs/guides/voice-agents)
- [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [OpenAI SIP guide](https://developers.openai.com/api/docs/guides/realtime-sip)
- [OpenAI server-side controls](https://developers.openai.com/api/docs/guides/realtime-server-controls)
- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [GPT-Realtime-2.1 mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

### Twilio and Render

Twilio Elastic SIP Trunking can receive calls on a Twilio number and originate SIP traffic to OpenAI's SIP endpoint. OpenAI now documents this path directly, making a custom audio transcoding bridge optional rather than mandatory.

Recommended telephony topology:

```text
Caller
  -> Google Voice auto attendant (optional front door)
  -> Twilio phone number
  -> Twilio Elastic SIP Trunk
  -> OpenAI Realtime SIP

OpenAI incoming-call webhook
  -> Render control service
  -> accept/reject call
  -> attach sideband WebSocket
  -> execute allowlisted tools
  -> journal sanitized events
  -> transfer or hang up when required
```

Render remains useful as the always-on telephony control plane. It can host the HTTPS webhook and outbound sideband WebSocket without carrying or transcoding the audio stream. Render supports public WebSockets, but connections can be interrupted during deploys or infrastructure changes, so the service needs keepalives, graceful shutdown, and resumable session metadata.

Official sources:

- [Twilio Elastic SIP Trunking](https://www.twilio.com/docs/sip-trunking)
- [Twilio/OpenAI Realtime SIP connector tutorial](https://www.twilio.com/en-us/blog/developers/tutorials/product/openai-realtime-api-elastic-sip-trunking)
- [Render WebSockets](https://render.com/docs/websocket)
- [Render web services](https://render.com/docs/web-services)

### Google Workspace Voice

Ordinary Google Voice linked-number forwarding is not supported for forwarding to an automated system. Google Voice Standard and Premier, however, support auto attendants, and the current administrator documentation allows an auto attendant to transfer a caller to another phone number.

Recommended rollout:

1. Purchase/configure a Twilio voice number and make the phone agent work directly first.
2. If Leisure Life has Google Voice Standard or Premier, configure the existing Workspace number as an auto-attendant entry point and transfer an explicit menu choice or after-hours route to the Twilio number.
3. Test caller-ID behavior, latency, voicemail loops, business-hours routing, transfers, and billing before publishing the Google number as the AI entry point.
4. Do not port the public number to Twilio during the feature build. Porting is a later business decision with service continuity consequences.

Official sources:

- [Google Voice subscription capabilities](https://support.google.com/voice/answer/9249103)
- [Google Voice automated attendant setup](https://knowledge.workspace.google.com/admin/voice/set-up-a-voice-automated-attendant-for-your-organization)
- [Google Voice forwarding limitation](https://support.google.com/voice/answer/165221)

## Product Concept

### Name

Use a clear product label such as **Leisure Life Cruise Concierge**. Avoid treating the assistant as a novelty chatbot. The UI should communicate an ongoing travel relationship: it learns preferences, helps compare choices, prepares booking information, and supports trips over time.

### Public Portfolio Mode

The `/voice-assistant` route should open in a clearly labeled showcase mode:

- Real OpenAI Realtime browser voice.
- Real read-only cruise tools where safe and available.
- Synthetic example traveler profile and trip history.
- No authentication required for the basic demo.
- No real booking, reservation, cabin hold, or payment.
- No real legal traveler data or payment data.
- Short session duration and rate limits to control cost.
- A visible `Demo mode` disclosure that states exactly what is and is not real.

The user should be able to say things such as:

- "Find me a seven-night Caribbean cruise from Florida next winter."
- "I prefer quiet ships, balcony cabins, and good live music."
- "Compare these two cruises for me."
- "Remember that I do not want a drink package."
- "Show me what the booking process would look like."
- "Pretend I am ready to pay."

The final request should produce a simulated handoff card, not a card-number conversation.

### Authenticated Guest Mode

The same underlying voice shell can later support a signed-in or verified guest:

- Retrieve an authorized guest profile.
- Resume a saved booking draft.
- Read low-risk confirmed preferences.
- Propose Tier A updates and require visible confirmation before saving.
- Show itineraries and trip history only after authorization.
- Switch seamlessly among voice, text, and deterministic forms.

Tier B/C values remain secure-form-only. Tier D payment remains supplier-controlled.

### Booking Assistant Mode

Keep one public `Start booking` path. Voice becomes an option **inside** Booking Assistant rather than a second competing booking CTA.

Recommended integration:

- `Start booking` opens the existing Booking Assistant.
- `More options` includes `Talk through this booking` or `Use voice`.
- Activating voice preserves the current task, draft, and entered text.
- Voice proposes only a typed field update.
- The guest sees an editable confirmation card.
- The deterministic Booking Assistant commits the value only after confirmation.
- Text input remains available throughout.

The standalone `/voice-assistant` route can link into a Deal's Booking Assistant, but it must not create a separate booking-state model.

## Simple Audio-First Interface

### Desktop

Use a restrained functional workspace:

1. **Voice controls** - assistant identity, large microphone control, listening/thinking/speaking state, and accessible stop/end controls.
2. **Transcript and confirmations** - live transcript with partial/final distinction, tool-status messages, editable proposed values, and text fallback.
3. **Compact session summary** - only the Deal/trip facts, active task, freshness, and booking progress needed to understand or verify the conversation.

Avoid decorative animation, cinematic backgrounds, slideshows, and presentation effects. Voice state must be understandable through text, icons, and controls without relying on a waveform or motion.

### Mobile

Mobile is the primary design constraint:

- One obvious microphone action.
- Large `Stop` and `End conversation` controls.
- Transcript close to the active audio state.
- Bottom-sheet session summary and confirmations.
- Visual viewport handling for the keyboard.
- One-tap switch between voice and typing.
- Resume after interruption or reconnect.

### Demonstrating Technical Depth

Include a restrained, optional `How this works` disclosure for portfolio reviewers. It may show:

- `WebRTC connected`
- active model label
- voice activity/turn state
- tool name and sanitized duration
- browser or telephone channel
- confirmation and persistence boundaries

Never expose prompts, API keys, raw PII, internal supplier credentials, or verbose raw event payloads.

The optional `How this works` disclosure must include the hidden-by-default trace window defined above. The default product surface stays calm; reviewers can inspect context, skill, tool, state, and transport activity without seeing secrets or implementation noise.

## Functional Tool Set

| Tool | Showcase behavior | Guest behavior |
| --- | --- | --- |
| Search cruises | Real read-only search or verified cache | Real search with authorized draft context |
| Compare sailings | Compare selected normalized results | Persist shortlist with confirmation |
| Explain itinerary/ship/cabin | Grounded answer with evidence date | Same |
| Save preference | Update synthetic in-session profile | Propose Tier A update; guest confirms |
| Show preferences | Read synthetic profile | Read authorized safe profile fields |
| Show trip history | Synthetic fixture | Authenticated, authorized records only |
| Create booking draft | Synthetic draft | Use existing Booking Assistant contracts |
| Prepare booking handoff | Simulated supplier handoff | Route through approved completion adapter |
| Request human help | Explain demo behavior | Create existing help/callback signal |
| Transfer phone call | Demonstrate only on telephony path | Use approved Realtime SIP `refer` target |

Do not expose internal marketing, campaign-generation, commission, or operator-only tools to anonymous users.

## Model and Latency Strategy

Use a feature-flagged session profile rather than hardcoding a single permanent choice:

- `quality`: `gpt-realtime-2.1` for portfolio demonstrations and complex tool use.
- `fast`: `gpt-realtime-2.1-mini` for cost/latency comparison and degraded-service fallback.

Create a small evaluation matrix covering:

- first-audio latency;
- interruption recovery;
- silence/noise behavior;
- destination/date/ship-name recognition;
- alphanumeric and confirmation accuracy;
- tool-selection accuracy;
- incomplete-information handling;
- hallucinated inventory or price claims;
- recovery after a failed tool call; and
- spoken-response length.

The model should speak short acknowledgements while tools run, but it must not claim success before receiving a successful tool result.

## Security and Truthfulness Boundaries

### Public demo

- Use synthetic names, preferences, bookings, and trip history.
- Do not ask anonymous users for DOB, address, passport, known-traveler, accessibility/medical, or payment information.
- Warn users not to speak sensitive information.
- Redact or discard detected sensitive content before persistence or tool dispatch.
- Raw audio recording stays off.
- Persist only sanitized operational telemetry unless the user explicitly enters an approved guest flow.

### Payment simulation

When the user says they are ready to pay:

1. The agent says payment details should never be spoken to the assistant.
2. The UI presents a card labeled `Secure supplier checkout - simulated`.
3. The demo uses an obviously synthetic token/status, never editable card fields.
4. The assistant narrates that a production version would transfer the guest to the approved Cruise Brothers/cruise-line payment surface.
5. The journal records only `simulated_payment_handoff_requested` and no financial content.

This produces a stronger portfolio story: the system demonstrates tool orchestration and payment-boundary awareness without pretending a prohibited action occurred.

## Implementation Phases

### Phase 0 - Reconcile documentation and establish baselines

- Preserve current uncommitted work.
- Document the new canonical voice architecture under `.github/DOCS`.
- Mark copied Linda/USA Pawn instructions as non-authoritative for Leisure Life or replace them with Leisure-specific guidance.
- Mark the old payment plan obsolete where it conflicts with `AI_POLICY.md`.
- Capture baseline tests for the current pure and hybrid voice paths.

### Phase 1 - Current OpenAI Realtime foundation

- Add the current OpenAI Agents SDK package after checking compatibility.
- Route model selection through the LLM gateway/configuration layer rather than scattering model IDs.
- Replace the legacy preview session creation with current client-secret creation.
- Build a typed Realtime transport/service wrapper around `RealtimeAgent` and `RealtimeSession`.
- Build the shared Agent Configuration Assembler so text, WebRTC, and SIP receive the same resolved skill, safe context snapshot, and tool policy.
- Replace public use of free-form `startingContext`/`contextBlock` with the typed launch envelope and server-owned context providers.
- Preserve interruption, transcript, text fallback, tool status, and cleanup behavior.
- Keep the manual WebRTC adapter temporarily only if needed for controlled migration comparison.

### Phase 2 - Public voice product page

- Add `/voice-assistant` under the public landing route group.
- Build the simple accessible voice controls, transcript, confirmation cards, compact session summary, demo disclosure, and reconnect/error states.
- Explicitly exclude Hero Chat Canvas, HyperFrames presentation, mood backgrounds, contextual slideshows, particles, and cinematic response animation from this route.
- Use synthetic profile/trip fixtures for anonymous demonstration.
- Add rate limiting, session duration, and usage telemetry.
- Add the hidden trace drawer/sheet backed by sanitized canonical events, filters, correlation IDs, and demo-safe export.

### Phase 3 - Safe cruise tools and memory

- Create a narrow allowlist of public read-only tools.
- Reuse existing tool handlers, caches, and normalized data contracts.
- Add preference proposal/read tools using an in-session showcase store.
- Add booking-draft preparation using existing Booking Assistant contracts without mutating supplier state.
- Require evidence/freshness labels for prices and inventory.
- Add the versioned runtime skill registry, context snapshot schema, transition policy, and audit metadata.

### Phase 4 - Booking Assistant integration

- Replace the simulated microphone action with the real shared voice shell.
- Add `Use voice` inside `More options`.
- Preserve current task, draft version, text, and journal identity across mode switches.
- Confirm every proposed field update visually before saving.
- Keep Tier B/C in secure deterministic forms and Tier D out of the application.
- Resolve `deal_booking_completion_v1` from the Deal/booking route and hydrate it from the complete authorized Deal campaign dataset through a bounded guest-safe snapshot.
- Refresh the snapshot after confirmed draft mutations or authoritative Deal changes without replacing the logical conversation.

### Phase 5 - Telephone agent

- Create a focused Node/TypeScript telephony control service suitable for Render.
- Verify OpenAI webhook signatures and make incoming-call handling idempotent.
- Accept calls with the same approved Leisure Life prompt/tool policy.
- Attach a sideband WebSocket for server-side tools and sanitized events.
- Configure Twilio Elastic SIP Trunking to the OpenAI project SIP URI.
- Implement approved transfer, human fallback, hangup, call duration, rate, and abuse controls.
- Keep call recording disabled.
- Reuse the same canonical task/state machine, active skill, context snapshot, tools, and journal as browser voice; implement only the SIP transport and audio-only presentation adapter separately.
- Support both anonymous public concierge calls and authorized short-lived call-intent/resume correlation. Never bind private state from caller ID alone.
- Treat secure web continuation and verified human transfer as expected telephone outcomes, not failures.

### Phase 6 - Google Voice routing experiment

- Confirm the exact Google Voice subscription and administrator access.
- Configure a Google Voice auto attendant only through supported settings.
- Transfer a test menu choice or after-hours route to the Twilio number.
- Validate caller ID, latency, looping, voicemail, after-hours behavior, and costs.
- Publish the Google number as an AI entry point only after repeated clean tests.

### Phase 7 - Portfolio integration and evidence

- Deploy the public voice page after validation.
- Update the Simple Portfolio Leisure Life project URL to the exact `/voice-assistant` route.
- Add a concise architecture disclosure and truthful project status.
- Capture a real screenshot and short demonstration recording.
- Do not claim autonomous payment, completed bookings, production call volume, or conversion gains without evidence.

## Acceptance Criteria

- `/voice-assistant` is a polished, public, mobile-first voice interface.
- The browser experience uses the current OpenAI Realtime stack and no deprecated GPT-4o Realtime preview.
- Barge-in, stop, reconnect, text fallback, partial/final transcript, and error states work.
- The assistant can complete a coherent cruise-discovery and comparison demonstration using real read-only tools or clearly labeled fixtures.
- Preferences and booking-draft proposals appear as editable confirmations before state changes.
- The existing Booking Assistant can activate the same voice experience from `More options` without losing state.
- A Booking Assistant voice session resolves `deal_booking_completion_v1`, includes the correct Deal/draft snapshot and source versions, and never falls back to generic onboarding while the binding remains valid.
- Public clients cannot inject instructions, skill paths, tools, or authoritative campaign facts.
- Text, browser voice, and SIP use the same skill/context/tool policy and preserve one logical conversation across channel changes.
- Browser and telephone scenarios traverse the same canonical task IDs and state transitions; only their presentation and transport events differ.
- The trace window is hidden by default, survives while the conversation runs, and accurately shows sanitized context, skill, tool, state, safety, and transport events.
- Sensitive and payment data are never requested in speech or persisted.
- Payment is demonstrated only as a labeled supplier-handoff simulation.
- A Twilio number can reach the agent through OpenAI Realtime SIP with Render-hosted server controls.
- The call can be transferred to an approved number through the supported SIP refer path.
- Google Voice routing remains an optional, tested auto-attendant configuration rather than an undocumented webhook hack.
- Documentation, tests, and portfolio claims match what was actually implemented.

## Decisions Requiring Nathaniel's Direct Action

The implementation team must pause before any of these external changes:

- purchasing or assigning a Twilio phone number;
- creating or modifying a Twilio SIP trunk;
- creating an OpenAI webhook or changing project settings;
- creating/deploying a Render service or changing paid service settings;
- changing Google Voice subscription, auto-attendant, or number assignment;
- porting any phone number;
- adding real transfer destinations;
- deploying the public route; or
- publishing the telephone number or portfolio link.
