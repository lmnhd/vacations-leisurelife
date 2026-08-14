# Implementation Prompt: Leisure Life Full Voice AI System

You are the implementation team for `C:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive`.

Your assignment is to build a public, portfolio-quality **Leisure Life Cruise Concierge** at `/voice-assistant`, integrate its voice capabilities into the existing Booking Assistant, and prepare a true inbound telephone path using Twilio, OpenAI Realtime SIP, and a Render-hosted control service.

Read this companion architecture plan before acting:

`.github/DOCS/VOICE_CHAT_SYSTEM/LEISURE_LIFE_VOICE_ASSISTANT_ARCHITECTURE_PLAN.md`

## Product Outcome

The finished system should clearly demonstrate that Nathaniel can build a full voice AI product:

- natural browser speech-to-speech conversation;
- low-latency interruption and turn taking;
- live, accessible transcripts;
- secure server-controlled tool use;
- cruise discovery, comparison, and itinerary assistance;
- preference and trip-profile memory;
- booking-draft preparation;
- text/voice continuity;
- server-resolved task context and versioned runtime agent skills;
- a hidden, sanitized agent trace showing context, skill, tool, state, and transport activity;
- an inbound phone agent;
- human call transfer; and
- responsible PII/payment boundaries.

The Simple Portfolio will eventually link directly to `/voice-assistant`, so this page must stand alone as a convincing demonstration rather than depend on visitors understanding the rest of Leisure Life.

## Explicit Visual Scope Exclusion

The `/voice-assistant` page is an audio-first systems demonstration. Do not integrate, port, or recreate the Hero Chat Canvas described in `.github/DOCS/Implementation/Complete/HERO_CHAT_CANVAS.md` for this assignment.

Out of scope for this route:

- cinematic assistant-response headlines;
- typewriter or word-stream response animation;
- contextual hero images or slideshows;
- mood-reactive backgrounds and agent-driven atmosphere changes;
- floating particles or decorative audio visualization;
- HyperFrames as a live UI framework; and
- pre-rendered HyperFrames sequences added only for visual spectacle.

Keep these ideas intact for a separate future feature. This page should use restrained Leisure Life styling and only the UI required to operate and understand the audio system: microphone and call controls, explicit state, transcript, text fallback, tool status, confirmation cards, compact context/session facts, errors, disclosures, and the hidden trace.

## Mandatory Preflight

Before editing, read completely:

- `AGENTS.md`
- `AI_POLICY.md`
- `.github/copilot-instructions.md`
- `PDR.md`
- `README.md`
- `.github/MY_VISION.txt`
- `.github/DOCS/Implementation/OPINIONATED_STYLE_GUIDE.md`
- `.github/DOCS/Implementation/Voice_SMS_CHAT.md`
- `.github/DOCS/Implementation/CHANNEL_UNIFIED_AGENT_RUNBOOK.md`
- `.github/DOCS/Implementation/BLUEPRINTS/CHAT_SYSTEM_BLUEPRINT.md`
- `.github/DOCS/Implementation/Complete/COMPLETED_CHAT_TOOLS.md`
- `.github/DOCS/Implementation/PAYMENT_FLOW.md`
- `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/DEAL_LANDING_UPGRADE_JULY_26/BOOKING_ASSISTANT/BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md`

Inspect the implementation before designing replacements:

- `lib/voice/**`
- `app/hooks/useVoiceChat.ts`
- `app/hooks/useHybridVoiceChat.ts`
- `app/api/voice/**`
- `app/(tests)/tests/voice-pipeline/**`
- `app/(tests)/tests/voice-hybrid/**`
- `app/(tests)/tests/voice-simulator/**`
- `app/(tests)/tests/deals-system/booking-assistant/**`
- `lib/booking-assistant/**`
- `lib/chat/**`
- `app/(landing)/deals/[id]/book/**`

Re-check `git status` before changing anything. The working tree already contains unrelated user changes. Preserve them, do not overwrite them, and do not use destructive git commands. Do not commit unless Nathaniel explicitly authorizes a commit.

The canonical policy forbids regular expressions in application code. Do not add regex, including for PII detection, parsing, redaction, or fallback logic.

## Current OpenAI Requirements

Use current official OpenAI documentation as the source of truth at implementation time:

- [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)
- [WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [SIP](https://developers.openai.com/api/docs/guides/realtime-sip)
- [Server-side controls](https://developers.openai.com/api/docs/guides/realtime-server-controls)
- [Realtime tools](https://developers.openai.com/api/docs/guides/realtime-mcp)
- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [GPT-Realtime-2.1 mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

The repository currently uses deprecated `gpt-4o-realtime-preview-2024-12-17` and the older Realtime session endpoint. Migrate it.

Use the current TypeScript Agents SDK voice surface (`RealtimeAgent` and `RealtimeSession` from `@openai/agents/realtime`) unless current official documentation establishes a better supported path. Add or update dependencies only as required and report the exact package/version change.

Route current model IDs and model-selection policy through the repo LLM gateway/configuration layer. Do not scatter provider model IDs through UI hooks or route handlers. If Realtime transport needs a narrow gateway adapter or documented exception, implement it explicitly rather than silently violating `AI_POLICY.md`.

Recommended session profiles:

- `quality`: `gpt-realtime-2.1`
- `fast`: `gpt-realtime-2.1-mini`

Model choice must be server-controlled. Never expose a standard OpenAI API key to the browser. Use current ephemeral client secrets for WebRTC.

## Architecture to Implement

### Browser path

```text
/voice-assistant UI
  -> Leisure Life Realtime client wrapper
  -> OpenAI Realtime over WebRTC

Next.js server
  -> creates ephemeral client secret
  -> assembles approved Leisure Life prompt
  -> resolves server-controlled model/session profile
  -> exposes allowlisted tool endpoints
  -> journals sanitized events

Existing systems
  -> typed conversation launch resolver
  -> context providers and versioned safe snapshots
  -> runtime skill registry and transition policy
  -> shared agent configuration assembler
  -> cruise tool handlers and caches
  -> Booking Assistant contracts and DynamoDB store
```

For the live concierge, expose no deep-research tool. Route cruise options,
itineraries, availability, and starting-price requests to read-only
`odysseus_search`, checking the normalized DynamoDB tool cache first. Preserve
capture time and freshness language, use a short TTL for successful live
results, and never cache empty/error responses. Legacy Perplexity-backed tools
must not appear in any guest runtime skill. Gemini Deep Research remains a
separate asynchronous operator campaign workflow, not a telephone or browser
voice capability.

### Mandatory Context and Runtime Skill Architecture

Preserve and harden the original structured prompt system. Do not build a fixed voice-only prompt, and do not create separate agent brains for text, browser voice, and telephone.

Implement these distinct server-side concepts:

1. `ConversationLaunchEnvelope` - typed route/source, channel, mode, opaque subject references, optional requested skill ID, and resume credential.
2. `ConversationContextProvider` - loads the complete authorized source records and produces a bounded, typed, guest-safe snapshot with provenance, source versions, evidence gaps, and freshness.
3. `RuntimeAgentSkill` - stable ID/version, instructions, response contract, allowed transitions, and maximum tool IDs.
4. `SkillTransitionPolicy` - deterministically approves or denies skill changes. The model may request a transition but may not activate one.
5. `AgentConfigurationAssembler` - intersects skill tools with mode and authorization, then produces the common instructions/tools/configuration for text, WebRTC, and SIP.

Use at least these initial skill IDs:

- `public_cruise_concierge_v1`
- `deal_booking_completion_v1`
- `campaign_landing_chat_v1`
- `active_voyage_support_v1`
- `human_help_handoff_v1`

The source route selects the initial skill. `/deals/[id]/book` must select `deal_booking_completion_v1`; the standalone public demo selects `public_cruise_concierge_v1`; a Group campaign page selects `campaign_landing_chat_v1`.

For Booking Assistant mode, resolve the authoritative Deal, package/campaign attribution, public copy, promotion qualification, price basis/freshness, link health, manifest/funnel source versions, booking draft/version, active task, safe confirmed Tier A values, and evidence gaps. Load the full authorized dataset on the server, then project only the information needed by the skill. Never put operator-only notes, credentials, commissions, ad controls, Tier B/C values, payment data, or unrelated records into model context.

Do not expose `.github/skills/deal-campaign-generation` or operator campaign-generation/publication tools to the guest agent. The guest-facing Deal skill understands and completes an existing Deal booking flow; it does not build or publish campaigns.

Treat the existing public `startingContext` and free-form `contextBlock` request fields as prototypes to migrate behind this boundary. Public callers may provide identifiers and authorization credentials only. They may not provide raw instructions, skill file paths, arbitrary tools, or authoritative campaign facts.

Maintain one logical `conversationId` across text, browser voice, and telephone. Map transport-specific Realtime/SIP session IDs to it. Persist the active skill ID/version and context snapshot ID/version with each sanitized turn. Rebuild or refresh the snapshot after authoritative state changes without discarding the conversation.

Implement one canonical task/state machine for browser Realtime voice and SIP telephone calls. Do not fork separate business flows. Both transports must consume the same resolved agent configuration, traverse the same task IDs and state transitions, call the same authorized tools, and write the same journal contracts. Transport adapters and presentation adapters may differ:

- WebRTC uses transcript, cards, buttons, trip canvas, and editable confirmations.
- SIP uses brief audio-only turns, explicit verbal confirmation for permitted Tier A actions, secure web continuation for visual/sensitive work, and approved human transfer.
- Caller ID never authenticates or attaches a private draft. Resume requires the approved short-lived call-intent/correlation mechanism or another authorized credential.

Use the TypeScript Agents SDK for the browser `RealtimeAgent`/`RealtimeSession` path. Do not assume it removes the SIP lifecycle: telephone still requires signed incoming-call webhook handling, accept/reject configuration, a server-side monitoring/tool connection, transfer, and hangup controls.

### Portfolio trace window

Add a `View agent trace` control under `How this works`. Keep it hidden by default. Render it as a desktop drawer and mobile full-height sheet without restarting the active session.

Drive it from a typed, sanitized server event projection. Include conversation/transport lifecycle, launch resolution, context snapshot build/refresh, skill selection/transition, task/state transition, tool policy/start/result, proposal/confirmation/persistence, safety/fallback, SIP transfer, error, latency, and reconnect events. Every event needs timestamp, severity, category, event name, correlation ID, channel, skill/version, and allowlisted details.

Add category filters, follow/pause, copy selected event, and demo-safe JSON export. Never expose prompts, chain-of-thought, unrestricted transcripts, raw provider events, PII, credentials, payment content, supplier secrets, or operator-only data. Trace collection/rendering is non-blocking and can fail without affecting the conversation.

### Telephone path

```text
Caller
  -> Twilio voice number
  -> Twilio Elastic SIP Trunk
  -> OpenAI Realtime SIP

OpenAI realtime.call.incoming webhook
  -> Render Node/TypeScript control service
  -> verify signature and enforce idempotency
  -> accept/reject call with approved session configuration
  -> sideband WebSocket for tools, monitoring, transfer, and hangup
  -> Leisure Life server APIs and sanitized journal
```

Do not begin with a custom Twilio Media Streams audio transcoder. Direct SIP is now the primary architecture. Keep the older relay approach only as a documented fallback if a verified SIP limitation blocks required behavior.

## Required Product Modes

### 1. Public showcase mode

- Available at `/voice-assistant`.
- Uses real browser voice and a synthetic guest profile/trip history.
- Uses real read-only cruise tools only where safe, available, and properly freshness-labeled.
- Does not require login for the basic demo.
- Does not create a reservation, cabin hold, booking, or payment.
- Shows a persistent `Demo mode` disclosure.
- Enforces session duration, rate limits, and cost controls.

### 2. Booking Assistant mode

- Add `Use voice` or `Talk through this booking` inside the current `More options` surface.
- Do not create a second public booking CTA.
- Use the same Booking Assistant draft, task, journal, version, and confirmation contracts.
- Preserve the current task and unsent text when switching modes.
- Voice may propose Tier A fields only.
- Every proposed value must appear in an editable confirmation card before saving.
- Tier B/C values remain secure-form-only.
- Tier D payment never enters Leisure Life voice, prompts, transcripts, logs, or storage.

### 3. Telephone mode

- Use the same approved agent identity, prompt policy, tools, and safety rules.
- Provide an explicit AI disclosure at call start.
- Do not record raw call audio.
- Allow human transfer through the OpenAI Realtime SIP `refer` operation to an approved configured destination.
- Implement business-hours, no-answer, tool-failure, timeout, abuse, and emergency-language fallbacks.
- Never claim a transfer succeeded until the API confirms the request was accepted.
- Use telephone primarily for screen-free access, older/less technical guests, weak-data situations, after-hours questions, hands-free travel help, continuation from a Deal/Booking Assistant call intent, and human escalation.
- Support an anonymous cold-call concierge path that can answer public questions and offer a secure continuation, but cannot read private drafts or trip history.
- When correlated to an authorized Booking Assistant conversation, continue the same task and context without re-running discovery or creating a second booking draft.

## Public Page Design

Build a polished mobile-first product page, not a developer test console.

The page should contain:

1. A concise header identifying the Leisure Life Cruise Concierge and demo status.
2. A dominant voice stage with a large microphone control and clear `Listening`, `Thinking`, `Speaking`, `Interrupted`, `Reconnecting`, and `Error` states.
3. Visible `Stop`, `End`, and `Switch to typing` controls.
4. A live transcript that distinguishes partial and final speech.
5. Tool-status rows with human-readable labels and sanitized timing.
6. Editable confirmation cards for proposed preferences or booking fields.
7. A compact session summary showing only the synthetic preferences, selected sailing/Deal, price basis/freshness, active task, and booking progress needed for the demonstration.
8. Suggested prompts that quickly demonstrate useful behavior.
9. A restrained `How this works` panel for hiring reviewers.
10. A clear final booking/payment simulation that cannot be mistaken for a real transaction.
11. A hidden-by-default trace drawer/sheet for sanitized context, skill, tool, state, safety, and transport events.

Follow the repository style guide with a restrained implementation. Do not add the Hero Chat Canvas, HyperFrames presentation, cinematic backgrounds, slideshows, particles, or decorative animation. The experience must remain understandable without a waveform or animation.

## Tool Policy

Create a narrow public allowlist. Reuse existing handlers instead of duplicating tool logic.

Allow, after contract review:

- cruise search;
- sailing comparison;
- ship/itinerary/cabin explanation;
- excursion research;
- pricing comparison with explicit price basis;
- synthetic preference read/write;
- synthetic trip history;
- booking-draft preparation;
- approved knowledge lookup;
- human-help request; and
- telephone transfer.

Do not expose:

- campaign generation or publication;
- paid distribution;
- operator approvals;
- supplier credentials;
- commission internals;
- arbitrary MCP tools;
- mutable Odysseus actions;
- cabin holds;
- final reservation submission; or
- payment entry.

All tool inputs require typed schemas and allowlists. Tool business logic stays server-side. Do not let the browser choose arbitrary endpoint names or pass arbitrary fields into Booking Assistant state.

The agent must never narrate a price, cabin, reservation, save, transfer, or handoff as successful until the corresponding tool returns a verified successful result.

## Payment Demonstration

Nathaniel wants the portfolio to show the theoretical end-to-end booking vision. Demonstrate the vision without collecting financial data.

If a visitor says a card number or asks to pay:

- Immediately tell them not to speak payment details.
- Do not repeat the content.
- Do not store it in the transcript or journal.
- Use the project's non-regex classification/redaction mechanism to emit only a content-free security event.
- Present `Secure supplier checkout - simulated`.
- Show a synthetic handoff token/status with no editable card fields.
- Explain that production payment would occur on an approved Cruise Brothers or cruise-line controlled surface.

Never build a fake card form, VGS/Skyflow proxy, automated card-entry worker, or Stripe cruise-fare flow in this assignment. Those contradict the canonical policy and current Booking Assistant plan.

## Implementation Sequence

### Phase A - Audit and durable design record

1. Audit all current voice code, test routes, prompt paths, and tool contracts.
2. Record which code is reusable, obsolete, copied from another project, or conflicting.
3. Create the canonical implementation plan under `.github/DOCS/Implementation/VOICE_ASSISTANT/`.
4. Update `PDR.md` and other stale docs needed to prevent future agents from restoring deprecated architecture.
5. Do not modify unrelated Deal/campaign work already present in the dirty tree.
6. Inventory the existing context resolver, skill loader, prompt assembler, `startingContext`, `contextBlock`, campaign landing chat route, and context-scoped tool definitions. Record what can be retained and what must be secured.
7. Define the launch envelope, context snapshot, runtime skill, transition, and shared agent-configuration contracts before changing the voice UI.
8. Remove duplicate skill-content assembly and prove each active skill/version appears exactly once in the final agent instructions.
9. Bind every tool dispatch to the resolved conversation, skill, mode, authorization, and context snapshot rather than trusting a client-supplied tool ID.

### Phase B - Realtime migration

1. Add the current Agents SDK dependency.
2. Create a typed Realtime adapter/service rather than embedding SDK calls in components.
3. Migrate ephemeral session creation to the current client-secret contract.
4. Move model selection into the LLM gateway/config layer.
5. Preserve or improve barge-in, stop, transcript, tool, cleanup, and reconnect behavior.
6. Add a temporary feature flag if both legacy and migrated transports must coexist during validation.
7. Remove the deprecated model and old endpoint after the new path passes tests.
8. Make Realtime session creation consume only the shared server-resolved agent configuration. It must not independently choose prompts, tools, or context.
9. Support safe instruction/tool updates when an approved skill transition or context refresh occurs.

### Phase C - Showcase page

1. Implement `/voice-assistant` in the public landing route group.
2. Build reusable, strongly typed, visually simple voice UI components.
3. Add a synthetic demo profile and trip history clearly isolated from real guest data.
4. Add the public tool allowlist and safe tool facade.
5. Add session cost/rate/duration controls.
6. Add sanitized observability and a reviewer-friendly technical disclosure.
7. Add the hidden trace window, typed trace-event contract, filters, non-blocking live stream, and demo-safe export.
8. Verify that no Hero Chat Canvas, HyperFrames runtime, mood-background, slideshow, particle, or cinematic-text dependency was introduced.

### Phase D - Booking Assistant integration

1. Replace only the simulated voice layer; preserve the deterministic booking state machine.
2. Add the voice option inside `More options`.
3. Map speech output to typed field proposals.
4. Require visible confirmation before saving.
5. Prove voice/text/form parity with tests.
6. Prove that mode switching does not lose the task, value, journal identity, or resume state.
7. Bind the logical conversation to the authorized Deal and booking draft, resolve `deal_booking_completion_v1`, and hydrate its versioned guest-safe campaign snapshot.
8. Prove that a client cannot override the skill, inject prompt text, expand the tool allowlist, or substitute another Deal/draft.

### Phase E - Telephony service

1. Add a focused telephony service directory with its own package/runtime configuration suitable for Render.
2. Implement a health endpoint and OpenAI incoming-call webhook.
3. Verify OpenAI webhook signatures and deduplicate webhook IDs.
4. Accept/reject calls using server-controlled prompt, voice, model, and tools.
5. Attach the sideband WebSocket and execute tools on the server.
6. Implement transfer, hangup, timeout, graceful shutdown, and sanitized event journaling.
7. Add a `render.yaml` or equivalent documented deployment definition if appropriate.
8. Provide exact manual Twilio/OpenAI/Render configuration instructions without making external changes automatically.
9. Route SIP through the same conversation runtime and canonical task/state machine as WebRTC; keep only transport and audio-only presentation concerns in the telephony adapter.
10. Implement anonymous public calls, approved short-lived call-intent/resume correlation, secure web continuation, and caller-ID non-authentication tests.

### Phase F - Google Voice experiment and portfolio handoff

1. Document the required Google Voice Standard/Premier auto-attendant setup.
2. Treat external transfer to the Twilio number as a manual, reversible experiment.
3. Do not scrape Google Voice or invent an incoming-call webhook.
4. Do not port the number.
5. After deployment is approved and verified, provide the exact `/voice-assistant` URL for the Simple Portfolio team.

## Testing and Evaluation

Create tests for:

- ephemeral client-secret authorization and failure paths;
- model/session-profile resolution;
- partial/final transcripts;
- barge-in and response cancellation;
- microphone denial;
- reconnect and cleanup;
- tool allowlist enforcement;
- tool timeouts and failed-tool language;
- price/inventory freshness labeling;
- synthetic versus real guest data separation;
- Tier A proposal confirmation;
- Tier B/C/D suppression;
- voice/text/form booking-state parity;
- mode switching and resume;
- OpenAI webhook signature verification;
- webhook idempotency;
- SIP call accept/reject/refer/hangup logic;
- human-transfer failure behavior;
- Render graceful shutdown; and
- reduced-motion/mobile accessibility;
- launch-envelope validation and authorization;
- route-to-skill selection;
- context snapshot projection, size bounds, provenance, freshness, and excluded-field checks;
- Deal/draft binding and cross-Deal substitution rejection;
- skill-transition allow/deny behavior;
- skill, mode, and authorization tool-policy intersection;
- rejection of client-supplied prompt text, skill paths, and arbitrary tool IDs;
- context refresh after confirmed draft or Deal changes; and
- identical logical conversation, skill, and context versions across text, WebRTC, and SIP;
- identical canonical task IDs, transitions, tool policy, and persisted outcomes across equivalent WebRTC and SIP scenarios;
- hidden trace default state, live updates, filtering, sanitization, export, and failure isolation;
- context/skill transition trace accuracy and correlation across browser and SIP transport sessions;
- anonymous telephone caller isolation and caller-ID-only draft-binding rejection; and
- secure web continuation and human-transfer outcomes from telephone mode.

Build a repeatable voice scenario suite for both `gpt-realtime-2.1` and `gpt-realtime-2.1-mini` measuring first-audio latency, interruption recovery, cruise/date recognition, tool accuracy, unsupported claims, and recovery from tool failure.

Do not start or stop persistent development servers without Nathaniel's explicit permission. Use static checks and existing test commands first. Do not make live supplier mutations, reservations, holds, payment actions, deployments, phone purchases, SIP-trunk changes, or Google Voice changes without direct approval.

## Definition of Done

The implementation is complete only when:

- The public `/voice-assistant` route is polished and usable on mobile and desktop.
- The route remains deliberately simple and audio-first; it does not implement Hero Chat Canvas or HyperFrames presentation features.
- The old GPT-4o Realtime preview is no longer the active implementation.
- The page uses the current supported OpenAI Realtime/Agents SDK architecture.
- The voice agent can search, compare, explain, remember synthetic preferences, and prepare a synthetic booking draft.
- The page displays real voice state, live transcript, tool progress, and editable confirmations.
- The Booking Assistant invokes the same voice layer from `More options` without creating a second booking path.
- Booking Assistant sessions deterministically use `deal_booking_completion_v1` with the correct authorized Deal/draft context snapshot.
- The runtime skill system supports multiple tasks without exposing operator campaign skills or allowing client-authored prompt injection.
- Text, browser voice, and telephone consume one shared server-built agent configuration and retain one logical conversation identity.
- WebRTC and SIP execute one canonical business flow; only connection mechanics and presentation affordances differ.
- The hidden trace window demonstrates important agent activity without exposing prompts, private reasoning, PII, secrets, or raw provider payloads.
- Voice, text, and deterministic forms produce the same confirmed booking state.
- Payment is only a clearly labeled secure-supplier handoff simulation.
- No real card data or high-risk PII enters prompts, transcripts, logs, analytics, or storage.
- The Render telephony service passes local/static tests and has complete deployment instructions.
- The Twilio/OpenAI SIP path and call transfer behavior are implemented and testable without claiming an external deployment that has not occurred.
- Google Voice routing is documented as an optional supported auto-attendant transfer, not an undocumented integration.
- All new behavior is documented in the canonical `.github/DOCS` location.
- Validation results, unresolved evidence gaps, external manual steps, and exact changed files are reported.

## Final Handoff

Return:

1. Architecture implemented and any deviations from this prompt.
2. Browser voice route and demonstrated scenarios.
3. OpenAI SDK/model/endpoint migration details.
4. Booking Assistant integration details.
5. Telephony service and manual Twilio/OpenAI/Render setup steps.
6. Google Voice eligibility and manual routing steps.
7. Security and payment-simulation evidence.
8. Test commands and results.
9. Changed files.
10. Remaining actions requiring Nathaniel's account access or approval.
