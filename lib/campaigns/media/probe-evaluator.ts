/**
 * Probe Evaluator
 *
 * Vision-based scoring for probe images generated from LandingStillSpec prompts.
 * Mirrors the pattern of vision-evaluator.ts — all pure logic functions are exported
 * for unit testing without live API calls.
 */

import { callLLM, ModelName } from '@/lib/ai/llm-gateway';
import type {
    LandingStillSpec,
    ProbeImageResult,
    ProbeImageStatus,
    ProbeImageReasonCode,
} from '../schema';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROBE_EVAL_MODEL = ModelName.CLAUDE_4_SONNET;
const PROBE_PASS_THRESHOLD = 65;
const PROBE_WARN_THRESHOLD = 40;

const PROBE_SYSTEM_PROMPT =
    'You are a campaign still image quality evaluator. ' +
    'Assess whether a generated image meets the requirements of its intended still slot. ' +
    'Respond ONLY with valid JSON matching the exact schema requested. No prose, no markdown.';

// ── Slot expectations ─────────────────────────────────────────────────────────

export function getSlotExpectations(slotRole: string): string {
    const map: Record<string, string> = {
        HERO_PRIMARY:
            'Wide establishing shot. 35-45% negative space for headline. Ship and environment lead. No tight cropping.',
        HERO_ALT:
            'Wide or medium-wide. Strong travel moment. Different location from primary hero.',
        EDITORIAL_WIDE_A:
            'Environment-led composition. NO intimate or close framing. Scene breadth required.',
        EDITORIAL_WIDE_B:
            'Different social unit and location from EDITORIAL_WIDE_A. Environment-led.',
        INTIMATE:
            'Close subject. Human-first framing. Must read as tight, intimate, or detail-focused.',
        FLEX:
            'General quality. Strong travel moment. Clear subject. No generic fallback imagery.',
    };
    return map[slotRole] ?? map['FLEX'];
}

// ── Pure logic — all exported for unit testing ─────────────────────────────────

export function deriveProbeStatus(
    aiScore: number,
    roleMatchScore: number,
    genericFallbackDetected: boolean,
): ProbeImageStatus {
    if (aiScore >= PROBE_PASS_THRESHOLD && roleMatchScore >= 50 && !genericFallbackDetected) {
        return 'probe_pass';
    }
    if (aiScore >= PROBE_WARN_THRESHOLD || roleMatchScore >= 35) {
        return 'probe_warn';
    }
    return 'probe_fail';
}

export function buildReasonCodes(fields: {
    nicheSignalPresent: boolean;
    genericFallbackDetected: boolean;
    roleMatchScore: number;
    aiScore: number;
    slotRole?: string;
}): ProbeImageReasonCode[] {
    const codes: ProbeImageReasonCode[] = [];
    if (!fields.nicheSignalPresent) {
        codes.push('niche_signal_absent');
    }
    if (fields.genericFallbackDetected) {
        codes.push('generic_fallback_detected');
    }
    if (fields.aiScore < PROBE_WARN_THRESHOLD) {
        codes.push('subject_clarity_low');
    }
    if (fields.roleMatchScore < 35) {
        if (fields.slotRole === 'HERO_PRIMARY' || fields.slotRole === 'HERO_ALT') {
            codes.push('role_mismatch_hero_scale');
        } else if (fields.slotRole === 'INTIMATE') {
            codes.push('role_mismatch_intimate_scale');
        } else {
            codes.push('composition_off_role');
        }
    }
    return codes;
}

// ── JSON parsing utilities (mirrors vision-evaluator.ts) ──────────────────────

export function tryExtractJsonObject(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (!trimmed) {
        throw new Error('Empty model response content');
    }

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

export function parseProbeApiResponse(
    raw: Record<string, unknown>,
    spec: LandingStillSpec,
): Omit<ProbeImageResult, 'imageUrl' | 'promptUsed' | 'evaluatedAt'> {
    const aiScore =
        typeof raw['aiScore'] === 'number'
            ? Math.min(100, Math.max(0, Math.round(raw['aiScore'])))
            : 40;
    const aiReasoning = typeof raw['aiReasoning'] === 'string' ? raw['aiReasoning'] : '';
    const nicheSignalPresent = raw['nicheSignalPresent'] === true;
    const roleMatchScore =
        typeof raw['roleMatchScore'] === 'number'
            ? Math.min(100, Math.max(0, Math.round(raw['roleMatchScore'])))
            : 50;
    const genericFallbackDetected = raw['genericFallbackDetected'] === true;
    const probeStatus = deriveProbeStatus(aiScore, roleMatchScore, genericFallbackDetected);
    const reasonCodes = buildReasonCodes({
        nicheSignalPresent,
        genericFallbackDetected,
        roleMatchScore,
        aiScore,
        slotRole: spec.slotRole,
    });
    return {
        stillId: spec.stillId,
        slotRole: spec.slotRole,
        probeStatus,
        aiScore,
        aiReasoning,
        nicheSignalPresent,
        roleMatchScore,
        genericFallbackDetected,
        reasonCodes,
    };
}

// ── Prompt construction ───────────────────────────────────────────────────────

function buildProbeEvalPrompt(
    spec: LandingStillSpec,
    themeName: string,
    nicheKeywords: readonly string[],
): string {
    return JSON.stringify({
        task: 'evaluate_campaign_probe_image',
        stillId: spec.stillId,
        slotRole: spec.slotRole,
        expectedNicheSignal: spec.nicheCarryThrough || nicheKeywords.slice(0, 3).join(', '),
        expectedHeroSubject: spec.heroSubject,
        expectedNicheCue: spec.nicheCue,
        antiFallbackNote: spec.antiFallbackNote,
        themeName,
        slotExpectations: getSlotExpectations(spec.slotRole ?? 'FLEX'),
        field_instructions: {
            aiScore:
                'Integer 0-100. 65+ meets direction. 40-64 marginal. Below 40 reject.',
            aiReasoning:
                'One sentence explaining the key pass or fail reason.',
            nicheSignalPresent:
                'true if niche cue is visible or implied in the image, false if generic.',
            roleMatchScore:
                'Integer 0-100. Does the framing match the slot role expectations above?',
            genericFallbackDetected:
                'true if the image looks like a generic cruise stock photo with no campaign identity.',
        },
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function evaluateProbeImage(
    imageBase64: string,
    imageMimeType: string,
    spec: LandingStillSpec,
    themeName: string,
    nicheKeywords: readonly string[],
): Promise<Omit<ProbeImageResult, 'imageUrl' | 'promptUsed' | 'evaluatedAt'>> {
    const promptText = buildProbeEvalPrompt(spec, themeName, nicheKeywords);

    const response = await callLLM(PROBE_EVAL_MODEL, promptText, {
        systemPrompt: PROBE_SYSTEM_PROMPT,
        images: [{ base64: imageBase64, mimeType: imageMimeType }],
        jsonMode: true,
        maxTokens: 1000,
    });

    const raw = tryExtractJsonObject(response.content ?? '');
    return parseProbeApiResponse(raw, spec);
}
