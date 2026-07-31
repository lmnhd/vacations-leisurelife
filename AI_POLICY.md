# AI_POLICY.md - Canonical Repo-Wide AI Policy

This file is the single source of truth for AI assistants working in this repository.
All regex pattern matching and any code that uses regex-based functions for processing or matching are forbidden in this repository; use AI solutions instead.
Regex is also forbidden for fallback purposes. There is no fallback exception here.

**DO NOT USE REGEX IN CODE. THIS IS NOT A SUGGESTION. THIS IS A MANDATORY RULE.**

I cannot stress this enough: I do not like regex patterns used in code for anything ever. Do not use anything that looks like a regex. Any agent found using REGX in code will be sent to agent rehab for eight weeks mandatory.

Reminder: this rule is about how much regular expressions are hated here, and that dislike existed long before AI became a thing.

If you need behavior that would normally use regex, use our simple evaluation models instead. Check the LLM Gateway for the right model and workflow.
Tool-specific instruction files should link here and only add narrow local exceptions.
If a local instruction file conflicts with this policy, **this file wins**.

---

## 1. Policy Order

When updating shared AI behavior, change this file first and then trim the wrappers.
Read the most specific local instruction file first, then this policy.
Do not preserve stale routing guidance in wrappers; point back here instead.

---

## 2. Project Overview

**Leisure Life Interactive** is an AI-powered cruise booking platform built on top of Cruise Brothers Travel Agency (CB). We are licensed CB agents. The platform has two primary product tracks:

### Track A — Odysseus (Individual Cruise Booking)
A conversational AI travel agent that learns user preferences over time and handles the full booking lifecycle: discovery → package presentation → CB booking handoff → post-trip follow-up. Powered by the `OdysseusEngine` Playwright automation (`lib/services/odysseus/OdysseusEngine.ts`).

### Track B — Shadow Groups (Group Campaign Platform)
An AI-orchestrated group cruise campaign system using a **"Shadow Group" model**: generate themed cruise concepts, collect waitlist interest (no money, no inventory commitment), and trigger the full group experience only when a minimum cabin threshold is met. CB holds all inventory at no cost to us. See §6 for the full pipeline.

**Core principle across both tracks:** We never collect payments locally. All money flows guest → CB directly.

---

## 3. Where to Find Documentation

> **Agents must always check `.github/DOCS` first before asking questions about the codebase, processes, workflows, ideology, or methodology.**

### Primary Documentation Hub
`.github/DOCS/` — ALL documentation lives here. Do not assume knowledge; read the relevant doc.

### Key Documents by Topic

| Topic | Document |
|---|---|
| **Project vision & product philosophy** | `.github/MY_VISION.txt` |
| **Shadow Group strategy (master blueprint)** | `.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md` |
| **Shadow Group strategy (current active state)** | `.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY-v2.md` |
| **Campaign media generation processes** | `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/` |
| **Odysseus booking engine** | `.github/DOCS/Implementation/Complete/Odysseus_Booking_Engine_Prototype.md` |
| **Odysseus Playwright automation details** | `.github/DOCS/PROCESSES/odysseus-playwright-automation.md` |
| **Chat system architecture** | `.github/DOCS/Implementation/BLUEPRINTS/CHAT_SYSTEM_BLUEPRINT.md` |
| **Voice/SMS channel** | `.github/DOCS/Implementation/Voice_SMS_CHAT.md` and `CHANNEL_UNIFIED_AGENT_RUNBOOK.md` |
| **Payment flow** | `.github/DOCS/Implementation/PAYMENT_FLOW.md` |
| **Auth** | `.github/DOCS/Implementation/AUTH.md` |
| **UI style guide** | `.github/DOCS/Implementation/OPINIONATED_STYLE_GUIDE.md` |
| **Guest info schema** | `.github/DOCS/Implementation/GUEST_INFO.json` |
| **Campaign API reference** | `.github/DOCS/Implementation/GROUP_STRATEGY/API_REFERENCE.md` |
| **Deterministic fixers / production bible / storyboard** | `.github/DOCS/deterministic-fixers.md` |
| **CB knowledge ingestion** | `.github/DOCS/PROCESSES/cb-knowledge-ingestion.md` |

### Completed Components
Finished, stable implementations are documented in:
`.github/DOCS/Implementation/Complete/`

Always check here before building something — it may already exist.

### Repo Skill Discovery

Canonical repo skill sources live under `.github/skills/`. Codex discovers repo-local skills through `.agents/skills/`.

On a fresh Windows checkout, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-repo-codex-skills.ps1
```

The script creates local junctions from `.agents/skills/<skill-name>` to the canonical `.github/skills/<skill-name>` directories. The generated junction tree is ignored by Git; never maintain duplicate skill copies.

---

## 4. Cruise Brothers Agent Tools (CBAT)

**CBAT URL:** https://www.cbagenttools.com/

CBAT is the Cruise Brothers agent portal. Use it for:
- Browsing pre-blocked group inventory (`/groups/view_groups/`) — hundreds of sailings with ready-made Personal Links and Price Advantages
- Validating group IDs, booking links, and price advantages during campaign setup
- Confirming tour-conductor credit thresholds per cruise line
- Viewing active named campaigns post-conversion (`view_campaigns`)
- Registering custom/external group blocks via Formstack (fallback only — see §6)

**Booking link format:**
```
https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}?siid={AGENT_ID}
```

**Agent credentials:** Stored in `.env.local` as `CB_EMAIL` / `CB_PASSWORD`. Never hardcode.

**Playwright automation:** The `OdysseusEngine` drives CBAT headlessly for automated booking and inventory work. Agents may run CBAT / Playwright inventory checks, scrapes, link validation, non-booking research, and the short-lived Odysseus session-lock activity defined below autonomously when credentials/session state are available. See `.github/DOCS/PROCESSES/odysseus-playwright-automation.md`.

**Temporary Odysseus session lock:** Creating one normal `brn` booking session for careful testing or an active booking flow is allowed. Operator-observed behavior indicates that this may temporarily lock the sailing/booking path for about 15 minutes and automatically releases when the session expires. Reuse one session per active test or booking draft, do not create repeated or parallel locks unnecessarily, and stop before entering payment information or submitting the final reservation/payment action.

**Hard approval boundary:** Ask before an explicit or durable hold, named reservation, payment entry, final booking submit, or any action whose effect appears to extend beyond the normal short-lived `brn` session lock.

**CRITICAL:** Temporary session locks are allowed but must be used sparingly. If the system produces a booking reference, named hold, durable reservation, or unclear inventory effect, stop and ask before continuing.

---

## 5. LLM Gateway Mandate

- All app/runtime LLM calls must go through `@/lib/ai/llm-gateway`.
- Never instantiate provider SDK clients directly outside `lib/ai/llm-gateway/`.
- Use `ModelName` and `modelForTask()` rather than raw provider IDs in app code.
- Raw provider IDs belong only in the gateway registry and provider adapters.
- When routing changes, update `lib/ai/llm-gateway/models.ts` and the relevant gateway adapter; do not scatter model logic across the app.
- If a helper already exists in the gateway or agent wrappers, use it instead of calling `callLLM` from feature code.

### Model Selection Principles

- Prefer task-based routing over manual model picking.
- Use stronger models for code fixes, code generation, and deep reasoning.
- Use lighter models for extraction, summarization, classification, or other low-complexity work.
- Use large-context models for repo-wide or long-document analysis.
- If a task needs structured output, still resolve the model through the gateway registry first.

---

## 6. Shadow Group Campaign System

This is the most actively developed track. Agents working here must understand the full pipeline before making changes.

### Mandatory Pre-Read Order (new campaign task)
1. `.github/skills/campaign-generation/SKILL.md` — entry point and hard rules
2. `.github/skills/campaign-generation/AGENT_ENV.md` — what you can and cannot run
3. `.github/skills/campaign-generation/CAMPAIGN_PROCESS_MEMORY.md` — operator-recorded exceptions
4. `.github/skills/campaign-generation/WORKFLOW.md` — phase-by-phase steps

### Use the Campaign Skill
**When building or modifying Group campaigns, invoke the `campaign-generation` skill:**
`.github/skills/campaign-generation/SKILL.md`

This skill is still a work in progress but contains the authoritative workflow, hard rules, and process memory. Using it keeps agent behavior consistent across sessions.

### Pipeline Summary

| Phase | What happens | Key constraint |
|---|---|---|
| **Phase 1: Discovery** | Perplexity Sonar → GPT structured blueprints → CB inventory match → DynamoDB `DRAFT` | CB deals cache must be fresh; agents may run `scrape-cb-deals.ts` autonomously |
| **Phase 2: Phase B** | CB live scrape + link validation + Odysseus retail link | Playwright — operator runs `run-phase-b.ts`; agent checks result via `scripts/agent/` |
| **Phase 3: Brief** | Aesthetic brief, landing still bible, production bible, secondary research dossier | Dossier must exist before approving brief for media |
| **Phase 4: Media** | Ship images → heroes → scenes → ads → TikTok video | One asset type per call; dossier is a hard gate |
| **Phase 5: Publish** | Landing page, ad distribution, go live | Brief must be approved first |

### Hard Rules (always active)
1. Never call `read_url_content` on localhost.
2. Agents may run Playwright scripts autonomously for inventory, pricing, validation, non-booking research, and one rate-limited short-lived `brn` session lock per active test/draft. Ask before an explicit or durable hold, named reservation, payment entry, final submit, real booking, or unclear inventory effect.
3. Never assume the dev server is running — ask before making `fetch()` calls to localhost.
4. One repair pass per layer — if a warning persists after one fix, escalate to the user.
5. Never modify `lib/campaigns/**` pipeline code to force a fix — report failures and wait for instructions.
6. Max 3 revision attempts per campaign concept before retiring it.
7. Default video deliverable is `tiktok_seed_video` — do not assume the legacy video family unless explicitly requested.

### Data Architecture
- **DynamoDB only** for all modern campaign and user-generated data. Table: `lll-shadow-campaigns`.
- Prisma/PostgreSQL is legacy — do not extend it for new Shadow Group features.
- Single-table design: `PK: CAMPAIGN#<slug>`, `SK: METADATA | USER#<email> | GUEST#<email>`.

### Payment Rule
The platform **must not** collect payments locally. No Stripe pre-authorizations. All money flows guest → CB directly via the CB personal booking link.

---

## 6A. Retail Deal Campaign System

Agents building, researching, reviewing, or publishing retail cruise Deal campaigns must use the workspace Deal skill.

### Mandatory Pre-Read Order

1. `.github/skills/deal-campaign-generation/SKILL.md` - entry point and hard rules
2. `.github/skills/deal-campaign-generation/AGENT_ENV.md` - safe execution and booking boundaries
3. `.github/skills/deal-campaign-generation/DEAL_PROCESS_MEMORY.md` - operator-recorded corrections
4. `.github/skills/deal-campaign-generation/WORKFLOW.md` - promotion-led and inventory-first workflows

### Use the Deal Campaign Skill

Invoke `.github/skills/deal-campaign-generation/SKILL.md` when an agent is asked to:

- find or shortlist real cruise packages for a Deal
- apply CB promotion intelligence to a sailing
- work in the Deal Campaign Workbench or Deals pipeline
- generate Deal angles, targeting, ad copy, funnel assets, or Curated Deals
- review duplicates, readiness, approval gates, or homepage eligibility

The skill keeps agency inventory lookup, promotion applicability, market fit, pipeline handoff, and approval-gated publication aligned across sessions.

---

## 6B. Agentic Campaign Manifest Builder

When the operator supplies a campaign opportunity and wants an agent to assemble the existing pipeline state instead of manually starting from the first UI step, use:

`.github/skills/campaign-manifest-builder/SKILL.md`

Invoke it for requests such as:

- turn a holiday angle or niche idea into a review-ready campaign
- build from an exact cruise sailing, package id, CB group, promotion, or strong CBAT deal
- reconstruct or complete Group or Deal manifests by using existing APIs or store contracts
- continue a campaign that moves intermittently between UI work and agent work
- hand the operator directly to the next meaningful approval or image-selection checkpoint

This skill routes the intake, chooses the nearest valid pipeline insertion point, assembles state through the existing Group or Deal systems, and preserves approval boundaries. It does not replace the lane skills:

- Group execution remains governed by `.github/skills/campaign-generation/SKILL.md`.
- Deal execution remains governed by `.github/skills/deal-campaign-generation/SKILL.md`.

---

## 7. Repository Operating Rules

- Do not start, stop, restart, or background persistent dev servers or watchers unless the user explicitly asks in the current turn.
- If a server restart seems necessary, explain why and ask for permission before doing it.
- Do not leave orphaned server processes running after a task.
- Use PowerShell syntax on Windows: `;` for chaining, native cmdlets where possible.
- Keep TypeScript strict; avoid `any`.
- Keep files small and split when a file grows unwieldy.
- Create checkpoints before significant changes when the workflow calls for them.
- Ask before structural changes.
- Keep business logic separate from framework handlers.

### Tech Stack
- Next.js (App Router) · TypeScript · Tailwind CSS · ShadCN · Aceternity UI
- AWS DynamoDB (direct SDK, no Prisma for new features)
- Vercel (serverless deployment — Hobby plan limit is 12 functions; be mindful)
- Cloudflare R2 (media asset storage)
- Klaviyo (email nurture sequences)
- ElevenLabs / HeyGen / Runway / Midjourney (AI media generation)
- Playwright (OdysseusEngine — operator-run only)

---

## 8. Agent Conduct

- Read the most specific local instruction file first, then this policy.
- Check `.github/DOCS` before asking questions about existing systems.
- Do not preserve stale routing guidance in wrappers; point back here instead.
- If a local document needs a special exception, keep it narrow and explicit.
- Treat user spelling from voice dictation as lower-confidence when it looks inconsistent. The user may be using Wispr Flow, which can mishear or misspell words like `CREWS` when `CRUISE` was intended; take spelling with a grain of salt and infer intent from context.
- Append process deviations, workarounds, or operator exceptions to `.github/skills/campaign-generation/CAMPAIGN_PROCESS_MEMORY.md` — this is the shared memory layer across campaign sessions.
- Do not silently continue past a persistent failure — escalate to the user.
- **Never write mojibake.** Typing em dashes (`—`), ellipses (`…`), or box-drawing divider comments (`──`) as raw multi-byte UTF-8 characters has repeatedly produced garbled byte sequences (e.g. `â€"`, `â€¦`, `â”€`) in both source comments and user-facing copy on live deal pages. If you need an em dash, ellipsis, or divider line, write it as a real Unicode character your tool actually emits correctly — verify by reading the file back, not by assuming the literal in your message round-tripped cleanly. When in doubt, prefer plain ASCII (`-`, `...`, `// ----`) over a Unicode character you can't confirm rendered correctly.
