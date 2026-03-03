# Group Campaign Automation — Progress Log

**Branch**: `feature/shadow-groups`  
**Last Updated**: 2026-03-02  
**Strategy Reference**: [GROUP_CAMPAIGN_STRATEGY.md](./GROUP_CAMPAIGN_STRATEGY.md)

---

## ✅ Phase 1: Discovery Infrastructure — COMPLETE

All initialization infrastructure for the "Shadow Group" campaign system is built and operational.

### What Was Built

#### Data Layer
- **DynamoDB Table**: `lll-shadow-campaigns` — ACTIVE in `us-east-1`
  - Single-Table Design: `PK = CAMPAIGN#<slug>`, `SK = METADATA` or `SK = USER#<email>`
  - Provisioned via: `scripts/create-campaign-dynamodb-tables.ps1`
- **Types**: `lib/campaigns/types.ts` — `Campaign` and `CampaignWaitlistEntry` interfaces
- **Store**: `lib/campaigns/campaign-store.ts` — `saveCampaignBlueprint`, `getCampaignBlueprint`

#### Discovery Pipeline (`app/api/groups/discovery/`)
- **`route.ts`** — `GET /api/groups/discovery`
  - In-flight lock (`isRunning` flag) — returns `409` if already running (prevents OpenClaw scheduler overcosts)
  - Returns `message`, `count`, `skippedCount`, and `campaigns[]` with `fetchUrl` per blueprint
- **`core-logic.ts`** — 3-step pipeline:
  1. **Sonar Deep Research** — Psychographic trend-mining (niche subculture identification)
  2. **Sonar Deep Research** — Aesthetic gap / ship infrastructure cross-reference
  3. **GPT-5-mini `generateObject`** — Produces 5 structured `Campaign` blueprints
  4. **DynamoDB write** — Idempotent: skips slugs that already exist

#### Campaign Lookup Endpoint (`app/api/groups/campaign/[id]/`)
- **`route.ts`** — `GET /api/groups/campaign/:id`
  - Fetches a single campaign from DynamoDB by slug
  - Returns AI-readable flat JSON with all fields and descriptive nulls
  - Returns `404` with clear error if not found

#### Test UI (`app/(tests)/tests/groups/discovery/page.tsx`)
- Triggers the full pipeline via button click
- **Cost guardrail**: `window.confirm` dialog showing `~$1.60–$2.00` cost estimate before firing
- **Button lockout**: Disabled while results are displayed; "Clear & Reset" to re-run
- **Skipped banner**: Shows yellow warning if any slugs were already in DynamoDB
- Fan-out fetches full campaign details from `/api/groups/campaign/[id]` for display

### Safeguards In Place
| Risk | Guard |
|---|---|
| Concurrent scheduler calls (OpenClaw) | `409` in-flight lock in `route.ts` |
| Accidental double-click on test page | Button disabled while results loaded |
| Blind cost exposure | `window.confirm` with cost estimate |
| Silent DynamoDB overwrites | Idempotency check skips existing slugs |

---

## 🔜 Phase 2: Digital Promotion Stack — **NEXT PRIORITY**

*Runs in parallel to landing page build. Goal: drive external traffic into `/campaigns/[slug]` waitlist before threshold is hit.*

### 2A. Top-of-Funnel — Traffic Generation
- [ ] **Google Custom Intent Audiences** — target niche search terms (e.g. "analog pocket restock", "best handheld emulator 2026"), force placement onto specific YouTube channels/blogs (Retro RGB, Digital Foundry)
- [ ] **Meta Lead Form Ads + Webhook** — Facebook Lead Ad auto-fills email on click → AWS Lambda/Zapier webhook writes directly to DynamoDB `lll-shadow-campaigns` as a `USER#` record — bypasses landing page load latency (+40% conversion)

### 2B. Lead Nurture — Moving to Threshold
- [ ] **Klaviyo / Beehiiv Email Sequence** (3-part, auto-triggered on waitlist join):
  - T+0: *"You're on the list. We need X more cabins."*
  - T+3d: *"Vote on the itinerary!"* → `UpdateItem` call to `proposedEvents` in DynamoDB
  - T+7d: *"We just hit Y cabins! Only Z more to go."* (live count from DynamoDB)
- [ ] **Twilio SMS** — fires only on `THRESHOLD_MET` status change with the CB booking link. SMS for action, email for nurture.

### 2C. Privacy-First Attribution
- [ ] **Meta Conversions API (CAPI)** — server-side event ping from the DynamoDB write Lambda → Facebook. Ensures 100% attribution accuracy despite browser privacy blockers. Critical for ad spend optimization.

### 2D. Synthetic Influencer Assets
- [ ] **Midjourney** — 4–5 hyper-specific aesthetic images per campaign (not generic cruise stock art)
- [ ] **ElevenLabs** — 30-second ambient audio pitch for landing page hero (`"Imagine a world where the only metric is the high score and the horizon..."`)
- [ ] **HeyGen** — optional 60-second "Virtual Cruise Director" avatar video per high-priority campaign explaining the Shadow Group concept in niche-native language
- [ ] **Original music** — 8-bit or hybrid background track for ads (copyright-safe, stand-out)

### 2E. Landing Page Engagement Mechanics (feeds nurture loop)
- [ ] **Live "Hype" Counter** — real-time DynamoDB read: *"5 of 8 cabins pledged. 3 more to lock in the group rate!"*
- [ ] **Proposed Events Leaderboard** — surface top-voted `proposedEvents` from waitlist entries to make early registrants feel like co-creators
- [ ] **Interactive "Vibe Quiz"** — lightweight React quiz (e.g. *"Which Caribbean island matches your vibe?"*) populates `proposedEvents` via email capture — higher conversion than a bare waitlist form

### Reference
Detailed strategy in: [GROUP_CAMPAIGN_STRATEGY.md §5](./GROUP_CAMPAIGN_STRATEGY.md) · [CONVERSTATION.md](./CONVERSTATION.md)

---

## 🔜 Phase 3: Campaign Build — NOT STARTED

*Converts a `DRAFT` campaign into an active `GATHERING_INTEREST` landing page.*

- [ ] Dynamic landing page: `app/(campaigns)/campaigns/[slug]/page.tsx`
- [ ] Waitlist form → DynamoDB `USER#<email>` record write
- [ ] Auto-threshold check on every waitlist submission
- [ ] Internal alert (Slack/Pushover/Email) when `minCabinsRequired` met

## 🔜 Phase 3: Group Registration — NOT STARTED

- [ ] Playwright task via `cruise-groups-manager.ts` to submit CB Formstack
- [ ] Populate `cbagenttoolsGroupId` and `cbagenttoolsBookingLink` on campaign record
- [ ] Campaign status → `CONVERTED`

## 🔜 Phase 4: Financial Handoff — NOT STARTED

- [ ] Automated email to all waitlist `USER#` records with CB booking link
- [ ] Mark `notified: true` per user record
- [ ] Conversion tracking: `converted: true` once deposit confirmed

---

## Known Gaps (Deferred)
- **Phase B Pricing**: `vtgSearch` + CB scraper cross-validation not yet wired into discovery — prices are currently LLM estimates (`priceSource: 'AI Estimate'`)
- **Auth on discovery endpoint**: Deferred — local-only system for now
- **Perplexity fetch timeout/retry**: No timeout set on Sonar calls; acceptable for local dev, revisit before any production deploy
