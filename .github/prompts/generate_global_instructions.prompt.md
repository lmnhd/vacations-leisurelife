---
description: "Generate global AI instructions — create AI_POLICY.md as the single source of truth and thin wrapper files for all supported agent frameworks (Claude Code, GitHub Copilot, Cursor, Windsurf)."
agent: agent
---

# Task: Globalize Project Instructions Across Agent Frameworks

## Your Goal

The user has provided raw project instructions, context, or an existing instruction file. Your job is to:

1. **Author `AI_POLICY.md`** at the repo root as the single source of truth.
2. **Create or update thin wrapper files** for every supported agent framework so each one loads `AI_POLICY.md` first and adds only narrow local exceptions.
3. **Never duplicate policy content** in a wrapper — wrappers point; they do not repeat.

---

## Input

Raw instructions or context to globalize:

```
${input:rawInstructions:Paste your raw project instructions, rules, or existing instruction file content here}
```

---

## Step 1 — Structure AI_POLICY.md

Analyze the input and produce `AI_POLICY.md` at the repo root using this structure. Omit any section that has no real content to fill — never emit empty headings.

```
# AI_POLICY.md - Canonical Repo-Wide AI Policy

This file is the single source of truth for AI assistants working in this repository.
Tool-specific instruction files should link here and only add narrow local exceptions.
If a local instruction file conflicts with this policy, **this file wins**.

---

## 1. Policy Order
[How agents should read this file relative to local wrappers]

## 2. Project Overview
[Product name, purpose, and any distinct feature tracks or modules]

## 3. Where to Find Documentation
[Primary doc hub path, key documents by topic as a markdown table]

## 4. [External Services / APIs]   ← one section per major service boundary
[Credentials (env var names only, never hardcoded), base URLs, access patterns,
 automation constraints, and any hard "ask before running" rules]

## 5. LLM / AI Gateway Rules      ← include only if the project makes LLM calls
[Gateway module path, model routing mandate, model selection principles]

## 6. [Core Feature System]        ← the most actively developed area
[Pipeline phases table, numbered Hard Rules (always active), data architecture]

## 7. Repository Operating Rules
[Server lifecycle policy, OS/shell conventions, language strictness,
 file-size hygiene, structural change protocol]

## 8. Agent Conduct
[Read order, doc-first policy, failure escalation, exception logging path]
```

**Authoring rules for AI_POLICY.md:**
- Write declarative present-tense rules. Avoid hedging words ("try to", "consider", "might").
- Use markdown tables for multi-item mappings: doc topics → paths, pipeline phases → constraints, tech stack items.
- Label all non-negotiable rules as **Hard Rules (always active)** and number them sequentially.
- Every credential must reference an env var name (e.g. `$OPENAI_API_KEY`). Never hardcode values.
- The "Where to Find Documentation" section must include an explicit note: *"Agents must always check [docs path] first before asking questions about the codebase."*
- Close with an "Agent Conduct" section that names the path where agents should log process deviations and operator exceptions.

---

## Step 2 — Create Framework Wrapper Files

After writing `AI_POLICY.md`, create or overwrite each file below. These are **thin pointers** — no policy content, only a reference and any narrow local additions unique to that framework.

### Claude Code — `CLAUDE.md` (repo root)

```markdown
# CLAUDE.md - Claude Entry

Read [AI_POLICY.md](./AI_POLICY.md) first. It is the canonical repo-wide policy for all AI assistants.

Then read:

- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) for project-specific rules
- [`PDR.md`](./PDR.md) for architecture and design decisions
- [`README.md`](./README.md) for setup and project overview

If a local instruction file conflicts with `AI_POLICY.md`, the policy file wins.
```

*Omit any `Then read:` entry if the referenced file does not exist in the project.*

---

### GitHub Copilot — `.github/copilot-instructions.md`

```markdown
# GitHub Copilot Instructions - {Project Name}

## Project Purpose

**Project Name**: {Project Name}
**Framework**: {Primary framework, e.g. Next.js 15 / FastAPI / Rails}
**Description**: {One sentence describing what the project does}

This file is a project wrapper. Read [AI_POLICY.md](../AI_POLICY.md) first; it is the canonical repo-wide AI policy for all assistants.

---

## Project-Specific Notes

- Read [PDR.md](../PDR.md) for architecture and design decisions.
- Read [README.md](../README.md) for setup and project overview.
- Keep business logic separate from framework handlers.
- Use project-specific docs for workflow details; do not duplicate shared AI policy here.

---

## Local Exceptions

- If a local instruction file conflicts with [AI_POLICY.md](../AI_POLICY.md), the policy file wins.
```

*Replace `{Project Name}` and `{Primary framework}` from the input. Add only exceptions that are genuinely specific to Copilot and not already covered in AI_POLICY.md.*

---

### Cursor — `.cursor/rules/critical.md`

```markdown
---
trigger: always_on
---

Read [AI_POLICY.md](../../AI_POLICY.md) first. It is the canonical repo-wide policy for all AI assistants.

Then read [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) for project-specific rules.

If a local instruction file conflicts with `AI_POLICY.md`, the policy file wins.
```

---

### Windsurf — `.windsurf/rules.md`

*Create this file only if `.windsurf/` already exists in the project or the user explicitly requests it.*

```markdown
---
trigger: always_on
---

Read [AI_POLICY.md](../../AI_POLICY.md) first. It is the canonical repo-wide policy for all AI assistants.

If a local instruction file conflicts with `AI_POLICY.md`, the policy file wins.
```

---

## Step 3 — Validation Checklist

Before presenting output, verify each item:

- [ ] `AI_POLICY.md` contains no placeholder text — every section has real content or was omitted entirely.
- [ ] No wrapper file repeats a rule already stated in `AI_POLICY.md`.
- [ ] Every credential reference uses an env var name; no hardcoded secrets.
- [ ] Relative paths in each wrapper are correct — count the `../` hops from each file's location to the repo root.
- [ ] All Hard Rules are numbered, self-contained, and free of cross-references like "see above".
- [ ] The "Where to Find Documentation" table lists paths that exist or will be created; mark with `*(planned)*` if not yet created.
- [ ] Each framework wrapper's "Local Exceptions" section is empty or contains only genuinely framework-specific rules.

---

## Output Format

Present each file as a fenced code block with its path as the label:

~~~
// AI_POLICY.md
[content]
~~~

~~~
// CLAUDE.md
[content]
~~~

~~~
// .github/copilot-instructions.md
[content]
~~~

~~~
// .cursor/rules/critical.md
[content]
~~~

After the files, provide a short summary (3–5 bullets) covering:
- What was preserved verbatim from the raw input
- What was restructured or moved into a different section
- Any assumptions you made that the user should verify before committing
