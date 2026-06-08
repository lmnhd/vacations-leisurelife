# Social Media Management — Roadmap & Index

This directory holds the plan for the agency's social media management infrastructure
(organic posting + inbound engagement on Facebook and Instagram). Read in this order:

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the long-term vision (autonomous social agent,
   5 organic content strategies, periodic engagement). The "Phase 1 (Implemented)" section
   at the top records what actually shipped and how it differs from the original vision.
2. **[PHASE_1_LAUNCH_POSTING.md](./PHASE_1_LAUNCH_POSTING.md)** — ✅ **implemented**. Organic
   launch announcements (IG + Facebook Page) that ride the existing ad-distribution dispatch.
3. **[PHASE_2_ENGAGEMENT.md](./PHASE_2_ENGAGEMENT.md)** — ⏳ **planned**. Inbound comment/DM
   handling through the chat pipeline, plus the remaining organic content strategies
   (deal-of-week, polls, FOMO, port carousels) via a Content Drip Engine.

---

## Guiding principle (why the implementation diverged from the doc)

The original ARCHITECTURE.md assumed a **separate `npm run social:sync` runner** that would
own scheduling and dispatch independently of the campaign pipeline. Exploration of the codebase
showed this was the wrong seam:

- The operator's "ad push" **is** the distribution dispatch route
  `app/api/groups/campaign/[slug]/media/distribute/route.ts`. It already builds a
  `DistributionSchedule` and loops every `ScheduledPost` through `dispatchMarketingPost()`.
- Instagram organic publishing already worked end-to-end (`dispatchInstagramGraphLive`).

So **organic posts are modeled as `ScheduledPost`s on the same schedule**, and posting is
triggered by the same dispatch the operator already runs. This is the design rule for all
phases: **reuse the distribution pipeline; do not build a parallel scheduler** unless a phase
genuinely needs autonomous, campaign-independent cadence (only the Content Drip Engine in
Phase 2 does, and even it should emit into the same dispatch primitives where possible).

---

## Phase status at a glance

| Phase | Scope | Status | Key new surface |
|---|---|---|---|
| **1 — Launch posting** | Organic IG + FB Page launch announcement, draft-for-approval, fired with the ad push | ✅ Implemented | `facebook_page` platform; `publishFacebookPagePost()`; `launch_announcement` schedule stage |
| **2a — Inbound engagement** | Fetch + reply to comments/DMs via chat pipeline, batch, no webhooks | ⏳ Planned | `instagram_dm` / `instagram_comment` channels; Graph polling; `social:sync` runner |
| **2b — Content Drip Engine** | Deal-of-week, ship-vs-ship polls, FOMO countdown, port carousels | ⏳ Planned | Drip generator emitting `ScheduledPost`s; weekly cadence |

---

## Hard constraints carried across all phases

These come from `AI_POLICY.md` and the repo operating rules — every phase must respect them:

- **No local payments.** All money flows guest → CB. Social CTAs drive to the waitlist / DMs / CB link only — never "book"/"buy"/"reserve" (the `BANNED_CTA_SUBSTRINGS` sanitiser in `distribution-marketing.ts` already enforces this for ad copy; organic captions must follow the same rule).
- **Vercel Hobby = 12 serverless functions.** Prefer operator-run scripts / existing routes over new API routes. A single cron route is acceptable if a phase truly needs autonomous cadence.
- **DynamoDB only** for new state (table `lll-shadow-campaigns`, single-table design). No Prisma for new features.
- **LLM Gateway mandate.** Any caption/reply generation goes through `@/lib/ai/llm-gateway` via `modelForTask()` — never a raw provider SDK.
- **Draft-for-approval default.** New outward-facing posting defaults to unpublished/paused for operator review, matching the paused-ad pattern.
