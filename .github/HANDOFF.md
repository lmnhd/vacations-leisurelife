# Campaign Generation Handoff Document

**Date**: April 28, 2026  
**Status**: Active Work - Blocked on 2 critical issues  
**Next Agent**: Use this for continuation

---

## Executive Summary

We've built an autonomous campaign generation pipeline for shadow group cruises with:

- ✅ 5 new campaigns generated via Phase 1 (Discovery)
- ✅ Red Team validation completed on all blueprints
- ❌ Phase 2 (Inventory Matching) blocked: 0/2 campaigns matched to CB inventory
- ❌ Campaign Revision API timing out: prevents moving past RED TEAM WARNINGS

**Current Priority**: Fix revision timeout, then resolve inventory matching failures.

---

## What We've Accomplished

### 1. Fixed Critical Features

| Feature                 | Status      | Location                                                                                                                          |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Book Now button routing | ✅ FIXED    | [components/campaign-landing/CampaignLandingPageClaude.tsx](../components/campaign-landing/CampaignLandingPageClaude.tsx#L47-L50) |
| GPT-5 model mapping     | ✅ FIXED    | [lib/ai/llm-gateway/models.ts](../lib/ai/llm-gateway/models.ts)                                                                   |
| Campaign deduplication  | ✅ VERIFIED | [app/api/groups/discovery/core-logic.ts](../app/api/groups/discovery/core-logic.ts)                                               |
| Discovery UI filtering  | ✅ ADDED    | [app/(tests)/tests/groups/discovery/page.tsx](<../app/(tests)/tests/groups/discovery/page.tsx#L838-L852>)                         |

### 2. Built Campaign Generation Skill

- **File**: [.github/skills/campaign-generation/SKILL.md](./skills/campaign-generation/SKILL.md)
- **Scope**: 5-phase autonomous pipeline with mandatory user checkpoints
- **Phases**:
  1. Discovery & Blueprint Generation
  2. Inventory Matching & Retail Link Generation
  3. Aesthetic Brief & Visual Strategy
  4. Media & Landing Assets
  5. Final QA & Deployment

### 3. Generated 5 New Campaigns

All campaigns completed Phase 1 Discovery and Red Team evaluation:

| Campaign                               | Slug                                      | Status | Red Team Verdict |
| -------------------------------------- | ----------------------------------------- | ------ | ---------------- |
| Cartridge & Sunrise: Retro Deck Nights | `cartridge-and-sunrise-retro-deck-nights` | DRAFT  | WARN (2 fixes)   |
| Sea Sillage: Indie Fragrance Social    | `sea-sillage-indie-fragrance-social`      | DRAFT  | WARN (2 fixes)   |
| Frames & Horizons: Scandinavian Photo  | `aesthetic-scandinavia-2026`              | DRAFT  | WARN (2 fixes)   |
| Sea of Stories: Bookish Mediterranean  | `bookish-mediterranean-2026`              | DRAFT  | WARN (2 fixes)   |
| Night Sky & Sea: Dusk & Dawn Edition   | `night-sky-sea-2026`                      | DRAFT  | BLOCK (7 fixes)  |

**Storage**: All campaigns stored in DynamoDB `lll-shadow-campaigns` table.

---

## Current Blockers

### 🔴 BLOCKER #1: Campaign Revision API Timeout

**Symptom**: Revision endpoint hangs for 120+ seconds, never returns  
**Endpoint**: `POST /api/groups/discovery/revise/bulk`  
**Last Attempted**:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/groups/discovery/revise/bulk" `
  -Body '{"slugs": ["cartridge-and-sunrise-retro-deck-nights", "aesthetic-scandinavia-2026"]}' `
  -ContentType "application/json" -TimeoutSec 300
```

**Result**: ❌ Timeout after 300 seconds

**Impact**:

- Campaigns stuck in WARN state (cannot progress to Phase 2 until revised)
- Cannot implement fixes recommended by Red Team

**Investigation Needed**:

1. Check `/api/groups/discovery/revise` route handler for bottlenecks
2. Profile `reviseDiscoveryBlueprint()` function (likely in [lib/ai/llm-gateway/](../lib/ai/llm-gateway/))
3. Check if LLM call itself is timing out (structured generation with large prompt)
4. Consider: streaming response, smaller prompt chunks, or increased timeout threshold

**Workaround Options**:

- Increase Next.js API timeout config
- Break revision into smaller substeps
- Use client-side retry with exponential backoff
- Implement webhook-based async revision (POST returns immediately, webhook notifies when done)

---

### ✅ RESOLVED: Inventory Matching Now Gated in Discovery Pipeline

**Resolution**: Inventory matching has been moved upstream — it now runs as a hard gate during discovery (Step 3) before any campaign is saved to DynamoDB.

**Changes Made**:
- `core-logic.ts`: Injects CB inventory as HARD CONSTRAINTS into the GPT Step 3 prompt, then runs `matchGroupInventoryToCampaign()` on each generated blueprint before save. Blueprints scoring < 25 are discarded with a log message.
- `campaign-store.ts`: Added `scanMatchedCampaigns()` for Phase B to scan campaigns already confirmed matchable.
- `run-phase-b.ts`: Simplified to **confirmation-only** — re-scrapes live CB inventory to confirm the pre-matched block still exists, then generates the Odysseus retail booking link. Never again used for primary matching.

**Phase B is now confirmation-only**:
- Phase B operates on `CB_MATCHED` campaigns (not unmatched)
- If a match is gone in live inventory, it logs `MATCH_EXPIRED` for operator review (campaign record unchanged)
- Phase B adds/updates `odysseusRetailBookingLink` after confirming

**Current Impact on Existing Campaigns**:
The 5 existing campaigns (`cartridge-and-sunrise-retro-deck-nights`, `aesthetic-scandinavia-2026`, etc.) were generated before the match gate existed — they may still be unmatched in DynamoDB. Run Phase B selectively or delete/re-discover those campaigns.

---

## Current Campaign State

**View Current Campaign Data**:

```powershell
# Test campaign state
npx tsx --env-file=.env.local scripts/test-verdict.ts
```

**Expected Output**: Lists all 5 campaigns with their current `verdict` (PASS/WARN/BLOCK).

---

## Testing URLs (All Require Dev Server Running)

| Task                        | URL                                            |
| --------------------------- | ---------------------------------------------- |
| View all campaigns & filter | `http://localhost:3000/tests/groups/discovery` |
| Run Phase A discovery       | Same URL (button at bottom)                    |
| Run Phase B inventory match | Same URL (button at bottom)                    |
| View campaign landing page  | `http://localhost:3000/campaign/[slug]`        |
| View brief studio           | `http://localhost:3000/tests/brief-studio`     |
| View media generation       | `http://localhost:3000/tests/media-generation` |

---

## Key Files & Their Purpose

### Core Pipeline

| File                                                                                            | Purpose                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [app/api/groups/discovery/core-logic.ts](../app/api/groups/discovery/core-logic.ts)             | Phase 1 discovery orchestration (Perplexity → GPT → DynamoDB) |
| [scripts/run-phase-b.ts](../scripts/run-phase-b.ts)                                             | Phase 2 inventory matching runner                             |
| [app/(tests)/tests/groups/discovery/page.tsx](<../app/(tests)/tests/groups/discovery/page.tsx>) | Discovery UI with filter toggle                               |

### Campaign Models & Validation

| File                                                            | Purpose                      |
| --------------------------------------------------------------- | ---------------------------- |
| [lib/campaigns/discovery.ts](../lib/campaigns/)                 | Campaign types & Zod schemas |
| [lib/campaigns/inventory-matcher.ts](../lib/campaigns/)         | Phase B matching algorithm   |
| [lib/ai/llm-gateway/models.ts](../lib/ai/llm-gateway/models.ts) | LLM model registry & routing |

### Features & Handlers

| File                                                                                                                      | Purpose                                             |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [components/campaign-landing/CampaignLandingPageClaude.tsx](../components/campaign-landing/CampaignLandingPageClaude.tsx) | Public landing page with state-aware button routing |
| [lib/ai/llm-gateway/llm-call.ts](../lib/ai/llm-gateway/)                                                                  | LLM call wrapper with fallback chain                |
| [lib/services/](../lib/services/)                                                                                         | Service layer for Perplexity, OpenAI integrations   |

### Documentation

| File                                                                                 | Purpose                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [.github/skills/campaign-generation/SKILL.md](./skills/campaign-generation/SKILL.md) | Master playbook for autonomous agents          |
| [PDR.md](../PDR.md)                                                                  | Project Design Record (architecture decisions) |
| [README.md](../README.md)                                                            | Project setup & overview                       |
| [.github/copilot-instructions.md](./copilot-instructions.md)                         | Project rules & conventions                    |

---

## Immediate Next Steps (Priority Order)

### Priority 1: Fix Revision Timeout (BLOCKING)

**Why**: Prevents all WARN→PASS transitions  
**Steps**:

1. Locate revision route: Find `POST /api/groups/discovery/revise` handler
2. Profile the LLM call: Is it `callGlobalGenerateObject()` taking too long?
3. Check error logs in [VSCODE_TARGET_SESSION_LOG] for timeout details
4. **Quick Fix**: Try increasing `timeoutSec` on the Invoke-RestMethod call or Next.js API timeout
5. **Medium Fix**: Break revision into async job with webhook callback
6. **Test**: Once fixed, retry:
   ```powershell
   Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/groups/discovery/revise/bulk" `
     -Body '{"slugs": ["cartridge-and-sunrise-retro-deck-nights"]}' -TimeoutSec 600
   ```

### Priority 2: Run Fresh Discovery With Match Gate ✅ (now unblocked)

**Why**: The inventory match gate is now built into the pipeline — new discovery runs will only save campaigns that are provably matchable.

**Steps**:
1. Ensure `cb-deals-cache.json` is fresh: `npx tsx scripts/scrape-cb-deals.ts`
2. Run a fresh discovery (respin or new): `GET /api/groups/discovery` or discovery UI button
3. Campaigns will be auto-filtered by the match gate — only inventory-backed campaigns save to DynamoDB
4. Then run Phase B for confirmation + retail links: `npx tsx scripts/run-phase-b.ts`

**Existing unmatched campaigns** (`cartridge-and-sunrise-retro-deck-nights`, `aesthetic-scandinavia-2026`, etc.) were generated before the gate. Options:
- Leave them (they are in DRAFT/WARN state and won't be processed by Phase B)
- Delete and regenerate via a fresh discovery run with the new inventory-first pipeline

### Priority 3: Once Revision + Inventory Fixed

**Sequence**:

1. Revise all WARN campaigns to PASS (fix Red Team issues)
2. Run Phase B inventory match
3. For first campaign that reaches Phase 2 success, proceed to Phase C (Aesthetic Brief)
4. Test brief-studio: `http://localhost:3000/tests/brief-studio`

### Priority 4: Implement Retail Booking Feature (Non-Blocking)

**Why**: Enables dual booking paths (group + independent retail)  
**Reference**: See WORK2.txt (currently empty, restore or recreate from context)  
**Scope**:

- OdysseusEngine integration to generate checkout bypass URLs
- Store retail links in campaign record during Phase B
- Update landing page UI to show "Book as Independent Traveler" option

---

## Technical Context for Continuation

### Environment

- **OS**: Windows 11, PowerShell
- **Runtime**: Node.js + npm
- **Framework**: Next.js 16.1.6 (Turbopack)
- **Database**: DynamoDB (`lll-shadow-campaigns` table)
- **Dev Server Command**: User runs this manually (NEVER run as agent)
  ```powershell
  npm run dev
  ```

### Key Dependencies

- **Perplexity API**: Real-time web research (calls via `lib/services/perplexity.ts`)
- **OpenAI GPT**: Structured generation (routed via `lib/ai/llm-gateway/llm-call.ts`)
- **Playwright**: CB inventory scraping (via OdysseusEngine)
- **Zod**: Schema validation for all campaign types

### Model Configuration

- Primary: `gpt-4o` (OpenAI, 16k context)
- Fallback: `gpt-5-mini` (when token limits exceeded)
- Gateway: Central LLM routing in [lib/ai/llm-gateway/models.ts](../lib/ai/llm-gateway/models.ts)
  - ✅ Recently fixed: `GPT_5_HIGH` now correctly maps to `gpt-4o` API ID

### Caching & Persistence

- **Perplexity**: Results cached by date (key: `perplexity-research-${date}`)
- **DynamoDB**: Campaign records include full blueprint + Red Team verdict + Phase B matches
- **Cache Clear**: To force fresh Perplexity research, delete cache entries in DynamoDB or update date parameter

---

## Debugging Commands

```powershell
# View current campaign states
npx tsx --env-file=.env.local scripts/test-verdict.ts

# Run Phase B inventory matching
npx tsx scripts/run-phase-b.ts --slug [campaign-slug]

# Check model gateway configuration
npx tsx --env-file=.env.local scripts/test-model-config.ts

# Simulate discovery pipeline (Phase A only)
npx tsx --env-file=.env.local scripts/test-discovery.ts

# Build project (for production testing)
npm run build

# Type check
npx tsc --noEmit
```

---

## Communication Protocol for Next Agent

### Check-In Before Major Changes

- Inventory-first pivot? → Ask before rewriting Phase A
- Revision API refactor? → Confirm approach first
- New campaigns from scratch? → Verify exclusion list updated

### Required Actions Before Committing Code

```powershell
# 1. Create git checkpoint
git add . ; git commit -m "checkpoint: before [change]"

# 2. Type check (no `any` types allowed)
npx tsc --noEmit

# 3. Test locally on discovery page
# Navigate to http://localhost:3000/tests/groups/discovery

# 4. Final checkpoint after testing
git add . ; git commit -m "feature: [description of what was fixed]"
```

### Rules to Follow

- ✅ Create git checkpoints before significant changes
- ✅ Use PowerShell `;` for command chaining (never `&&`)
- ✅ Maintain TypeScript strict mode (no `any` types)
- ✅ Keep files under 500 lines (split if needed)
- ❌ NEVER run `npm run dev` (user starts dev server)
- ❌ NEVER use generic `any` types
- ❌ NEVER commit without testing locally first

---

## Success Criteria

**Phase 2 Success** (First Milestone):

- [ ] Revision API returns successfully (fixes WARN verdict)
- [ ] Inventory matching finds ≥1 campaign with CB match
- [ ] Campaign advances to Phase 3 (Aesthetic Brief generation)

**Phase 3-5 Success** (Second Milestone):

- [ ] Brief generation produces visual strategy
- [ ] Media generation creates landing page assets
- [ ] Campaign deployed with working booking links (both group + retail)

**End Goal** (Campaign Fully Live):

- [ ] Landing page accessible: `[deployment-url]/campaign/[slug]`
- [ ] Book Now button works for group booking (CB link)
- [ ] Alternative "Book Independently" works for retail booking (Odysseus link)
- [ ] Waitlist functional for users not ready to book

---

## Questions for Next Agent Before Starting

1. **Should we pivot to inventory-first discovery?** (Recommended but requires replanning)
2. **What's the acceptable timeout for revision API?** (Currently 120s, consider 300s+)
3. **Priority: Get one campaign to Phase 3, or get multiple to Phase 2?**
4. **Should we launch with dual booking (group + retail) or group-only for now?**

---

## Final Notes

- **Conversation Transcript**: [Stored in session logs](c:\Users\cclem\AppData\Roaming\Code\User\workspaceStorage\f17d76f1a257a900ae67912ba02a7b47\GitHub.copilot-chat\transcripts\05871db8-05e4-4b07-997f-31fd1fdd61a4.jsonl)
- **Last User Command**: "document what we've been working on for handoff"
- **Estimated Hours to Unblock**: 2-4 hours (revision + inventory issues)
- **Estimated Hours to Phase 5 Complete**: 6-8 hours (with fixes)

**Good luck! Reference this document and CLAUDE.md for guidance. Ask for clarification if anything is unclear.**
