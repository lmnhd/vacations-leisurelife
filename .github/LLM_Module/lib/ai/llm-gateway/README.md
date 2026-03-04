# LLM Gateway

> Centralised model orchestrator for Next.js / TypeScript projects.  
> Drop into any project at `lib/ai/llm-gateway/`.

---

## Quick Start

```typescript
import { callLLM, ModelName, reviewCode } from '@/lib/ai/llm-gateway';

// Direct call
const { content } = await callLLM(ModelName.CLAUDE_4_OPUS, 'Fix this bug: ...');

// Semantic agent wrapper
const { output } = await reviewCode({ content: myCodeDiff });
```

---

## Folder Structure

```
lib/ai/llm-gateway/
├── index.ts          ← Public API (import from here only)
├── types.ts          ← Shared TypeScript interfaces
├── models.ts         ← ModelName enum, MODEL_METADATA, TASK_MODEL_MAP
├── gateway.ts        ← callLLM() + streamLLM() orchestrators
├── agents/
│   └── index.ts      ← reviewCode, summarizeThread, makeDecision, …
└── providers/
    ├── index.ts
    ├── openai.ts
    ├── anthropic.ts
    ├── google.ts
    └── groq.ts

scripts/
└── update-model-specs.ts   ← Monthly leaderboard sync
```

---

## Model Tiers (March 2026)

| Tier | Model | Best For | Coding | Logic |
|------|-------|----------|--------|-------|
| 1 | `CLAUDE_4_OPUS` | Code fixes, SWE tasks | 95 | 91 |
| 1 | `GPT_5_HIGH` | Complex reasoning | 80 | 93 |
| 1 | `GEMINI_3_PRO` | 2M-token analysis | 85 | 88 |
| 2 | `CLAUDE_4_SONNET` | Agentic workflows | 88 | 85 |
| 2 | `GPT_5_MEDIUM` | Balanced general use | 75 | 82 |
| 2 | `GEMINI_3_FLASH` | Fast + large context | 70 | 75 |
| 3 | `GPT_5_INSTANT` | Low-latency decisions | 60 | 65 |
| 3 | `GEMINI_3_FLASH_LITE` | Cheap summarisation | 55 | 60 |
| 3 | `LLAMA_4_MAVERICK` | Open-source verify | 65 | 70 |

---

## Available Agent Wrappers

| Function | Model | Use Case |
|----------|-------|----------|
| `reviewCode` | CLAUDE_4_OPUS | Bug/security code review |
| `generateCode` | CLAUDE_4_OPUS | Code generation from spec |
| `verifyCode` | LLAMA_4_MAVERICK | Fast PASS/FAIL verification |
| `summarizeThread` | GEMINI_3_FLASH_LITE | Conversation/doc summary |
| `analyzeRepo` | GEMINI_3_PRO | Large codebase analysis |
| `makeDecision` | GPT_5_INSTANT | Binary or short decisions |
| `extractData` | GPT_5_MEDIUM | JSON extraction |
| `createAgent(model, system)` | any | Custom agent factory |

---

## Environment Variables

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
LLM_GATEWAY_VERBOSE=false
```

---

## Update Model Specs

```bash
# Monthly sync with public leaderboards
npx tsx scripts/update-model-specs.ts

# Dry run
DRY_RUN=true npx tsx scripts/update-model-specs.ts
```

---

See [AGENT_INSTRUCTIONS.md](../../AGENT_INSTRUCTIONS.md) for full wiring guide.
