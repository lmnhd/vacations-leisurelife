# Validation and Approval

Updated: 2026-07-31

## Review-State Assembly

The direct route-handler orchestration completed without calling localhost.

- Deal ID: `1621785`
- Deal status: `needs_review`
- Operator approval: `needs_review`
- Link health: `valid`
- Brief ID: `brief-1621785-holiday-magic-without-the-holiday-marathon`
- Numeric cabin tiers: inside, oceanview, balcony, and suite present
- Meta geographic restriction: Florida only, strict, residency verification required
- Public visibility: not authorized
- Booking, hold, traveler, and payment actions: not attempted

The exact package was reloaded during assembly. The returned ship, date, pricing, and day-by-day itinerary matched the campaign dossier.

## Promotion Handoff

The official Disney promotion is now stored and attached to the campaign manifest.

- Promotion record: `official-dcl-florida-resident-1621785`
- Source: `official_cruise_line`
- Manifest: `manifest-1621785-holiday-magic-without-the-holiday-marathon`
- Handoff status: `promo_attached`
- Inferred audience market: United States, from the explicit Florida targeting language
- Matching Disney promotion count: 1
- Handoff warnings: none
- Handoff blocking issues: none

The promotion record remains `needs_review` because cabin-level promotional inventory must be confirmed before booking and before making an unqualified availability claim. The official page states no booking deadline, so none was invented.

The campaign has not been sent to Copywriter, Funnel Synthesis, Meta, Google, or publication-review assembly. No approval or publication action was taken.

Funnel image generation is not ready yet. The next checkpoint is promotion-aware copy generation and selection, followed by funnel synthesis and review of its image briefs.

## Automated Validation

- `npm run test:curated-deal-assembly`: 65 passed, 0 failed.
- `npx tsx tests/deal-promo-handoff.ts`: 7 passed, 0 failed.
- `npx tsx tests/deal-meta-distribution.ts`: 10 passed, 0 failed, including strict Florida targeting and nationwide-fallback rejection.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- New campaign documentation and orchestration script: ASCII-only.

## Meta Targeting Review - 2026-08-01

- Strict location remains Florida region key `3843`; nationwide fallback remains blocked.
- Prospecting is consolidated into one paused ad set instead of three overlapping persona ad sets.
- Verified Advantage+ audience suggestions: Disney Cruise Line, Walt Disney World, and Cruise Critic.
- Persona cells remain creative hypotheses and no longer multiply the daily ad-set budget.
- Detailed-interest exclusions are not sent to Meta. Employee and customer suppression require Custom Audiences.
- Fresh reach checks succeeded after the exclusion repair: 373,200-439,100; 2,800,000-3,300,000 after relaxation; and 163,700-192,600.
- Current dispatch objective is traffic optimized to landing-page views. These results must not be described as proven booking conversions.

## Remaining Approval Gates

- Confirm the selected cabin rate displays the Florida Resident Rate.
- Promotion-aware copy generated and selected.
- Funnel copy checked against package and promotion evidence.
- Exact-ship and exact-destination images selected, or text-only media waiver approved.
- Meta style recommendation reviewed before image generation.
- Operator approves the Deal for publication.
