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

### 2A. Top-of-Funnel — Traffic Generation (Human-in-the-Loop Approval)

The system generates a **Promotion Brief** per campaign, then explicitly prompts you for approval/input before spending money. Once approved, automation resumes via APIs.

**Step-by-step flow:**

1. **Auto-generated**: System produces a structured Promotion Brief from the campaign blueprint:
   - Google Custom Intent keywords + placement URLs (derived from `targetingKeywords`)
   - Meta Lead Form ad copy (3 variants, niche-native voice via GPT-5-mini)
   - Budget recommendation (tiered: $5 → $15 → $30/day based on traction)
   - Webhook URL for Meta Lead Form → DynamoDB

2. **⏸️ HUMAN CHECKPOINT — Brief Review**:
   System prompts you with exactly what it needs:
   - *"Approve/edit the following 3 ad copy variants"*
   - *"Confirm daily budget tier (default: $5/day)"*
   - *"Provide Google Ads Customer ID and Meta Ad Account ID"* (one-time, stored in `.env`)
   - *"Approve targeting keywords and placements"*
   
   Approval stored on campaign record: `promotionStatus: 'APPROVED'`

3. **▶️ AUTOMATION RESUMES**:
   - Google Ads API → creates Custom Intent Audience + Display campaign
   - Meta Marketing API → creates Lead Ad + attaches webhook endpoint
   - Campaign record updated: `promotionStatus: 'LIVE'`

4. **Budget auto-scaling** (agent-managed, no approval needed):
   - Agent reads waitlist count from DynamoDB every 24h
   - 0–2 signups after 48h → pause spend, flag for review
   - 3+ signups → escalate to Tier 2 ($15/day)
   - Within 2 cabins of threshold → escalate to Tier 3 ($30/day)

### 2B. Lead Nurture — Moving to Threshold
- [ ] **Klaviyo / Beehiiv Email Sequence** (3-part, auto-triggered on waitlist join):
  - T+0: *"You're on the list. We need X more cabins."*
  - T+3d: *"Vote on the itinerary!"* → `UpdateItem` call to `proposedEvents` in DynamoDB
  - T+7d: *"We just hit Y cabins! Only Z more to go."* (live count from DynamoDB)
- [ ] **Twilio SMS** — fires only on `THRESHOLD_MET` status change with the CB booking link

### 2C. Privacy-First Attribution
- [ ] **Meta Conversions API (CAPI)** — server-side event ping from the DynamoDB write Lambda → Facebook. 100% attribution accuracy despite browser privacy blockers

### 2D. Synthetic Influencer Assets
- [ ] **Midjourney** — 4–5 hyper-specific aesthetic images per campaign
- [ ] **ElevenLabs** — 30-second ambient audio pitch for landing page hero
- [ ] **HeyGen** — optional 60-second "Virtual Cruise Director" avatar video
- [ ] **Original music** — niche-native background track for ads (copyright-safe)

### 2E. Landing Page Engagement Mechanics (feeds nurture loop)
- [ ] **Live "Hype" Counter** — real-time DynamoDB read: *"5 of 8 cabins pledged."*
- [ ] **Proposed Events Leaderboard** — top-voted `proposedEvents` from waitlist entries
- [ ] **Interactive "Vibe Quiz"** — lightweight React quiz populates `proposedEvents` via email capture

### Reference
Detailed strategy in: [GROUP_CAMPAIGN_STRATEGY.md §5](./GROUP_CAMPAIGN_STRATEGY.md) · [CONVERSTATION.md](./CONVERSTATION.md)

---

## 🔜 Phase 3: Campaign Build — NOT STARTED

*Converts a `DRAFT` campaign into an active `GATHERING_INTEREST` landing page.*

- [ ] Dynamic landing page: `app/(campaigns)/campaigns/[slug]/page.tsx`
- [ ] Waitlist form → DynamoDB `USER#<email>` record write
- [ ] Auto-threshold check on every waitlist submission
- [ ] Internal alert (Slack/Pushover/Email) when `minCabinsRequired` met

## 🔜 Phase 4: Group Registration — NOT STARTED

- [ ] Playwright task via `cruise-groups-manager.ts` to submit CB Formstack
- [ ] Populate `cbagenttoolsGroupId` and `cbagenttoolsBookingLink` on campaign record
- [ ] Campaign status → `CONVERTED`

## 🔜 Phase 5: Financial Handoff — NOT STARTED

- [ ] Automated email to all waitlist `USER#` records with CB booking link
- [ ] Mark `notified: true` per user record
- [ ] Conversion tracking: `converted: true` once deposit confirmed

---

## 🔜 Phase 6: Campaign Lifecycle Tracking — NOT STARTED

*Structured process for monitoring campaigns over months. Prevents missed deadlines, stale campaigns, and budget waste.*

### 6A. Campaign Health Status Engine
- [ ] **New DynamoDB attributes on campaign record**:
  - `promotionStatus`: `'BRIEF_GENERATED'` → `'PENDING_APPROVAL'` → `'APPROVED'` → `'LIVE'` → `'PAUSED'` → `'EXPIRED'`
  - `promotionStartedAt`: ISO timestamp
  - `lastHealthCheckAt`: ISO timestamp
  - `adSpendTotal`: running total in dollars
  - `deadlines`: structured object (see 6B)

### 6B. Deadline Tracking
- [ ] **Per-campaign deadline object** on the DynamoDB record:
  - `sailingDate`: when the target sailing departs — hard stop for all activity
  - `groupBlockExpiry`: when CB group block expires if not filled (typically sail date minus 60–90 days)
  - `depositDeadline`: last date waitlist users can book via the CB link
  - `promotionCutoff`: *auto-calculated* (`groupBlockExpiry - 14 days`) — stop spending after this
- [ ] **OpenClaw daily cron** checks all `LIVE` campaigns:
  - 🟡 Alert if within 14 days of `groupBlockExpiry` and waitlist < threshold
  - 🔴 Alert if `promotionStatus: 'LIVE'` but 0 signups for 7+ days (dead campaign)
  - ⛔ Auto-pause ads if past `promotionCutoff`

### 6C. Campaign Health Report
- [ ] **`GET /api/groups/health`** endpoint — returns all active campaigns with:
  - Current waitlist count vs. `minCabinsRequired`
  - Days until each deadline
  - Ad spend vs. signups (cost-per-lead)
  - Status flag: `ON_TRACK` | `AT_RISK` | `STALE` | `EXPIRED`
- [ ] OpenClaw consumes this endpoint on schedule, alerts you only on `AT_RISK` or `STALE`

### 6D. Campaign Archival
- [ ] On `CONVERTED` or `EXPIRED`:
  - Pause/delete promotion ads via API
  - Snapshot final metrics on campaign record
  - Status → `ARCHIVED` (data preserved, removed from active monitoring)

---

## Known Gaps (Deferred)
- **Phase B Pricing**: `vtgSearch` + CB scraper cross-validation not yet wired into discovery — prices are currently LLM estimates (`priceSource: 'AI Estimate'`)
- **Auth on discovery endpoint**: Deferred — local-only system for now
- **Perplexity fetch timeout/retry**: No timeout set on Sonar calls; acceptable for local dev, revisit before any production deploy
