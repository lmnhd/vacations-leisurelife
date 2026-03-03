# Group Campaign Strategy

**Document Status:** Master Blueprint / Single Source of Truth
**Core Principle:** Validate Market Demand Before Securing Inventory or Financial Liability
**Architecture:** DynamoDB (No Prisma) / Direct Agent Tools Handoff (No Local Payment Capture)

## 1. The "Shadow Group" Philosophy

In standard travel agent workflows, an agent must formulate a group with a cruiseline and configure it via Cruise Brothers (*CB Agent Tools*) upfront. This assumes risk and requires significant back-and-forth for themes that might not convert.

**The "Shadow Group" Model** flips this equation:
1.  **AI-Generated Pitch:** The AI and host construct an aspirational "Group Cruise Package" (e.g., *Salsa Dancing in the Caribbean*) featuring anticipated prices based on available retail APIs, without holding group inventory.
2.  **Waitlist Collection:** Users register interest on a dynamically generated landing page (the "Feel It Out" generator). Crucially, **no money is collected at this stage**. The system only gathers Lead Data, Cabin Preferences, Passenger Counts, and **Event/Activity Proposals**.
3.  **Threshold Action:** Once the predefined minimum threshold is met (e.g., 8 cabins to secure a tour-conductor credit), the group is definitively established.

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
    *   `minCabinsRequired`: The minimum waitlist entries needed to pull the trigger (Default: 8).
    *   `status`: 'DRAFT' | 'GATHERING_INTEREST' | 'CONVERTED'
    *   `cbagenttoolsGroupId`: (Populated post-conversion)
    *   `cbagenttoolsBookingLink`: (Populated post-conversion) The link sent to users.

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

---

## 3. The Validation Pipeline & Handoff Process

### Stage 1: Gauge Interest via Landing Page
*   Traffic is routed to `/campaigns/[slug]`.
*   Users review the AI-assisted itinerary proposal.
*   Users submit the "VIP Waitlist" form. Data is pushed directly to the DynamoDB `lll-shadow-campaigns` table as a `USER#` record.

### Stage 2: Triggering Validation
*   On every waitlist submission, a serverless function checks if `Total Cabins Request >= minCabinsRequired`.
*   If true, the system fires off an internal alert via the `.env` configured notification channel (Slack/Pushover/Email) to the Master Agent.

### Stage 3: Inventory Match & Link Acquisition

*Verified via direct CBAT recon (March 2026): Cruise Brothers pre-negotiates and holds hundreds of group blocks across all major cruise lines on behalf of its agent network. **No agent-side deposit is required.** CB carries the group hold cost.*

*   **Primary Action (No-Cost Path):** Search the existing CB Group Inventory at `/groups/view_groups/` for a sailing that matches the campaign's target destination, duration, and sail date window. Hundreds of pre-blocked sailings are available across Royal Caribbean, Norwegian, Celebrity, Carnival, MSC, Holland America, Princess, and Virgin Voyages — with ready-made Personal Links and pre-calculated Price Advantages.
*   **On Match Found:** Click "Copy Link" to retrieve the Personal Booking Link immediately. No Formstack registration needed.
*   **Fallback (Custom/External Blocks Only):** If a sailing negotiated *outside* of CB's pre-existing inventory is used (e.g., directly with a cruise line group desk), register it via the Formstack at `https://anhywhereinc.formstack.com/forms/private_group_booking`. This locks the Group ID so other CB agents cannot book into it.
*   *Note*: The `view_campaigns` section in CBAT is where the agent's named/themed campaigns appear once linked to a group block — this is the visible record of an active Shadow Group post-conversion.

### Stage 4: Financial Collection Handoff (The Direct Link)
*   **CRITICAL CONSTRAINT**: The Leisure Life Interactive platform MUST NOT collect local payments or deposits (No Stripe Pre-Authorizations).
*   **Action:**
    1.  Upon group generation in CB, the system retrieves the official **"Personal Link to Book"** provided by the Cruise Brothers engine.
    2.  Format expected: `https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}?siid={AGENT_ID}`
    3.  This URL is saved to the Campaign Metadata record as `cbagenttoolsBookingLink`.
    4.  An automated email dispatch securely emails the users in the waitlist. 
    5.  Users click the link, customize their specific cabin directly in the CB flow, and pay their deposit directly into the official, bonded agency account. 

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
*   **Day 3 (The Co-Creation):** "Vote on the tournament! Mario Kart 64 or GoldenEye? Your vote shapes the itinerary." (This link triggers a UpdateItem call to your DynamoDB `proposedEvents`).
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

---

## 6. Campaign Discovery & Research

*This phase happens **before** a campaign slug is created. The goal is to identify which themed niches are viable, aspirationally price them using real inventory data, and produce the `campaign-config` object that auto-generates the landing page.*

### 6.1 Phase A: Psychographic Trend-Mining

The objective is to find high-intent niche subcultures *before* they hit the mainstream cruise industry's radar.

**The "Psychographic Discovery" Prompt**
Run this prompt through the internal AI chat pipeline (`/api/chat`) or a dedicated research agent session:

> *"Analyze current community growth and sentiment for niche subcultures discussing 'digital burnout,' 'IRL meetups,' or 'aesthetic retreats.' Identify 5 high-engagement communities with a high willingness to spend and a specific, ownable aesthetic (e.g., Solar-punk, Dark Academia, Biohacking, Retro-Gaming). For each, explain why a 4-day 'controlled environment' like a cruise would resonate."*

**The "Aesthetic Gap" Follow-Up**
Once a theme candidate emerges, drill into cruise-side feasibility:

> *"For a [THEME] retreat, what onboard amenities are most requested? Now cross-reference which cruise lines — focus on ships with newer fleet builds — already have that infrastructure without requiring a full-scale custom arrangement."*

This produces a shortlist of 2–3 **viable ship/theme pairings** before any inventory is touched.

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
