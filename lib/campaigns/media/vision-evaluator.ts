import { getModelConfig, ModelName, callLLM } from '@/lib/ai/llm-gateway';
import { ShipReferenceCandidate } from '../schema';

// ── Controlled vocabulary (Phase 4: IMAGE_REFERENCE_USING_VISION.md) ─────────

const VISION_SUITABILITY_TAG_SET = new Set([
    'ship-identity', 'ocean-forward', 'travel-first', 'headline-safe', 'wide',
    'clean', 'minimal', 'quiet', 'cinematic', 'contextual', 'guest-accessible',
    'public-space', 'interior', 'exterior', 'promenade', 'atrium', 'dining', 'stateroom',
]);

const VISION_ANTI_TAG_SET = new Set([
    'wrong-category', 'wrong-ship', 'generic-cruise', 'cgi-or-render', 'blurry',
    'text-overlay', 'busy', 'crowded', 'interior-heavy', 'hotel-like',
    'non-public-space', 'workshop-like', 'literal-activity',
]);

const VALID_SHIP_MATCH_VALUES = new Set(['exact_ship', 'same_class', 'generic_cruise', 'wrong_ship']);
const VALID_CATEGORY_FIT_VALUES = new Set(['strong', 'weak', 'wrong_category']);

// ── Constants ─────────────────────────────────────────────────────────────────

const VISION_MODEL = ModelName.CLAUDE_4_SONNET;
const VISION_MIN_AI_SCORE = 30;
const FETCH_TIMEOUT_MS = 10_000;

// ── Prompt construction ───────────────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are a cruise ship photography quality evaluator. Assess whether an image is appropriate for a specific ship reference category in marketing materials.
Respond ONLY with a valid JSON object matching the exact schema requested. No prose, no markdown, no explanation outside the JSON.`;

function getHostFromUrl(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return 'invalid-url';
    }
}

function extractAssistantTextContent(content: unknown): string {
    if (content === null || content === undefined) {
        return '';
    }
    if (typeof content === 'string') {
        return content.trim();
    }

    if (!Array.isArray(content)) {
        return typeof content === 'object' ? JSON.stringify(content) : String(content);
    }

    const textParts: string[] = [];
    for (const part of content) {
        if (!part || typeof part !== 'object') {
            continue;
        }

        const typedPart = part as Record<string, unknown>;
        if (typedPart['type'] === 'text' && typeof typedPart['text'] === 'string') {
            textParts.push(typedPart['text']);
            continue;
        }

        if (typedPart['type'] === 'refusal' && typeof typedPart['refusal'] === 'string') {
            textParts.push(typedPart['refusal']);
        }
    }

    return textParts.join('\n').trim();
}

function tryExtractJsonObject(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (!trimmed) {
        throw new Error('Empty model response content');
    }

    // Try stripping markdown fences first
    let cleanedText = trimmed;
    if (cleanedText.startsWith('```json')) cleanedText = cleanedText.slice(7);
    else if (cleanedText.startsWith('```')) cleanedText = cleanedText.slice(3);
    if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);
    cleanedText = cleanedText.trim();

    try {
        return JSON.parse(cleanedText) as Record<string, unknown>;
    } catch {
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const candidate = cleanedText.slice(firstBrace, lastBrace + 1);
            return JSON.parse(candidate) as Record<string, unknown>;
        }
        throw new Error(`Model did not return parseable JSON. Raw preview: ${trimmed.slice(0, 280)}`);
    }
}

function buildEvaluationPrompt(shipName: string, category: string): string {
    const isOffboard = category === 'offboard_excursion';
    return JSON.stringify({
        task: 'evaluate_ship_reference_image',
        ship_name: isOffboard ? 'N/A' : shipName,
        expected_category: category,
        field_instructions: {
            aiScore: 'Integer 0-100. 85+ excellent match. 50-84 usable. Below 50 discard.',
            aiReasoning: 'One sentence explaining why this image does or does not fit.',
            shipMatch: isOffboard 
                ? "Always output 'generic_cruise' since this is an offboard destination photo." 
                : 'One of: exact_ship | same_class | generic_cruise | wrong_ship',
            categoryFit: 'One of: strong | weak | wrong_category',
            disqualifiers: 'Array of applicable strings from: wrong-category, wrong-ship, generic-cruise, cgi-or-render, blurry, text-overlay, busy, crowded, interior-heavy, hotel-like, non-public-space, workshop-like, literal-activity',
            detectedTags: 'Array of applicable strings from: ship-identity, ocean-forward, travel-first, headline-safe, wide, clean, minimal, quiet, cinematic, contextual, guest-accessible, public-space, interior, exterior, promenade, atrium, dining, stateroom, destination, excursion, beach, city',
            antiTags: 'Array of applicable strings from the disqualifier vocabulary above',
        },
    });
}

// ── Image fetch ───────────────────────────────────────────────────────────────

async function fetchImageAsBase64(
    url: string,
): Promise<{ base64: string; mimeType: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(url, { signal: controller.signal });
    } catch (err) {
        clearTimeout(timeout);
        throw new Error(`[VisionEvaluator] Network error fetching image: ${url} — ${String(err)}`);
    }
    clearTimeout(timeout);

    if (!response.ok) {
        throw new Error(`[VisionEvaluator] Image fetch returned ${response.status}: ${url}`);
    }

    const rawMime = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    if (!rawMime.startsWith('image/')) {
        throw new Error(`[VisionEvaluator] Non-image content-type "${rawMime}" for: ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType: rawMime };
}

// ── Response parsing ──────────────────────────────────────────────────────────

function parseVisionApiResponse(raw: Record<string, unknown>): {
    aiScore: number;
    aiReasoning: string;
    shipMatch: 'exact_ship' | 'same_class' | 'generic_cruise' | 'wrong_ship';
    categoryFit: 'strong' | 'weak' | 'wrong_category';
    detectedTags: string[];
    antiTags: string[];
} {
    const aiScore = typeof raw['aiScore'] === 'number'
        ? Math.min(100, Math.max(0, Math.round(raw['aiScore'])))
        : 50;

    const aiReasoning = typeof raw['aiReasoning'] === 'string' ? raw['aiReasoning'] : '';

    const rawShipMatch = String(raw['shipMatch'] ?? '');
    const shipMatch = VALID_SHIP_MATCH_VALUES.has(rawShipMatch)
        ? (rawShipMatch as 'exact_ship' | 'same_class' | 'generic_cruise' | 'wrong_ship')
        : 'generic_cruise';

    const rawCategoryFit = String(raw['categoryFit'] ?? '');
    const categoryFit = VALID_CATEGORY_FIT_VALUES.has(rawCategoryFit)
        ? (rawCategoryFit as 'strong' | 'weak' | 'wrong_category')
        : 'weak';

    const detectedTags = Array.isArray(raw['detectedTags'])
        ? (raw['detectedTags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_SUITABILITY_TAG_SET.has(t)
          )
        : [];

    const explicitAntiTags = Array.isArray(raw['antiTags'])
        ? (raw['antiTags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_ANTI_TAG_SET.has(t)
          )
        : [];

    // Merge disqualifiers into antiTags so negative governance is never silently lost
    const disqualifierTags = Array.isArray(raw['disqualifiers'])
        ? (raw['disqualifiers'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_ANTI_TAG_SET.has(t)
          )
        : [];

    const antiTags = Array.from(new Set([...explicitAntiTags, ...disqualifierTags]));

    return { aiScore, aiReasoning, shipMatch, categoryFit, detectedTags, antiTags };
}

// ── Per-candidate evaluation ──────────────────────────────────────────────────

// Throws on infrastructure failure (network, non-image, API error).
// Returns null when the image was successfully evaluated but failed visual criteria.
async function evaluateSingleCandidate(
    candidate: ShipReferenceCandidate,
    shipName: string,
): Promise<ShipReferenceCandidate | null> {
    // Infrastructure failures propagate as thrown errors (allSettled will capture as 'rejected')
    const imageData = await fetchImageAsBase64(candidate.imageUrl);

    const promptText = buildEvaluationPrompt(shipName, candidate.category);

    const response = await callLLM(VISION_MODEL, promptText, {
        systemPrompt: EVALUATION_SYSTEM_PROMPT,
        images: [{ base64: imageData.base64, mimeType: imageData.mimeType }],
        jsonMode: true,
        maxTokens: 2000,
    });

    const rawContent = response.content;
    if (!rawContent) {
        throw new Error(`Empty model response content. Provider raw: ${JSON.stringify(response.raw)}`);
    }

    const raw = tryExtractJsonObject(rawContent);
    const { aiScore, aiReasoning, shipMatch, categoryFit, detectedTags, antiTags } =
        parseVisionApiResponse(raw);

    const isFailedShipMatch = candidate.category === 'offboard_excursion' 
        ? false // Excursions can't fail ship match
        : shipMatch === 'wrong_ship';

    if (categoryFit === 'wrong_category' || isFailedShipMatch || aiScore < VISION_MIN_AI_SCORE) {
        console.log('[VisionEvaluator] Candidate disqualified by vision', {
            url: candidate.imageUrl,
            category: candidate.category,
            aiScore,
            categoryFit,
            shipMatch,
        });
        return null;
    }

    return {
        ...candidate,
        aiScore,
        aiReasoning,
        detectedTags,
        antiTags,
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs per-category vision evaluation on a batch of text-pre-filtered candidates.
 *
 * Fallback semantics (Phase 7):
 * - ALL promises rejected (infra failures: network, API down) → return original batch for heuristic ranking.
 * - ANY promise fulfilled but zero survivors (visual rejection: wrong category / ship) → return [] to drop the category.
 * - Some survivors → return survivors augmented with AI fields.
 */
export async function applyVisionEvaluationToCategory(
    candidates: ShipReferenceCandidate[],
    shipName: string,
): Promise<ShipReferenceCandidate[]> {
    if (candidates.length === 0) {
        return candidates;
    }

    const category = candidates[0]?.category ?? 'unknown';

    const settledResults = await Promise.allSettled(
        candidates.map((candidate) =>
            evaluateSingleCandidate(candidate, shipName)
        )
    );

    // Count fulfilled (evaluated by AI) vs rejected (infra failure)
    let evaluatedCount = 0;
    const survivors: ShipReferenceCandidate[] = [];
    settledResults.forEach((result, index) => {
        const candidate = candidates[index];
        if (!candidate) {
            return;
        }

        if (result.status === 'rejected') {
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            console.warn('[VisionEvaluator] Candidate infrastructure failure', {
                category,
                title: candidate.title,
                imageUrl: candidate.imageUrl,
                imageHost: getHostFromUrl(candidate.imageUrl),
                contextUrl: candidate.contextUrl,
                contextHost: getHostFromUrl(candidate.contextUrl),
                reason,
            });
        }
    });

    for (const result of settledResults) {
        if (result.status === 'fulfilled') {
            evaluatedCount++;
            if (result.value !== null) {
                survivors.push(result.value);
            }
        }
    }

    // All infra failures — vision service unavailable: preserve heuristic candidates
    if (evaluatedCount === 0) {
        console.warn('[VisionEvaluator] All candidates failed infrastructure (fetch/API) — heuristic fallback', {
            category,
            attempted: candidates.length,
            candidateHosts: Array.from(new Set(candidates.map((candidate) => getHostFromUrl(candidate.imageUrl)))),
        });
        return candidates;
    }

    // Vision evaluated but every image was visually rejected — drop the category entirely
    if (survivors.length === 0) {
        console.warn('[VisionEvaluator] All evaluated candidates visually rejected — dropping category', {
            category,
            evaluated: evaluatedCount,
        });
        return [];
    }

    console.log('[VisionEvaluator] Category evaluation complete', {
        category,
        evaluated: evaluatedCount,
        survivors: survivors.length,
    });

    return survivors;
}
