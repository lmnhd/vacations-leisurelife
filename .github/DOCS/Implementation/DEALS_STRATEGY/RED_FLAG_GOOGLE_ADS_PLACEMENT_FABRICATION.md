# RED FLAG — Group Campaigns' Google Ads "real" placements are unverified LLM guesses

> Status: **Needs operator review.** Raised 2026-06-25 while building the deals-system
> equivalent (Google Ads Synthesis/Distribution, Step 9/10). Not yet acted on — flagging
> for your attention once current work wraps.

## The one-line version

Group campaigns' Google Display ad targeting can apply **placement criteria** (specific
subreddits, YouTube channels, domains) to a **live, real Google Ads account** that were
never verified to exist. They are pattern-matched out of free-text prose an LLM wrote
with no web search, no browsing, and no grounding tool — the LLM can name a subreddit
that doesn't exist, and the code will dispatch it as a real placement criterion anyway.

**This is reachable from the live dispatch path used by the 3 currently-live group
campaigns** (`lib/campaigns/distribution/dispatcher.ts`, `case 'google_display'`),
*if* a research dossier was generated for that campaign. The dossier step is
operator-triggered (not automatic), so whether any given live campaign is actually
exposed depends on whether `/api/groups/campaign/[slug]/research-dossier` was ever
called for it — that needs to be checked per-campaign, not assumed.

## How this was discovered

While building the deals-system's Google Ads placement targeting (a parallel, much
smaller pipeline for individual cruise Deals), the natural move was to copy group
campaigns' existing pattern for sourcing Google Ads placements
(`lib/campaigns/distribution/platforms/google-ads/targeting.ts`). Tracing exactly how
that pattern gets its "real" placement URLs surfaced the problem below. The deals-system
build was changed to NOT copy this pattern — see "What deals-system did instead."

## The exact mechanism, with file/line citations

**Step 1 — the dossier is pure LLM reasoning, no search tool.**
`lib/campaigns/campaign-research.ts:90-146`, function `generateCampaignResearchDossier`:
- Calls `callGlobalGenerateObject()` (line 128) — a structured-output LLM call.
- No search/browsing/grounding tool is passed in. The system prompt (lines 48-80)
  instructs the model to produce "current, niche-literate detail" including
  `specificExamples`, `allowedSignals`, communities, formats — but the model has no way
  to check whether any community it names is real. It is reasoning from training data
  and the campaign's existing blueprint fields, not live information.
- Persisted verbatim onto the campaign record via `upsertCampaignResearchDossier`
  (line 137) as `campaign.researchDossier.nicheResearch`.

**Step 2 — placements are regex-mined out of that unverified prose, with no existence
check.**
`lib/campaigns/distribution/platforms/google-ads/targeting.ts:234-268`, function
`extractPlacementsFromText`:
- `subredditPattern = /\br\/([a-z0-9_]+)/gi` — any text matching `r/something` becomes
  `reddit.com/r/something` (line 251).
- `youtubeHandlePattern = /(?:youtube\.com\/)?@([a-z0-9_\-]{3,})/gi` — any `@something`
  becomes `youtube.com/@something` (line 256).
- A bare-domain regex captures anything shaped like `word.tld` (line 240, 260-265).
- **None of these three patterns make an HTTP request, call a search API, or otherwise
  check that the resulting URL resolves to anything real.** A string that merely looks
  like a subreddit/handle/domain is treated as a verified placement.
- The only denylist (`GENERIC_SUBREDDIT_DENY`, lines 27-60) filters out *generic* terms
  (e.g. "travel", "cruise") — it does not and cannot verify a *specific*-sounding
  fabricated name like `r/glacierphotography` is real.
- Sources fed into this function (`dossierTextSources`, lines 299-313): the dossier's
  `nicheTitle`, `allowedSignals`, `specificExamples`, `audienceRoutineInsights`,
  `sourceNotes`, `trendCycleSummary`, `whyThisTrendFeelsDistinctNow` — i.e. the entire
  free-text surface of Step 1's unverified LLM output.
- Notably, the same file has an explicit guardrail comment one function below
  (`deriveSubredditCandidatesFromKeywords`, lines 270-297) that says: *"Do not invent
  subreddit placements from ad keywords. If a community is real, it should appear in
  audienceSignals or the research dossier."* — **the guardrail assumes the dossier's
  content is already verified-real. It is not.** The fabrication risk was moved one
  layer upstream and then trusted.

**Step 3 — the result is dispatched straight to the live Google Ads account.**
`lib/campaigns/distribution/dispatcher.ts:60-101`, `case 'google_display'`:
- Line 71: `synthesizeGoogleTargeting(campaign)` — runs the steps above against the
  live campaign record at dispatch time.
- Line 73-79: `createGoogleDisplayDraft(...)` — applies the resulting
  `GoogleTargetingPackage` (including any fabricated placements) as real ad-group
  targeting criteria via the Google Ads API
  (`lib/campaigns/distribution/platforms/google-ads/campaign.ts`,
  `buildAdGroupCriterionOperations`).
- The campaign/ad is created **PAUSED**, but the *placement criteria themselves* are
  applied live, immediately, to a real ad group in the real account.
- The post-creation verification (`summarizeTargetingVerification`,
  `campaign.ts:398-466`) only checks that Google Ads' own readback matches what was
  requested (count of criteria, campaign status) — it has **no concept of whether a
  placement URL corresponds to a real, existing page.** Google Ads itself does not
  validate that a placement URL exists/resolves before accepting it as a criterion, so
  nothing downstream catches a fabricated one either.

## Why this matters

- **Wasted/misdirected spend risk**: if a campaign is ever unpaused, Display ads could
  be configured to target placements (subreddits, channels, domains) that don't exist —
  silently reducing effective targeting to nothing, or in the case of a generic-looking
  fabricated domain, conceivably resolving to an unrelated real site the LLM "imagined"
  matching a community name.
- **False confidence**: the targeting summary/rationale text (built in
  `targeting.ts:415-445`) reads as a confident, sourced explanation ("Placements sourced
  from: research_dossier.") — an operator reviewing it has no visual signal that the
  placements were never checked against reality.
- **Standing guardrail comment is misleading**: the "do not invent placements from
  keywords" comment in the same file creates a false sense that placement sourcing in
  general is conservative/verified, when the dossier path one function away has the
  identical fabrication risk it was written to avoid.
- **Already shipped**: 3 group campaigns are live today. Whether any of them actually
  carries a fabricated placement depends on (a) whether a research dossier was ever
  generated for that campaign via `/api/groups/campaign/[slug]/research-dossier`, and
  (b) whether a `google_display` post was dispatched for it. Both need to be checked —
  this doc does not assert that they have already executed.

## What deals-system did instead (for contrast / a possible fix pattern)

When building the equivalent placement-sourcing for individual cruise Deals (Step
9/10 Google Ads Synthesis/Distribution), this exact problem was caught before copying
the pattern. The deals-system path instead:
- Never derives placements from LLM-written prose at all.
- Added a real, grounded web-search call (`lib/services/media/google-web-search.ts`,
  organic SerpAPI search — same `serpapi` client `google-images.ts` already used for
  image search, just `engine: 'google'` instead of `'google_images'`) returning real
  search results with real URLs.
- `lib/cb/deals-system/deal-community-search.ts` runs `site:reddit.com` /
  `site:youtube.com` / forum queries and surfaces actual results (title + url + snippet)
  to the operator in the lab UI — never auto-applied.
- A placement only becomes a real targeting criterion when the operator clicks "Add as
  placement" on an actual search result they can see and click themselves
  (`DealGoogleAdsSynthesis.operatorPlacements`).
- If the operator picks nothing, placements stay empty and a clear warning is shown —
  never silently substituted with a guess.

This is the candidate fix shape for group campaigns too: replace
`extractPlacementsFromText`'s regex-mining of dossier prose with either (a) a real
search-and-verify step before a placement is accepted, or (b) the same
operator-picks-from-real-search-results flow used in deals-system.

## Suggested next steps (for your review, not yet started)

1. **Audit the 3 live campaigns**: for each, check whether `researchDossier` is
   populated (`campaign.researchDossier` on the campaign record) and whether a
   `google_display` post has been dispatched (check `metadataNotes` /
   `placements_applied` on the scheduled post record). If `placements_applied > 0` on
   any of them, the live ad group has unverified placement criteria applied right now.
2. **If any are exposed**: decide whether to manually review/remove the placement
   criteria in Google Ads Manager for that ad group (low effort — it's a paused
   draft's targeting, not a published ad).
3. **Fix the root cause**: either retrofit `extractPlacementsFromText` with a
   verification step (e.g. before accepting a regex-matched placement, run it through
   `searchGoogleWeb`/a HEAD request to confirm it resolves), or replace group
   campaigns' placement sourcing with the deals-system's operator-picks-from-real-search
   pattern.
4. **Audit the rest of the dossier's free-text fields for the same fabrication risk**
   beyond placements — `specificExamples`/`allowedSignals` feed copy and media
   generation too (`cruiseTranslation.downstreamImplications`), so the same
   "ungrounded LLM output treated as researched fact" pattern may be wider than just
   Google Ads placements.
