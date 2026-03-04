/**
 * UPDATE MODEL SPECS — Monthly Maintenance Script
 * ──────────────────────────────────────────────────
 * Queries public LLM leaderboards and updates MODEL_METADATA scores in
 * `lib/ai/llm-gateway/models.ts` automatically.
 *
 * Run:
 *   npx ts-node scripts/update-model-specs.ts
 *   # or with tsx:
 *   npx tsx scripts/update-model-specs.ts
 *
 * Options (env vars):
 *   DRY_RUN=true     — print the diff but don't write to disk
 *   FORCE=true       — skip the "last verified < 28 days" guard
 *   VERBOSE=true     — log raw API responses
 *
 * Data sources used (in order of preference):
 *   1. LMSYS Chatbot Arena  — https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard
 *   2. EvalPlus / LiveCodeBench — https://evalplus.github.io/leaderboard.html
 *   3. Hugging Face Open LLM Leaderboard v2
 *
 * The script uses an AI call (cheapest model) to parse the leaderboard HTML
 * and map results back to our ModelName enum values.
 */

import fs   from 'fs';
import path from 'path';

const MODELS_FILE = path.resolve(__dirname, '../lib/ai/llm-gateway/models.ts');
const DRY_RUN     = process.env.DRY_RUN  === 'true';
const FORCE       = process.env.FORCE    === 'true';
const VERBOSE     = process.env.VERBOSE  === 'true';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrapedModel {
  name:    string;   // Model display name from leaderboard
  coding?: number;   // Normalised 0–100
  logic?:  number;
  speed?:  number;
}

interface UpdateResult {
  modelKey:     string;
  field:        string;
  oldValue:     number;
  newValue:     number;
  source:       string;
  confidence:   'high' | 'medium' | 'low';
}

// ─── Leaderboard Fetchers ─────────────────────────────────────────────────────

async function fetchHuggingFaceLeaderboard(): Promise<string> {
  const url = 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard';
  console.log(`  ↳ Fetching: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'llm-gateway-updater/1.0' } });
  if (!res.ok) throw new Error(`HF leaderboard fetch failed: ${res.status}`);
  return res.text();
}

async function fetchLMSYSArena(): Promise<string> {
  // LMSYS returns a JSON API
  const url = 'https://lmarena.ai/api/leaderboard';
  console.log(`  ↳ Fetching: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'llm-gateway-updater/1.0' } });
  if (!res.ok) throw new Error(`LMSYS fetch failed: ${res.status}`);
  return res.text();
}

// ─── AI-Assisted Parser ───────────────────────────────────────────────────────

/**
 * Uses the cheapest model to extract structured scores from raw leaderboard HTML/JSON.
 * This avoids brittle CSS selectors that break every time the leaderboard redesigns.
 */
async function parseWithAI(rawContent: string, source: string): Promise<ScrapedModel[]> {
  // Lazy-import so non-AI environments can still run --dry-run without credentials
  const { callLLM, ModelName } = await import('../lib/ai/llm-gateway/index');

  const prompt = `
You are a data extraction assistant. Below is raw leaderboard data from ${source}.

Extract a JSON array of model entries. For each model include:
- name: exact model identifier string
- coding: 0-100 score for code generation / SWE-bench class benchmarks
- logic: 0-100 score for GPQA / reasoning benchmarks
- speed: 0-100 relative token throughput (estimate if unavailable)

Only include models whose names contain one of: gpt-5, claude-4, gemini-3, llama-4.
Return ONLY the JSON array, no markdown fences.

---RAW DATA START---
${rawContent.slice(0, 12_000)}
---RAW DATA END---
`.trim();

  const { content } = await callLLM(ModelName.GEMINI_3_FLASH_LITE, prompt, { temperature: 0 });

  if (VERBOSE) console.log('[AI parse raw output]', content);

  try {
    return JSON.parse(content) as ScrapedModel[];
  } catch {
    console.warn(`  ⚠ Could not parse AI response as JSON from ${source}`);
    return [];
  }
}

// ─── Matcher & Diff Builder ───────────────────────────────────────────────────

/**
 * Maps a leaderboard model name to a ModelName enum key using fuzzy matching.
 */
function matchModelKey(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('claude') && lower.includes('opus'))   return 'CLAUDE_4_OPUS';
  if (lower.includes('claude') && lower.includes('sonnet')) return 'CLAUDE_4_SONNET';
  if (lower.includes('gpt-5') && lower.includes('high'))    return 'GPT_5_HIGH';
  if (lower.includes('gpt-5') && lower.includes('medium'))  return 'GPT_5_MEDIUM';
  if (lower.includes('gpt-5') && lower.includes('instant')) return 'GPT_5_INSTANT';
  if (lower.includes('gemini') && lower.includes('pro'))    return 'GEMINI_3_PRO';
  if (lower.includes('gemini') && lower.includes('flash') && lower.includes('lite')) return 'GEMINI_3_FLASH_LITE';
  if (lower.includes('gemini') && lower.includes('flash'))  return 'GEMINI_3_FLASH';
  if (lower.includes('llama') && lower.includes('maverick')) return 'LLAMA_4_MAVERICK';
  return null;
}

function buildDiff(scraped: ScrapedModel[], source: string): UpdateResult[] {
  const updates: UpdateResult[] = [];

  for (const entry of scraped) {
    const key = matchModelKey(entry.name);
    if (!key) continue;

    const fields: Array<[keyof ScrapedModel, string]> = [
      ['coding', 'scores.coding'],
      ['logic',  'scores.logic'],
      ['speed',  'scores.speed'],
    ];

    for (const [scoreKey, fieldPath] of fields) {
      const newVal = entry[scoreKey];
      if (newVal == null) continue;

      updates.push({
        modelKey:   key,
        field:      fieldPath,
        oldValue:   -1,          // filled in during patch phase
        newValue:   Math.round(newVal),
        source,
        confidence: 'medium',
      });
    }
  }

  return updates;
}

// ─── File Patcher ─────────────────────────────────────────────────────────────

function patchModelsFile(updates: UpdateResult[]): { patched: string; applied: number } {
  let content = fs.readFileSync(MODELS_FILE, 'utf8');
  let applied = 0;

  for (const u of updates) {
    // Match patterns like: coding: 95, or  logic: 91,
    const scoreType = u.field.split('.')[1]; // 'coding' | 'logic' | 'speed' | 'context'
    // Capture the number after the field name inside the block for this model key
    // Strategy: find the model key block, then replace the score inside it
    const modelBlockRegex = new RegExp(
      `(\\[ModelName\\.${u.modelKey}\\][\\s\\S]*?scores:\\s*\\{[\\s\\S]*?${scoreType}:\\s*)(\\d+)`,
      'g'
    );
    const updated = content.replace(modelBlockRegex, (match, prefix, oldNum) => {
      u.oldValue = parseInt(oldNum, 10);
      if (u.oldValue === u.newValue) return match; // no change
      applied++;
      return `${prefix}${u.newValue}`;
    });
    content = updated;
  }

  // Bump lastVerified date for all modified models
  const today = new Date().toISOString().slice(0, 10);
  content = content.replace(/lastVerified:\s*'[\d-]+'/g, `lastVerified:  '${today}'`);

  return { patched: content, applied };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport(updates: UpdateResult[]) {
  if (!updates.length) {
    console.log('\n  ✅ All scores are current. No updates needed.');
    return;
  }
  console.log(`\n  📊 ${updates.length} score update(s) found:\n`);
  console.log('  MODEL KEY               FIELD             OLD →  NEW   SOURCE');
  console.log('  ─────────────────────── ──────────────── ───── → ─────  ──────────');
  for (const u of updates) {
    const oldStr = u.oldValue >= 0 ? String(u.oldValue).padStart(5) : '  ???';
    const newStr = String(u.newValue).padStart(5);
    console.log(`  ${u.modelKey.padEnd(23)} ${u.field.padEnd(16)} ${oldStr} → ${newStr}   ${u.source}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   LLM Gateway — Model Spec Updater       ║');
  console.log(`║   ${new Date().toISOString().slice(0, 10)}  ${DRY_RUN ? '[DRY RUN]' : '[LIVE]  '}              ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  if (!FORCE) {
    // Check if last update was < 28 days ago
    const raw = fs.readFileSync(MODELS_FILE, 'utf8');
    const match = raw.match(/lastVerified:\s*'([\d-]+)'/);
    if (match) {
      const last = new Date(match[1]);
      const daysSince = (Date.now() - last.getTime()) / 86_400_000;
      if (daysSince < 28) {
        console.log(`  ℹ Models were last verified ${Math.floor(daysSince)} days ago (< 28). Skipping.`);
        console.log(`  Run with FORCE=true to override.\n`);
        return;
      }
    }
  }

  const allUpdates: UpdateResult[] = [];

  // ── Fetch & parse each source ──────────────────────────────────────────────
  const sources: Array<{ name: string; fetch: () => Promise<string> }> = [
    { name: 'LMSYS Arena',       fetch: fetchLMSYSArena },
    { name: 'HF Leaderboard v2', fetch: fetchHuggingFaceLeaderboard },
  ];

  for (const src of sources) {
    try {
      console.log(`\n[1/3] Fetching ${src.name}...`);
      const raw     = await src.fetch();
      console.log(`[2/3] Parsing with AI (${src.name})...`);
      const scraped = await parseWithAI(raw, src.name);
      console.log(`      → Found ${scraped.length} relevant model entries`);
      const diff    = buildDiff(scraped, src.name);
      allUpdates.push(...diff);
    } catch (err) {
      console.warn(`  ⚠ Skipping ${src.name}: ${(err as Error).message}`);
    }
  }

  // Deduplicate — last source wins for each (modelKey, field)
  const dedupedMap = new Map<string, UpdateResult>();
  for (const u of allUpdates) {
    dedupedMap.set(`${u.modelKey}::${u.field}`, u);
  }
  const deduped = Array.from(dedupedMap.values());

  printReport(deduped);

  if (deduped.length === 0 || DRY_RUN) {
    if (DRY_RUN && deduped.length > 0) {
      console.log('\n  [DRY RUN] No changes written to disk.');
    }
    return;
  }

  // ── Patch the file ─────────────────────────────────────────────────────────
  console.log('\n[3/3] Patching models.ts...');
  const { patched, applied } = patchModelsFile(deduped);
  fs.writeFileSync(MODELS_FILE, patched, 'utf8');
  console.log(`  ✅ Applied ${applied} change(s) to ${MODELS_FILE}`);
  console.log('  ✨ Done! Commit the changes: git add lib/ai/llm-gateway/models.ts\n');
}

main().catch((err) => {
  console.error('\n  ❌ Fatal error:', err);
  process.exit(1);
});
