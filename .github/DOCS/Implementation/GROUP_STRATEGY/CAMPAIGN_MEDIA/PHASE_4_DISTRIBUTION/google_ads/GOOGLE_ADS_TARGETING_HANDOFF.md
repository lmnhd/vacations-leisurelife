# Google Ads Targeting Handoff for Claude

**Status:** Ready for implementation  
**Scope:** Full Google Ads targeting for Shadow Group campaigns, with `wellness-and-nature-cruise` as the current reference case  
**Goal:** Move the Google Ads adapter from a creative-first paused draft to a fully specified niche-targeted Google Display setup that can be verified in the UI and in code.

---

## 1. What Exists Today

The current Google Ads live path already creates paused Display drafts and uploads the required responsive display assets.

What is already working:

- Paused campaign creation in Google Ads
- Responsive Display creative upload
- `marketing_images` and `square_marketing_images` asset support
- Unique draft campaign naming per run
- Review URL persistence for the created draft

Relevant files:

- [Google draft builder](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution/platforms/google-ads/campaign.ts)
- [Distribution planner](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution-planner.ts)
- [Campaign model](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/types.ts)
- [Google Ads vision doc](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/google_ads/GOOGLE_ADS_VISION.md)
- [Google Ads strategy doc](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md)

What is still missing:

- No real Google targeting criteria are created yet
- No readable targeting summary is persisted with the distribution record
- No verification pass reads back the created ad group criteria
- The current draft still behaves like a creative shell, not a fully audienced campaign

---

## 2. The Intended Targeting Formula

The repo docs describe Google Ads as a contextual interception layer, not broad cruise advertising.

The intended strategy is:

- Seed from `campaign.targetingKeywords`
- Expand into a niche-specific custom intent audience set
- Add niche placements for YouTube channels, blogs, or other relevant placements
- Avoid generic travel, cruise, or vacation audience buckets
- Keep the campaign in paused draft status until a human reviews it

Primary doc references:

- [GROUP_CAMPAIGN_STRATEGY.md](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md)
- [GOOGLE_ADS_VISION.md](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/google_ads/GOOGLE_ADS_VISION.md)
- [PHASE_4_DISTRIBUTION.md](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/PHASE_4_DISTRIBUTION.md)

The documented expectation is that Google targeting should be grounded in the campaign's own niche signals, not in generic cruise interest targeting.

---

## 3. Implementation Target

Claude should implement a real targeting builder that turns campaign context into Google Ads targeting artifacts.

### Inputs to use

- `campaign.targetingKeywords`
- `campaign.audienceSignals`
- `campaign.researchRationale`
- `campaign.nicheExpressionMode`
- campaign slug, ship target, target destination, and highlight events when available
- any approved secondary research dossier content already available to the pipeline

### Required outputs

- A niche keyword set for Google custom intent / custom audience style targeting
- A placement set for relevant sites / channels
- A persisted targeting summary for operator review
- A verification readback of what was created in Google Ads

### Recommended behavior

1. Generate 10-15 high-specificity niche keywords.
2. Generate 5-10 placements.
3. Keep the targeting derived from campaign-native terms only.
4. Do not add broad cruise, travel, or vacation terms as a convenience fallback.
5. If the campaign has weak or empty niche seed data, fail clearly rather than silently broadening the audience.

---

## 4. Google Ads API Shape to Implement

Use the current Google Ads API path already in the repo, but extend it beyond creative upload.

The implementation should:

- keep the campaign paused
- create the ad group
- attach targeting criteria at the correct level
- persist the resulting IDs
- persist the human review URL
- read back the ad group criteria after create so the UI or logs can show the actual targeting formula

Important API areas to confirm in code:

- campaign-level or ad-group-level targeting criteria
- custom intent or custom audience style criteria
- placement criteria
- responsive display asset requirements

Do not guess the exact resource names from memory alone. Use the official Google Ads API docs and the installed `google-ads-api` typings already present in the repo.

Official docs that matter:

- Google Ads targeting overview
- Criteria targeting docs
- Responsive Display Ad creation docs

---

## 5. Suggested Code Changes

Claude should likely touch these files:

- [lib/campaigns/distribution/platforms/google-ads/campaign.ts](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution/platforms/google-ads/campaign.ts)
- [lib/campaigns/distribution-marketing.ts](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution-marketing.ts)
- [lib/campaigns/distribution-planner.ts](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution-planner.ts)
- possibly a small targeting helper under `lib/campaigns/distribution/platforms/google-ads/`
- tests under `lib/campaigns/__tests__/`

Recommended split:

### A. Add a targeting synthesizer

Create a helper that returns:

- `keywords`
- `placements`
- `summary`
- optionally `negativeKeywords` if the repo's strategy wants exclusions later

### B. Pass targeting into the draft builder

Extend the Google draft function to accept the targeting package and use it during ad group creation.

### C. Persist operator-visible targeting details

Store a summary string or structured notes in the distribution record so the campaign test UI can show:

- seed keywords
- placement list
- why those terms were chosen
- what was excluded

### D. Verify after creation

After the draft is created, read back the Google Ads entities and confirm:

- campaign status is paused
- ad group exists
- targeting criteria match the requested formula
- responsive display assets are present

---

## 6. Acceptance Criteria

This work is done when all of the following are true:

- The Google draft still creates a paused campaign
- The ad group includes explicit niche targeting criteria
- The targeting is derived from campaign context, not generic cruise interests
- The saved distribution record exposes a readable targeting summary
- The UI can show the operator what Google was told to target
- A verification pass can confirm the ad group criteria after creation
- The code remains strict TypeScript and passes the repo's type check

---

## 7. Non-Negotiable Constraints

- Do not activate the campaign automatically
- Do not spend money automatically
- Do not broaden the audience to generic cruise or travel targeting just to make the draft easier to create
- Do not remove the current paused-draft behavior
- Do not modify unrelated campaign pipeline code to force Google targeting into place

---

## 8. Current Reference Case

Use `wellness-and-nature-cruise` as the first end-to-end validation campaign.

Known working context for that campaign:

- Google OAuth reconnect is fixed
- The draft campaign now creates successfully
- The creative shell is valid
- The remaining work is targeting fidelity and verification visibility

---

## 9. Practical Starting Point

If Claude needs a clear first step, do this in order:

1. Build a targeting synthesis helper from `campaign.targetingKeywords` and `campaign.audienceSignals`.
2. Add the targeting criteria to the Google draft builder.
3. Persist a readable targeting summary in the distribution record.
4. Add a test that asserts the targeting package is generated.
5. Add a test that asserts Google draft creation receives the targeting package.
6. If possible, verify the created ad group criteria by readback.

---

## 10. Review Response Already Implemented

The latest review was correct that the earlier live `wellness-and-nature-cruise` dispatch produced `0` placements because `campaign.audienceSignals` was prose, not URL-shaped.

That has now been addressed in code with a four-tier, niche-native placement waterfall in:

- [lib/campaigns/distribution/platforms/google-ads/targeting.ts](/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/distribution/platforms/google-ads/targeting.ts)

Placement source order:

1. `audience_signals`
2. `research_dossier`
3. `niche_text_fields`
4. `keyword_derived`

Behavior details:

- `audience_signals` only uses URL-shaped or handle-shaped data already present in `campaign.audienceSignals`
- `research_dossier` scans normalized research dossier fields plus cruise translation notes
- `niche_text_fields` scans campaign-native rationale and theme fields
- `keyword_derived` only runs when the earlier tiers still produce fewer than `MIN_PLACEMENTS` placements
- Generic cruise / travel / vacation placement broadening is denied

Operator visibility improvements:

- `placementSources` is now exposed on the targeting package
- the summary string now shows placement count plus contributing sources
- the dispatcher and marketing layer pass the targeting summary through to distribution metadata

Validation already added:

- prose-only `audienceSignals` yields placements through fallback without broadening to generic cruise/travel placements
- `audience_signals` is preferred when present
- `researchDossier` contributes placements when `audienceSignals` does not
- the summary string includes placement source attribution

Observed verification result for `wellness-and-nature-cruise`:

- targeting synthesis now produces a non-empty keyword set
- placement generation now produces a non-empty placement set via the keyword-derived fallback when the campaign's prose signals are sparse
- the campaign-landing review panel now surfaces the Google targeting preview so operators can inspect the exact keywords, placements, and sources before sending a live draft

Upstream solution:

- keep discovery and dossier generation focused on rich niche evidence, but do not rely on URL-shaped `audienceSignals` alone
- allow prose-heavy campaigns to be redeemed by structured keyword-derived placements, while still denying generic cruise/travel broadening
- surface the synthesized targeting in the review UI so operators can see whether the signal came from audience data, dossier content, or keyword fallback
