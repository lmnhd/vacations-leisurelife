# AI ARCHITECT RULES — LLM Gateway v2.6

> **Template note**: This document is a module template. If you are using it inside Leisure Life Interactive, read [AI_POLICY.md](../../AI_POLICY.md) first. The repo policy wins over any example text below.

## Core Law
**ALL LLM calls must pass through `@/lib/ai/llm-gateway`.** No exceptions. No raw SDK clients in app code.

## Rule 1 — No Hardcoded Model Strings
```typescript
// ❌ FORBIDDEN
const res = await openai.chat.completions.create({ model: 'gpt-4o', ... });

// ✅ CORRECT
import { callLLM, ModelName } from '@/lib/ai/llm-gateway';
const { content } = await callLLM(ModelName.CLAUDE_4_OPUS, prompt);
```

## Rule 2 — Task → Model Selection
Use `TASK_MODEL_MAP` or these defaults:

| Task | Model |
|------|-------|
| Bug fix / code review | `CLAUDE_4_OPUS` (SWE-bench: 95) |
| Repo-wide / large doc analysis | `GEMINI_3_PRO` (2M ctx) |
| Complex reasoning / planning | `GPT_5_HIGH` (logic: 93) |
| Agentic workflow orchestration | `CLAUDE_4_SONNET` |
| Summarization / tagging | `GEMINI_3_FLASH_LITE` (cheapest) |
| Binary / fast decisions | `GPT_5_INSTANT` (fastest) |
| Verification / sanity check | `LLAMA_4_MAVERICK` (open-source) |

```typescript
import { modelForTask } from '@/lib/ai/llm-gateway';
const model = modelForTask('code_fix'); // → ModelName.CLAUDE_4_OPUS
```

## Rule 3 — Use Pre-Built Agent Wrappers First
Before writing a `callLLM` call, check if a wrapper already exists:

```typescript
import { reviewCode, summarizeThread, makeDecision, extractData, analyzeRepo } from '@/lib/ai/llm-gateway';
```

If none fits, use `createAgent()` and add the result to `agents/index.ts`.

## Rule 4 — Parameter Integrity
Never pass raw temperature or token values inline. Let the gateway resolve them:
```typescript
// ❌ Don't guess parameters
await callLLM(ModelName.GPT_5_HIGH, prompt, { temperature: 0.99, maxTokens: 99999 });

// ✅ Trust the registry; only override when you have a specific reason
await callLLM(ModelName.GPT_5_HIGH, prompt); // uses ModelConfig defaults
await callLLM(ModelName.GPT_5_HIGH, prompt, { temperature: 0.1 }); // deliberate override
```

## Rule 5 — Monthly Model Check
If it's been > 28 days since models were last verified, run:
```bash
npx tsx scripts/update-model-specs.ts
```
Or when uncertain about a model's ranking, search "current month LLM Leaderboard" and
update `MODEL_METADATA` in `models.ts` manually if a new flagship was released.

## Rule 6 — Adding New Models
1. Add to `ModelName` enum
2. Add to `MODEL_METADATA` with accurate scores
3. Optionally add to `TASK_MODEL_MAP`
4. That's it — no other files need touching

## Module Location
```
lib/ai/llm-gateway/   ← drop into any Next.js project
scripts/update-model-specs.ts
AGENT_INSTRUCTIONS.md ← full wiring guide for new projects
```
