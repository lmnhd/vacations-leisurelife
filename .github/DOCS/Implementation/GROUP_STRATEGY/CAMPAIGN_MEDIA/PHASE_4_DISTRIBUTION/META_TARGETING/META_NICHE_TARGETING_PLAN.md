# Meta Ads Dynamic Niche Targeting Strategy

## 1. The Current Gap
Currently, Meta Ads dispatch (`dispatchMetaAdsLive`) uses a static `META_AD_SET_ID` from the environment. This means all campaigns, regardless of their niche, are broadcast to the same static audience. Google Ads, by contrast, dynamically synthesizes contextual placements, keywords, and audience signals specific to the campaign using a dedicated targeting module (`synthesizeGoogleTargeting`).

## 2. Objective
Promote from *within* the niche. If the campaign is a "Tabletop Gaming" cruise, the Meta Ads should target board game interests, convention attendees, and tabletop hobbyists, actively excluding generic cruise audiences to maintain high relevance and low CPA.

## 3. Options for Implementation

### Option A: Dynamic Ad Set Creation (Recommended)
Instead of hardcoding the Ad Set, we create a new Meta Ad Set (and potentially a parent Meta Campaign) for every group campaign at the time of dispatch.
*   **Pros:** Isolates budget and learning phase per niche. Prevents concurrent campaigns from polluting each other's audiences. Allows a true 1:1 map between the campaign blueprint and Meta delivery.
*   **Cons:** Requires handling campaign budgets, bid strategies, and schedule windows via the Meta Graph API.

### Option B: Static Ad Set with Overwritten Targeting
Maintain a single "Draft" Ad Set and overwrite its targeting parameters right before adding the new Ad.
*   **Pros:** Requires fewer API calls.
*   **Cons:** Extremely fragile. If multiple campaigns run concurrently or are in draft review, overwriting the Ad Set targeting affects *all* ads currently running under that Ad Set.

### Option C: Saved Audience API
Generate Meta "Saved Audiences" via the API and attach them manually.
*   **Pros:** Reusable audiences.
*   **Cons:** Overcomplicates the pipeline; Ad Sets already encapsulate targeting effectively.

**Verdict:** **Option A** is the only safe and scalable approach for an autonomous pipeline managing multiple diverse niches.

## 4. Proposed Architecture

### 4.1. Meta Targeting Synthesizer (`lib/campaigns/distribution/platforms/meta-ads/targeting.ts`)
Parallel to Google's synthesizer, this module will extract signals and format them for Meta:
*   **Seed Extraction:** Pull `targetingKeywords`, `highlightEvents`, and `audienceSignals` from the blueprint and the research dossier.
*   **Generic Denial:** Actively filter out broad travel words ("cruise", "travel", "vacation").
*   **Meta Interest Resolution:** Unlike Google (which takes raw string keywords), Meta requires specific Interest Node IDs for targeting. We will need to query the Meta Graph API (`GET /search?type=adinterest&q={keyword}`) to map our raw text seeds into valid Meta targeting node IDs.

### 4.2. Meta Graph Updates (`lib/integrations/meta-ads.ts`)
*   Add functions to query the targeting search API (`/search?type=adinterest`).
*   Add functions to create Meta Campaigns (`/act_<id>/campaigns`).
*   Add functions to create Meta Ad Sets (`/act_<id>/adsets`) using the resolved `targeting` parameter. The payload will use the `flexible_spec` targeting format (e.g., `targeting: { flexible_spec: [{ interests: [{id, name}] }] }`).

### 4.3. Dispatch Pipeline Updates (`lib/campaigns/distribution-marketing.ts`)
*   Modify `dispatchMetaAdsLive` to follow a multi-step orchestration:
    1.  Synthesize Meta Targeting (resolve blueprint text to Meta Interest IDs).
    2.  Create a Meta Campaign for the Leisure Life Group Campaign (if not using a master campaign).
    3.  Create an Ad Set with the synthesized targeting and a baseline daily budget.
    4.  Create the Ad Creative and Ad (as it does now, but linking to the newly generated Ad Set).

## 5. Step-by-Step Execution Plan

**Step 1: Meta Interest Resolution API**
*   Implement the Graph API wrapper for `GET /search?type=adinterest`.
*   Create a caching layer or fallback mechanism so we don't spam the Meta Search API if a keyword resolution fails.

**Step 2: Build `synthesizeMetaTargeting`**
*   Create `lib/campaigns/distribution/platforms/meta-ads/targeting.ts`.
*   Port the keyword expansion logic from Google Ads, but append the asynchronous step of resolving these keywords into Meta Interest IDs.
*   Include robust error handling (if a niche is too obscure, fall back to the closest broader interest).

**Step 3: Preview & Simulation UI**
*   Update the `providerMode="simulate"` logic in `distribution-marketing.ts` to output `metaTargeting`.
*   Update the preview response to surface the resolved Meta Interests alongside Google Placements, allowing the user to review the planned audience before live dispatch.

**Step 4: Live Dispatch Orchestration**
*   Update `dispatchMetaAdsLive` to create the Ad Set on the fly.
*   Retire or deprecate the strict requirement for `META_AD_SET_ID` in `.env`, using it only as an absolute fallback for generic campaigns.

**Step 5: E2E Testing**
*   Run the pipeline against existing difficult test cases (e.g., Tabletop Gaming, Niche Music Festivals) to verify the Meta interests actually map correctly.
*   Validate the payloads created in the Meta Ads Manager Sandbox.

## 6. Implementation Status - Option A

Status: implemented in the app-side dispatch path.

Completed:
* `lib/integrations/meta-ads.ts` now treats `META_AD_SET_ID` as optional fallback configuration, exposes Meta interest search, and can create paused Meta campaigns and paused ad sets.
* `lib/campaigns/distribution/platforms/meta-ads/targeting.ts` synthesizes campaign-native Meta interest queries from `targetingKeywords`, `highlightEvents`, `audienceSignals`, niche text fields, and the secondary research dossier. Generic cruise/travel/vacation terms are denied before targeting is built.
* Live `facebook_ad` dispatch now resolves Meta interest IDs, creates a paused campaign plus paused ad set when interests resolve, and creates the paused ad under that dynamic ad set.
* If live interest resolution produces no usable Meta interests, `META_AD_SET_ID` is used only as an explicit static fallback. If no fallback is configured, dispatch fails rather than silently using a generic audience.
* Simulated `facebook_ad` dispatch now returns a `metaTargeting` preview payload without calling Meta provider APIs.
* The distribution dashboard exposes "Preview Meta Targeting", "Meta Draft Audit", and "Current Meta Targeting" surfaces so operators can review audience construction before live draft creation.

Live behavior:
1. Resolve niche terms with `GET /search?type=adinterest`.
2. Create a paused Meta campaign using `OUTCOME_TRAFFIC`.
3. Create a paused Meta ad set using `flexible_spec` interests, `LINK_CLICKS` optimization, and a daily budget from `META_DAILY_BUDGET_CENTS` or the default 2000 cents.
4. Create the ad creative and paused ad linked to the new ad set.
5. Persist campaign, ad set, creative, ad, review URL, and targeting summary notes.

Remaining live validation:
* Run one sandbox or production-paused Meta draft with a real campaign to confirm the account accepts the selected objective/ad-set fields.
* Confirm that interest resolution quality is strong enough for the first few niche campaigns; adjust query expansion only if live Meta search returns weak matches.
