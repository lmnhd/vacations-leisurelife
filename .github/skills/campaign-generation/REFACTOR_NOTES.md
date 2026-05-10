# Skill Refactor Notes

This document records what was done during the SKILL.md restructure (May 2026) so you can redo or extend it.

## Why It Was Done

The original `SKILL.md` grew to 792 lines (~71KB). Loading it in full consumed significant context window on every skill invocation, even when the agent only needed one phase of the pipeline. Additionally, agents were failing repeatedly on four predictable execution environment issues (Playwright hangs, localhost blocking, etc.) that had no written guidance.

## What Was Done

### SKILL.md → 5 sub-files

| New file | Source lines (original SKILL.md) | Content |
|---|---|---|
| `PIPELINE_ISSUES.md` | 26–167 | §1a — recurring pipeline issues and mitigations |
| `AGENT_ENV.md` | 168–289 | §1c — agent execution environment constraints |
| `DIRECTIVES.md` | 290–411 | §1b — campaign directive system |
| `WORKFLOW.md` | 412–792 | §2 + §3 — end-to-end workflow and tooling |
| `SKILL.md` | 1–25 + new content | Lean index: §0, §1, reading guide, hard rules, pipeline overview |

### Agent-Safe Scripts

Three new scripts created in `scripts/agent/`:

| Script | Purpose | Output file |
|---|---|---|
| `campaign-status.ts <slug>` | DynamoDB status for one campaign + brief | `scripts/agent/output/<slug>-status.json` |
| `list-campaigns.ts` | All campaigns with key status fields | `scripts/agent/output/campaigns-list.json` |
| `check-server.ts` | TCP connect to localhost:3000 — RUNNING/NOT_RUNNING | stdout only |

All three: no Playwright, no HTTP, safe for autonomous agent execution.

### run-phase-b.ts result dump

Modified to write `scripts/agent/output/phase-b-result.json` after completion. Agents can `read_file` this instead of polling the dev server for Phase B results.

## How to Redo or Extend

### Adding a new §1a issue

Add a `### Your Section Title` block to `PIPELINE_ISSUES.md` directly. The lean `SKILL.md` just points to it — no changes needed there.

### Adding a new phase to the workflow

Add to `WORKFLOW.md`. Update the "Campaign Pipeline at a Glance" table in `SKILL.md` if the phase list changes.

### Adding a new agent-safe script

1. Create `scripts/agent/<your-script>.ts` following the pattern in `campaign-status.ts`:
   - `loadEnvConfig(process.cwd())` at the top
   - No Playwright imports
   - No `fetch()` to localhost
   - Write JSON to `scripts/agent/output/<name>.json`
   - Print same JSON to stdout
   - Exit code 1 on error
2. Document it in the "Agent-Safe Scripts" section of `SKILL.md`
3. Add it to `AGENT_ENV.md` under "Checking Campaign State Without HTTP"

### Restoring the monolithic SKILL.md

The four sub-files contain all the extracted content verbatim. Concatenate them in order:
```
PIPELINE_ISSUES.md (minus header) → AGENT_ENV.md (minus header) → DIRECTIVES.md (minus header) → WORKFLOW.md (minus header)
```
Paste after line 25 of the current lean `SKILL.md`.
