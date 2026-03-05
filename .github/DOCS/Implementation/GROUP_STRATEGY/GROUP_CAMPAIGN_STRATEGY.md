# Group Campaign Strategy

**Document Status:** Master Blueprint / Single Source of Truth
**Core Principle:** Validate Market Demand Before Securing Inventory or Financial Liability
**Architecture:** DynamoDB (No Prisma) / Direct Agent Tools Handoff (No Local Payment Capture)

## 1. The "Shadow Group" Philosophy

In standard travel agent workflows, an agent must formulate a group with a cruiseline and configure it via Cruise Brothers (*CB Agent Tools*) upfront. This assumes risk and requires significant back-and-forth for themes that might not convert.

**The "Shadow Group" Model** flips this equation:
1.  **AI-Generated Pitch:** The AI and host construct an aspirational "Group Cruise Package" (e.g., *Salsa Dancing in the Caribbean*) featuring anticipated prices based on available retail APIs, without holding group inventory.
2.  **Waitlist Collection:** Users register interest on a dynamically generated landing page (the "Feel It Out" generator). Crucially, **no money is collected at this stage**. The system only gathers Lead Data, Cabin Preferences, Passenger Counts, and **Event/Activity Proposals**.
3.  **Threshold Action:** Once the predefined minimum threshold is met (e.g., 8 cabins), the full Shadow Group experience is unlocked — manifest collection triggers, the CB group booking link is dispatched, and the tour-conductor (TC) credit becomes achievable.

> **What the threshold actually gates:** The minimum cabin count exists for two reasons only: (1) qualifying for the cruise line's **tour-conductor free cabin credit**, awarded when a minimum number of paying cabins book under the same CB group block (typically 8–10, varies by line), and (2) ensuring enough attendees for the themed event to have real group energy. It does **not** gate whether individual guests can book the sailing — that is always available. If a campaign expires without hitting the threshold, guests are offered the same CB link as individual bookings (see Stage 5). The agent still earns commission; the TC credit simply does not materialize.

---

## 2. Waitlist Data Model (DynamoDB)

*Strict Directive: All modern, user-generated interaction features must utilize DynamoDB to align with the high-scale ephemeral architecture of the master workspace. Prisma/PostgreSQL remains legacy.*

### Table: `lll-shadow-campaigns`

We implement a **Single-Table Design** pattern.

#### Campaign Metadata Record
*   **PK**: `CAMPAIGN#<SlugId>`
*   **SK**: `METADATA`
*   **Attributes**:
    *   `id`: Unique slug identifier layout.
    *   `name`: Theme Name (e.g., "Cat Lover's Cruise 2026").
    *   `targetDates`: Planned departure timeframes.
    *   `minCabinsRequired`: The minimum cabin count to qualify for the tour-conductor credit and trigger the full group experience (Default: 8).
    *   `expiresAt`: ISO date after which the campaign is automatically marked `EXPIRED` if threshold has not been met. Typically set to 30–60 days before the sailing's deposit deadline.
    *   `autoHandoffThreshold`: Cabin count below which all completed manifests are automatically routed to **OdysseusEngine-assisted fulfillment** rather than self-serve link dispatch. Default: `5`. Once total converted cabins exceeds this number, the campaign switches to self-serve dispatch automatically. Can be set to `0` (always self-serve) or `999` (always OdysseusEngine). This is the primary lever for the hybrid mode transition.
    *   `status`: `'DRAFT'` | `'GATHERING_INTEREST'` | `'THRESHOLD_MET'` | `'CONVERTED'` | `'EXPIRED'`
        *   `DRAFT` → campaign configured, link pre-loaded, not yet live
        *   `GATHERING_INTEREST` → campaign page live, waitlist open, no action required
        *   `THRESHOLD_MET` → minimum cabin count reached; manifest collection triggered; CB link dispatching per guest as manifests submit; **no agent action needed**
        *   `CONVERTED` → threshold-met guests have booked; group block is active in CB `view_campaigns`; TC credit path is open
        *   `EXPIRED` → campaign reached `expiresAt` without hitting threshold; graceful fallback triggered (see Stage 5); **no liability incurred**
    *   `cbagenttoolsGroupId`: (Populated post-conversion)
    *   `cbagenttoolsBookingLink`: (Populated post-conversion) The link sent to users.
    *   `communityChannelUrl`: Invite link to the campaign's private group channel (Discord server, WhatsApp group, etc.). Sent in the "Trip is GO!" email. Populated during pre-launch campaign config.
    *   `merchandiseStoreUrl`: URL to the campaign's print-on-demand merch store. Populated post-threshold when the store is activated. `null` until threshold is met.

#### Campaign Waitlist Record
*   **PK**: `CAMPAIGN#<SlugId>`
*   **SK**: `USER#<Email>`
*   **Attributes**:
    *   `firstName` / `lastName`
    *   `passengerCount`: 1-4.
    *   `preferredCabinType`: Inside, Oceanview, Balcony, Suite.
    *   `specialRequests`: Notes.
    *   `proposedEvents`: User-suggested activities, mixers, or meetups to help dynamically shape the cruise itinerary and build organic hype.
    *   `notified`: Boolean (Has the final tracking link been emailed?)
    *   `converted`: Boolean (Did they use the link to make a deposit?)
    *   `bookingMode`: `'GROUP_WAIT'` | `'BOOK_NOW'` — Set at the moment the guest submits the initial landing page form. Controls *when* manifest collection triggers relative to threshold. Independent of fulfillment mode.
    *   `fulfillmentMode`: `'AUTO'` | `'ODYSSEUS_ASSIST'` | `'SELF_SERVE'` — Controls *how* the post-manifest booking is completed. `AUTO` (default) defers to the campaign's `autoHandoffThreshold`: if total converted cabins is below it at the moment the manifest submits, OdysseusEngine handles the booking end-to-end; otherwise self-serve link dispatch. Can be overridden per-guest at any time before manifest submission.
    *   `manifestStatus`: `'PENDING'` | `'SUBMITTED'` — Tracks whether the guest has completed the Passenger Manifest. The CB booking link (self-serve) or agent action (agent-assist) is triggered when this transitions to `'SUBMITTED'`.

#### Campaign Guest Manifest Record
*   **PK**: `CAMPAIGN#<SlugId>`
*   **SK**: `GUEST#<Email>`
*   **Attributes**:
    *   `guestInfoJson`: The fully populated `GUEST_INFO` document (per the `GUEST_INFO.json` schema) for all travelers in this party, serialized to a single JSON attribute. Covers legal names, DOB, passport data, cabin bed configs, dining preferences, accessibility needs, and loyalty program numbers.
    *   `submittedAt`: ISO timestamp of manifest completion.
    *   `cabinCount`: Denormalized from `guestInfoJson.cabins.length` — allows threshold queries without deserializing the full JSON.
    *   `prefilledFrom`: Reference to the parent `USER#<Email>` record. Fields already known (`firstName`, `lastName`, `preferredCabinType`, `passengerCount`) are pre-seeded at record creation so the guest only fills in new information.

---

## 3. The Validation Pipeline & Handoff Process

### Stage 1: Gauge Interest via Landing Page
*   Traffic is routed to `/campaigns/[slug]`.
*   Users review the AI-assisted itinerary proposal.
*   The landing page presents **two distinct CTAs** — both create a `USER#` record but set different `bookingMode` values:
    *   **"Join the Group Waitlist"** (`bookingMode: 'GROUP_WAIT'`) — Guest wants the full themed group experience. Their manifest collection is held until the threshold is met. They are included in the social proof counter visible to other visitors.
    *   **"Book My Spot Now"** (`bookingMode: 'BOOK_NOW'`) — Guest is ready to go regardless of group size. Manifest collection triggers immediately after this form submits. The CB booking link is dispatched as soon as they complete it.
*   Both paths write to the DynamoDB `lll-shadow-campaigns` table as a `USER#` record. `BOOK_NOW` guests also count toward the threshold total — their energy pulls the group forward.

### Stage 2: Triggering Validation
*   On every waitlist submission, a serverless function evaluates `bookingMode`:
    *   **`BOOK_NOW`:** Manifest collection triggers **immediately** for this guest — no threshold check needed. They proceed directly to Stage 2.5 as a solo onboarding.
    *   **`GROUP_WAIT`:** The function checks if `Total Cabins Requested >= minCabinsRequired` (counting both `BOOK_NOW` and `GROUP_WAIT` records). If true, the threshold is met and Stage 2.5 is triggered for *all* remaining `GROUP_WAIT` guests simultaneously.
*   If threshold is met, the system fires off an internal alert via the `.env` configured notification channel (Slack/Pushover/Email) to the Master Agent.
*   **`BOOK_NOW` guests are always fully onboarded** — even if the campaign never reaches threshold and eventually expires.

### Stage 2.5: Passenger Manifest Collection (The "Golden Window")

*The moment the threshold is met, every waitlisted guest is in a state of maximum excitement and commitment — the trip is real, but no money has moved yet. This is the single best window to collect their full travel party details. Framed correctly, it does not feel like a form; it feels like exclusive trip onboarding.*

**The Flow:**
1.  **Threshold event** simultaneously triggers a **"The Trip is GO!"** notification email to every `USER#` record on this campaign.
2.  **Email Content:** Confirms the sailing (ship name, dates, departure port), and contains one prominent CTA: **"Complete Your Party Details to Unlock Your Booking Link"** — pointing to `/campaigns/[slug]/manifest?token=<signed-jwt>`. The JWT encodes the guest's email and campaign slug, scoped to 72 hours.
3.  **The Manifest Page (`/campaigns/[slug]/manifest`):**
    *   Bootstraps from the parent `USER#` record — `firstName`, `lastName`, `preferredCabinType`, and `passengerCount` are pre-filled. The guest starts with minimal work already done.
    *   Uses an **AI-assisted conversational interface** (`/api/chat`) rather than a static form. Each section is introduced with context: *"For the ship's dining team — do you or anyone in your party have dietary restrictions we should flag?"*
    *   Walks through all sections of the `GUEST_INFO` schema: legal traveler names, cabin configuration (bed type, deck preference, connecting cabins), dining preferences, accessibility needs, loyalty program numbers, and logistics (air travel, pre/post hotel).
    *   Passport numbers, DOB, and address fields are collected but marked **"You can skip these now — if your agent is completing your booking, we'll need them. Otherwise CB's checkout will ask you."** This framing serves both booking modes without confusing the guest.
    *   On completion, writes the full populated `GUEST_INFO` JSON to a new `GUEST#<Email>` record in `lll-shadow-campaigns` and updates the parent `USER#` record's `manifestStatus` to `'SUBMITTED'`.
4.  **Dispatch Gate:** Stage 4 (CB link delivery) is triggered **per guest** the moment their `manifestStatus` flips to `'SUBMITTED'` — not as a broadcast blast. Guests who complete the manifest first get their link first, which creates natural urgency.
5.  **Non-Submitter Reminder Sequence:** Guests who have not submitted after 24 hours receive an automated nudge: *"Your cabin is still reserved — [N] guests have already locked in their spots."* Repeats at 48 hours. After 72 hours, the agent is alerted to follow up manually.

**Why gating the CB link behind the manifest works:**
*   Converts a compliance chore into a perceived VIP step — guests feel they are completing an exclusive intake, not a form.
*   Collects the exact data needed for proactive trip management (dining flags, accessibility setup, special occasions, shore excursion interest) — things CB's checkout does not ask about. The agent uses this data post-booking to call CB and add preferences to the reservation directly.
*   Ensures our CRM holds the full `GUEST_INFO` record under our ownership. CB does not share booking data back to agents in a structured way — without this step, we have no permanent record of who booked, what they need, or how to reach them for future campaigns.
*   Natural urgency driver: the link is the reward for completing the step.

**Honest note on duplicate data entry (Self-Serve path):** When a guest books via the CB personal link, CB's own checkout form collects legal names, DOB, address, and passport data independently. In that path, the guest technically enters their core booking details twice — once in our manifest, once in CB's checkout. Our manifest data in this case is primarily a **CRM and service record**, not a handoff to CB. This is a known tradeoff of the self-serve model and should be acknowledged if guests ask.

**The Two Booking Completion Modes — Chosen Automatically by `autoHandoffThreshold`:**

| Mode | How it works | Guest data entry | Scales— | Best for |
|---|---|---|---|---|
| **Self-Serve (Personal Link)** | CB link dispatched; guest completes CB's own checkout | Guest enters data in both our manifest AND CB's checkout | ✅ Yes | Campaigns above `autoHandoffThreshold` |
| **OdysseusEngine-Assisted** | `OdysseusEngine` books on the guest's behalf via headless Chrome automation | Guest enters data **once** in our manifest only — never touches CB's UI. Zero duplicate entry. | ✅ Yes (async, background) | Early bookings below threshold; complex family blocks; accessibility-critical; VIP guests |

*The OdysseusEngine is the automated agent — no human logs into anything. The `GUEST_INFO` record is the data source it reads from. The guest experience in both modes is identical from their perspective: fill out the manifest, receive a booking confirmation.*

### Stage 2.6: Group Community Channel

*Triggered simultaneously with Stage 2.5. The "Trip is GO!" email includes not just the manifest CTA but also an invite into the group's private channel. This is where strangers become travel companions before the ship ever leaves port.*

**Platform Choice:**
Use the platform that matches the campaign's niche identity. Include the `communityChannelUrl` in the campaign config (§6.4) at pre-launch setup.
*   **Discord** — Best for gaming, tech, or hobby-driven niches. Supports voice rooms, event scheduling, and polls natively. The server can be pre-configured with channels: `#intros`, `#event-voting`, `#cabin-tips`, `#ship-day-photos`.
*   **WhatsApp Group** — Best for older demographics or family-oriented niches. Frictionless for mobile-first users.
*   **Facebook Group (Private)** — Best for existing Facebook-heavy communities and for organic discovery within the platform ad funnel.

**What the channel does for the campaign:**
*   Converts the `proposedEvents` field from a one-time form input into a live, evolving conversation — guests vote on, debate, and co-create the event lineup in real time.
*   Generates authentic social content organically: member excitement posts, countdowns, and cabin reveal photos all happen in the channel first, then spread outward.
*   Gives the agent a real-time pulse on sentiment, questions, and any booking friction before it becomes a support issue.
*   Builds enough pre-trip familiarity that group identification on the ship (via merch — see Stage 2.7) actually matters to people.

**`BOOK_NOW` guests** receive the channel invite immediately upon manifest completion — they don't wait for the threshold. Being first in an empty channel reinforces their founding-member identity.

### Stage 2.7: Branded Merchandise (Group Identity Layer)

*The single best way to find your people on a ship with 3,000 strangers is a t-shirt. This stage adds a zero-inventory, zero-upfront-cost merch layer that activates post-threshold and pays for itself.*

**Model:** Print-on-demand via **Printful** or **Printify**, connected to a minimal storefront (a single Next.js page at `/campaigns/[slug]/merch` or a Printify Pop-Up Store link). No inventory is held, no product is manufactured until an order is placed.

**Activation:**
*   The merch store is activated when `status` transitions to `'THRESHOLD_MET'`. Before that, the merch page shows a teaser: *"Group gear unlocks when we hit [N] cabins."* This makes merchandise itself a threshold incentive.
*   The `merchandiseStoreUrl` is populated in the METADATA record at activation and included in:
    1.  The manifest completion confirmation screen ("Your booking link is below — and your group gear store is now open.")
    2.  The community channel pinned message.
    3.  The Day 3 nurture email in the post-threshold sequence.

**What to sell:**
Design around the campaign's aesthetic identity (from Phase C asset generation), not generic cruise branding. Examples:
*   **Core item:** Unisex t-shirt or tank with the campaign logo/tagline — the primary ship identification tool.
*   **Practical items:** Lanyard with campaign branding (cruise staple — everyone needs one), waterproof tote.
*   **Niche-specific items:** Tie directly to the theme. A retro-gaming cruise might offer an enamel pin set; a dark academia cruise might offer a tote with a literary quote.

**Pricing:** Mark up 20–30% over Printful base cost. Revenue is pure margin — no fulfillment, no shipping logistics.

**Order window:** Opens at threshold, closes 21 days before the sailing date to guarantee delivery before departure. The closing date is enforced automatically by the storefront.

**On-ship benefit:** Immediate visual group cohesion. Members spot each other continuously across the ship throughout a 4–7 day sailing without needing a centralized meet-up event to establish connection.

### Stage 3: Inventory Match & Link Pre-Loading *(Happens Pre-Launch, Not at Threshold)*

*Verified via direct CBAT recon (March 2026): Cruise Brothers pre-negotiates and holds hundreds of group blocks across all major cruise lines on behalf of its agent network. **No agent-side deposit is required.** CB carries the group hold cost.*

> **Critical Mechanic — No Cabin Commitment Until a Guest Books:**
> Copying a CB Personal Link is a zero-commitment action. CB holds a fixed block of cabins on the sailing for the entire agent network. Storing that link in the DynamoDB METADATA record does absolutely nothing to the inventory — no cabins are reserved, no deposit is triggered, no group is created on your end. Cabins are only consumed when a guest clicks the link and **completes a deposit directly with CB**. For CB's pre-existing blocks, you never "submit" or "create" a group at all. The Shadow Group model is fully preserved: you carry zero liability at every stage prior to a guest's own booking action.

*   **Timing:** This stage is performed during **Phase D of Campaign Discovery** (§6.4) — before the campaign page goes live. The matched `cbGroupId` and `cbPersonalLink` are committed to the campaign config object and written to the DynamoDB `METADATA` record as part of initial setup. By the time a guest submits the first waitlist form, the link is already in the system and threshold dispatch is instantaneous — no manual agent step is required at threshold time.
*   **Primary Action (No-Cost Path):** Search the existing CB Group Inventory at `/groups/view_groups/` for a sailing that matches the campaign's target destination, duration, and sail date window. Hundreds of pre-blocked sailings are available across Royal Caribbean, Norwegian, Celebrity, Carnival, MSC, Holland America, Princess, and Virgin Voyages — with ready-made Personal Links and pre-calculated Price Advantages.
*   **On Match Found:** Click "Copy Link" to retrieve the Personal Booking Link. Store it as `cbagenttoolsBookingLink` in the METADATA record. No Formstack registration needed.
*   **Fallback (Custom/External Blocks Only):** If a sailing negotiated *outside* of CB's pre-existing inventory is used (e.g., directly with a cruise line group desk), register it via the Formstack at `https://anhywhereinc.formstack.com/forms/private_group_booking`. This locks the Group ID so other CB agents cannot book into it. This is the *only* scenario where a pre-threshold agent action beyond link-copying is required.
*   *Note*: The `view_campaigns` section in CBAT is where the agent's named/themed campaigns appear post-conversion — the visible record that guest bookings have materialized against the block.

### Stage 4: Financial Collection Handoff (The Direct Link)
*   **CRITICAL CONSTRAINT**: The Leisure Life Interactive platform MUST NOT collect local payments or deposits (No Stripe Pre-Authorizations).
*   **Action:**
    1.  The `cbagenttoolsBookingLink` is already present in the Campaign METADATA record — stored there during pre-launch setup (Stage 3 / Phase D). **No retrieval step is needed at threshold time. There is no "group generation" action on the agent's side for CB pre-existing blocks.** The threshold event simply reads this field from DynamoDB and transitions `status` from `'GATHERING_INTEREST'` to `'THRESHOLD_MET'`, triggering the Stage 2.5 manifest sequence.
    2.  Link format: `https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}?siid={AGENT_ID}`
    3.  The field `cbagenttoolsBookingLink` is already populated in the METADATA record. No write is needed here.
    4.  When a guest's `manifestStatus` flips to `'SUBMITTED'`, the system evaluates their `fulfillmentMode` and branches:

        **Path A — Self-Serve (`fulfillmentMode: 'SELF_SERVE'` or `AUTO` above threshold):**
        The CB booking link is dispatched automatically to the guest via email. Guest clicks it, completes CB's own checkout, pays deposit. Zero human involvement.

        **Path B — OdysseusEngine (`fulfillmentMode: 'ODYSSEUS_ASSIST'` or `AUTO` below `autoHandoffThreshold`):**
        The **OdysseusEngine** (`lib/services/odysseus/OdysseusEngine.ts`) is invoked programmatically — a Playwright-based automation service that drives CBAT as a headless browser actor. The guest never touches CB's UI. The booking happens silently and completely in the background. Guest receives a confirmation email with their booking reference when it's done.

**OdysseusEngine Automated Booking Flow (Path B — How It Works)**

*The OdysseusEngine is already built and partially scaffolded. It uses persistent session state — no login latency after the first run. It drives real Chrome (not Chromium) to avoid bot detection on CBAT.*

```
GUEST_INFO submitted
        ↓
OdysseusEngine.init()          → Launch Chrome, load saved .playwright-state.json session
OdysseusEngine.login()         → Verify session or auto-login via CB_EMAIL / CB_PASSWORD env vars
OdysseusEngine.validateHealth()→ Confirm Odysseus UI DOM schema is intact before proceeding
        ↓
Navigate to group block via cbGroupId (/groups/view_groups/ → select matched sailing)
        ↓
OdysseusEngine.selectItinerary() → Navigate into the group block's package page
OdysseusEngine.bypassGuestInfoAndContinue(guestAges, guestState)
   → Constructs details.aspx URL from GUEST_INFO (ages, state of residence)
   → Navigates directly to Category page, bypassing the flaky Angular guest form
        ↓
OdysseusEngine.holdCabin(guestDetails)
   → Selects cabin category matching guestInfo.cabins[0].preferences_override.stateroom.category
   → Acknowledges non-refundable modal
   → Selects specific stateroom
   → Fills Passenger Details page with GUEST_INFO data (legal names, DOB, address, phone)
   → Submits hold
        ↓
Reservation number captured → written to GUEST# record → confirmation email dispatched to guest
```

> **Current Implementation Status:** OdysseusEngine is fully operational through `holdCabin()` scaffolding — it reaches the Passenger Details page and captures the HTML. **The outstanding gap** is the final Passenger Details form fill using live `GUEST_INFO` data and the hold submission click. This is the next implementation milestone for the Shadow Group build. All prior steps are verified working.

**The Hybrid Mode Switch — Fully Automatic, Zero Human Involvement at Either Scale:**
*   Cabins 1–`autoHandoffThreshold`: OdysseusEngine books each guest silently in the background. Guest experience is frictionless — they submit the manifest, get a confirmation email with their booking reference. Done.
*   Cabin `autoHandoffThreshold`+: CB personal link dispatched. Guest self-books through CB's own checkout. Also frictionless.
*   At every scale, override any individual guest's `fulfillmentMode` to `'ODYSSEUS_ASSIST'` for accessibility-critical bookings, complex family blocks (3+ cabins), or any guest where the self-serve path is likely to cause confusion.

**The fast-booking conversational flow** (`lib/chat/prompt-data/flows/fast-booking.json`) integrates directly with this pipeline — the AI orchestrates `capture_request → info_gap_fill → search_and_present → hold_and_email`, and `hold_and_email` maps to the OdysseusEngine invocation above. The group campaign manifest page *is* the structured version of the `info_gap_fill` stage, pre-seeded with what we already know.
    5.  The guest clicks their personalized link, selects their specific cabin in the CB booking flow, and pays their deposit directly into the official, bonded agency account. The `converted` field on their `USER#` record is updated via a webhook callback.

**Payment Scenarios & CB Limitations (Honest Assessment)**

CB's personal booking link is a **consumer-facing retail checkout** — it processes one cabin reservation per transaction. This is not a limitation of our platform; it is the architecture of CB's Swift booking engine. Understanding it prevents guest frustration and sets correct expectations upfront.

| Scenario | How it works | Agent action needed— |
|---|---|---|
| **Solo traveler or couple, one cabin** | Single CB link flow, one deposit payment | None |
| **Family/group paying for 2+ cabins** | Must complete the CB booking flow **separately for each cabin** — separate transactions, separate deposits | None, but must be communicated to guest |
| **Installment / flex-pay** | CB's checkout natively offers payment plan options; guest selects at checkout | None — guest self-selects |
| **One person paying for someone else's cabin** | They complete the CB flow entering the other traveler's details; the deposit card is theirs | None for standard cases; complex cases → direct CB agent call |
| **Large family block (3+ cabins, one payer)** | Not supported via personal link; requires agent-assisted group reservation call with CB | **Agent calls CB directly to assist** |

**What we NEVER do:** collect payment on behalf of guests, hold deposits locally, or act as an intermediary between guest money and CB. Every dollar flows directly guest → CB. Our platform only dispatches the link.

**Communication in the manifest confirmation screen:** After a guest submits their manifest and receives their CB link, the confirmation screen must clearly display: *"If you're booking more than one cabin, you'll complete a separate checkout for each one — it only takes a few minutes."* This prevents confusion before it starts.

### Stage 5: Graceful Expiry (If Threshold Is Never Met)

*A campaign that never fills carries zero financial or inventory liability — there is nothing to unwind. The only obligation is to the guests who trusted you with their interest. This stage handles them well.*

**Trigger:** A scheduled function checks all `GATHERING_INTEREST` campaigns daily. When `currentDate >= expiresAt` and `status !== 'THRESHOLD_MET'`, the campaign transitions to `EXPIRED`.

**What happens automatically:**
1.  Every `USER#` record with `bookingMode: 'GROUP_WAIT'` and `manifestStatus: 'PENDING'` receives a **"This One Didn't Sail"** email. Tone is honest and warm — not a failure announcement, a pivot:
    > *"We didn't hit the cabin count to lock in the full group experience — but here's the good news: [Ship Name] is still sailing, and the sailing is still available. If you still want in, tap below to complete your details and we'll send you the individual booking link right away."*
2.  The email CTA points to `/campaigns/[slug]/manifest?token=<signed-jwt>` — **the same manifest page**, not a bare CB link. The guest completes their GUEST_INFO, gets the CB link dispatched immediately, and we capture the full record. No guest exits this flow without a `GUEST#` record if they engage.
3.  Guests who already have `bookingMode: 'BOOK_NOW'` are unaffected — they were fully onboarded the moment they signed up.
4.  All collected `USER#` and `GUEST#` records are **retained in DynamoDB** — this data is CRM gold. These guests showed intent for this niche; they are the highest-priority audience for the next campaign in the same theme space.

**Why this is still a win:**
*   Agent earns commission on any individual bookings that come from the expiry email.
*   Waitlist data (niche preferences, proposed events, cabin types) directly seeds the next campaign iteration — with a pre-warmed audience who already opted in once.
*   A campaign that expires becomes a data point proving the niche needs a different angle (different ship, different price point, different departure) — not that the niche itself is dead.

> **Key Insight:** The threshold is not a survival gate for the campaign; it is a *bonus unlocked* when the campaign works especially well. Every outcome generates either commission, CRM data, or both.

---

## 4. Why This Model?

*   **Risk Averse:** Prevents holding unfillable group inventory. CB holds it on your behalf at no cost.
*   **Compliance Safe:** Removes the legal liability of acting as a Merchant of Record on behalf of a host agency.
*   **Agile Iteration:** Allows the creation of 50 different themed landing pages in a day, letting the organic web traffic prove which trip is naturally viable.
*   **Serverless Native:** Moves transient interest data to fast, cheap DynamoDB storage.
*   **Crowd-Sourced Itineraries (Event Requests):** By asking early responders what activities, workshops, or meetups they want, we gather free market research, increase user investment in the trip, and use their specific ideas as marketing ammunition to autonomously promote the campaign to others.
*   **Inventory-First Theming:** CB's pre-blocked inventory is rich enough to support virtually any niche theme. Campaigns can be designed *around* compelling sailings already in the group list — matching ship amenities, departure ports, and price advantages to the target audience — rather than building a theme in a vacuum and hoping matching inventory exists.

---

## 5. Campaign Execution & Promotion Strategy (2026 Landscape)

In the 2026 landscape, the technical edge is moving toward Zero-Click Discovery and Programmatic Niche Targeting. Here is how you technically execute the promotion for your "Shadow Groups."

### 5.1 The "Top-of-Funnel" (Traffic Generation)

Don't just run broad "Cruise Ads." You want to target the identity of the niche.

**A. Programmatic Contextual Ads (The Google Display Hack)**
Instead of targeting "People interested in cruises," use Custom Intent Audiences in Google Ads.
*   **The Tech:** Create an audience based on users who have recently searched for specific niche terms (e.g., "Best handheld emulator 2026" or "Analog pocket restock").
*   **The Placement:** Use Placement Targeting to force your ads onto specific YouTube channels or blogs (e.g., Retro RGB or Digital Foundry) rather than letting Google's AI guess.

**B. Meta "Lead Form" Ads (The API Integration)**
Since your goal is to populate `lll-shadow-campaigns` in DynamoDB:
*   **The Tech:** Use Facebook Lead Ads with a Webhook.
*   **The Flow:** When a user clicks "Interested" on a Facebook ad, the Lead Form auto-fills their email. Use a Zapier or AWS Lambda Webhook to pipe that data directly into your DynamoDB table.
*   **Why:** This bypasses the need for the user to wait for a slow landing page to load, increasing your conversion rate by up to 40%.

### 5.2 The "Nurture" Tech (Moving to Threshold)

Once they are in your DynamoDB, the marketing becomes Automated & Sequential.

**A. The "Vibe Check" Email Flow (Klaviyo/Beehiiv)**
Trigger a 3-part automated sequence the moment they join the waitlist:
*   **Immediate (The Validation):** "You're on the list. We need 6 more cabins to make this 'Unplugged' trip a reality."
*   **Day 3 (The Co-Creation):** "Vote on the tournament! Mario Kart 64 or GoldenEye— Your vote shapes the itinerary." (This link triggers a UpdateItem call to your DynamoDB `proposedEvents`).
*   **Day 7 (The Social Proof):** "We just hit 5 cabins! Only 3 more to go before we lock in the group rates."

**B. SMS Urgency (Twilio)**
In 2026, email is for information; SMS is for action.
*   **The Tech:** Use the Twilio API to send a text only when the status changes to `THRESHOLD_MET`.
*   **The Message:** "Lvl 1-1 is Clear! The Retro-Gaming group is officially GO. Tap here to grab one of the 8 locked-in cabins: [Link]"

### 5.3 Privacy-First Tracking (The 2026 Legal Edge)

Standard tracking pixels are being throttled by browser privacy settings. To get accurate data for your ads, you must use Server-Side Tracking.

*   **The Tech:** Meta Conversions API (CAPI).
*   **How it works:** Instead of the user's browser sending "A lead happened" to Facebook (which gets blocked), your AWS Lambda (which handles the DynamoDB write) sends a server-to-server ping to Facebook.
*   **The Result:** Your ad platform gets 100% accurate data on which ads are actually producing waitlist signups, allowing the algorithm to optimize your spend much faster.

### 5.4 The "Synthetic" Influencer Strategy

Since you are a music producer, you can create high-end Audio-Visual Assets that look like they cost $10k for nearly $0.

*   **Audio:** Use ElevenLabs to clone a "Hype-Man" voice for your video ads.
*   **Visuals:** Use HeyGen to create an AI avatar of a "Retro Specialist" who speaks directly to the camera about the cruise.

### 5.5 TikTok — Niche-First Discovery Channel

TikTok is the single highest-leverage platform for niche community validation in 2026. The algorithm surfaces hyper-specific content to self-selected identity communities — exactly the audiences this model targets. It operates in two modes:

**A. Organic Seeding (Zero Budget, Proof-of-Concept)**
*   Create a 30–60 second concept video using HeyGen AI avatar + ElevenLabs voice (same assets as §5.4) around the proposed trip theme.
*   Post with 3–5 niche hashtags (e.g., `#RetroGaming`, `#AnalogPocket`, `#GamingCruise`) plus one curiosity-hook caption: *"We're trying to get enough people to fill a ship. Who's in?"*
*   Measure: Views, saves, and comment sentiment within 48 hours. High save rate on a niche video = validated intent. This is free Phase A research before spending a dollar on ads.
*   DM commenters with the landing page slug directly — early organic signups have the highest conversion rate and seed the social proof count.

**B. TikTok Lead Gen Ads (Paid, Post-Validation)**
Once organic seeding confirms the theme has traction:
*   **The Tech:** TikTok Lead Generation campaign type — auto-fills user email + phone from their TikTok profile, identical mechanic to Meta Lead Form Ads (§5.1B).
*   **The Flow:** Webhook fires → Lambda writes `USER#<Email>` to `lll-shadow-campaigns` DynamoDB table → user receives the same Klaviyo nurture sequence as any other entry point.
*   **Targeting:** TikTok Interest & Behavior targeting for the specific niche (e.g., "Gaming," "Retro Tech," "Lifestyle Travel"). Lookalike audience seeded from any existing DynamoDB signups exported as a custom audience CSV.
*   **Creative Edge:** TikTok's algorithm rewards native-feel video over polished ad formats. The same AI-generated avatar content from §5.4 is repurposed here — low production cost, natively optimized format.

> **Why TikTok is Category-Defining for This Model:** Traditional cruise ads target "cruise intenders." TikTok lets you reach the Retro Gaming community *before* they know a gaming cruise is possible — making Leisure Life Interactive the originator of the concept in their feed, not one of twenty competing ads.

---

## 6. Campaign Discovery & Research

*This phase happens **before** a campaign slug is created. The goal is to identify which themed niches are viable, aspirationally price them using real inventory data, and produce the `campaign-config` object that auto-generates the landing page.*

### 6.1 Phase A: Psychographic Trend-Mining

The objective is to find high-intent niche subcultures *before* they hit the mainstream cruise industry's radar.

**This phase is fully automated** — trigger it via the discovery UI at `/tests/groups/discovery` or directly via `GET /api/groups/discovery`.
The pipeline executes two Perplexity Sonar Deep Research calls sequentially, then passes both research results to the blueprint-generation model.

---

#### Step 1 — Psychographic Discovery (Perplexity Sonar)

The pipeline sends this prompt to `sonar-deep-research`:

> *"Analyze current community growth and sentiment for niche subcultures discussing 'digital burnout,' 'IRL meetups,' or 'aesthetic retreats.' Identify 5 high-engagement communities with a high willingness to spend and a specific, ownable aesthetic (e.g., Solar-punk, Dark Academia, Biohacking, Retro-Gaming). For each, explain why a 4-day 'controlled environment' like a cruise would resonate."*

The full Sonar response is cached in `.github/data/discovery-research-cache.json` (keyed by date) and is **viewable in the discovery UI** — expand the "Sonar Deep Research → Step 1" panel after a run.

---

#### Step 2 — Aesthetic Gap / Ship Match (Perplexity Sonar)

Follow-up prompt fed back to `sonar-deep-research`, with the Step 1 output + live CB inventory context injected:

> *"For each theme retreat identified above, what onboard amenities are most requested? Cross-reference which cruise lines — focus on ships with newer fleet builds — already have that infrastructure without requiring a full-scale custom arrangement."*

The CB inventory context (`cb-deals-cache.json`) is automatically appended if it exists. Run `scripts/scrape-cb-deals.ts` first for inventory-first theming. The full Step 2 response is also viewable in the "Step 2 — Aesthetic Gap / Ship Match" panel in the discovery UI.

---

#### Step 3 — Structured Blueprint Generation (Gateway Model)

Both Sonar responses are fed to the blueprint-generation model (`callGlobalGenerateObject`) which produces exactly **5 structured campaign blueprints**. The model is explicitly required to produce three research-intelligence fields alongside each blueprint — these are stored on the `Campaign` record and are visible in the discovery UI under "Research Intelligence" on each blueprint card:

| Field | Description |
|---|---|
| `researchRationale` | **Why this niche was selected** — cites specific community data, platform signals, and trend observations from the Sonar data that identified the theme as viable. Must name subreddits, hashtag metrics, Discord sizes, etc. |
| `successLogic` | **Why this will convert** — the commercial and psychological case: audience spend willingness, the IRL pull factor, what market gap this fills, and why the cruise environment uniquely suits this community. |
| `audienceSignals` | **2–4 concrete data signals** — specific, single-sentence facts with platform, metric, and date context where available (e.g., `r/solotravel 15k+ upvotes on IRL meetup thread, Jan 2026`). |

> **Why this matters:** Blueprints that cannot explain their own rationale are guesses. These fields make every Phase A result auditable — you can see exactly which Sonar data point triggered each campaign idea and assess commercial viability before spending money on Phase B.

**Accessing Research Intelligence in the UI:**
- Each blueprint card in `/tests/groups/discovery` has a collapsible **"Research Intelligence"** section showing all three fields.
- The full raw Sonar text (both steps) is surfaced in the **"Sonar Deep Research"** amber panel between Phase A results and Phase B.

---

### 6.2 Phase B: Real-World Pricing via Internal Scrapers

Generic tools like Mindtrip or Gemini web extensions are **not used here**. Pricing must be grounded in the actual inventory sources this platform already integrates with.

**Primary Pricing Source: `vtgSearch` API**
The existing `/api/vtgSearch` route queries the VTG (Vacations To Go) retail engine for live sailing data. Use it to pull real `startingPrice` benchmarks for the proposed itinerary and date range.

*Example query pattern:*
```
GET /api/vtgSearch?destination=bahamas&duration=4&departureMonth=2026-11
```
Extract the median Balcony cabin price across 2–3 cruise lines for the target window. This becomes the campaign's `startingPrice` baseline.

**Secondary Source: CB Group Inventory (Live, Pre-Blocked)**

The CB `view_groups` page at `/groups/view_groups/` is the most authoritative source for confirmed available inventory with group pricing already applied. This step serves double duty: pricing validation *and* inventory matching.

*   **`scrape-group-info.ts`** — Query the live CB group inventory for sailings matching the target destination, cruise line, and duration. This returns the actual Group ID, Price From (group rate), Price Advantage over retail, and Personal Link availability.
*   **`scrape-cb-deals.ts`** — Cross-check against CB's promotional fares to identify any additional stackable discounts on the matched sailing.
*   **`scrape-group-rules.ts`** — Confirms the tour-conductor credit threshold and blackout date restrictions for the matched cruise line.

**Inventory-First Theming Workflow:**
Rather than designing a theme and then searching for inventory, Phase B can run in parallel with Phase A or even lead it:
1.  Query `view_groups` filtered by target departure port (e.g., JAX, XPC, TPA) and date window.
2.  Identify sailings with strong Price Advantages and compelling ships (newer fleet, specific amenities).
3.  Feed the ship/itinerary details back into the Phase A AI prompt to refine or select the best-fit theme.
4.  Lock the matched `cbGroupId` and `cbPersonalLink` into the campaign config *before launch* — making the threshold handoff near-instantaneous.

**Pricing Formula:**
```
startingPrice = (CB group 'Price From' for matched sailing) × 1.15  // +15% Theme Fee
```
Using the CB group rate directly (rather than retail median) is more accurate and already captures the Price Advantage. The 15% buffer covers the aspirational "exclusive event" component (tournament prize pools, private venue buyouts, branded materials).

---

### 6.3 Phase C: "Vibe" Asset Generation

Once pricing and ship/theme pairing are confirmed, generate the visual and audio assets for the landing page.

**Visuals (Midjourney)**
Generate 4–5 images that define the campaign aesthetic. Be hyper-specific to avoid generic cruise imagery:
> *"A [THEME AESTHETIC] scene on a modern cruise ship deck at golden hour, [specific prop/mood], high-resolution editorial photography style."*

**Ship Reference Imagery (Internal Image Search API)**
Generate 6–8 reference photos of the matched cruise ship to anchor the campaign aesthetic. Use the internal `/api/imageSearch` endpoint with the ship name and specific deck/amenity filters:

```
GET /api/imageSearch?shipName=Norwegian Gem&filters=deck,pool,dining,cabin,atrium&limit=8
```

Pull a mix of:
- Deck/outdoor spaces (where the theme's signature events will happen)
- Cabin interiors (balcony vs. oceanview, to anchor pricing tiers)
- Dining venues (to hint at onboard experience quality)
- Atrium/public spaces (to convey ship scale and energy)

These reference shots are embedded in the Phase C asset deck shared with the campaign's host/co-creator for visual alignment — ensuring the theme aesthetic matches the actual ship environment. They inform both the landing page hero imagery selection (which images to feature) and the Midjourney AI prompt refinement (grounding the generated visuals in real ship topology rather than generic cruise imagery).


**Audio Pitch (ElevenLabs)**
Create a 30-second ambient narration clip for the landing page hero. Keep it aspirational and identity-driven, not transactional:
> *"Imagine a week where the only thing that matters is [core theme value] and the horizon..."*

**Video (HeyGen — Optional)**
For high-priority campaigns, generate a 60-second "Virtual Host" video. The host explains the Shadow Group concept in niche-native language: *"We are gathering [N] more [identity label] to unlock this exclusive sailing — join the waitlist to make it happen."*

---

### 6.4 Phase D: The Campaign Config Object

The output of this entire discovery phase is a single typed config object that the campaign generator reads to auto-build the `/campaigns/[slug]` landing page and seed the DynamoDB `METADATA` record.

```json
{
  "slug": "analog-voyage-2026",
  "themeName": "The Analog Voyage",
  "aesthetic": "Retro-Future / Y2K",
  "targetDates": "November 2026",
  "minCabins": 8,
  "startingPrice": 1034,
  "priceSource": "CB group inventory (scrape-group-info) — cbGroupId matched pre-launch",
  "cbGroupId": "2847958",
  "cbPersonalLink": "https://bookings.cbagenttools.com/swift/cruise/package/2847958?siid=23379",
  "cbPriceAdvantage": 305,
  "shipTarget": "Norwegian Gem — 4-Night Bahamas from JAX",
  "highlightEvents": ["GameBoy Link-Cable Tourney", "Vinyl & Sunset Mixer", "35mm Film Walk Ashore"],
  "targetingKeywords": ["GameBoy", "Vinyl Records", "Digital Detox", "Analog Photography"],
  "status": "DRAFT"
}
```

This object is the handoff artifact from the Discovery phase to the Build phase. It is committed to the campaign's DynamoDB `METADATA` record as the initial `DRAFT` entry before any waitlist traffic is routed.


---

## 7. Campaign Operations Calendar

*This section defines the operational rhythm — how blueprints are batched, campaigns are launched, and performance gates are enforced. It is the "factory floor" layer on top of the strategy.*

### 7.1 Monthly Blueprint Sprint (The Batch Model)

All 5 campaign blueprints for the month are produced **in a single AI-assisted session** at the start of each month. This is not a rolling process — it is a focused batch.

**Session Output (per month):** 5 × completed Phase D `campaign-config` objects, stored as `DRAFT` in DynamoDB with all fields populated: theme, pricing, CB group link, targeting keywords, and asset briefs.

**Why Batch?**
Running all 5 discovery prompts (§6.1–6.3) in one session lets the AI cross-reference themes, avoid keyword overlap across simultaneous campaigns, and maintain aesthetic distinctiveness. A Retro-Gaming campaign and an Analog Photography campaign share an audience — spacing them thematically prevents cannibalization.

**Monthly Sprint Checklist:**
- [ ] Run Phase A discovery prompt once for all 5 themes (single session)
- [ ] Run Phase B pricing scrape for each (`scrape-group-info.ts` × 5)
- [ ] Match `cbGroupId` + `cbPersonalLink` for each theme
- [ ] Generate Phase C assets (Midjourney × 5 sets, ElevenLabs × 5 clips)
- [ ] Commit 5 × `DRAFT` configs to DynamoDB `lll-shadow-campaigns`
- [ ] Queue 5 landing page slugs for build

---

### 7.2 Weekly Launch Rate (Staggered Activation)

From the 5 monthly blueprints, **1–2 campaigns activate per week**, staggered across the month. This prevents ad budget fragmentation and ensures each campaign gets focused attention during its critical first 7 days.

**Activation Schedule (example — 5 campaigns/month):**

| Week | Campaigns Activated | Campaigns Active | Decision Gate |
|------|---------------------|------------------|---------------|
| Week 1 | 2 | 2 | — |
| Week 2 | 2 | 4 | Week 1 early signals reviewed |
| Week 3 | 1 | 5 | Week 1–2 signals reviewed |
| Week 4 | 0 | 5 | All 5 at Seed Phase Day 21 |
| End of Month | 0 | 5 → Decision gate | Day 30 review for all 5 |

**Activation = Status `DRAFT` → `GATHERING_INTEREST`** — the DynamoDB record transitions, the landing page goes live, and the Seed Phase clock starts.

---

### 7.3 The Seed Phase (Days 1–30)

Each active campaign runs a **30-day Seed Phase** using only two promotion channels:

**Channel 1: TikTok Organic (Zero Budget)**
Free content strategy as defined in §5.5A:
- Post 1× 30–60s AI-generated concept video per campaign at activation
- Niche hashtag set + curiosity-hook caption
- Monitor: Views, saves, comment sentiment, DMs within 48h
- DM every commenter with the campaign landing page slug directly
- Re-post at Day 14 with a "We're still gathering" angle if organic traction is present

This is the **zero-cost proof signal**. High TikTok save rate on a niche video is the earliest and cheapest validation indicator — before a single ad dollar is spent.

**Channel 2: Tier 1 Targeted Ads (Controlled Spend)**
Two paid channels only during Seed Phase — kept lean intentionally:

| Platform | Ad Type | Target | Spend Cap |
|----------|---------|--------|-----------|
| Google Display | Custom Intent Audience (§5.1A) | Niche search-term recency targeting | $5–10/day |
| Meta Lead Ads | Lead Form with Webhook (§5.1B) | Interest + behavior targeting | $5–10/day |

> **Seed Phase budget ceiling: ~$300/month per campaign.** This is a market research cost, not a scaling cost. The goal is signal, not volume.

All paid leads write directly to DynamoDB via the Meta/Google Webhook → Lambda pipeline and enter the same Klaviyo nurture sequence (§5.2A).

---

### 7.4 Day 30 Decision Gate (Scale or Kill)

At the end of the 30-day Seed Phase, each campaign is evaluated against the following metrics. The decision is binary: **Scale** or **Kill**.

**Scoring Metrics:**

| Signal | Strong (Scale) | Weak (Kill) |
|--------|----------------|-------------|
| Waitlist signups | ≥ 40% of `minCabins` threshold | < 15% of threshold |
| Klaviyo email open rate (nurture seq.) | > 35% | < 20% |
| TikTok content save rate | > 8% | < 2% |
| Meta/Google CPL (Cost Per Lead) | < $8 | > $25 |
| Manifest completion rate (if triggered) | > 60% | < 30% |

**Decision: Scale**
If 3+ signals are in the "Strong" column:
- Channel budget scaled: TikTok Lead Gen Ads activated (§5.5B), Google/Meta budgets increased to $25–50/day
- Promotion window extended: campaign continues as a rolling monthly increment until `THRESHOLD_MET` or a defined max-duration cap
- Klaviyo sequence extended with fresh social proof ("X more cabins since last week") and event-voting CTAs
- Optional: Influencer/creator outreach targeting niche community leaders (micro-influencers, < 100K followers, high engagement rate)

**Decision: Kill**
If 3+ signals are in the "Weak" column:
- Stage 5 Graceful Expiry triggered immediately (§3, Stage 5)
- All `USER#` and `GUEST#` records retained as CRM — seeded into the next month's blueprint sprint as a pre-warmed "niche near-miss" audience
- Ad spend halted; TikTok content archived (not deleted — organic long-tail value remains)
- Debrief: niche flagged in monthly sprint as needing a different angle (ship, price point, departure port, seasonal timing) — not dead, re-queued

> **Operating Principle:** A killed campaign at ~$300 spend is a $300 market research cost that produced a validated negative signal and a CRM list. This is categorically cheaper than the traditional model of blocking inventory and discovering the niche does not convert after months of effort.

---

### 7.5 Operational Summary (Monthly View)

```
MONTH START
  └── Blueprint Sprint (1 session, all 5 themes, all 5 configs → DRAFT)

WEEK 1
  ├── Activate Campaign A + B (→ GATHERING_INTEREST)
  └── TikTok organic posts for A + B; Tier 1 ads fire

WEEK 2
  ├── Activate Campaign C + D
  ├── TikTok organic posts for C + D; Tier 1 ads fire
  └── Review Week 1 early TikTok signals for A + B

WEEK 3
  ├── Activate Campaign E
  ├── TikTok organic re-post for A + B if traction present
  └── Review Week 1–2 signals for A + B + C

WEEK 4
  └── All 5 in Seed Phase; monitor metrics dashboard

MONTH END — Day 30 Decision Gate
  ├── Scale: 3+ Strong signals → extend + increase spend
  └── Kill: 3+ Weak signals → Stage 5 Expiry, archive, CRM retain

MONTH START (NEXT)
  └── New Blueprint Sprint — killed niche re-queues factored in, pre-warmed lists reused
```