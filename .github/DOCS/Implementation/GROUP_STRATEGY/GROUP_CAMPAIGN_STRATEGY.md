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

### Stage 3: Official Configuration
*   **Action**: The Agent formally populates the group registration Formstack at `https://www.cbagenttools.com/groups/build/` to lock in the real CB Group ID.
*   *Note*: This can be performed manually or via a verified Playwright task (`cruise-groups-manager`).

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

*   **Risk Averse:** Prevents holding unfillable group inventory.
*   **Compliance Safe:** Removes the legal liability of acting as a Merchant of Record on behalf of a host agency.
*   **Agile Iteration:** Allows the creation of 50 different themed landing pages in a day, letting the organic web traffic prove which trip is naturally viable.
*   **Serverless Native:** Moves transient interest data to fast, cheap DynamoDB storage.
*   **Crowd-Sourced Itineraries (Event Requests):** By asking early responders what activities, workshops, or meetups they want, we gather free market research, increase user investment in the trip, and use their specific ideas as marketing ammunition to autonomously promote the campaign to others.

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
