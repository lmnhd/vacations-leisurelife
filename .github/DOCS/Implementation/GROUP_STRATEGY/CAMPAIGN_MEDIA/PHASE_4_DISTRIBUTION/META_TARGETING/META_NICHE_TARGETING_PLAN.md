# Meta Ads Dynamic Niche Targeting Strategy

## 1. The Problem This Solves
Meta Ads dispatch previously used a static `META_AD_SET_ID` from the environment, broadcasting every campaign to the same generic audience. A fiber arts cruise was targeting the same people as a tabletop gaming cruise. The goal is to promote from *within* the niche: if the campaign is a knitting cruise, the Meta Ads should target knitters — not generic cruise audiences.

## 2. Architecture

### 2.1. Targeting Synthesizer (`lib/campaigns/distribution/platforms/meta-ads/targeting.ts`)
Extracts niche signals from the campaign blueprint and research dossier, filters out generic travel/cruise terms, then resolves them to Meta interest node IDs via the Graph API.

Key behaviors:
- **Seed extraction:** `targetingKeywords`, `audienceSignals`, dossier `allowedSignals`, `specificExamples`, and campaign prose fields are all mined for interest atoms
- **Generic denial:** Travel ideology terms (cruise, vacation, travel, ship, port, etc.) are stripped before any Meta query is built
- **Atom compression:** Long dossier prose is compressed into short Meta-safe queries (≤4 words, ≤36 chars) before resolution
- **AI parent node resolution:** `resolveMetaParentNodes` calls the LLM gateway (`extraction` task tier) to identify 2–6 verified broad Meta interest category names for the niche (e.g. "Knitting", "Crochet", "Board game"). These are injected immediately after seed keywords so they are never crowded out by secondary text-mining. This replaces the old `NICHE_PARENT_MAP` regex table.
- **Interest ID resolution:** Each query is sent to `GET /search?type=adinterest`. On miss, smaller derived atoms are retried. The in-memory cache prevents duplicate API calls within a dispatch run.
- **Fallback chain:** dynamic ad set → `META_AD_SET_ID` static fallback → hard fail (no silent generic audience)

### 2.2. Meta Graph Integration (`lib/integrations/meta-ads.ts`)
- `createMetaCampaign`: creates a paused `OUTCOME_TRAFFIC` campaign. **Must use JSON body** — `special_ad_categories` is an array and cannot be sent via form encoding. Requires `is_adset_budget_sharing_enabled: false`.
- `createMetaAdSet`: creates a paused ad set with `flexible_spec` interest targeting, `LANDING_PAGE_VIEWS` optimization, `IMPRESSIONS` billing.
- `searchMetaAdInterests`: wraps `GET /search?type=adinterest`.
- Error formatting surfaces `error_user_msg` (the human-readable Meta explanation) rather than the generic `message` field.

### 2.3. Dispatch Pipeline (`lib/campaigns/distribution-marketing.ts`)
`dispatchMetaAdsLive` orchestration:
1. Build preview payload (image URL, copy, CTA from brief/manifest)
2. Upload image to Meta and get image hash
3. `synthesizeMetaTargeting` — runs AI parent node resolution + Meta interest ID resolution
4. If interests resolved → create paused campaign + paused ad set with `flexible_spec` targeting
5. If campaign/ad set creation fails → fall back to `META_AD_SET_ID` with a warning (not a silent failure)
6. Create ad creative and paused ad under the resolved ad set
7. Persist all IDs, review URL, and targeting summary to the schedule entry

### 2.4. Operator UI
Two surfaces expose the full targeting picture before and after live dispatch:

**Review panel** (`app/(tests)/tests/campaign-landing/[slug]/review-controls.tsx`):
- **Preview Meta Targeting** — simulate-only, no Meta API calls, shows AI parent nodes + interest queries
- **Build Meta Draft** — live dispatch scoped to `facebook_ad` only, `replaceExisting: true`

**Distribution Control Deck** (`app/dashboard/campaigns/[slug]/media/distribution/page.tsx`):
- **Preview Meta Targeting** — same simulate path
- **Dispatch Meta Live** — live dispatch, `replaceExisting: true`
- **Current Meta Targeting** panel — shows AI-resolved parent nodes (blue chips), interest queries, resolved interests, unresolved queries, and warnings after any action

## 3. Account-Specific Requirements (act_1612907296491359)

These were discovered through live testing and are not in Meta's generic docs. Future campaigns on this account must follow these exactly.

**Campaign creation:**
- Use JSON body (`Content-Type: application/json`), not form encoding
- `special_ad_categories: []` — required, must be a real JSON array
- `is_adset_budget_sharing_enabled: false` — required; account rejects creation without this
- `objective: 'OUTCOME_TRAFFIC'` — correct ODAX objective; `LINK_CLICKS` is rejected
- `status: 'PAUSED'`

**Ad set creation:**
- `optimization_goal: 'LANDING_PAGE_VIEWS'` — matches existing account ad sets; `LINK_CLICKS` is wrong for this objective
- `billing_event: 'IMPRESSIONS'`
- `bid_strategy: 'LOWEST_COST_WITHOUT_CAP'` — must be explicit; omitting it causes Meta to default to bid cap which then requires a `bid_amount` and fails
- `destination_type: 'WEBSITE'`

**Error handling:**
- Always surface `error.error_user_msg` from Graph API errors — the `message` field contains only generic text like "Invalid parameter" which is useless for debugging

## 4. Duplicate Ad Prevention

`forceDispatch: true` bypasses the schedule timing gate but must not bypass the already-drafted guard. The dispatch route (`app/api/groups/campaign/[slug]/media/distribute/route.ts`) skips live paid-ad platforms (`facebook_ad`, `google_display`, `tiktok_paid`) that already have `status: draft_created` and an `externalPostId`, unless `replaceExisting: true` is also passed. "Build Meta Draft" and "Dispatch Meta Live" both pass `replaceExisting: true` intentionally.

## 5. Ship Name Integrity

Ad copy is generated by `generatePlatformCopy` from the campaign brief. The copy generator now receives `canonicalShipName` (from `getAuthoritativeShipName(campaign)`) as an explicit parameter, injected as a hard rule at the top of the LLM prompt: `"SHIP NAME RULE: The ship for this campaign is X. Use this exact name. Never substitute another ship name."` This prevents the LLM from hallucinating a ship name from stale text in other fields (e.g. `researchRationale`).

`getAuthoritativeShipName` prefers `matchedShipName` (inventory-matched) over `shipTarget` (blueprint). The campaign PATCH API (`/api/groups/campaign/[slug]`) now accepts `shipTarget` and `matchedShipName` corrections directly without requiring a full discovery re-run.

## 6. Current Status

**Fully working as of 2026-06-03:**
- Dynamic campaign + ad set creation with `flexible_spec` interest targeting — confirmed live on act_1612907296491359
- AI parent node resolution via LLM gateway replacing the old regex `NICHE_PARENT_MAP`
- Fallback to `META_AD_SET_ID` when dynamic creation fails, with explicit warning in dispatch response
- Duplicate ad prevention via `draft_created` + `externalPostId` guard
- Ship name explicitly injected into copy generator prompt
- `shipTarget` / `matchedShipName` patchable via campaign PATCH API
- `parentNodes` surfaced in preview UI and dispatch metadata
- Warning messages in targeting package updated to be operator-actionable

**Live dispatch flow (confirmed end-to-end 2026-06-03):**
1. AI resolves niche → broad Meta parent nodes (e.g. Knitting, Crochet, Sewing, Crafts)
2. Meta interest search resolves parent nodes + seed atoms to interest node IDs
3. Paused campaign created with `OUTCOME_TRAFFIC`, `special_ad_categories: []`, `is_adset_budget_sharing_enabled: false`, JSON body
4. Paused ad set created with `flexible_spec` interests, `LANDING_PAGE_VIEWS`, `IMPRESSIONS`, `LOWEST_COST_WITHOUT_CAP`, daily budget $5 (500 cents)
5. Ad creative and paused ad created under the new isolated ad set
6. All IDs, review URL, and targeting summary persisted to schedule entry
7. Each campaign gets its own isolated Meta campaign + ad set — no audience cross-contamination between niches

**Remaining:**
- Monitor interest resolution quality across additional niche campaigns (tabletop gaming, music festivals, etc.)
- Consider adding `age_min`/`age_max` and `geo_locations.location_types` to match the account's existing ad set structure if Meta requires it for future ad sets
- Copy regeneration for the fiber arts campaign is still needed — the manifest `adVariants` still contain "Celebrity Edge"; regenerate via `POST /api/groups/campaign/fiber-arts-yarn-tasting-voyage/media/test/copy`
