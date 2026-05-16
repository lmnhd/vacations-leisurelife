# AI_POLICY.md - Canonical Repo-Wide AI Policy

This file is the single source of truth for AI assistants working in this repository.
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

**Playwright automation:** The `OdysseusEngine` drives CBAT headlessly for automated booking. All Playwright scripts that interact with CBAT require operator browser session state — never run them autonomously. Give the command and ask the user to run it. See `.github/DOCS/PROCESSES/odysseus-playwright-automation.md`.

**CRITICAL:** Always confirm with the user before running any script that executes a "Hold" or reservation action. Raising flags with Cruise Brothers is a real operational risk.

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
| **Phase 1: Discovery** | Perplexity Sonar → GPT structured blueprints → CB inventory match → DynamoDB `DRAFT` | CB deals cache must be fresh; operator runs `scrape-cb-deals.ts` |
| **Phase 2: Phase B** | CB live scrape + link validation + Odysseus retail link | Playwright — operator runs `run-phase-b.ts`; agent checks result via `scripts/agent/` |
| **Phase 3: Brief** | Aesthetic brief, landing still bible, production bible, secondary research dossier | Dossier must exist before approving brief for media |
| **Phase 4: Media** | Ship images → heroes → scenes → ads → TikTok video | One asset type per call; dossier is a hard gate |
| **Phase 5: Publish** | Landing page, ad distribution, go live | Brief must be approved first |

### Hard Rules (always active)
1. Never call `read_url_content` on localhost.
2. Never run Playwright scripts autonomously — give the command, ask the user to run it.
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
- Append process deviations, workarounds, or operator exceptions to `.github/skills/campaign-generation/CAMPAIGN_PROCESS_MEMORY.md` — this is the shared memory layer across campaign sessions.
- Do not silently continue past a persistent failure — escalate to the user.
