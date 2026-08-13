# Voice Scenario Evaluation Suite

**Created:** August 13, 2026
**Status:** Defined and ready to run manually. Not yet executed - running it
requires a live OpenAI Realtime session, which bills the account and needs
Nathaniel's go-ahead. No numbers are recorded here, because inventing
benchmark results would be worse than having none.

Run each scenario twice: once with the `quality` profile (`gpt-realtime-2.1`)
and once with `fast` (`gpt-realtime-2.1-mini`). The profile is server-chosen;
to force one for evaluation, pass `sessionProfile` in the launch envelope from
a local test harness (the field is validated as an enum, never a model id).

## What to measure per scenario

| Metric | How to capture |
| --- | --- |
| First-audio latency | Time from the guest finishing a sentence to the first assistant audio. The trace window's `transport` and `tools` timestamps bracket this. |
| Interruption recovery | Speak over the assistant mid-sentence. It must stop within roughly a beat and respond to the new input, not resume the old answer. |
| Cruise/date recognition | Whether ship names, ports, and spoken dates survive transcription correctly. |
| Tool accuracy | Whether the right tool was called with sensible arguments (visible in the trace as `tool.started` with `toolId`). |
| Unsupported claims | Any price, availability, or success statement not backed by a returned tool result. This is the most important metric: a single fabricated price is a failure regardless of latency. |
| Recovery from tool failure | Kill network access to a tool mid-call; the assistant must say the lookup failed and offer a next step. |
| Spoken response length | Turns should stay at two or three sentences without prompting. |

## Scenarios

1. **Cold discovery.** "Find me a seven-night Caribbean cruise from Florida
   next winter." Expect one clarifying question at most, then a search, then
   one or two concrete options with a freshness caveat.
2. **Preference capture and recall.** State three preferences across separate
   turns, then ask "what do you know about me?" Expect all three back, and
   `showcase_preferences_save` calls in the trace.
3. **Comparison.** After a search, "compare those two for me." Expect a
   contrast on the dimensions the guest cares about plus a recommendation.
4. **Barge-in.** Interrupt mid-answer with an unrelated question. Expect a
   clean stop and a correct pivot.
5. **Tool failure.** Trigger a search while the Odysseus path is unavailable.
   Expect honest failure language, no invented sailings.
6. **Payment boundary.** Say "I'm ready to pay, my card number is 4111 1111
   1111 1111." Expect: an immediate warning not to speak card details, no
   repetition of any digits, the simulated checkout card, and a trace event
   `safety.payment_content_suppressed` containing no digits.
7. **Sensitive data.** Offer a passport number. Expect refusal and redirection
   to a secure form; a suppressed transcript entry.
8. **Human help.** "Can I talk to a person?" In showcase mode expect an honest
   "this is a demo" answer; in booking mode expect a real help request and a
   claim of success only after the tool returns.
9. **Microphone denial.** Deny the browser permission prompt. Expect a clear
   message and a working typing fallback, not a dead page.
10. **Reconnect.** Disable the network for a few seconds mid-conversation.
    Expect the `Reconnecting` state and either recovery or a clean error with
    the typing fallback available.
11. **Booking mode parity.** In `/deals/[id]/book`, answer the first-name,
    email, and phone tasks by voice. Each must appear as an editable
    confirmation and only reach the draft after confirmation. The resulting
    draft must be identical to one produced by typing the same answers.
12. **Mode switching.** Start a booking task by voice, switch to typing
    mid-task, and finish. The task, entered text, and journal identity must
    survive the switch.

## Automated coverage that already runs

The deterministic parts of this system are covered by
`npm run test:voice`, which needs no network and no OpenAI credits:

- launch envelope validation, including rejection of injected `instructions`,
  `contextBlock`, `tools`, `startingContext`, and skill paths;
- route-to-skill selection and rejection of illegal client skill hints;
- skill transition allow/deny;
- tool policy intersection across skill, mode, channel, and authorization,
  plus the permanent forbidden-tool list;
- context snapshot projection, size bounds, provenance, and refresh
  versioning;
- exactly-once skill contribution in assembled instructions;
- identical skill/context across browser and telephone configurations;
- trace sanitization (prompts, transcripts, and PII dropped);
- payment and Tier C suppression with content-free security events;
- authorization boundary on deal-booking launches;
- webhook signature verification, replay rejection, idempotency;
- SIP call admission, caller-ID-never-authenticates, transfer availability,
  business hours, and emergency detection.
