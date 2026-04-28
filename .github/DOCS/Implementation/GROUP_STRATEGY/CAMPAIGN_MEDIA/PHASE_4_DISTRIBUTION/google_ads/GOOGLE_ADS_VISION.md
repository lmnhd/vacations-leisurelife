# Google Ads Distribution Vision & Strategy

**Document Status:** Master Blueprint for Google Ads Integration
**Context:** Phase 4 Distribution Engine - Contextual Interception
**Primary Ad Products:** Google Display Network (Responsive Display Ads) & YouTube Video Ads
**Forbidden Ad Products:** Generic Google Search Ads (e.g., bidding on "Caribbean Cruise")

---

## 1. The Core Philosophy: "The Google Display Hack"

The fundamental premise of the Leisure Life Interactive group campaign strategy is that we are selling a **community and an experience**, not just a cruise. 

If we bid on generic Search terms like "Caribbean Cruise 2026", we enter a bidding war against Royal Caribbean for an audience looking for a generic family vacation. We will lose.

Instead, Google Ads is our **Top-of-Funnel Contextual Interceptor**. We find our target audience while they are deeply engaged in the specific hobby or niche that our campaign is themed around. We interrupt their hobby consumption with an invitation to join "their people" at sea.

### The Mechanism
1. **Custom Intent Audiences:** We target users who have recently searched for hyper-specific niche terms (e.g., "rare monstera care", "selvedge denim repair", "analog pocket restock").
2. **Placement Targeting:** We force our ads to appear on highly relevant YouTube channels, niche forums, and specialty blogs.
3. **The Hook:** We present the AI-generated aesthetic imagery (Phase 2) offering a low-pressure, vacation-first experience tailored exactly to their interests.
4. **The Action:** Drive them to the campaign landing page to capture the `GROUP_WAIT` intent (zero financial commitment).

---

## 2. AI's Role in Campaign Generation

When the Distribution Engine (`POST /api/campaigns/[slug]/media/distribute`) targets Google Ads, it does not just upload images. The LLM Gateway is responsible for generating the targeting strategy dynamically based on the campaign blueprint:

1. **Keyword Generation:** The AI generates 10-15 highly specific Custom Intent keywords.
   * *Example for Houseplant Campaign:* "variegated monstera cuttings", "aroid soil mix", "indoor greenhouse setup".
2. **Placement Generation:** The AI suggests 5-10 specific YouTube channels or website domains where this community congregates.
3. **Copy Generation:** The AI generates Short Headlines, Long Headlines, and Descriptions optimized for Responsive Display Ads, matching the exact character limits of the Google Ads API.

---

## 3. The Developer / Agent Contract (How to Build This)

All agents implementing the Google Ads adapter (`lib/campaigns/distribution/platforms/google-ads.ts`) must adhere to the following rules:

### A. Strict Adherence to Phase 4 Principles
* **Create Native Drafts:** The adapter MUST create campaigns in Google Ads with the status strictly set to `PAUSED`.
* **Separate Creation from Activation:** The system NEVER activates a campaign or spends money. Activation is an explicit, manual human action taken inside the Google Ads UI.
* **Persist Native Review Links:** After successfully creating the paused campaign, the adapter must return the Google Ads `campaignId` and construct a deep link (e.g., `https://ads.google.com/aw/campaigns?campaignId=[ID]`) to be stored in the DynamoDB distribution record.

### B. Authentication & Credentials
* **OAuth 2.0:** Implement a standard OAuth flow to obtain a `refreshToken`.
* **Required Scopes:** `https://www.googleapis.com/auth/adwords`
* **Credentials Storage:** Persist the `refreshToken`, `developerToken`, `customerId`, and `managerAccountId` (MCC) in the existing durable provider token store (`lib/integrations/provider-token-store.ts`).

### C. The API Integration Steps
1. **Asset Upload:** Download the Phase 2 generated images and videos from R2, format them to Google's requirements, and upload them to the Google Ads Asset Library.
2. **Campaign Creation:** Create a `Display` or `Video` campaign (Paused) with a minimal placeholder budget.
3. **Ad Group & Targeting:** Create an Ad Group and attach the AI-generated Custom Intent Audiences and Placements.
4. **Ad Creation:** Combine the uploaded assets and AI-generated copy into Responsive Display Ads or Video Ads attached to the Ad Group.

---

## 4. Expected Output

When the integration is complete, the operator should be able to click "Distribute to Google" on the dashboard. The system will process the assets, interact with the Google Ads API, and within seconds, provide a link saying: 

> *"Google Display Campaign Created (Paused). Click here to review targeting and activate."*