# AI_POLICY.md - Canonical Repo-Wide AI Policy

This file is the single source of truth for AI assistants working in this repository.
Tool-specific instruction files should link here and only add narrow local exceptions.

## 1. Policy Order

If a tool-specific instruction file conflicts with this policy, `AI_POLICY.md` wins.
When updating shared AI behavior, change this file first and then trim the wrappers.

## 2. LLM Gateway Mandate

- All app/runtime LLM calls must go through `@/lib/ai/llm-gateway`.
- Never instantiate provider SDK clients directly outside `lib/ai/llm-gateway/`.
- Use `ModelName` and `modelForTask()` rather than raw provider ids in app code.
- Raw provider ids belong only in the gateway registry and provider adapters.
- When routing changes, update `lib/ai/llm-gateway/models.ts` and the relevant gateway adapter; do not scatter model logic across the app.
- If a helper already exists in the gateway or agent wrappers, use it instead of calling `callLLM` from feature code.

## 3. Model Selection Principles

- Prefer task-based routing over manual model picking.
- Use stronger models for code fixes, code generation, and deep reasoning.
- Use lighter models for extraction, summarization, classification, or other low-complexity work.
- Use large-context models for repo-wide or long-document analysis.
- If a task needs structured output, still resolve the model through the gateway registry first.

## 4. Repository Operating Rules

- Do not start, stop, restart, or background persistent dev servers or watchers unless the user explicitly asks in the current turn.
- If a server restart seems necessary, explain why and ask for permission before doing it.
- Do not leave orphaned server processes running after a task. If you must launch a process, either keep it visibly under active control or shut it down before reporting back.
- Use PowerShell syntax on Windows: `;` for chaining, native cmdlets where possible.
- Keep TypeScript strict; avoid `any`.
- Keep files small and split when the file grows unwieldy.
- Create checkpoints before significant changes when the workflow calls for them.
- Ask before structural changes.
- Keep business logic separate from framework handlers.

## 5. Agent Conduct

- Read the most specific local instruction file first, then this policy.
- Do not preserve stale routing guidance in wrappers; point back here instead.
- If a local document needs a special exception, keep it narrow and explicit.
