import { callLLM, ModelName } from '@/lib/ai/llm-gateway';
import type { AssetRecord } from '../schema';
import type { VisionSourceQualityEvaluation } from './source-quality';

const VISUAL_COMPASS_MODEL = ModelName.CLAUDE_4_SONNET;
const FETCH_TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT =
    'You are a campaign image visual-compass evaluator. Score the actual image, not the prompt. ' +
    'Respond only with valid JSON matching the requested fields. No prose or markdown.';

export interface VisualCompassVisionContext {
    campaignName: string;
    themeName?: string;
    expectedFeatures?: readonly string[];
}

export interface VisualCompassVisionResult extends VisionSourceQualityEvaluation {
    aiReasoning: string;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function parseSupportSurfaceIntegrity(raw: Record<string, unknown>): VisualCompassVisionResult['supportSurfaceIntegrity'] {
    const value = raw['supportSurfaceIntegrity'];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record['supported'] === 'boolean') {
            return {
                supported: record['supported'],
                issue: typeof record['issue'] === 'string' && record['issue'].trim()
                    ? record['issue'].trim()
                    : undefined,
            };
        }
    }

    if (typeof raw['supportSurfaceSupported'] === 'boolean') {
        return {
            supported: raw['supportSurfaceSupported'],
            issue: typeof raw['supportSurfaceIssue'] === 'string' && raw['supportSurfaceIssue'].trim()
                ? raw['supportSurfaceIssue'].trim()
                : undefined,
        };
    }

    return undefined;
}

export function tryExtractJsonObject(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (!trimmed) throw new Error('Empty model response content');

    let cleaned = trimmed;
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    try {
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
        }
        throw new Error(`Model did not return parseable JSON. Preview: ${trimmed.slice(0, 280)}`);
    }
}

export function parseVisualCompassVisionResponse(
    raw: Record<string, unknown>,
    expectedFeatures: readonly string[] = [],
): VisualCompassVisionResult {
    const themeLegibilityScore = typeof raw['themeLegibilityScore'] === 'number'
        ? clamp01(raw['themeLegibilityScore'])
        : 0.5;
    const groupActionScore = typeof raw['groupActionScore'] === 'number'
        ? clamp01(raw['groupActionScore'])
        : 0.5;
    const peopleCount = typeof raw['peopleCount'] === 'number'
        ? Math.max(0, Math.round(raw['peopleCount']))
        : undefined;
    const ageBands = normalizeStringArray(raw['ageBands']);
    const ethnicityBands = normalizeStringArray(raw['ethnicityBands']);
    const rawPreserved = normalizeStringArray(raw['preservedFeaturesReported']);
    const expected = new Set(expectedFeatures.map((feature) => feature.toLowerCase()));
    const preservedFeaturesReported = expected.size > 0
        ? rawPreserved.filter((feature) => expected.has(feature.toLowerCase()))
        : rawPreserved;
    const supportSurfaceIntegrity = parseSupportSurfaceIntegrity(raw);

    return {
        themeLegibilityScore,
        groupActionScore,
        peopleCount,
        ageBands,
        ethnicityBands,
        preservedFeaturesReported,
        supportSurfaceIntegrity,
        aiReasoning: typeof raw['aiReasoning'] === 'string' ? raw['aiReasoning'] : '',
        evaluatedAt: new Date().toISOString(),
    };
}

function buildEvaluationPrompt(asset: AssetRecord, context: VisualCompassVisionContext): string {
    return JSON.stringify({
        task: 'evaluate_campaign_source_asset_visual_compass',
        assetId: asset.assetId,
        assetType: asset.assetType,
        eligibilityRole: asset.eligibilityRole,
        campaignName: context.campaignName,
        themeName: context.themeName ?? context.campaignName,
        promptUsed: asset.promptUsed,
        tags: asset.tags,
        expectedFeatures: context.expectedFeatures ?? [],
        fieldInstructions: {
            themeLegibilityScore: 'Number 0-1. Can the campaign theme/niche be recognized from the image without caption copy?',
            groupActionScore: 'Number 0-1. Does the image show 4-6 people doing a shared theme-specific activity?',
            peopleCount: 'Integer visible people count. Use 0 if no people are visible.',
            ageBands: 'Array of visible age bands from: child, teen, young_adult, middle_aged, senior, multi_gen. Empty if not inferable.',
            ethnicityBands: 'Array of visible ethnicity/presentation bands from: diverse_mixed, east_asian, south_asian, southeast_asian, black, latino, middle_eastern, indigenous, white. Empty if not inferable.',
            preservedFeaturesReported: 'Array containing only expectedFeatures that are visibly present in the image. Empty if none survived or expectedFeatures is empty.',
            supportSurfaceIntegrity: 'Object { supported: boolean, issue?: string }. Set supported=false if any seated, standing, kneeling, or reclining person appears unsupported, floating, or sitting/standing/lying on open water. Set supported=true only when every visible person is on a clear physical surface such as deck, chair, lounger, bench, step, pool coping, pool ledge, or is clearly swimming.',
            aiReasoning: 'One concise sentence explaining the score.',
        },
    });
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(url, { signal: controller.signal });
    } catch (err) {
        clearTimeout(timeout);
        throw new Error(`[VisualCompassVision] Network error fetching image: ${url} - ${String(err)}`);
    }
    clearTimeout(timeout);

    if (!response.ok) {
        throw new Error(`[VisualCompassVision] Image fetch returned ${response.status}: ${url}`);
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';
    if (!mimeType.startsWith('image/')) {
        throw new Error(`[VisualCompassVision] Non-image content-type "${mimeType}" for: ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
}

export async function evaluateAssetVisualCompass(
    asset: AssetRecord,
    context: VisualCompassVisionContext,
): Promise<VisualCompassVisionResult> {
    const image = await fetchImageAsBase64(asset.url);
    const response = await callLLM(VISUAL_COMPASS_MODEL, buildEvaluationPrompt(asset, context), {
        systemPrompt: SYSTEM_PROMPT,
        images: [{ base64: image.base64, mimeType: image.mimeType }],
        jsonMode: true,
        maxTokens: 1200,
    });

    const raw = tryExtractJsonObject(response.content ?? '');
    return parseVisualCompassVisionResponse(raw, context.expectedFeatures ?? []);
}
