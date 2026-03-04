/**
 * LLM GATEWAY - TYPE DEFINITIONS
 * All shared interfaces and types for the gateway module.
 * Do NOT import from other gateway files here (no circular deps).
 */

// ─── Provider Keys ─────────────────────────────────────────────────────────────

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'groq';

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Benchmark-derived scores (0–100).
 * Updated by `scripts/update-model-specs.ts`.
 */
export interface ModelScores {
  /** SWE-bench / HumanEval composite */
  coding: number;
  /** GPQA / MMLU-Pro composite */
  logic: number;
  /** Tokens-per-second relative score */
  speed: number;
  /** Needle-in-haystack / long-context retrieval */
  context: number;
}

// ─── Model Configuration ──────────────────────────────────────────────────────

export interface ModelConfig {
  provider: ProviderName;
  /** Max output tokens the model supports */
  maxTokens: number;
  /** Sensible default temperature for most tasks */
  defaultTemp: number;
  /** Maximum input context window in tokens */
  contextWindow: number;
  scores: ModelScores;
  /** ISO-8601 date when this entry was last verified */
  lastVerified?: string;
  /** Public API model identifier used in SDK calls */
  apiId?: string;
}

// ─── Call Options ─────────────────────────────────────────────────────────────

export interface LLMCallOptions {
  /** Override the model's default temperature */
  temperature?: number;
  /** System-level instruction prepended to every call */
  systemPrompt?: string;
  /** Max tokens for THIS request (falls back to ModelConfig.maxTokens) */
  maxTokens?: number;
  /** Structured JSON schema for structured output (provider-dependent) */
  responseSchema?: Record<string, unknown>;
  /** Custom abort signal for timeouts / cancellation */
  signal?: AbortSignal;
}

// ─── Unified Response ────────────────────────────────────────────────────────

export interface LLMResponse {
  /** Primary text content returned by the model */
  content: string;
  /** Which model actually produced the response */
  model: string;
  /** Token usage breakdown */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Provider-specific raw response, for debugging */
  raw?: unknown;
}

// ─── Agent Role Wrappers ─────────────────────────────────────────────────────

/** Input contract for all semantic agent helper functions */
export interface AgentInput {
  content: string;
  context?: string;
}

export interface AgentResult {
  output: string;
  modelUsed: string;
}
