# LLM Gateway — Agent Implementation Instructions

> **Audience**: Any AI coding agent (Copilot, Cursor, Windsurf, etc.) wiring this module
> into a new or existing Next.js / TypeScript project.
> **Last updated**: March 2026

> **Repo note**: If you are using this module inside Leisure Life Interactive, read [AI_POLICY.md](../../AI_POLICY.md) first. It is the canonical repo-wide policy and wins over local wrapper text.

---

## 1. Copy the Module

Copy the entire `lib/` folder from this template into the project root:

```
lib/
  ai/
    llm-gateway/
      index.ts          ← ONLY file you import from
      types.ts
      models.ts
      gateway.ts
      agents/
        index.ts
      providers/
        openai.ts
        anthropic.ts
        google.ts
        groq.ts
        index.ts
```

Copy `scripts/update-model-specs.ts` into the project's `scripts/` folder.

---

## 2. Install Dependencies

Install only the SDKs for the providers actually used in the project:

```bash
# Always required (default providers)
npm install openai @anthropic-ai/sdk @google/generative-ai groq-sdk

# Optional — only if using Vercel AI SDK streaming in Route Handlers
npm install ai
```

---

## 3. Set Up Environment Variables

Add to `.env.local` (never commit real keys):

```env
# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GROQ_API_KEY=gsk_...

# Gateway Behaviour
LLM_GATEWAY_VERBOSE=false   # set true to log every model dispatch
```

---

## 4. Configure Path Alias

Ensure `tsconfig.json` has the `@/` alias pointing to the project root:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

## 5. Importing Rules — CRITICAL

| ✅ DO | ❌ NEVER DO |
|---|---|
| `import { callLLM, ModelName } from '@/lib/ai/llm-gateway'` | `import OpenAI from 'openai'` directly in app code |
| Use `ModelName` enum for every model reference | `model: 'gpt-4o'` hardcoded strings |
| Use pre-built agent wrappers (`reviewCode`, `summarizeThread`) | Call `callLLM` in UI components |
| Add new roles to `agents/index.ts` | Import from `gateway.ts` or `providers/*` directly |
| Use `TASK_MODEL_MAP` for dynamic task routing | Pick models by gut-feel |

---

## 6. Task → Model Selection Guide

| Task | Use | Why |
|---|---|---|
| Bug fix / code review | `ModelName.CLAUDE_4_OPUS` | Highest SWE-bench score (95) |
| New feature generation | `ModelName.CLAUDE_4_OPUS` | Same — best coder |
| Repo-wide / large doc analysis | `ModelName.GEMINI_3_PRO` | 2M token context |
| Multi-step reasoning / planning | `ModelName.GPT_5_HIGH` | Best logic score (93) |
| Agentic workflows (tool-chaining) | `ModelName.CLAUDE_4_SONNET` | Fastest Anthropic model |
| Summarisation / tagging | `ModelName.GEMINI_3_FLASH_LITE` | Cheap, fast, 1M ctx |
| Binary / short decisions | `ModelName.GPT_5_INSTANT` | Lowest latency |
| Open-source verification | `ModelName.LLAMA_4_MAVERICK` | Free on Groq |
| Dynamic (let the map decide) | `modelForTask('code_fix')` | Future-proof |

---

## 7. Using Pre-Built Agent Wrappers

```typescript
import { reviewCode, summarizeThread, makeDecision } from '@/lib/ai/llm-gateway';

// Review a PR diff
const review = await reviewCode({ content: prDiff });
console.log(review.output);
console.log('Model used:', review.modelUsed);

// Summarise a long thread
const summary = await summarizeThread({ content: threadText });

// Fast decision
const decision = await makeDecision({ content: 'Should we use Redis or Valkey for this?' });
```

---

## 8. Creating a Custom Agent

When no pre-built wrapper fits, use `createAgent()` — do NOT call `callLLM` directly in
app code unless you are inside `agents/index.ts`:

```typescript
import { createAgent, ModelName } from '@/lib/ai/llm-gateway';

export const legalAnalyst = createAgent(
  ModelName.GEMINI_3_PRO,
  'You are a senior contract lawyer. Identify risk clauses and summarise obligations.',
  0.2
);

// Later:
const result = await legalAnalyst({ content: contractText });
```

Add the exported agent to `agents/index.ts` and re-export from `index.ts`.

---

## 9. Using `callLLM` Directly (Gateway Authors Only)

Reserved for the `agents/index.ts` file.  If you find yourself needing it elsewhere,
create an agent wrapper instead.

```typescript
// Inside agents/index.ts ONLY
import { callLLM } from '../gateway';
import { ModelName } from '../models';

const { content, usage } = await callLLM(ModelName.CLAUDE_4_OPUS, prompt, {
  systemPrompt:  'You are a Python expert.',
  temperature:   0.2,
  maxTokens:     4096,          // override if needed
});
```

---

## 10. Streaming (Route Handlers / Server-Sent Events)

```typescript
import { streamLLM, ModelName } from '@/lib/ai/llm-gateway';

// In a Next.js Route Handler (app/api/chat/route.ts)
export async function POST(req: Request) {
  const { prompt } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of streamLLM(ModelName.GPT_5_MEDIUM, prompt)) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

---

## 11. Monthly Model Spec Update

Run the update script on the first of each month (or add it to a cron / CI job):

```bash
# Dry run — see proposed changes without writing
DRY_RUN=true npx tsx scripts/update-model-specs.ts

# Live update
npx tsx scripts/update-model-specs.ts

# Force even if < 28 days since last update
FORCE=true npx tsx scripts/update-model-specs.ts
```

The script will:
1. Fetch LMSYS Arena and Hugging Face leaderboard data
2. Use `GEMINI_3_FLASH_LITE` to parse the results (lowest cost)
3. Diff against current `MODEL_METADATA` scores
4. Patch `models.ts` in place and bump `lastVerified` dates
5. Print a summary table of all changes

After running, commit the updated `models.ts`:
```bash
git add lib/ai/llm-gateway/models.ts
git commit -m "chore: update LLM Gateway model specs $(date +%Y-%m)"
```

---

## 12. Adding a New Model

1. Add a new value to the `ModelName` enum in `models.ts`
2. Add a full `ModelConfig` entry to `MODEL_METADATA`
3. Optionally add it to `TASK_MODEL_MAP` if it should be the default for a task
4. No other files need modification — the gateway routes by provider automatically

---

## 13. TypeScript Path Reminder

After copying `lib/`, verify the import resolves:

```bash
# Should print no errors
npx tsc --noEmit
```

If using Next.js, the `@/` alias is automatic from `tsconfig.json`. For standalone
Node scripts, set `tsconfig-paths` or use `tsx` with `--tsconfig`.

---

*Gateway template maintained at: `c:\Users\cclem\Dropbox\Source\.github\templates\LLM_Module`*
