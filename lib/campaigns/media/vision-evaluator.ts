import OpenAI from 'openai';
import { getModelConfig, ModelName } from '@/lib/ai/llm-gateway';
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

const VISION_MODEL = ModelName.GPT_5_HIGH;
const VISION_MIN_AI_SCORE = 30;
const FETCH_TIMEOUT_MS = 10_000;

// ── Prompt construction ───────────────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are a cruise ship photography quality evaluator. Assess whether an image is appropriate for a specific ship reference category in marketing materials.
Respond ONLY with a valid JSON object matching the exact schema requested. No prose, no markdown, no explanation outside the JSON.`;

function buildEvaluationPrompt(shipName: string, category: string): string {
    return JSON.stringify({
        task: 'evaluate_ship_reference_image',
        ship_name: shipName,
        expected_category: category,
        field_instructions: {
            aiScore: 'Integer 0-100. 85+ excellent match. 50-84 usable. Below 50 discard.',
            aiReasoning: 'One sentence explaining why this image does or does not fit.',
            shipMatch: 'One of: exact_ship | same_class | generic_cruise | wrong_ship',
            categoryFit: 'One of: strong | weak | wrong_category',
            disqualifiers: 'Array of applicable strings from: wrong-category, wrong-ship, generic-cruise, cgi-or-render, blurry, text-overlay, busy, crowded, interior-heavy, hotel-like, non-public-space, workshop-like, literal-activity',
            detectedTags: 'Array of applicable strings from: ship-identity, ocean-forward, travel-first, headline-safe, wide, clean, minimal, quiet, cinematic, contextual, guest-accessible, public-space, interior, exterior, promenade, atrium, dining, stateroom',
            antiTags: 'Array of applicable strings from the disqualifier vocabulary above',
        },
    });
}

// ── Image fetch ───────────────────────────────────────────────────────────────

async function fetchImageAsBase64(
    url: string,
): Promise<{ base64: string; mimeType: string } | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        const rawMime = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
        if (!rawMime.startsWith('image/')) {
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        return { base64: buffer.toString('base64'), mimeType: rawMime };
    } catch {
        return null;
    }
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

    const antiTags = Array.isArray(raw['antiTags'])
        ? (raw['antiTags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_ANTI_TAG_SET.has(t)
          )
        : [];

    return { aiScore, aiReasoning, shipMatch, categoryFit, detectedTags, antiTags };
}

// ── Per-candidate evaluation ──────────────────────────────────────────────────

async function evaluateSingleCandidate(
    client: OpenAI,
    apiId: string,
    candidate: ShipReferenceCandidate,
    shipName: string,
): Promise<ShipReferenceCandidate | null> {
    const imageData = await fetchImageAsBase64(candidate.imageUrl);
    if (!imageData) {
        console.warn('[VisionEvaluator] Image fetch failed — discarding candidate', {
            url: candidate.imageUrl,
            category: candidate.category,
        });
        return null;
    }

    const dataUrl = `data:${imageData.mimeType};base64,${imageData.base64}`;
    const promptText = buildEvaluationPrompt(shipName, candidate.category);

    const response = await client.chat.completions.create({
        model: apiId,
        messages: [
            { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
                    { type: 'text', text: promptText },
                ],
            },
        ],
        max_tokens: 400,
        temperature: 0,
        response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0]?.message?.content ?? '{}';
    const raw = JSON.parse(rawContent) as Record<string, unknown>;
    const { aiScore, aiReasoning, shipMatch, categoryFit, detectedTags, antiTags } =
        parseVisionApiResponse(raw);

    if (categoryFit === 'wrong_category' || shipMatch === 'wrong_ship' || aiScore < VISION_MIN_AI_SCORE) {
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
 * Returns only candidates that pass visual screening (correct category, correct ship, aiScore >= 30),
 * augmented with AI fields (aiScore, aiReasoning, detectedTags, antiTags).
 *
 * If vision evaluation fails entirely for the batch, returns the original unaugmented candidates
 * so heuristic ranking can proceed (Phase 7 fallback).
 */
export async function applyVisionEvaluationToCategory(
    candidates: ShipReferenceCandidate[],
    shipName: string,
): Promise<ShipReferenceCandidate[]> {
    if (candidates.length === 0) {
        return candidates;
    }

    const category = candidates[0]?.category ?? 'unknown';

    let client: OpenAI;
    let apiId: string;
    try {
        const config = getModelConfig(VISION_MODEL);
        const { default: OpenAIClass } = await import('openai');
        client = new OpenAIClass({ apiKey: process.env.OPENAI_API_KEY });
        apiId = config.apiId ?? 'gpt-5';
    } catch (initError) {
        console.warn('[VisionEvaluator] Failed to initialize — returning heuristic candidates', {
            category,
            error: initError instanceof Error ? initError.message : String(initError),
        });
        return candidates;
    }

    const settledResults = await Promise.allSettled(
        candidates.map((candidate) =>
            evaluateSingleCandidate(client, apiId, candidate, shipName)
        )
    );

    const survivors: ShipReferenceCandidate[] = [];
    for (const result of settledResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
            survivors.push(result.value);
        }
    }

    if (survivors.length === 0) {
        console.warn(
            '[VisionEvaluator] All candidates disqualified for category — falling back to heuristic',
            { category, evaluated: candidates.length }
        );
        return candidates;
    }

    console.log('[VisionEvaluator] Category evaluation complete', {
        category,
        evaluated: candidates.length,
        survivors: survivors.length,
    });

    return survivors;
}
