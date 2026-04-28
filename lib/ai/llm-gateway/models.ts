/**
 * LLM GATEWAY - MODEL REGISTRY  (Updated: March 2026)
 * ─────────────────────────────────────────────────────
 * Single source of truth for every model the app can use.
 *
 * AGENT RULE: NEVER reference a raw model string.
 * Always import ModelName and use the enum value.
 */

import type { ModelConfig } from "./types";

// ─── Enum ─────────────────────────────────────────────────────────────────────

export enum ModelName {
  // TIER 1 · Heavy Reasoning & Architecture
  GPT_5_HIGH = "gpt-5.2-high",
  CLAUDE_4_OPUS = "claude-4.6-opus",
  GEMINI_3_PRO = "gemini-3.1-pro",

  // TIER 2 · Balanced Utility & Tool-Use
  GPT_5_MEDIUM = "gpt-5.2-medium",
  CLAUDE_4_SONNET = "claude-4.6-sonnet",
  GEMINI_3_FLASH = "gemini-3.1-flash",

  // TIER 3 · Micro-Tasks, Speed, Cost
  GPT_5_INSTANT = "gpt-5.3-instant",
  GEMINI_3_FLASH_LITE = "gemini-3-lite",
  LLAMA_4_MAVERICK = "llama-4-maverick",

  // LEGACY · Low-Complexity Website Tasks
  LEGACY_CHAT = "legacy-chat",
  LEGACY_EXTRACTION = "legacy-extraction",
  LEGACY_FALLBACK = "legacy-fallback",
}

// ─── Task → Default Model Mapping ────────────────────────────────────────────

/**
 * Semantic task categories.  Use these when selecting a model instead of
 * picking one manually, so all decisions stay in one auditable place.
 *
 * @example
 *   const model = TASK_MODEL_MAP['code_fix'];
 *   const result = await callLLM(model, prompt);
 */
export const TASK_MODEL_MAP: Record<string, ModelName> = {
  /** Bug fixes, code generation, SWE-bench class problems */
  code_fix: ModelName.CLAUDE_4_OPUS,
  /** Writing new features end-to-end */
  code_generation: ModelName.CLAUDE_4_OPUS,
  /** Repo-wide or large-doc analysis (2M ctx) */
  repo_analysis: ModelName.GEMINI_3_PRO,
  /** Long document synthesis */
  long_context: ModelName.GEMINI_3_PRO,
  /** Planning, multi-step reasoning */
  reasoning: ModelName.GPT_5_HIGH,
  /** Agentic workflow orchestration */
  agentic: ModelName.CLAUDE_4_SONNET,
  /** Thread / conversation summarization */
  summarize: ModelName.GEMINI_3_FLASH_LITE,
  /** Binary or short-answer decisions */
  decision: ModelName.GPT_5_INSTANT,
  /** Cheap verification / sanity checks */
  verify: ModelName.LLAMA_4_MAVERICK,
  /** Data extraction / classification */
  extraction: ModelName.GPT_5_MEDIUM,
  /** Real-time voice / low-latency UI chat */
  ui_chat: ModelName.GEMINI_3_FLASH,
  /** Memory / preference mining extraction */
  memory_extraction: ModelName.GPT_5_INSTANT,
  /** Cruise booking simulation / evaluation */
  simulation: ModelName.CLAUDE_4_SONNET,
  /** Creative campaign briefs */
  creative: ModelName.CLAUDE_4_OPUS,
  /** Legacy website chat endpoint compatibility tier */
  legacy_chat: ModelName.LEGACY_CHAT,
  /** Legacy website extraction / formatting tier */
  legacy_extraction: ModelName.LEGACY_EXTRACTION,
  /** Legacy website binary decision tier */
  legacy_decision: ModelName.LEGACY_FALLBACK,
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const MODEL_METADATA: Record<ModelName, ModelConfig> = {
  // ── TIER 1 ──────────────────────────────────────────────────────────────────

  [ModelName.GPT_5_HIGH]: {
    provider: "openai",
    apiId: "gpt-4o",
    maxTokens: 16_384,
    defaultTemp: 0.7,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 80, logic: 93, speed: 40, context: 85 },
  },

  [ModelName.CLAUDE_4_OPUS]: {
    provider: "anthropic",
    apiId: "claude-opus-4-6",
    maxTokens: 8_192,
    defaultTemp: 0.3,
    contextWindow: 200_000,
    lastVerified: "2026-03-01",
    scores: { coding: 95, logic: 91, speed: 30, context: 98 },
  },

  [ModelName.GEMINI_3_PRO]: {
    provider: "google",
    apiId: "gemini-3.1-pro-latest",
    maxTokens: 32_768,
    defaultTemp: 1.0,
    contextWindow: 2_000_000,
    lastVerified: "2026-03-01",
    scores: { coding: 85, logic: 88, speed: 60, context: 99 },
  },

  // ── TIER 2 ──────────────────────────────────────────────────────────────────

  [ModelName.GPT_5_MEDIUM]: {
    provider: "openai",
    apiId: "gpt-5-medium",
    maxTokens: 8_192,
    defaultTemp: 0.7,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 75, logic: 82, speed: 70, context: 80 },
  },

  [ModelName.CLAUDE_4_SONNET]: {
    provider: "anthropic",
    apiId: "claude-sonnet-4-6",
    maxTokens: 8_192,
    defaultTemp: 0.5,
    contextWindow: 200_000,
    lastVerified: "2026-03-01",
    scores: { coding: 88, logic: 85, speed: 65, context: 95 },
  },

  [ModelName.GEMINI_3_FLASH]: {
    provider: "google",
    apiId: "gemini-3.1-flash-latest",
    maxTokens: 8_192,
    defaultTemp: 1.0,
    contextWindow: 1_000_000,
    lastVerified: "2026-03-01",
    scores: { coding: 70, logic: 75, speed: 90, context: 92 },
  },

  // ── TIER 3 ──────────────────────────────────────────────────────────────────

  [ModelName.GPT_5_INSTANT]: {
    provider: "openai",
    apiId:
      process.env.OPENAI_INSTANT_MODEL?.trim() ||
      process.env.OPENAI_FALLBACK_MODEL?.trim() ||
      "gpt-5.4-instant",
    maxTokens: 4_096,
    defaultTemp: 0.5,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 60, logic: 65, speed: 99, context: 70 },
  },

  [ModelName.GEMINI_3_FLASH_LITE]: {
    provider: "google",
    apiId: "gemini-3-flash-lite",
    maxTokens: 16_384,
    defaultTemp: 0.9,
    contextWindow: 1_000_000,
    lastVerified: "2026-03-01",
    scores: { coding: 55, logic: 60, speed: 95, context: 90 },
  },

  [ModelName.LLAMA_4_MAVERICK]: {
    provider: "groq",
    apiId: "llama-4-maverick-17b-128e-instruct",
    maxTokens: 4_096,
    defaultTemp: 0.1,
    contextWindow: 1_000_000,
    lastVerified: "2026-03-01",
    scores: { coding: 65, logic: 70, speed: 98, context: 80 },
  },

  // ── LEGACY ─────────────────────────────────────────────────────────────────

  [ModelName.LEGACY_CHAT]: {
    provider: "openai",
    apiId:
      process.env.OPENAI_LEGACY_CHAT_MODEL?.trim() ||
      process.env.OPENAI_INSTANT_MODEL?.trim() ||
      "gpt-5-mini",
    maxTokens: 1_024,
    defaultTemp: 0.6,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 50, logic: 58, speed: 96, context: 70 },
  },

  [ModelName.LEGACY_EXTRACTION]: {
    provider: "openai",
    apiId:
      process.env.OPENAI_LEGACY_EXTRACTION_MODEL?.trim() ||
      process.env.OPENAI_INSTANT_MODEL?.trim() ||
      "gpt-5-mini",
    maxTokens: 800,
    defaultTemp: 0,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 45, logic: 60, speed: 97, context: 70 },
  },

  [ModelName.LEGACY_FALLBACK]: {
    provider: "openai",
    apiId:
      process.env.OPENAI_LEGACY_FALLBACK_MODEL?.trim() ||
      process.env.OPENAI_FALLBACK_MODEL?.trim() ||
      "gpt-5-mini",
    maxTokens: 600,
    defaultTemp: 0,
    contextWindow: 128_000,
    lastVerified: "2026-03-01",
    scores: { coding: 40, logic: 55, speed: 98, context: 68 },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the best model for a given task key (falls back to CLAUDE_4_SONNET). */
export function modelForTask(task: string): ModelName {
  return TASK_MODEL_MAP[task] ?? ModelName.CLAUDE_4_SONNET;
}

/** Returns the full config for a model. Throws if unknown. */
export function getModelConfig(model: ModelName): ModelConfig {
  const cfg = MODEL_METADATA[model];
  if (!cfg) throw new Error(`[LLM Gateway] Unknown model: "${model}"`);
  return cfg;
}
