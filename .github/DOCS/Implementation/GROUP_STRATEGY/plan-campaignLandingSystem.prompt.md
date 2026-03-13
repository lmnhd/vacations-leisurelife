## Plan: Campaign Landing System

Build the campaign landing page as a state-aware public product surface, not a one-off marketing page. The system should render from campaign metadata, approved aesthetic identity, and generated media while supporting the two required acquisition paths from the strategy: group waitlist and immediate booking intent. The visual direction should use campaign identity for media, accent color, and wording, but keep layout and interaction structure strict, calm, and Uncodixfy-compliant.

**Steps**
1. Define a normalized landing view model that merges campaign metadata, pricing state, threshold state, approved aesthetic fields, approved media fields, CTA labels, and state-specific messaging.
2. Add a landing aggregate API that returns that normalized payload so the public page, previews, and future admin tools all consume the same contract.
3. Lock the scenario matrix for `DRAFT`, `GATHERING_INTEREST`, `THRESHOLD_MET`, `CONVERTED`, and `EXPIRED`, including what sections appear, what CTA copy changes, and how trust/booking language shifts.
4. Build the public landing route with a stable section order: hero, trip explanation, progress, experience preview, booking-path choice, pricing and fulfillment clarity, FAQ/trust, footer.
5. Split the page into presentational components and keep campaign-state branching centralized in the view model instead of scattered across JSX.
6. Apply campaign identity through approved hero media, hero slogan, sub-slogan, and restrained accent usage while enforcing Uncodixfy rules: no glass panels, no decorative gradients, no eyebrow labels, no fake dashboard metrics, no oversized radii.
7. Add the waitlist submission endpoint with a multi-caller contract that persists the booking-mode split and returns next-step metadata rather than a bare success boolean.
8. Add threshold/progress and proposed-event read models so the page can show honest live movement and not inferred placeholders.
9. Wire the dual-CTA flow so both intents use the same form contract, with `GROUP_WAIT` and `BOOK_NOW` as a visible product choice.
10. Add post-submit and post-threshold variants so threshold-met, converted, and expired campaigns each present the correct next action.
11. Add preview-safe rendering for unfinished campaigns so `DRAFT` pages can be reviewed without public exposure.
12. Update project docs and add a preview/test harness for content and state verification.

**Relevant files**
- [lib/campaigns/types.ts](lib/campaigns/types.ts)
- [lib/campaigns/schema.ts](lib/campaigns/schema.ts)
- [app/api/groups/campaign/[slug]/route.ts](app/api/groups/campaign/%5Bslug%5D/route.ts)
- [app/globals.css](app/globals.css)
- [lib/fonts.tsx](lib/fonts.tsx)
- [.github/skills/Uncodixify/Uncodixfy.md](.github/skills/Uncodixify/Uncodixfy.md)
- [.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md](.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md)
- [.github/DOCS/Implementation/GROUP_STRATEGY/PROGRESS.md](.github/DOCS/Implementation/GROUP_STRATEGY/PROGRESS.md)

**Verification**
1. Test the landing payload against campaigns with missing media, approved media only, approved aesthetic plus media, threshold-met state, and expired state.
2. Verify both CTA flows persist the correct booking mode and return the correct next-step behavior.
3. Confirm pricing language changes correctly for `CB_MATCHED`, `AI_ESTIMATE`, and missing/unmatched pricing.
4. Check desktop and mobile layouts for readable forms, equal CTA prominence, and clean fallbacks without Uncodixfy-banned styling.
5. Review the rendered page against the strategy to ensure it clearly explains no local payment, threshold behavior, manifest timing, and expiry fallback.

**Decisions**
- The landing page layout remains stable across campaigns; campaign identity changes content, media, and accent treatment, not the page architecture.
- The booking-mode split is a first-class product feature and must stay explicit in both UI and API.
- Trust and workflow clarity are part of the core design, not secondary copy.
- Uncodixfy is a hard constraint for this system, not a loose inspiration.

The plan is saved to session memory as `plan.md`. If you want the next planning pass, I can now do one of these:

1. Draft the exact landing API/view-model contract.
2. Draft the section-by-section component tree for the public page.
3. Refine the state matrix for `GATHERING_INTEREST`, `THRESHOLD_MET`, and `EXPIRED` before implementation.

## Implementation Progress

- Added shared landing data loading and normalized landing view-model mapping in `lib/campaigns/landing/view-model.ts`.
- Added aggregate landing API route at `app/api/groups/campaign/[slug]/landing/route.ts`.
- Added waitlist persistence helpers in `lib/campaigns/waitlist-store.ts`.
- Added waitlist submission endpoint at `app/api/groups/campaign/[slug]/waitlist/route.ts` with next-step metadata responses.
- Added the first public landing route at `app/(landing)/groups/[slug]/page.tsx`.
- Added landing UI components in `components/campaign-landing/landing-page.tsx` and `components/campaign-landing/waitlist-form.tsx`.
- Added a preview-safe review route at `app/(tests)/tests/campaign-landing/[slug]/page.tsx` so draft campaigns with paid media can be inspected without exposing them as public pages.
- Normalized aesthetic palette color tokens in the landing view-model so labels embedded in stored palette values do not break inline CSS rendering.
- Added `scripts/use-local-next-cache.ps1` and `npm run next:prepare-local-cache` to move `.next` behind a LocalAppData junction, reducing Windows Dropbox/Turbopack `EPERM` rename failures that were blocking preview/test routes.
- Current implementation status: read-model + public page + waitlist submission are in place; manifest collection flow, post-threshold conversion handling, and preview/test harnesses still need follow-up implementation.
