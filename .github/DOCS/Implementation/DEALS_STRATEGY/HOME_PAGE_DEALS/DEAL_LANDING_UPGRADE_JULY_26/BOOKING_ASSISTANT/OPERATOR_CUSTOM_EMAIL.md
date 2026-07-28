# Operator Custom Email — Send a special email to a guest from the console

Status: Code complete (July 26, 2026). Pending: build the Klaviyo template and
supply `BOOKING_ASSISTANT_PUBLIC_BASE_URL` for correct resume links in prod.

## Goal

Let the operator (and the Live Call Copilot) send an ad-hoc, operator-authored
email to the selected booking guest directly from the Operator Console. The
motivating example: on a call the guest asks for flight options to the port; the
Copilot finds them, the operator reads them out, and then sends a follow-up
email with those options — without leaving the console.

This is a deliberate, bounded exception to the booking-assistant rule that email
is templated-only. It is operator-authenticated, redaction-checked, consent-
gated, and journaled.

## Decisions (July 26, 2026)

- **Delivery:** new Klaviyo transactional event (not raw SES/SMTP). Consistent
  with the existing 6 notification kinds. One reusable Klaviyo template renders
  the operator-authored `subject` + `body`.
- **Copilot link:** Copilot answer → editable draft → operator reviews/edits →
  send. Also supports composing from scratch. Copilot never auto-sends.
- **Eligibility:** any draft with a saved email **and**
  `transactionalEmailConsent === true`, regardless of status.
- **Guest-email polish:** **Polish for guest** works on a Copilot research
  answer or a raw idea typed into the composer. It redaction-checks text before
  it reaches the model, removes citations and internal guidance, and returns an
  editable subject/body draft. It never sends automatically; the original is
  available to restore.

## Klaviyo event contract

The transport and the seed script both emit this exact shape. **Keep them in
sync** — the template you build renders live sends unchanged.

- **Metric / event name:** `LLL Booking Assistant Custom Operator Message`
- **Notification kind (code):** `custom_operator_message`
- **Event properties (template bindings):**
  - `subject` — operator-authored subject
  - `body` — operator-authored message (plain text / light HTML)
  - `deal_label` — short sailing label for context
  - `resume_url` — guest secure-resume link (safe to include)
  - `reminder_controls_url` — guest reminder-controls link (safe to include)
  - `delivery_id` — idempotency key for the send

## Seeding the event (do this first, to build the template)

A seed script fires one sample event so the metric + a profile appear in the
Klaviyo dashboard before the feature code ships.

```
npm run seed:klaviyo-custom-email -- you@example.com
```

- The email arg is optional (defaults to a fake seed address). Use a real inbox
  you control to preview the rendered template end to end.
- Reads `KLAVIYO_PRIVATE_API_KEY` from `.env.local` (the npm script passes
  `--env-file=.env.local`).
- Reuses `upsertKlaviyoProfile` + `trackKlaviyoEvent` from
  `lib/integrations/klaviyo.ts`, so the event shape matches the real transport.
- Source: `scripts/seed-klaviyo-custom-operator-email.ts`.

Ran successfully on July 26, 2026 against `halimedetech@gmail.com`
(`accepted=true`). The metric now exists in Klaviyo.

### Template to build in Klaviyo

Create a flow triggered by the `LLL Booking Assistant Custom Operator Message`
metric, with a single email that renders:

- Subject: `{{ event.subject }}`
- Body: `{{ event.body }}` (preserve line breaks; the body is authored as plain
  text with `\n` line breaks)
- Optionally surface `{{ event.deal_label }}` in a header and
  `{{ event.reminder_controls_url }}` in the footer.

## Implementation (shipped code)

Reuses existing transport, redaction, journal, and operator-auth patterns.

| Layer | File | Change |
| --- | --- | --- |
| Contracts | `lib/booking-assistant/contracts.ts` | Added `operator_custom_email_sent` to `bookingJournalEventTypes`. |
| Transport | `lib/booking-assistant/notifications.ts` | Added `custom_operator_message` to `BookingNotificationKind`, `EVENT_NAMES`, and the `BookingNotification` fields (`subject`, `body`); passes both into the Klaviyo event properties. |
| Service | `lib/booking-assistant/operator-custom-email.ts` (new) | Validates length; runs `subject`/`body` through `redactConversationText` + `assertNoRestrictedStructuredContent`; loads draft; requires saved email + `transactionalEmailConsent`; issues resume token; sends via transport; appends `operator_custom_email_sent`. Accepts a `source` (`operator_compose` \| `copilot_draft`). |
| Event registry | `lib/booking-assistant/event-registry.ts` | Registered `operator_custom_email_sent` (owner `operator`, `protected_metadata`, analytics `subjectLength`, `bodyLength`, `delivered`, `source` — never the body). |
| API route | `app/api/booking-assistant/custom-email/route.ts` (new) | Operator-authenticated POST `{ draftId, subject, body, source? }` via `createOperatorRouteContext`. Derives public base URL from `BOOKING_ASSISTANT_PUBLIC_BASE_URL` → `NEXT_PUBLIC_SITE_URL` → request origin. Validation/consent/redaction failures return 400; unexpected faults 500. |
| Console UI | `app/(tests)/tests/booking-assistant-operator/custom-email-composer.tsx` (new) | Self-contained compose box (subject + body + Send). Exposes an imperative `seed({ subject?, body })` handle so the Copilot can pre-fill it and scroll it into view. |
| Console wiring | `app/(tests)/tests/booking-assistant-operator/page.tsx` | Renders `<CustomEmailComposer>` under the Copilot panel with a ref; passes `onSendToGuest` into the Copilot panel that calls the composer's `seed`. |
| Copilot UI | `app/(tests)/tests/booking-assistant-operator/operator-copilot-panel.tsx` | New optional `onSendToGuest` prop; "Send this to guest as email" button under an answer (shown when a draft is selected) that seeds the composer with the answer text and a sailing-derived subject. |

## Verification (July 26, 2026)

- `npx tsc --noEmit`: 0 errors across the project.
- `npm run test:booking-assistant:operator-copilot` and `:no-agents`: pass.
- `npm run test:booking-assistant:contracts` fails on a **pre-existing** assertion
  (`cancelled must be terminal`) unrelated to this change — confirmed by
  stashing the `contracts.ts` edit and reproducing the same failure.
- Playwright drive of `/tests/booking-assistant-operator`: composer renders; Send
  disabled with no draft; Copilot panel present. API negative tests: missing
  draft → 400 "Booking draft was not found."; body with a test card number →
  400 "contains payment, identity, or proof content that cannot be sent."

## Guardrails (respect BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md non-negotiables)

- **Redaction before send** — body/subject rejected if they contain card
  numbers (Luhn) or Tier-C identity/proof content, via `redaction.ts`.
- **Consent-gated** — only sends when `transactionalEmailConsent` is true.
- **Human-in-the-loop** — Copilot pre-fills; operator reviews/edits/sends.
- **Journaled, PII-safe** — `operator_custom_email_sent` records that a message
  was sent (and its length), never the raw body, in analytics.
- **No new PII in the Copilot** — the send happens server-side by `draftId`; the
  Copilot never receives the guest email address.

## Related

- Plan: `BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md`
- Existing templated transport: `lib/booking-assistant/notifications.ts`
- Redaction: `lib/booking-assistant/redaction.ts`
- Operator action pattern (`email_guest` mailto today): `lib/booking-assistant/operator-actions.ts`
