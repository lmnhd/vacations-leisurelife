/**
 * LLM GATEWAY - SEMANTIC AGENT WRAPPERS
 * ──────────────────────────────────────
 * Reusable, role-named helper functions for common AI tasks.
 * These are the ONLY functions that should be imported outside this module.
 *
 * Each wrapper:
 *   1. Selects the optimal model for its task (via TASK_MODEL_MAP)
 *   2. Injects an appropriate system prompt
 *   3. Normalises the response into an AgentResult
 *
 * Add new wrappers here instead of calling callLLM directly from app code.
 */

import { callLLM }                       from '../gateway';
import { modelForTask, ModelName }       from '../models';
import type { AgentInput, AgentResult }  from '../types';

// ─── Code Agents ─────────────────────────────────────────────────────────────

/**
 * Reviews code for bugs, security issues, and best-practice violations.
 * Uses CLAUDE_4_OPUS (highest SWE-bench score).
 */
export async function reviewCode(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('code_fix');
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt:
      'You are an expert code reviewer. Identify bugs, security vulnerabilities, ' +
      'and style violations. Return a structured markdown report with severity levels.',
    temperature: 0.2,
  });
  return { output: content, modelUsed };
}

/**
 * Generates production-ready code from a natural-language specification.
 * Uses CLAUDE_4_OPUS.
 */
export async function generateCode(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('code_generation');
  const system = input.context
    ? `You are a senior engineer. Context:\n${input.context}\n\nGenerate clean, typed, production-ready code.`
    : 'You are a senior engineer. Generate clean, typed, production-ready code.';
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt: system,
    temperature:  0.3,
  });
  return { output: content, modelUsed };
}

/**
 * Verifies that generated code or logic is correct.
 * Uses LLAMA_4_MAVERICK (open-source, ultra-fast for sanity-checks).
 */
export async function verifyCode(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('verify');
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt:
      'You are a code verifier. Check whether the provided code or logic is correct. ' +
      'Reply with PASS or FAIL, followed by a one-line reason.',
    temperature: 0.0,
  });
  return { output: content, modelUsed };
}

// ─── Summarisation Agents ─────────────────────────────────────────────────────

/**
 * Summarises a conversation thread or long document chunk.
 * Uses GEMINI_3_FLASH_LITE (cheap, fast, large context).
 */
export async function summarizeThread(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('summarize');
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt:
      'Summarise the following conversation or document into 3–5 concise bullet points. ' +
      'Preserve key decisions, action items, and open questions.',
    temperature: 0.5,
  });
  return { output: content, modelUsed };
}

/**
 * Analyses an entire repository (or large batch of files).
 * Uses GEMINI_3_PRO for its 2M-token context window.
 */
export async function analyzeRepo(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('repo_analysis');
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt:
      'You are a staff engineer performing a codebase audit. ' +
      'Identify architecture patterns, technical debt hotspots, and improvement opportunities.',
    temperature: 0.4,
  });
  return { output: content, modelUsed };
}

// ─── Decision Agents ─────────────────────────────────────────────────────────

/**
 * Makes a fast binary or short-answer decision.
 * Uses GPT_5_INSTANT (lowest latency).
 */
export async function makeDecision(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('decision');
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt:
      'You are a decisive AI. Answer with a clear, unambiguous choice or value. ' +
      'No preamble. No hedging.',
    temperature: 0.1,
  });
  return { output: content, modelUsed };
}

/**
 * Extracts structured data from unstructured text.
 * Uses GPT_5_MEDIUM (reliable instruction-following).
 */
export async function extractData(input: AgentInput): Promise<AgentResult> {
  const model = modelForTask('extraction');
  const system = input.context
    ? `Extract data matching this schema:\n${input.context}\nReturn valid JSON only.`
    : 'Extract all key data from the text and return valid JSON only.';
  const { content, model: modelUsed } = await callLLM(model, input.content, {
    systemPrompt: system,
    temperature:  0.0,
  });
  return { output: content, modelUsed };
}

// ─── Custom Agent Factory ─────────────────────────────────────────────────────

/**
 * Creates a one-off agent with a custom system prompt and model.
 * Use this when none of the named wrappers fit your task.
 *
 * @example
 *   const agent = createAgent(ModelName.GEMINI_3_PRO, 'You are a legal document analyst...');
 *   const result = await agent({ content: documentText });
 */
export function createAgent(model: ModelName, systemPrompt: string, temperature?: number) {
  return async (input: AgentInput): Promise<AgentResult> => {
    const { content, model: modelUsed } = await callLLM(model, input.content, {
      systemPrompt,
      temperature,
    });
    return { output: content, modelUsed };
  };
}
