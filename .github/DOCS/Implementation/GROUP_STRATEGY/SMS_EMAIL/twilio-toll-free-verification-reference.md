# Twilio Toll-Free Verification Reference

Use this file as the canonical reference for the current Leisure Life Vacations toll-free SMS verification submission.

This reflects the current implemented system behavior:
- users can optionally provide a mobile number on a campaign waitlist form
- users must explicitly check the SMS consent box before submitting a phone number
- SMS is used for threshold and booking-stage alerts, not broad newsletter marketing
- Privacy and Terms pages already contain SMS program language

## Exact Form Values

### Estimated monthly volume
`10`

### Opt-in type
`Web Form`

### Messaging use case categories
`Account Notifications`

### Proof of consent (opt-in) collected
Use the stable public SMS consent reference page rather than an individual campaign slug.

Enter:

`https://leisurelifevacations.net/sms-consent`

Why this is the correct durable URL:

1. all campaign landing pages use the same waitlist component and the same SMS consent pattern
2. Twilio needs proof of the opt-in mechanism, not a separate URL for every individual cruise campaign
3. this keeps the compliance reference stable even as campaign slugs change over time

This page must be publicly reachable on the live deployed domain.

### Use case description
`Leisure Life Vacations sends optional SMS alerts to travelers who join a specific group cruise waitlist on our website and choose to provide a mobile number for text alerts. Messages include threshold-reached alerts, booking-stage updates, and limited cruise waitlist status notifications for the selected campaign. SMS consent is optional and not required to join the waitlist.`

### Sample message
`Leisure Life Vacations: Great news. The group cruise you joined has reached booking threshold and booking is now available. Check your email for next steps. Reply STOP to opt out, HELP for help.`

### E-mail for notifications
Use the real business/admin email that is actively monitored.

Current recommended value:

`admin@leisurelifevacations.net`

### Additional information
`This messaging program is used for optional group cruise waitlist alerts and booking updates only. Users opt in by entering a mobile number and checking the SMS consent box on the campaign waitlist form.`

### Opt-In Confirmation Message
Leave blank.

Reason: the current system does not implement a separate inbound keyword opt-in flow.

### Help Message Sample
Leave blank.

Reason: the current system does not implement inbound HELP handling.

### Privacy Policy URL
`https://leisurelifevacations.net/privacy`

### Terms & Conditions URL
`https://leisurelifevacations.net/terms`

### Opt-In Keywords
Leave blank.

Reason: the current system does not use SMS keyword opt-in.

## Why These Values Are Correct

These values are aligned to both the implemented code and the campaign strategy:
- strategy treats SMS as an action-oriented alert channel, especially for threshold and booking-stage updates
- the waitlist form now includes optional phone capture plus explicit SMS consent
- the Privacy page includes mobile messaging privacy language
- the Terms page includes SMS program terms
- the system is not currently using keyword opt-in, HELP automation, or broad promotional SMS campaigns

## Implementation Reality Check

Before submitting toll-free verification, confirm all of the following are true on the live deployed site:

1. The SMS consent page is publicly reachable.
2. It accurately describes the live waitlist opt-in flow.
3. The waitlist form includes the phone field.
4. The waitlist form includes the SMS consent checkbox.
5. The Privacy Policy link is visible on the waitlist form.
6. The Terms of Service link is visible on the waitlist form.
7. The privacy page is live.
8. The terms page is live.

If the public landing page does not visibly show the consent story you are submitting to Twilio, verification may be rejected.

## Current Compliance Story

This is the story being represented to Twilio:
- a user joins a specific cruise campaign waitlist on the website
- providing a phone number is optional
- if the user provides a phone number, they must explicitly check consent for SMS alerts
- messages relate only to the selected cruise campaign, such as threshold and booking updates
- users can opt out by replying STOP

## Do Not Enter

Do not invent any of the following unless the system actually supports them:
- keyword opt-in such as START or SUBSCRIBE
- inbound HELP automation
- inbound STOP automation beyond carrier-level handling
- general marketing/newsletter SMS use
- multiple unrelated use cases not represented by the current app

## Next Follow-Up

After toll-free verification is approved, the next technical cleanup step should be to support Twilio Messaging Service SID sending in app code so the sender configuration aligns cleanly with Twilio’s verified messaging setup.
