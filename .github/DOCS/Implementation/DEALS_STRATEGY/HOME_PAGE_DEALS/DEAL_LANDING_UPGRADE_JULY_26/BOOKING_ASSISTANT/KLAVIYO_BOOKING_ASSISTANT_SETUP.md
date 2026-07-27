# Booking Assistant Klaviyo Setup

Date: July 26, 2026

Purpose: create and activate every Booking Assistant transactional email flow, including No Agents mode, in one work session.

## 1. Before opening Klaviyo

Confirm `.env.local` contains:

```text
KLAVIYO_PRIVATE_API_KEY=pk_...
BOOKING_ASSISTANT_PUBLIC_BASE_URL=https://your-public-site.example
```

The private key needs permission to create/update profiles and create events. Do not put it in a browser-exposed environment variable.

The application sends event-triggered emails. It does not select Klaviyo template IDs in code. The exact event name is the contract between the application and each Klaviyo flow.

## 2. Seed all six Booking Assistant events

Before creating flows, send one sample of every event to an email address you control:

```powershell
npm run klaviyo:test-booking-assistant -- --email your-test-email@example.com
```

This creates the metrics and supplies recent-event preview data. The sample resume links deliberately point to `example.com`; they are template data only.

Expected output:

```text
resume_receipt: accepted
continue_later_reminder: accepted
ready_to_call_receipt: accepted
ready_to_call_reminder: accepted
callback_requested_receipt: accepted
no_agents_try_later_receipt: accepted
```

## 3. Create these six metric-triggered flows

Create one flow per event. Use the event name exactly as written.

| Flow name | Trigger event | Recommended subject |
| --- | --- | --- |
| Booking Assistant - Progress Saved | `LLL Booking Assistant Progress Saved` | Your cruise information is saved |
| Booking Assistant - Continue Later Reminder | `LLL Booking Assistant Continue Later Reminder` | Ready to continue your cruise details? |
| Booking Assistant - Ready To Call | `LLL Booking Assistant Ready To Call` | Your cruise details are ready for your booking agent |
| Booking Assistant - Call Reminder | `LLL Booking Assistant Call Reminder` | Your saved cruise details are ready when you are |
| Booking Assistant - Callback Requested | `LLL Booking Assistant Callback Requested` | Your callback request is confirmed |
| Booking Assistant - No Agents Progress Saved | `LLL Booking Assistant No Agents Progress Saved` | Your cruise information is saved for later |

For each flow:

1. Create a metric-triggered flow.
2. Select the exact event above.
3. Add one email immediately after the trigger.
4. Set the message to transactional if the account supports that designation.
5. Do not add marketing list membership as a requirement.
6. Do not add a marketing-consent filter. These messages deliver requested booking-service information.
7. Keep Smart Sending off for immediate receipts. Application idempotency and reminder ceilings control duplicates.
8. Keep the recurring reminder flows separate from immediate receipts so their performance and suppression behavior remain visible.

## 4. Event properties available in templates

Use Klaviyo event variables from the trigger event:

| Property | Meaning | Present for |
| --- | --- | --- |
| `event.resume_url` | One-time secure resume exchange URL | All six events |
| `event.reminder_controls_url` | Booking page used for reminder controls | All six events |
| `event.deal_label` | Guest-safe Deal/cruise label | All six events |
| `event.next_task_label` | Next saved intake task | Progress/continue-later messages |
| `event.fallback_call_key` | Stable three-letter fallback key | Ready-to-call messages when available |
| `event.agency_phone` | Configured booking-agent phone | Ready-to-call messages when configured |
| `event.callback_window_label` | Requested callback window | Callback receipt |
| `event.delivery_id` | Application idempotency identifier | All six events |

In Klaviyo's editor, insert these through **Personalization > Event properties**. Do not type a variable syntax from memory if the editor presents a different syntax for the account; choose the property from the recent test event.

## 5. Required template copy

### Progress Saved

Headline: `Your cruise information is saved`

Body:

> We saved the information you have confirmed so far. Use the secure button below to continue where you left off.

Button: `Continue my booking information` -> `event.resume_url`

Footer note:

> Nothing has been booked, held, or charged.

### Continue Later Reminder

Headline: `Ready when you are`

Body:

> Your saved cruise information is still available. Continue when it is convenient; you will not need to start over.

Optional line when populated:

> Next step: `event.next_task_label`

Button: `Continue where I left off` -> `event.resume_url`

### Ready To Call

Headline: `Your information is ready for your booking agent`

Body:

> Your answers are securely saved. Your booking agent will recheck the live price, cabin availability, discounts, choices, and terms before completing anything with you by phone.

Fallback line:

> If your agent needs help finding your information, your three-letter call key is `event.fallback_call_key`.

Button: `Return to my saved information` -> `event.resume_url`

Boundary:

> Nothing is booked, held, or charged yet, and price or availability may change.

### Call Reminder

Headline: `Your saved cruise details are ready`

Body:

> Return to your saved information when you are ready to speak with a booking agent. We will check agent availability before placing a call.

Button: `Check availability and continue` -> `event.resume_url`

Do not say an agent is available in the email. Availability is checked at button time.

### Callback Requested

Headline: `Your callback request is confirmed`

Body:

> We saved your request for `event.callback_window_label`. An agent will call as close to that window as possible.

Button: `Review my saved information` -> `event.resume_url`

Boundary:

> This is a requested time window, not a guaranteed appointment. Nothing has been booked, held, or charged.

### No Agents Progress Saved

Headline: `Your cruise information is saved`

Body:

> No booking agents were available when you finished, but your information has been retained. Use your secure link whenever you are ready to return. You will not need to complete the form again.

Button: `Return to my saved information` -> `event.resume_url`

Boundary:

> We will check agent availability when you return. Nothing has been booked, held, or charged.

## 6. Design and compliance checklist

- Use one large, high-contrast primary button.
- Keep the main message readable at 16px or larger on an iPhone.
- Do not put the resume URL itself in visible body copy.
- Do not include legal names, birth dates, addresses, traveler details, accessibility details, or payment language.
- Do not call the three-letter key a confirmation, reservation, booking, hold, payment, or authentication number.
- Do not promise an exact callback time.
- Include Leisure Life identity and the required physical mailing address/footer.
- Include unsubscribe controls only where required by the account's transactional-email policy; do not accidentally suppress requested service receipts through a marketing-list filter.
- Test dark mode, long Deal labels, missing optional properties, and a 320px-wide mobile preview.

## 7. Activate safely

For each flow:

1. Preview with the recent seeded event.
2. Send a Klaviyo test email.
3. Verify the button uses the event's `resume_url`.
4. Verify optional properties disappear cleanly when empty.
5. Set the flow to Manual and trigger one real local Booking Assistant action.
6. Inspect the queued recipient and event properties.
7. Send that one message manually.
8. Only then change the flow to Live.

Recommended activation order:

1. Progress Saved
2. No Agents Progress Saved
3. Callback Requested
4. Ready To Call
5. Continue Later Reminder
6. Call Reminder

The two reminder flows should be activated last because they recur. Immediate receipts are easier to verify and stop.

## 8. End-to-end checks

- Continue later sends one Progress Saved email with a working one-time link.
- Final review sends Ready To Call.
- No Agents > Try again later sends No Agents Progress Saved.
- No Agents > Have an agent call me sends Callback Requested with the correct window.
- Reusing a consumed resume URL fails; the newest email link succeeds.
- No Agents mode prevents a telephone launch even if the page was opened while calls were available.
- A callback request appears in the protected Bookings queue.
- Call reminders are deferred while No Agents mode is active and resume after availability returns.

## 9. Troubleshooting

`Metric does not appear`: run the seed command again and confirm it reports `accepted`.

`Event accepted but no email`: confirm the flow trigger uses the exact event name, the flow is Live, and no marketing-list or Smart Sending filter blocks the profile.

`Button is blank`: select `resume_url` from the trigger event properties rather than profile properties.

`Callback window is blank`: seed again after pulling the No Agents implementation, then choose the newest Callback Requested event in preview.

`Application reports email may be delayed`: inspect the Klaviyo event API response and confirm `KLAVIYO_PRIVATE_API_KEY` is present in the server environment.
