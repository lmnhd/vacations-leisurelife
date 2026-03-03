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

## 🔜 Phase 2: Campaign Build — NOT STARTED

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
