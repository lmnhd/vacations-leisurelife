# Post-Booking Guest Engagement Strategy

Research, evaluate, and plan the complete post-booking guest lifecycle — from deposit confirmation through post-cruise rebooking — for the Shadow Group campaign system.

---

## 1. Current State: Where The System Ends

The pipeline currently terminates at booking:

```
Waitlist → Threshold → Manifest → CB Booking Link / OdysseusEngine → converted=true → [NOTHING]
```

**What exists today:**
- `USER#` record with `converted: true`, `bookingMode`, `fulfillmentMode`, `phoneNumber`
- `GUEST#` record with full `GUEST_INFO` JSON (travelers, cabins, dining, accessibility, logistics, loyalty programs)
- Klaviyo integration for pre-booking nurture only (waitlist confirmation, Day 3, Day 7, "Trip is GO!", manifest confirmation, expiry)
- Twilio SMS for threshold alerts only
- Community channel (Discord/WhatsApp/Facebook) described but not operationalized
- Merch store opens at threshold, closes 21 days pre-sail — never pushed post-booking
- Chat system blueprint defines `active_voyage` and `post_voyage` contexts (unimplemented)
- `GUEST_INFO.logistics` collects air travel, pre/post hotel, and transfer needs — never acted upon

**The gap:** A guest who books is never contacted again by the system. No welcome, no countdown, no travel prep, no onboard engagement, no post-cruise follow-up, no rebooking path.

---

## 2. Research: What The Cruise Industry Does (And What We Should Do Differently)

### Industry Standard Post-Booking Journey

| Phase | Typical Timeline | Standard Practice |
|-------|-----------------|-------------------|
| Booking Confirmation | Immediately | Transactional email with booking ref, deposit receipt |
| Pre-Cruise Prep | 90→30 days out | Payment reminders, passport/visa nudges, shore excursion upsells, drink package upsells |
| Travel Logistics | 30→7 days out | Flight reminders, hotel offers, transfer booking, luggage tags |
| Final Countdown | 7→1 days out | Check-in reminders, boarding pass, health questionnaire, packing list |
| Onboard | Day 1–7 | Daily planner, spa/restaurant upsells, excursion reminders, onboard account statements |
| Post-Cruise | Day 8–14 | Satisfaction survey, photo gallery upsell, future cruise deposit offer, loyalty status update |
| Rebooking Window | 14–90 days | "Book next cruise onboard" offer, early-bird loyalty pricing, referral program |

### What Makes Our Model Different

- **Niche community, not mass market.** Our guests booked because of shared identity (houseplants, vintage fashion, retro gaming), not because they searched "cheap Caribbean cruise."
- **We own the relationship.** CB owns the booking transaction; we own the guest relationship, preferences, and community. CB does not share structured booking data back — our `GUEST_INFO` is the canonical CRM record.
- **Community is the product.** The themed group experience is why they booked. Post-booking engagement should deepen that community bond, not just upsell.
- **Zero liability model.** We never hold inventory or collect payments. Post-booking services (flights, hotels, insurance) should follow the same referral/affiliate model — we connect, we don't transact.

---

## 3. The Post-Booking Lifecycle: Proposed Phases

### Phase A: Booking Confirmation & Welcome (Day 0–3)

**Goal:** Convert transactional booking into emotional commitment. Make them feel they joined something, not just bought something.

**Actions:**
1. **Immediate: Booking confirmation email** — Warm, niche-voiced. "You're in. Here's what happens next." Includes booking reference, ship name, sail date, departure port. Links to community channel.
2. **Day 1: Welcome sequence email** — "Meet your crew." Introduces the concept of the themed group, the social mechanic (icon+codename, lapel pin, etc.), and what makes this sailing different.
3. **Day 3: Community channel invite** — Direct push into Discord/WhatsApp. "Your people are already here." If they're among the first, frame as founding member status.
4. **Landing page update:** Post-booking, the campaign landing page should detect returning guests (via cookie/email token) and show a personalized "Your Trip" dashboard instead of the public waitlist CTA. Shows: countdown, community link, travel checklist, merch store.

**Channels:** Email (primary), Landing page (personalized), SMS (optional, for threshold-alert opt-ins only)

---

### Phase B: Travel Preparation & Logistics (90→14 Days Out)

**Goal:** Remove friction. Help guests get to the ship without becoming a travel agency.

**What we should do:**
1. **Flight assistance (affiliate model):** Integrate Google Flights or Skyscanner affiliate links. Guest enters departure city → we link to flight options. We earn affiliate commission, zero operational burden. Never book flights for them.
2. **Pre/post-cruise hotel (affiliate model):** Link to Booking.com or Hotels.com with pre-filtered results near the departure port. Same affiliate model.
3. **Cruise port transfers:** Surface options (Uber/Lyft estimates, port parking links, shuttle services). Informational only.
4. **Travel insurance (affiliate model):** Partner with a travel insurance comparison tool or a specific provider with an affiliate program. One email at 60 days out: "Protect your trip."
5. **Passport/visa nudges:** Automated check against `GUEST_INFO.logistics.travel_documents_verified`. If false, trigger reminder sequence at 90, 60, 30 days.
6. **Payment reminders:** CB handles payment collection, but we can send gentle "final payment due" reminders aligned with the cruise line's payment schedule (typically 90–120 days before sailing). This is a service, not a collection.

**Channels:** Email (primary, sequenced), Landing page dashboard (checklist), SMS (key deadlines only)

**What we should NOT do:**
- Book flights, hotels, or transfers on behalf of guests
- Hold inventory or collect payment for any travel product
- Become a de facto travel agency — we are a community + booking connector

---

### Phase C: Final Countdown & Excitement Build (14→1 Days Out)

**Goal:** Maximize excitement, minimize anxiety. Ensure everyone shows up prepared.

**Actions:**
1. **Day 14: "The Packing List" email** — Niche-specific packing suggestions (not generic cruise packing). Houseplant cruise: "Your favorite plant photo for camera-roll share." Vintage cruise: "That one piece you've been waiting to wear."
2. **Day 7: "Who's On Board" email** — Anonymous social proof. "12 cabins booked. 28 plant people. 4 first-time cruisers." Builds anticipation without violating privacy.
3. **Day 3: "Final Details" email** — Check-in time, boarding pass reminder, port address, parking/transport links, what to bring to the terminal.
4. **Day 1: "See You Tomorrow" email/SMS** — Short, high-energy. Ship photo, weather at departure port, boarding window.
5. **Community channel:** Daily countdown posts. "5 days." "72 hours." Member-generated excitement content.
6. **Merch last call:** "Last chance — merch store closes in 48 hours." Urgency without pressure.

**Channels:** Email, SMS (Day 1 only), Community channel, Landing page dashboard

---

### Phase D: Onboard Engagement (Day 1–7 of Sailing)

**Goal:** Enhance the cruise experience without being intrusive. Be useful, not annoying.

**What's possible on a ship:**
- Guests have ship Wi-Fi (typically paid, but increasingly included). Email and messaging apps work.
- The cruise line's own app handles daily schedules, restaurant bookings, and onboard accounts.
- We should NOT compete with the cruise line's app. We should complement it.

**Actions:**
1. **Day 1: "You're On Board" email** — Welcome aboard. Reminder of the first themed meetup time/location. "Look for the [icon] pins."
2. **Daily themed touchpoint reminders** — One short email or community post per day with the day's themed micro-event (coffee hello, golden-hour photo share, pre-dinner salute). These are the lightweight social rituals defined in the campaign blueprint.
3. **Community channel:** The primary onboard coordination tool. "Who's at the sunset deck?" Photo shares, spontaneous meetup calls.
4. **"Cruise Buddy" chat context (`active_voyage`):** The AI assistant should recognize the guest is on an active sailing and shift context. Use cases: "What time is our group dinner?" "Where's the coffee hello today?" "I lost my lapel pin — can I get another?"
5. **Shore excursion coordination:** If guests want to do excursions together, the community channel is the coordination layer. We don't book excursions — we facilitate group formation.

**What we should NOT do:**
- Send push notifications (requires app install, oversteps)
- Duplicate the cruise line's daily planner
- Require guests to be on their phones — the cruise is the experience

**Channels:** Email (1/day max), Community channel (guest-driven), Chat (`active_voyage` context)

---

### Phase E: Post-Cruise & Rebooking (Day 8–90 After Sailing)

**Goal:** Capture the post-trip high, collect feedback, seed the next booking.

**This is the highest-ROI phase.** A guest who just had a great themed cruise is the single most likely person to book another one. The window is short — cruise lines know this, which is why they push "book next cruise onboard."

**Actions:**
1. **Day 1 post-cruise: "Welcome Home" email** — Warm, not salesy. Photo share invitation. Link to community channel (keep the group alive post-cruise).
2. **Day 3: Satisfaction survey** — Short (5 questions). "What was your favorite moment?" "What would make the next one even better?" "Would you cruise with this group again?" This is CRM gold and directly feeds the next discovery sprint.
3. **Day 7: Photo album share** — Community-generated photo collection. "Your trip in photos." Deepens nostalgia and social bonds.
4. **Day 14: "What's Next" email** — First rebooking pitch. "We're planning the next [theme] sailing. Want first access?" Link to a pre-registration page for the next iteration.
5. **Day 30: Loyalty/early-bird offer** — "Alumni get first pick of cabins on the next sailing." Creates FOMO and rewards loyalty.
6. **Day 60–90: Rebooking campaign** — Targeted emails to past guests when a new campaign in the same or adjacent niche launches. These are the highest-converting leads in the system.
7. **Post-cruise chat context (`post_voyage`):** AI assistant handles post-trip questions: "Can I get a copy of my booking receipt?" "My luggage was damaged." "I want to book the same ship next year."

**Channels:** Email (sequenced), Community channel (keep alive), Chat (`post_voyage` context), Landing page (alumni portal)

---

## 4. Channel Strategy: What Goes Where

| Channel | Pre-Booking (Exists) | Post-Booking (New) | Rationale |
|---------|---------------------|-------------------|-----------|
| **Email** | Waitlist nurture, "Trip is GO!", manifest reminders, expiry | Welcome, travel prep, countdown, onboard touchpoints, post-cruise survey, rebooking | Primary channel. Owned, sequenced, measurable. Klaviyo already integrated. |
| **SMS** | Threshold alert only | Day 1 pre-sail nudge, key deadline reminders (passport, final payment) | High-open but intrusive. Reserve for 3–4 critical moments only. |
| **Landing Page** | Public waitlist CTA, social proof counter | Personalized post-booking dashboard (countdown, checklist, community link, merch) | Converts anonymous visitors differently than booked guests. Same URL, different view. |
| **Community Channel** | Described but not operationalized | Pre-cruise hype, onboard coordination, post-cruise photo sharing, alumni community | Highest-engagement surface. Guest-driven, not system-driven. |
| **AI Chat** | Booking flow, cruise search | `active_voyage` context (onboard assistant), `post_voyage` context (post-trip support) | Already defined in chat system blueprint. Needs implementation. |

---

## 5. Change Notifications: The Klaviyo Upgrade

**Current state:** Klaviyo is integrated (`lib/integrations/klaviyo.ts`) but only used for pre-booking nurture events (waitlist confirmation, Day 3, Day 7). The nurture orchestrator (`lib/campaigns/nurture-orchestrator.ts`) fires Klaviyo events that trigger flows — but there are no post-booking flows and no change-notification flows at all.

**The problem:** If the ship changes, the sail date moves, the itinerary shifts, or the campaign is cancelled after bookings exist, guests currently receive nothing. This is a trust-destroying gap. In the cruise industry, ship swaps and itinerary changes are common — we need a reliable notification pipeline.

### Change Scenarios To Handle

| Change Type | Severity | Notification Urgency |
|-------------|----------|---------------------|
| Ship swap (same class, same dates) | Medium | Within 24 hours |
| Ship swap (different class/amenities) | High | Within 6 hours |
| Sail date change (±1–2 days) | High | Within 12 hours |
| Sail date change (different month) | Critical | Within 6 hours + SMS |
| Itinerary change (port swap) | Low | Within 48 hours |
| Itinerary change (port cancelled, sea day added) | Medium | Within 24 hours |
| Price change (CB group rate adjustment) | Medium | Within 48 hours |
| Campaign cancelled / expired with bookings | Critical | Within 6 hours + SMS + manual agent follow-up |
| Final itinerary published | Positive | Scheduled (not urgent) |
| Tour conductor announced | Positive | Scheduled (not urgent) |

### Klaviyo Architecture Changes Needed

**1. New Klaviyo event: `LLL Booking Change`**

```typescript
// Triggered whenever a METADATA field affecting guests changes
await trackKlaviyoEvent({
    email: guestEmail,
    eventName: 'LLL Booking Change',
    properties: {
        change_type: 'ship_swap' | 'date_change' | 'itinerary_change' | 'cancellation' | 'itinerary_published' | 'tc_announced',
        severity: 'critical' | 'high' | 'medium' | 'low' | 'positive',
        previous_value: string,
        new_value: string,
        campaign_slug: string,
        campaign_name: string,
        sail_date: string,
        action_required: boolean,
        action_deadline: string | null,
    },
});
```

**2. New Klaviyo flows to build in the Klaviyo dashboard:**

| Flow Name | Trigger | Emails in Sequence |
|-----------|---------|-------------------|
| `LLL Change - Critical` | `LLL Booking Change` with `severity=critical` | Immediate email + SMS fallback + 48h follow-up if no acknowledgment |
| `LLL Change - High` | `LLL Booking Change` with `severity=high` | Immediate email + 72h follow-up |
| `LLL Change - Medium/Low` | `LLL Booking Change` with `severity=medium` or `low` | Single email within timeframe above |
| `LLL Change - Positive` | `LLL Booking Change` with `severity=positive` | Single email, excitement tone (itinerary published, TC announced) |

**3. New `METADATA` fields for change tracking:**

```
changeLog: JSON array of { changeType, previousValue, newValue, changedAt, notifiedAt, notifiedCount }
lastChangeNotifiedAt: ISO timestamp
```

**4. New module: `lib/guests/change-notifier.ts`**

- Watches for changes to `METADATA` fields (shipTarget, targetDates, highlightEvents, status, cbagenttoolsBookingLink)
- On change detection, compares against previous values in `changeLog`
- Determines severity and fires `trackKlaviyoEvent` for every `USER#` record with `converted=true`
- For critical changes, also triggers Twilio SMS
- Appends to `changeLog` after successful notification

### Human-in-the-Loop for Critical Changes

For cancellations and major date changes, the system should:
1. Fire all automated notifications immediately
2. Flag the campaign in an internal alert channel (Slack/Pushover)
3. Surface a "needs manual follow-up" list of affected guests
4. The agent (you) can then call CB to understand options and send a personalized follow-up

---

## 6. AI-Composed Final Itinerary

**Current state:** The landing chat (`app/api/groups/campaign/[slug]/chat/route.ts`) has four channels — `main`, `ideas`, `logistics`, `meetups`. The `ideas` channel already extracts guest suggestions via `extractAndSaveIdea()` (`lib/campaigns/guest-ideas.ts`). The `meetups` channel captures meetup intentions. But none of this data is synthesized into a final itinerary.

**The goal:** Throughout the campaign development period (from first booking until ~2 weeks before sailing), the system should continuously monitor chat data and use AI to compose a final group itinerary. This itinerary becomes the canonical event schedule that the tour conductor executes onboard.

### Data Sources For Itinerary Composition

| Source | What It Provides |
|--------|-----------------|
| `ideas` channel chat history | Guest-proposed activities, events, workshops, mixers |
| `meetups` channel chat history | Guest meetup intentions, spontaneous group formations |
| `proposedEvents` on `USER#` records | Original signup-form event suggestions |
| Campaign blueprint | Themed social mechanic, daily rhythm, operational non-negotiables |
| Ship deck plans / amenities | What spaces are actually available (from SerpAPI reference imagery) |
| Sailing itinerary (port days vs. sea days) | Which days can host events vs. which days guests are ashore |

### How It Should Work

**Continuous monitoring phase (booking → 3 weeks pre-sail):**

1. A scheduled job (weekly) pulls all `ideas` and `meetups` channel messages since last scan.
2. Extracted ideas are stored in a new `CAMPAIGN#<slug>` / `IDEAS_LOG` DynamoDB record.
3. Ideas are deduplicated and clustered by theme (e.g., "3 guests want a board game night, 2 want a card tournament → cluster: tabletop gaming evening").

**Composition phase (3 weeks pre-sail):**

1. AI prompt assembles all clustered ideas + campaign blueprint constraints + ship/sailing context.
2. AI produces a draft `FinalItinerary` object:

```typescript
interface FinalItinerary {
    campaignSlug: string;
    generatedAt: string;
    sailDate: string;
    shipName: string;
    
    events: {
        day: number;                    // Day 1 = embarkation, Day 7 = disembarkation
        dayType: 'embarkation' | 'sea_day' | 'port_day' | 'disembarkation';
        portName?: string;              // If port day
        
        scheduledItems: {
            time: string;               // e.g., "09:00–09:30"
            title: string;              // e.g., "Morning Coffee Hello"
            location: string;           // e.g., "Garden Café, Deck 12 Aft"
            type: 'hosted_ritual' | 'guest_proposed' | 'free_form' | 'optional_excursion';
            host: 'tour_conductor' | 'self_guided' | 'guest_volunteer';
            maxParticipants?: number;
            notes: string;
            sourceIdeaIds: string[];    // Trace back to which guest ideas spawned this
        }[];
    }[];
    
    operationalNotes: string;           // For the TC: accessibility flags, dietary notes, backup locations
    guestHighlights: string;            // "3 guests celebrating birthdays this sailing"
}
```

3. The draft itinerary is stored as `ITINERARY#draft` on the campaign record.
4. A "Final Itinerary Ready for Review" notification fires to the agent (you).

### Human Bridge (Manual Step)

**This is where you step in.** The AI can compose the ideal group itinerary, but it cannot:
- Confirm venue availability with the cruise line's group coordinator
- Reserve private spaces or dining rooms
- Verify that times don't conflict with ship-wide events (shows, drills, captain's dinner)
- Negotiate group rates for specialty dining or beverage packages

**Your workflow:**
1. Review the AI-composed draft itinerary on a new `/tests/final-itinerary` page.
2. Edit, reorder, add, or remove events based on your knowledge of the ship and cruise line.
3. Contact the cruise line's group liaison to confirm venue availability and any special arrangements.
4. Mark the itinerary as `confirmed` in the system.
5. System fires the `LLL Booking Change` event with `change_type=itinerary_published` → all booked guests receive the final itinerary email.

### New API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/groups/campaign/[slug]/itinerary/generate` | AI composes draft final itinerary from chat data + blueprint |
| `GET /api/groups/campaign/[slug]/itinerary` | Fetch current itinerary (draft or confirmed) |
| `PATCH /api/groups/campaign/[slug]/itinerary` | Human edits and confirms the itinerary |
| `POST /api/groups/campaign/[slug]/itinerary/publish` | Fire change notification to all booked guests |

### New Test Page

`/tests/final-itinerary` — Itinerary composition and review:
- Select campaign → see clustered ideas from chat data
- Trigger AI itinerary generation → review draft
- Edit events inline (time, location, title)
- Mark as confirmed → preview the guest-facing email
- Publish → fire Klaviyo notification

---

## 7. Tour Conductor Assignment & Free Cabin Offer

**Current state:** The landing chat AI persona is called "Tour Conductor" — but it's an AI, not a real person. The `GROUP_CAMPAIGN_STRATEGY.md` mentions the tour-conductor (TC) free cabin credit as the economic incentive for hitting threshold (typically 8–10 cabins = 1 free berth), but there's no mechanism to assign a real human TC or offer the free cabin to a guest.

**The reality:** You (Nathaniel) are the agent, not the tour conductor. You won't be on the ship. Someone needs to be the on-the-ground host — facilitating the daily rituals, coordinating meetups, being the friendly face of the group. The cruise line's TC credit makes one cabin free — that's the compensation.

### The TC Assignment Flow

**Phase 1: Identify candidates (post-threshold, pre-manifest deadline)**

1. System analyzes chat engagement in the community channel and landing chat:
   - Who's most active in `ideas` and `meetups` channels?
   - Who's proposing events and rallying others?
   - Who has cruise experience (from `GUEST_INFO.preferences.past_cruise_experience`)?
   - Who has event planning or community organizing signals in their chat behavior?
2. AI produces a ranked `TCCandidateList` with reasoning for each candidate.
3. This is surfaced to you on the campaign dashboard — **you make the final decision.**

**Phase 2: Extend the offer (agent-driven, not automated)**

1. You review candidates and select one (or decide none are suitable — you find someone through your network).
2. You personally reach out to the candidate (email, phone, or community channel DM). This is a relationship moment, not an automated email.
3. The offer: "We'd like you to be the official Tour Conductor for [Campaign Name]. It means hosting a few short daily rituals (coffee hello, golden-hour photo share), being the friendly face of the group, and helping guests connect. In exchange, your cabin is free — the cruise line's group credit covers it."
4. If they accept, you mark them as `tc_assigned` in the system.

**Phase 3: Onboard the TC (post-assignment)**

1. System sends the TC a private "TC Onboarding" email with:
   - The confirmed final itinerary
   - Operational notes (guest dietary flags, accessibility needs, backup locations)
   - The daily ritual scripts (simple, not scripted — just the structure)
   - Emergency contact: your phone number + the cruise line group coordinator
   - "What to do if..." guide (no-shows, weather changes, guest conflicts)
2. TC gets a dedicated chat channel or thread for agent↔TC communication.
3. System announces the TC to all booked guests via `LLL Booking Change` with `change_type=tc_announced`.

### Free Cabin Mechanics

**How the TC credit works (from CB/cruise line side):**
- When the group block hits the minimum cabin threshold (typically 8–10), the cruise line awards one free berth (the TC credit).
- This is a cabin fare waiver — the TC still pays port fees, taxes, and gratuities (typically $150–300).
- The credit is applied as a refund after all qualifying cabins have made final payment, OR as a discount at booking time depending on the cruise line.

**What we need to handle in the system:**

1. Add to `METADATA`:
```
tcAssignedEmail: string | null
tcAssignedAt: ISO timestamp | null
tcCreditApplied: boolean
```

2. Add to the assigned guest's `USER#` record:
```
isTourConductor: true
tcAcceptedAt: ISO timestamp
```

3. When the TC books their cabin (via CB link or OdysseusEngine), the system should:
   - Flag the booking as the TC cabin
   - Track whether the TC credit has been applied
   - Remind you to verify with CB that the credit is processed

### New Module: `lib/guests/tc-assignment.ts`

- `identifyTCCandidates(campaignSlug)` — Analyzes chat data, returns ranked candidates with reasoning
- `assignTC(campaignSlug, email)` — Marks guest as TC, triggers onboarding sequence
- `getTCStatus(campaignSlug)` — Returns current TC assignment state

### New Test Page

`/tests/tour-conductor` — TC assignment workflow:
- View candidate rankings with reasoning
- Preview the offer email (but send is manual)
- Assign TC → see onboarding checklist
- Track TC credit status
- Preview guest-facing TC announcement

---

## 8. Merch Sales: The Missed Opportunity

**Current state:** Merch store opens at threshold, closes 21 days pre-sail. It's presented as a group identity tool, not a revenue driver.

**The problem:** We've never actually sold merch because no campaign has reached threshold yet. But even when one does, the current model has two flaws:
1. The order window closes 21 days before sailing — but post-booking excitement peaks right after booking and again 14 days out.
2. There's no post-cruise merch play ("I wish I'd bought that shirt" → "You still can").

**Proposed changes:**
1. **Open merch immediately post-booking** (not just at threshold). A booked guest is more likely to buy than a waitlisted guest. Remove the threshold gate for merch.
2. **Two order windows:** Window 1 (post-booking → 21 days pre-sail, guaranteed delivery before departure) and Window 2 (post-cruise, 14-day window, "Missed it? Get it now.").
3. **Post-cruise merch email:** "The shirt you didn't buy." Photo of the group wearing merch onboard. FOMO-driven.
4. **Digital merch:** Consider digital goods (phone wallpapers, printable packing lists, niche recipe cards) as zero-cost lead magnets that keep the brand present.

---

## 9. Timeline: How Long To Engage

| Phase | Duration | Intensity |
|-------|----------|-----------|
| Booking Confirmation | Days 0–3 | High (3 emails) |
| Travel Prep | 90→14 days out | Low (biweekly emails, key deadline nudges) |
| Final Countdown | 14→1 days out | Medium (4 emails, 1 SMS) |
| Onboard | 7 days | Low (1 daily touchpoint, community-driven) |
| Post-Cruise Immediate | Days 1–14 | High (survey, photos, rebooking pitch) |
| Rebooking Window | Days 14–90 | Medium (alumni offers, new campaign alerts) |
| Long-Term Nurture | 90+ days | Low (quarterly "what's new" emails, adjacent niche alerts) |

**Total engagement window: ~6 months per guest per campaign.** The goal is to be present at every decision point without being overwhelming.

**During-cruise and post-cruise are not optional.** They are the highest-leverage phases for:
- Generating authentic social proof (guest photos, testimonials)
- Collecting structured feedback (directly improves next discovery sprint)
- Driving rebooking (warm audience, proven conversion)
- Building a defensible community moat (cruise lines can copy pricing, not community)

---

## 10. Technical Implementation Plan

### 10.1 Data Model Extensions

Add to `USER#` record in `lll-shadow-campaigns`:

```
postBookingStatus: 'WELCOME_SENT' | 'TRAVEL_PREP' | 'COUNTDOWN' | 'ONBOARD' | 'POST_CRUISE' | 'ALUMNI'
bookingConfirmedAt: ISO timestamp
reservationNumber: string (from CB/OdysseusEngine)
postBookingSequenceStage: number (which email in the sequence was last sent)
surveyCompleted: boolean
rebookInterest: boolean
isTourConductor: boolean
tcAcceptedAt: ISO timestamp | null
```

Add to `METADATA` record:

```
postBookingEmailSequenceId: string (Klaviyo flow ID)
alumniListId: string (Klaviyo list segment for past guests)
changeLog: JSON array of { changeType, previousValue, newValue, changedAt, notifiedAt, notifiedCount }
lastChangeNotifiedAt: ISO timestamp
tcAssignedEmail: string | null
tcAssignedAt: ISO timestamp | null
tcCreditApplied: boolean
finalItineraryStatus: 'not_generated' | 'draft' | 'confirmed' | 'published'
```

New DynamoDB records:

```
CAMPAIGN#<slug> / IDEAS_LOG — clustered guest ideas extracted from chat
CAMPAIGN#<slug> / ITINERARY#draft — AI-composed draft final itinerary
CAMPAIGN#<slug> / ITINERARY#confirmed — human-confirmed final itinerary
```

### 10.2 New Services

| Module | Purpose |
|--------|---------|
| `lib/guests/post-booking/sequencer.ts` | Orchestrates the post-booking email/SMS sequence. Reads `postBookingStatus` and `sailDate`, determines next action, triggers Klaviyo/Twilio. |
| `lib/guests/post-booking/travel-prep.ts` | Generates personalized travel prep content (flight links, hotel links, insurance offers) from `GUEST_INFO.logistics`. |
| `lib/guests/post-booking/survey.ts` | Post-cruise survey generation, collection, and storage. Feeds results into discovery sprint context. |
| `lib/guests/post-booking/rebooking.ts` | Alumni targeting — matches past guests to new campaigns in same/adjacent niches. |
| `lib/guests/change-notifier.ts` | Detects METADATA changes, determines severity, fires Klaviyo events + SMS for all booked guests. |
| `lib/guests/itinerary-composer.ts` | Pulls chat data + blueprint constraints, calls AI to compose draft FinalItinerary. |
| `lib/guests/tc-assignment.ts` | Analyzes chat engagement, ranks TC candidates, manages assignment and onboarding. |

### 10.3 New API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/groups/campaign/[slug]/guest/status?email=` | Returns personalized post-booking dashboard data |
| `POST /api/groups/campaign/[slug]/guest/survey` | Submit post-cruise survey |
| `GET /api/groups/campaign/[slug]/guest/alumni` | List past guests for rebooking targeting |
| `POST /api/guests/post-booking/process` | Cron endpoint — processes daily post-booking sequence steps |
| `POST /api/groups/campaign/[slug]/notify-change` | Fire change notification to all booked guests |
| `POST /api/groups/campaign/[slug]/itinerary/generate` | AI composes draft final itinerary |
| `GET /api/groups/campaign/[slug]/itinerary` | Fetch current itinerary (draft or confirmed) |
| `PATCH /api/groups/campaign/[slug]/itinerary` | Human edits and confirms the itinerary |
| `POST /api/groups/campaign/[slug]/itinerary/publish` | Fire itinerary-published notification to guests |
| `GET /api/groups/campaign/[slug]/tc/candidates` | Ranked TC candidates with reasoning |
| `POST /api/groups/campaign/[slug]/tc/assign` | Assign TC (agent action) |
| `GET /api/groups/campaign/[slug]/tc/status` | Current TC assignment state |

### 10.4 New Test Pages

| Page | Purpose |
|------|---------|
| `/tests/post-booking` | Full post-booking lifecycle simulator (emails, SMS, state machine, landing page personalization, chat contexts) |
| `/tests/final-itinerary` | Itinerary composition: view clustered ideas, trigger AI generation, edit events, confirm, preview guest email, publish |
| `/tests/tour-conductor` | TC assignment: view candidates, preview offer, assign, track credit, preview announcement |

### 10.5 Integration Points

| System | Integration |
|--------|------------|
| **Klaviyo** | 4 new event-triggered flows: `LLL Booking Change` (critical/high/medium-low/positive variants), `LLL Post-Booking Welcome`, `LLL Post-Booking Countdown`, `LLL Post-Cruise`. Alumni list segment. |
| **Twilio** | SMS for critical changes, final payment deadline, Day 1 pre-sail nudge, merch last call. |
| **Landing Page** | Detect returning booked guest → personalized dashboard (countdown, itinerary, community link, TC info, merch). |
| **Landing Chat** | `ideas` and `meetups` channel data continuously piped to `IDEAS_LOG` for itinerary composition. TC announcement posted in `main` channel. |
| **Chat Pipeline** | Implement `active_voyage` and `post_voyage` context resolvers. Private agent↔TC chat channel. |
| **Community Channel** | Automated welcome, countdown posts, photo album generation, TC introduction post. |
| **Merch Store** | Remove threshold gate. Add post-cruise window. Automated "last chance" and "you missed it" emails. |

---

## 11. Recommended Rollout Order

### Phase 1: Foundation (Lowest Effort, Highest Impact)
1. **Booking confirmation email** — One Klaviyo template. Triggers on `converted=true`.
2. **Landing page personalization** — Detect booked guest, show countdown + community link instead of waitlist CTA.
3. **Change notification system** — `change-notifier.ts` + `LLL Booking Change` Klaviyo event + critical/high flows. This is the highest-trust item — guests must know when things change.

### Phase 2: Core Post-Booking Sequence
4. **Full post-booking email sequence** — Welcome → Travel Prep → Countdown → Onboard → Post-Cruise → Rebooking. 10–12 emails in Klaviyo.
5. **`postBookingStatus` state machine** — Track where each guest is in the sequence.
6. **Travel prep content generation** — Affiliate links for flights, hotels, insurance.
7. **Post-cruise survey** — Collect structured feedback, feed into discovery sprint.

### Phase 3: Itinerary & TC
8. **AI itinerary composition** — `itinerary-composer.ts`, `IDEAS_LOG`, draft/confirm/publish flow. `/tests/final-itinerary`.
9. **TC assignment system** — `tc-assignment.ts`, candidate ranking, offer workflow, onboarding. `/tests/tour-conductor`.
10. **TC announcement + itinerary publish** — Klaviyo positive-change notifications to all booked guests.

### Phase 4: Advanced Engagement
11. **`active_voyage` chat context** — Onboard AI assistant.
12. **`post_voyage` chat context** — Post-trip support and rebooking.
13. **Community channel automation** — Automated welcome posts, countdown posts, photo album generation.
14. **Merch post-booking push** — Remove threshold gate, add post-cruise window.

### Phase 5: Retention Engine
15. **Alumni targeting** — Match past guests to new campaigns.
16. **Referral program** — "Bring a friend, get a cabin credit."
17. **Loyalty tiering** — "Gold Alumni" get first access to new sailings.

---

## 12. Open Questions To Resolve

1. **CB booking confirmation webhook:** Can we get a callback when a guest completes a CB booking? Currently `converted` is set manually or via OdysseusEngine. For self-serve guests, we need a reliable trigger. Options: CB webhook (ask if available), polling, or manual confirmation email from guest.

2. **Community channel platform:** Discord vs. WhatsApp vs. Facebook Group. Decision should be per-campaign based on niche demographics. Need a lightweight setup workflow.

3. **Affiliate partners:** Which flight/hotel/insurance affiliate programs to use? Need to evaluate commission rates, API availability, and guest experience.

4. **Onboard Wi-Fi reality:** Most cruise lines charge for Wi-Fi. If guests aren't connected, email/SMS won't reach them onboard. The community channel and chat only work if guests buy Wi-Fi. Need to research typical Wi-Fi adoption rates and whether we should sponsor basic Wi-Fi for group members.

5. **Post-cruise community lifespan:** Does the Discord/WhatsApp group stay active after the cruise? If so, who moderates? Does it become a permanent alumni community or dissolve?

6. **Privacy and data ownership:** Post-cruise surveys and photo sharing involve guest data. Need clear opt-in and data policy.

7. **TC credit processing:** How exactly does CB handle the TC free cabin credit? Is it automatic at threshold or does the agent need to request it? Does the TC book normally and get refunded, or do they get a $0 fare link? This affects the TC booking flow.

8. **TC liability and contract:** If a guest serves as TC, what's the legal relationship? Volunteer? Independent contractor? Need a simple agreement — even a one-page "TC Expectations & Waiver" document.

9. **Itinerary change frequency:** How often do cruise lines change ships/itineraries after bookings exist? Understanding this determines whether the change notifier needs to be real-time or weekly-polling.

10. **Klaviyo flow complexity:** The proposed Klaviyo setup has 4 new event types and 8–12 new emails. This is a significant Klaviyo dashboard build-out. Should we start with just 2 flows (critical changes + welcome) and expand?

---

## 13. Summary

The post-booking guest journey is the largest missing piece in the Shadow Group system. This plan now covers the complete lifecycle across five workstreams:

1. **Post-booking communication** — 6-phase email/SMS sequence from booking confirmation through rebooking (~6 months per guest)
2. **Change notifications** — Klaviyo-powered alerts for ship swaps, date changes, cancellations, with severity-based routing
3. **AI-composed final itinerary** — Continuous chat monitoring → clustered ideas → AI draft → human confirmation → guest publication
4. **Tour conductor assignment** — AI-ranked candidates → human selection → free cabin offer → TC onboarding → guest announcement
5. **Merch sales** — Remove threshold gate, add post-cruise window, digital merch options

**Core principles:**
- **Community-first, not transaction-first.** Every touchpoint should deepen the guest's connection to the themed group.
- **Referral/affiliate model for travel services.** We connect, we don't transact. Zero liability, pure margin.
- **Own the relationship.** CB owns the booking; we own the guest. Our CRM data is the moat.
- **Human bridges the critical gaps.** AI composes, ranks, and drafts — but venue confirmation, TC selection, and cruise line liaison are human decisions.
- **Start simple, measure everything.** Phase 1 is booking confirmation + change notifications + landing page personalization. Validate before building the full sequence.
