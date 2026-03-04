/**
 * LLM GATEWAY - PUBLIC API
 * ─────────────────────────
 * This is the ONLY file you should import from in app code:
 *
 *   import { callLLM, ModelName, reviewCode, summarizeThread } from '@/lib/ai/llm-gateway';
 *
 * Do NOT import from sub-modules (gateway.ts, models.ts, providers/*, agents/*)
 * directly — the internal structure may change without notice.
 */

// Core call function + streaming
export { callLLM, streamLLM }    from './gateway';

// Model enum, task map, config helpers
export { ModelName, TASK_MODEL_MAP, modelForTask, getModelConfig, MODEL_METADATA } from './models';

// All shared types (for TypeScript consumers)
export type {
  ModelConfig,
  ModelScores,
  LLMCallOptions,
  LLMResponse,
  AgentInput,
  AgentResult,
  ProviderName,
} from './types';

// Semantic agent wrappers
export {
  reviewCode,
  generateCode,
  verifyCode,
  summarizeThread,
  analyzeRepo,
  makeDecision,
  extractData,
  createAgent,
} from './agents';
