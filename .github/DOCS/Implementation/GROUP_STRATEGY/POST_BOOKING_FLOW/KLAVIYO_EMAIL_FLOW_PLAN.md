# Klaviyo Email Flow Plan

> **Phases 1 + 2 + 3 + 4 shipped.** See [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md) (three nurture emails), [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md) (five pre-booking lifecycle events), [PHASE_3_IMPLEMENTATION.md](./PHASE_3_IMPLEMENTATION.md) (five post-booking core emails + the daily scheduler at `/api/cron/email-scheduler`), and [PHASE_4_IMPLEMENTATION.md](./PHASE_4_IMPLEMENTATION.md) (`LLL Booking Change` with severity branches, Twilio SMS on critical, and the manual follow-up dashboard at `/tests/booking-changes`). End-to-end live testing across all phases is covered by [KLAVIYO_LIVE_TEST_PLAN.md](./KLAVIYO_LIVE_TEST_PLAN.md). Phase 5 (post-cruise / alumni) remains unimplemented.

This plan defines the complete Klaviyo email architecture for Shadow Group campaigns, replacing the basic starter emails with polished, campaign-personalized flows from first signup through post-cruise rebooking.

---

## 1. Current State

The current app integration is intentionally minimal.

**Code path:**
- `app/api/groups/campaign/[slug]/waitlist/route.ts` saves the waitlist entry and calls `sendWaitlistConfirmation()`.
- `lib/campaigns/nurture-orchestrator.ts` maps nurture stages to Klaviyo event names.
- `lib/integrations/klaviyo.ts` upserts the profile and tracks a Klaviyo event.
- `app/api/groups/campaign/[slug]/nurture/route.ts` can manually dispatch the same stages.

**Current Klaviyo events:**

| App Stage | Klaviyo Event | Current Purpose |
|-----------|---------------|-----------------|
| `waitlist_confirmation` | `LLL Waitlist Confirmation` | Signup confirmation |
| `nurture_day3` | `LLL Nurture Day 3` | Early waitlist nurture |
| `nurture_day7` | `LLL Nurture Day 7` | Follow-up nurture |

**Current SMS event:**

| App Stage | Provider | Current Purpose |
|-----------|----------|-----------------|
| `threshold_sms` | Twilio | Alert phone-opted leads when threshold is met |

**Gap:** The current setup proves the wire works, but it does not yet deliver the emotional, visual, campaign-specific experience required for premium themed cruise conversion.

---

## 2. Email Strategy

Every Klaviyo message should feel like a designed campaign artifact, not a transactional system email.

**Tone principles:**
- Vacation-first, community-second.
- Stylish, warm, and highly specific to the campaign theme.
- Never overpromise confirmed group amenities before they are confirmed.
- Avoid generic cruise-brochure language.
- Make every email answer: "Why this trip, why now, and what should I do next?"

**Design principles:**
- Use campaign visual system: palette, hero image, designed ad assets, itinerary cards, merch mockups where available.
- Maintain one consistent Leisure Life email shell.
- Use campaign-specific modules inside that shell.
- Every email has one primary CTA.
- Secondary CTAs should be restrained.

**Personalization principles:**
- Use first name when available.
- Use `campaign_name`, `campaign_slug`, `booking_mode`, `passenger_count`, `preferred_cabin_type`.
- Later phases add `ship_name`, `sail_date`, `departure_port`, `community_channel_url`, `merchandise_store_url`, `reservation_number`, `final_itinerary_url`, and `tour_conductor_name`.

---

## 3. Required Klaviyo Profile Properties

The current profile upsert sends only a small set of properties. We should expand the profile property contract so Klaviyo templates can be richly personalized without hardcoding campaign content in Klaviyo.

### Existing Properties

| Property | Source |
|----------|--------|
| `campaign_slug` | Campaign slug |
| `campaign_name` | Campaign name |
| `booking_mode` | Waitlist entry |
| `passenger_count` | Waitlist entry |

### Add Next

| Property | Source | Purpose |
|----------|--------|---------|
| `first_name` | Waitlist entry | Greeting |
| `preferred_cabin_type` | Waitlist entry | Cabin-specific personalization |
| `campaign_status` | Campaign metadata | Flow branching |
| `campaign_stage_label` | Landing view model or derived helper | Guest-readable status |
| `hero_image_url` | Media manifest or landing model | Email visual header |
| `landing_page_url` | Campaign slug | Primary CTA |
| `booking_link_url` | Campaign metadata | Threshold/booking CTA |
| `community_channel_url` | Campaign metadata | Community CTA |
| `merchandise_store_url` | Campaign metadata | Merch CTA |
| `ship_name` | Campaign metadata | Travel details |
| `sail_date` | Campaign metadata | Countdown/details |
| `departure_port` | Campaign metadata | Travel prep |
| `final_itinerary_url` | Final itinerary publish flow | Itinerary CTA |
| `tour_conductor_name` | TC assignment | TC announcement |

---

## 4. Event Architecture

Keep the current event-triggered Klaviyo architecture. The app owns truthful event firing and data. Klaviyo owns template design, delays, splits, and copy iteration.

### Pre-Booking Events

| Event | Trigger | Purpose |
|-------|---------|---------|
| `LLL Waitlist Confirmation` | Immediately after valid waitlist signup | Confirm entry and deepen desire |
| `LLL Nurture Day 3` | 3 days after signup, if not threshold/converted | Community and theme expansion |
| `LLL Nurture Day 7` | 7 days after signup, if not threshold/converted | Urgency + social proof |
| `LLL Threshold Met` | Campaign crosses threshold | Trip is viable; move guest to booking action |
| `LLL Manifest Requested` | Manifest collection opens | Collect guest details |
| `LLL Manifest Reminder` | Manifest incomplete after delay | Complete manifest |
| `LLL Booking Link Ready` | Booking link available | Send CB/Odysseus booking path |
| `LLL Campaign Expired` | Campaign dies before threshold | Graceful close + adjacent campaign CTA |

### Post-Booking Events

| Event | Trigger | Purpose |
|-------|---------|---------|
| `LLL Booking Confirmed` | Guest is marked `converted=true` | Welcome into booked guest journey |
| `LLL Travel Prep` | Scheduled by sail date | Flight/hotel/passport/insurance prep |
| `LLL Final Countdown` | 14, 7, 3, 1 days pre-sail | Prepare and build anticipation |
| `LLL Final Itinerary Published` | Human confirms itinerary | Deliver final group schedule |
| `LLL Tour Conductor Announced` | TC assigned | Introduce human onboard host |
| `LLL Onboard Touchpoint` | During sailing | Daily lightweight group ritual reminder |
| `LLL Post Cruise Welcome Home` | 1 day after disembarkation | Warm close + photo/community CTA |
| `LLL Post Cruise Survey` | 3 days after disembarkation | Capture feedback and testimonials |
| `LLL Alumni Rebooking Invite` | New adjacent campaign launches | Rebook warm past guests |

### Change Notification Event

| Event | Trigger | Purpose |
|-------|---------|---------|
| `LLL Booking Change` | Ship/date/itinerary/price/cancellation/positive update | Severity-based guest notification |

---

## 5. Flow Map

### Flow A: Waitlist Conversion Flow

**Trigger:** `LLL Waitlist Confirmation`

**Audience:** New leads with valid email.

**Email 1: Entry Confirmed**
- **Timing:** Immediate
- **Subject ideas:**
  - `You're on the list for {{ campaign_name }}`
  - `Your spot is saved — now let's see if this sailing becomes real`
- **Primary job:** Confirm the entry, explain threshold model, make the campaign feel real.
- **Primary CTA:** Return to campaign page.
- **Modules:** Hero image, threshold explanation, what happens next, share/invite block.

**Email 2: Day 3 Niche Deepener**
- **Timing:** 3 days after signup if not converted/expired
- **Subject ideas:**
  - `The kind of people this sailing is being built for`
  - `This is not a generic cruise crowd`
- **Primary job:** Expand the emotional value of the theme and guest community.
- **Primary CTA:** Drop an idea in the campaign chat.
- **Modules:** Theme story, guest idea prompt, sample onboard rituals.

**Email 3: Day 7 Momentum Check**
- **Timing:** 7 days after signup if not converted/expired
- **Subject ideas:**
  - `A quick status check on {{ campaign_name }}`
  - `Where this sailing stands right now`
- **Primary job:** Show progress, create urgency without pressure.
- **Primary CTA:** Invite one likely guest or choose booking intent.
- **Modules:** Threshold progress, waitlist count/social proof, next-step options.

---

## 6. Pre-Booking Stage Emails

### `LLL Threshold Met`

**When:** Campaign reaches public threshold.

**Primary message:** The trip has enough demand to move into booking coordination.

**Tone:** Celebratory but precise.

**Subject ideas:**
- `It's happening: {{ campaign_name }} reached the threshold`
- `The group is real — next step inside`

**CTA:** Complete manifest or move to booking path.

**Important copy rule:** Say the group has reached the internal demand threshold. Do not imply cruise line space is permanently secured until booking path is live and confirmed.

### `LLL Manifest Requested`

**When:** Manifest collection opens.

**Primary message:** We need the traveler details that make the booking path possible.

**Subject ideas:**
- `Next step: tell us who's sailing with you`
- `Your traveler details are needed for {{ campaign_name }}`

**CTA:** Complete guest manifest.

**Modules:** Why we need the info, privacy reassurance, deadline, what happens after submission.

### `LLL Booking Link Ready`

**When:** CB/Odysseus booking link is available.

**Primary message:** Booking is now actionable.

**Subject ideas:**
- `Your booking path is ready`
- `Ready to book {{ campaign_name }}?`

**CTA:** Open booking link.

**Modules:** Booking path explanation, group vs independent booking clarification, support path.

### `LLL Campaign Expired`

**When:** Campaign does not reach threshold or becomes unavailable.

**Primary message:** Close the loop gracefully and redirect interest.

**Subject ideas:**
- `This one won't sail as a group — but here's what's next`
- `An update on {{ campaign_name }}`

**CTA:** View nearby/adjacent campaigns.

**Tone:** Honest, warm, not apologetic beyond what is appropriate.

---

## 7. Post-Booking Emails

### `LLL Booking Confirmed`

**When:** `converted=true` is set.

**Primary message:** They are no longer just interested; they are in.

**Subject ideas:**
- `You're in — welcome aboard {{ campaign_name }}`
- `Booked: your place in {{ campaign_name }} is confirmed`

**CTA:** Open Your Trip dashboard.

**Modules:** Confirmation, what happens next, community link, travel checklist preview, merch preview.

### `LLL Travel Prep`

**When:** 90/60/30 days pre-sail or adapted to available timeline.

**Primary message:** Help them get to the ship without becoming their travel agency.

**Subject ideas:**
- `A few smart travel moves before {{ campaign_name }}`
- `Flights, hotels, documents — your pre-cruise checklist`

**CTA:** Open travel checklist.

**Modules:** Departure port, document reminders, hotel/flight referral links, insurance reminder.

### `LLL Final Countdown`

**When:** 14/7/3/1 days pre-sail.

**Primary message:** Excitement + practical readiness.

**Subject ideas:**
- `Two weeks out: what to pack for {{ campaign_name }}`
- `Seven days until the group meets onboard`
- `Final details before you sail`
- `Tomorrow: see you at the ship`

**CTA:** Open final details dashboard.

**Modules:** Packing list, boarding reminder, community prompt, merch last call when applicable.

### `LLL Final Itinerary Published`

**When:** Human confirms itinerary with cruise line liaison.

**Primary message:** The onboard group schedule is ready.

**Subject ideas:**
- `Your group itinerary is ready`
- `Here's the plan for {{ campaign_name }} onboard`

**CTA:** View final itinerary.

**Modules:** Daily rhythm preview, featured meetups, who hosts what, caveat that ship operations may adjust timing.

### `LLL Tour Conductor Announced`

**When:** Human TC is assigned.

**Primary message:** Introduce the onboard human host.

**Subject ideas:**
- `Meet your Tour Conductor for {{ campaign_name }}`
- `The friendly face helping the group connect onboard`

**CTA:** Meet the TC / open community channel.

**Modules:** TC intro, what the TC does, what the TC does not do, community etiquette.

### `LLL Post Cruise Welcome Home`

**When:** 1 day after disembarkation.

**Primary message:** Warm close and memory capture.

**Subject ideas:**
- `Welcome home from {{ campaign_name }}`
- `That was a real one`

**CTA:** Share photos or favorite moment.

### `LLL Post Cruise Survey`

**When:** 3 days after disembarkation.

**Primary message:** Collect structured feedback.

**Subject ideas:**
- `Tell us what made the sailing work`
- `Five quick questions about {{ campaign_name }}`

**CTA:** Take survey.

### `LLL Alumni Rebooking Invite`

**When:** New same/adjacent niche campaign launches.

**Primary message:** Give past guests first access.

**Subject ideas:**
- `Alumni first look: the next {{ niche }} sailing`
- `Want first pick on the next group cruise?`

**CTA:** View alumni invite.

---

## 8. Change Notification Flow

**Trigger:** `LLL Booking Change`

**Required properties:**
- `change_type`
- `severity`
- `previous_value`
- `new_value`
- `campaign_slug`
- `campaign_name`
- `sail_date`
- `action_required`
- `action_deadline`

### Severity Branches

| Severity | Flow Behavior |
|----------|---------------|
| `critical` | Immediate email, SMS fallback, manual follow-up task, 48h reminder if no acknowledgment |
| `high` | Immediate email, 72h reminder |
| `medium` | Single direct email |
| `low` | Single soft update email |
| `positive` | Celebration/update email |

### Copy Rules

- Be explicit about what changed.
- Put old vs new values in a clear comparison block.
- State whether action is required.
- Never bury cancellation language.
- For critical changes, include direct support contact.

---

## 9. Email Design System

### Base Shell

**Header:** Leisure Life Interactive mark + campaign visual accent.

**Hero:** Campaign-specific generated hero or designed email header.

**Body modules:**
- Status card
- Campaign story block
- Progress/threshold block
- What happens next block
- Primary CTA button
- Secondary support link
- Fine-print trust note

**Footer:**
- Leisure Life Interactive identity
- Why they are receiving the email
- Unsubscribe/manage preferences
- Support contact

### Visual Modes

| Mode | Use |
|------|-----|
| `cinematic_invite` | Waitlist confirmation, booking confirmed |
| `field_note` | Travel prep, practical updates |
| `status_briefing` | Threshold, manifest, booking link, change notices |
| `celebration` | Threshold met, itinerary published, TC announced |
| `afterglow` | Post-cruise welcome, alumni invite |

---

## 10. Implementation Plan

### Phase 1: Fix The Current Three Emails

1. Upgrade `LLL Waitlist Confirmation` copy, layout, and event properties.
2. Upgrade `LLL Nurture Day 3` as the niche/community deepener.
3. Upgrade `LLL Nurture Day 7` as momentum/social proof/decision email.
4. Add preview payload docs for each email.
5. Add a `/tests` page or operator tool to send dry-run/test events for a selected campaign and email.

### Phase 2: Add Missing Pre-Booking Events

1. `LLL Threshold Met`
2. `LLL Manifest Requested`
3. `LLL Manifest Reminder`
4. `LLL Booking Link Ready`
5. `LLL Campaign Expired`

### Phase 3: Add Post-Booking Core

1. `LLL Booking Confirmed`
2. `LLL Travel Prep`
3. `LLL Final Countdown`
4. `LLL Final Itinerary Published`
5. `LLL Tour Conductor Announced`

### Phase 4: Add Change Notifications

1. `LLL Booking Change`
2. Severity branching in Klaviyo
3. Critical-change SMS path
4. Manual follow-up dashboard list

### Phase 5: Add Post-Cruise / Alumni

1. `LLL Post Cruise Welcome Home`
2. `LLL Post Cruise Survey`
3. `LLL Alumni Rebooking Invite`

---

## 11. Code Changes Required Later

**Do not implement until this plan is approved.**

Likely code work:

1. Expand `NurtureStage` in `lib/campaigns/nurture-orchestrator.ts` or split into a new `email-event-orchestrator.ts`.
2. Add strongly typed Klaviyo event payload builders.
3. Expand Klaviyo profile properties from campaign + waitlist + guest records.
4. Add new event dispatch endpoints for operator testing.
5. Add dry-run preview support that returns the exact Klaviyo properties without sending.
6. Add dashboard/test UI for triggering all email events safely.
7. Add event ledger entries for each new lifecycle email.

Preferred architecture:

```
lib/campaigns/email/
  email-event-types.ts
  klaviyo-profile-builder.ts
  klaviyo-event-builder.ts
  email-event-orchestrator.ts
```

This avoids overloading the existing `nurture-orchestrator.ts` with post-booking, change, and alumni events.

---

## 12. First Slice Recommendation

Start with **Phase 1 only**.

**Why:** The current signup confirmation is live today and shapes the first impression. Improving the first three emails gives immediate quality lift without requiring post-booking data model changes.

**First implementation output should be:**
- Updated event property payload for current three events.
- A test/preview surface for `LLL Waitlist Confirmation`, `LLL Nurture Day 3`, and `LLL Nurture Day 7`.
- Complete Klaviyo template briefs for the three current emails.
- No new lifecycle states yet.

---

## 13. Open Decisions

1. **Email template ownership:** Should final HTML live entirely in Klaviyo, or should the app generate reusable HTML modules and push/send properties only?
2. **Asset source:** Should email hero/header images come from landing view model, Phase 2 media manifest, or a dedicated `email_header` artifact?
3. **Preview tooling:** Should the preview live on the existing conversion dashboard or a new `/tests/klaviyo-emails` page?
4. **Flow naming:** Keep `LLL ...` event names or move to a stricter versioned naming scheme like `LLL Campaign Waitlist Confirmation v1`?
5. **Acknowledgment tracking:** For critical changes, should guests click an acknowledgment link that writes back to DynamoDB?
