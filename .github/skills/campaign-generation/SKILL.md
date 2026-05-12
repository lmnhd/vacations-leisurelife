**Name: Campaign Generation Orchestrator**

**Description:** Orchestrates the end-to-end creation of a Leisure Life Interactive shadow group campaign. Use this skill to guide agents through discovery, inventory matching, aesthetic briefing, and final media generation while enforcing hard quality constraints and allowing user intervention.

## 0. Shared Process Memory

Agents using this skill must treat ad hoc user-driven workflow changes as important process evidence, not just one-off conversation details.

- **Read first:** Before substantial campaign work, review [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) for prior adjustments, recurring friction points, and temporary operating rules.
- **Append after meaningful changes:** If the user asks for an ad hoc process change, exception, workaround, new guardrail, or manual override that changes how the campaign pipeline is being operated, document it in [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) before ending the task.
- **What belongs there:** Workflow deviations, recurring blockers, manual operator steps, routing changes, messaging adjustments, inventory/booking exceptions, review heuristics, and any temporary policy that future agents should know about.
- **Why this exists:** This file is the shared memory layer for the campaign-development process across agents. It is meant to accumulate real-world implementation friction so the system can later be refactored with evidence instead of relying on memory or scattered thread history.
- **How to write entries:** Add a dated note with a short title, the trigger or user request, the change that was made, and the broader lesson or refactor implication.

### Persistence Rule

When a user-requested change affects how a campaign should behave in future revisions, do not leave it as a one-off asset tweak. Prefer the most durable source of truth available in this order:

1. campaign directive or brief patch when the change should survive later regenerations
2. landing still bible / production bible when the change belongs in the visual plan
3. asset-level regeneration only when the change is intentionally local to one asset

If the change is meant to survive `regenerate all`, `regenerate with revision`, or later directive application, update the upstream brief or directive source instead of only editing the regenerated asset. Use asset-only revision notes for narrow fixes that should not redefine the campaign.

## 1. Core Philosophy & Pitfalls to Avoid

Based on V2 Campaign Strategy and previous iterations, agents using this skill MUST adhere to the following:

- **Vacation First:** The group is an icebreaker, not a curriculum. Avoid mandatory classes, tight schedules, or high-pressure social mechanics.
- **Ship/Inventory Grounding:** Campaigns must match real inventory limits. Do not invent impossible ship amenities or assume retail block structures.
- **Finite Iteration:** Do not loop endlessly in discovery. If a concept requires more than 3 revisions to pass the Red Team, retire it.
- **Honest Readiness:** Do not mark a campaign as "Ready" if it still carries required fixes.
- **Deduplication:** Gemini Deep Research MUST exclude already generated campaigns (the backend pipeline handles this by natively injecting the DynamoDB state into the prompt).
- **Agentic Glue:** Treat the campaign builder as a control loop, not a one-shot generator. The agent should notice gaps, make one targeted repair pass, re-check the result, and escalate persistent uncertainty to the user instead of silently pushing forward.
- **Durable Revisions:** When a user asks for a change that should keep applying across future regenerations, treat the brief/directive layer as the source of truth. Do not rely on a single asset regeneration if the same change will be needed again later.
- **Probe Discipline:** Do not run probe previews or probe-render validation as a default step. Probes generate cheap preview images plus Claude vision scoring, so they still consume real model usage. Only run them when the user explicitly asks for direction validation, or when you are actively debugging a prompt-quality problem and need that extra signal.

## 2. Reading Guide

This skill is split across sub-documents. Load only what you need for the current task.

| When you need...                          | Read                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Before running any script or API call** | [AGENT_ENV.md](./AGENT_ENV.md) — execution constraints, hard stop list, safe patterns     |
| **Step-by-step pipeline execution**       | [WORKFLOW.md](./WORKFLOW.md) — all 5 phases from discovery to publish                     |
| **Debugging a pipeline failure**          | [PIPELINE_ISSUES.md](./PIPELINE_ISSUES.md) — recurring issues and mitigations             |
| **Surgical media changes (single asset)** | [DIRECTIVES.md](./DIRECTIVES.md) — directive system for targeted regeneration             |
| **Prior process deviations**              | [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) — operator-recorded exceptions |

**Default reading order for a new campaign task:**

1. [AGENT_ENV.md](./AGENT_ENV.md) — know what you can and cannot run
2. [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) — check for recent exceptions
3. [WORKFLOW.md](./WORKFLOW.md) — find the relevant phase steps

## 3. Hard Rules (non-negotiable, always active)

1. **Never call `read_url_content` on localhost** — blocked permanently. See `AGENT_ENV.md` for alternatives.
2. **Never run Playwright scripts autonomously** — `run-phase-b.ts`, `scrape-cb-deals.ts`, and all `scrape-*.ts` scripts require operator browser sessions. Give the command; ask the user to run it.
3. **Never assume the dev server is running** — `fetch()` to localhost silently times out if the server is down. Always ask first.
4. **One repair pass per layer** — if a warning persists after one auto-repair, stop and ask the user for a decision. Do not silently continue to the next phase.
5. **Never use `read_url_content` with localhost** — same as rule 1, stated again because it has been attempted repeatedly.
6. **Finite iteration** — 3 revision attempts max before retiring a campaign.
7. **NEVER modify pipeline code to force a fix** — If a campaign fails validation (like Anchor Compliance or schema issues), DO NOT edit `lib/campaigns/**` or add new deterministic fixers without explicit permission. Report the failure, explain the diagnostic output, and wait for instructions. You are an orchestrator, not a pipeline developer.
8. **Treat TikTok as one production package by default** — When the user asks to generate campaign media broadly or “generate all media,” the default video deliverable is the single `tiktok_seed_video` promotional package. Do not assume the legacy video family (`hero_explainer_video`, `threshold_video`, `countdown_video`, `broll_clip`) is part of the normal bundle unless the user explicitly asks for those deliverables.

## 4. Campaign Pipeline at a Glance

| Phase                  | What happens                                                   | Key constraint                                                                        |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Phase 1: Discovery** | Gemini Deep Research → GPT-5 → Inventory match gate → DynamoDB | CB deals cache must be fresh; operator runs `scrape-cb-deals.ts`                      |
| **Phase 2: Phase B**   | CB live scrape + link validation + Odysseus retail link        | Playwright — operator runs `run-phase-b.ts`; agent checks result via `scripts/agent/` |
| **Phase 3: Brief**     | Aesthetic brief, landing still bible, production bible         | Verify production bible has non-empty `imagePrompt` fields before proceeding          |
| **Phase 4: Media**     | Ships → heroes → scenes → designed ads → video/audio           | One asset type per call; never re-submit video on timeout — poll manifest instead     |
| **Phase 5: Publish**   | Landing page, ad distribution, go live                         | Brief must be approved; verify manifest before distribution plan                      |

**Full step-by-step workflow:** [WORKFLOW.md](./WORKFLOW.md)

## 5. Agent-Safe Scripts (no Playwright, no HTTP)

The following scripts in `scripts/agent/` are safe to run autonomously. They write results to `scripts/agent/output/` AND print to stdout.

```powershell
# Check if campaign exists + brief status (writes slug-status.json)
$out = npx tsx scripts/agent/campaign-status.ts <slug> 2>&1 ; Write-Host $out

# List all campaigns with key status fields (writes campaigns-list.json)
$out = npx tsx scripts/agent/list-campaigns.ts 2>&1 ; Write-Host $out

# Check if dev server is reachable (exits 0=RUNNING, 1=NOT_RUNNING)
$out = npx tsx scripts/agent/check-server.ts 2>&1 ; Write-Host $out

# Read Phase B result after operator runs it
# File: scripts/agent/output/phase-b-result.json (written by run-phase-b.ts)
```
