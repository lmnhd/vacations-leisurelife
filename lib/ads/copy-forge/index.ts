// lib/ads/copy-forge/index.ts
//
// Single-call structured generation of an AdCopySet, followed by a
// deterministic quality gate. If the gate fails on the first pass, we
// regenerate once with the failure reasons injected. We never loop.

import { generateStructuredObject, modelForTask, ModelName } from '@/lib/ai/llm-gateway';
import { ZodError } from 'zod/v3';
import { AD_COPY_FORGE_MODEL_OVERRIDE } from '../config';
import { assembleCopyForgePrompt } from './prompt';
import { AdCopySetSchema } from './schema';
import { failedChecksAsPromptHint, runQualityGate } from './quality-gate';
import type {
    AdCopySet,
    CopyForgeInput,
    CopyForgeResult,
    QualityGateResult,
} from '../types';

const COPY_FORGE_TIMEOUT_MS = Number(process.env.AD_COPY_FORGE_TIMEOUT_MS ?? '60000');

function resolvePreferredModel(warnings: string[]): ModelName {
    if (AD_COPY_FORGE_MODEL_OVERRIDE) {
        warnings.push(`Copy Forge using local model override "${AD_COPY_FORGE_MODEL_OVERRIDE}".`);
    }
    return modelForTask('creative');
}

async function callModel(
    preferredModel: ModelName,
    system: string,
    user: string,
): Promise<{ copySet: AdCopySet; modelId: string; warnings: string[] }> {
    const result = await generateStructuredObject({
        model: preferredModel,
        schema: AdCopySetSchema,
        system,
        prompt: user,
        timeoutMs: COPY_FORGE_TIMEOUT_MS,
        rawModelOverride: AD_COPY_FORGE_MODEL_OVERRIDE,
        // AdCopySetSchema uses z.record(...) for variable-name slot directives
        // and z.union([..., array(...)]) for carousel pages, both of which
        // produce JSON Schema constructs (`additionalProperties: <schema>`)
        // that OpenAI's strict structured-output mode rejects. We rely on
        // the deterministic quality gate downstream as the strictness layer.
        strictJsonSchema: false,
    });

    return {
        copySet: result.object as AdCopySet,
        modelId: result.modelId,
        warnings: result.warnings,
    };
}

function schemaFailureAsPromptHint(error: unknown): string | null {
    if (error instanceof ZodError) {
        return JSON.stringify(error.issues, null, 2);
    }
    return null;
}

function cleanTokens(values: string[]): string[] {
    return Array.from(new Set(values
        .flatMap((value) => value.split(/[^a-zA-Z0-9]+/))
        .map((value) => value.trim())
        .filter((value) => value.length >= 4)));
}

function themeAnchorHints(input: CopyForgeInput): string[] {
    return [
        input.campaign.name,
        input.campaign.theme,
        input.brief.heroSlogan,
        input.brief.subSlogan,
        input.brief.emotionalPromise,
        ...input.brief.nicheSignals,
        ...input.brief.propFamilies,
        ...(input.dossier?.specificExamples ?? []),
        ...(input.dossier?.allowedSignals ?? []),
    ]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, 14);
}

function logisticsBanList(input: CopyForgeInput): string[] {
    return cleanTokens([
        input.campaign.vessel,
        input.campaign.route,
        input.campaign.departure,
        'ship',
        'cruise line',
        'port',
        'ports',
        'route',
        'sailing date',
        'nights',
    ]);
}

function qualityRepairInstructions(input: CopyForgeInput, gate: QualityGateResult): string {
    const failedKeys = new Set(gate.checks.filter((check) => !check.passed).map((check) => check.key));
    const instructions: string[] = [
        'Regenerate the full AdCopySet, not just the failed field.',
        'Keep all text inside each template slot budget.',
    ];

    if (failedKeys.has('theme_dominance')) {
        instructions.push(
            'The visible ad copy leaned on cruise inventory. Remove all ship, route, port, date, and duration language from headline, subhead, and microcopy.',
            `Forbidden logistics tokens: ${logisticsBanList(input).join(', ') || '(none)'}.`,
            `Approved theme anchors to use instead: ${themeAnchorHints(input).join(' | ') || input.campaign.name}.`,
            'Write the headline as a niche-theme hook, not a vessel name or itinerary fact.',
            'Use subhead and microcopy for mood, ritual, community, or theme-specific desire. Do not mention the vessel, date, route, ports, or number of nights.',
        );
    }

    if (failedKeys.has('specificity')) {
        instructions.push(
            `Every headline must include or clearly evoke one of these niche/theme anchors: ${themeAnchorHints(input).join(' | ') || input.campaign.name}.`,
        );
    }

    if (failedKeys.has('niche_visibility')) {
        instructions.push(
            'Visible copy is too atmospheric and does not explicitly name the niche. Add plain niche language to headline, subhead, or microcopy while staying within slot budgets.',
            `Use campaign niche language from: ${themeAnchorHints(input).join(' | ') || input.campaign.name}.`,
            'For wellness campaigns, words like wellness, yoga, meditation, breath, stretch, mindful, nature, reset, or restorative are acceptable when they fit the campaign.',
        );
    }

    if (failedKeys.has('image_diversity')) {
        instructions.push(
            'Image directives are too repetitive. Assign different image slots to different assetType values wherever available.',
            `Available image pools: ${Object.entries(input.availableImages).filter(([, count]) => count > 0).map(([type, count]) => `${type}:${count}`).join(', ') || 'none'}.`,
            'Use the slot image guidance: background for atmosphere, hero for primary human niche moment, tiles for action detail, social cue, prop/texture close-up, and cruise-native context.',
            'Do not make every slot a quiet deck, balcony, sea view, or solo person at railing.',
        );
    }

    if (failedKeys.has('slot_fit')) {
        const textBudgets = input.formats.flatMap((format) => {
            const layout = input.templateLayouts[format];
            if (!layout) return [];
            return layout.slotDescriptors
                .filter((slot) => slot.type === 'text')
                .map((slot) => {
                    const budget = [
                        slot.maxChars !== undefined ? `${slot.maxChars} chars` : null,
                        slot.maxWords !== undefined ? `${slot.maxWords} words` : null,
                        slot.maxLines !== undefined ? `${slot.maxLines} lines` : null,
                    ].filter(Boolean).join(', ');
                    return `${format}.${slot.name}: ${budget || 'no explicit text budget'}; ${slot.copyInstruction ?? slot.copyRole ?? 'fit the visual slot'}`;
                });
        });
        instructions.push(
            'At least one text slot was too long for the template. Rewrite only with ultra-short display copy that fits the exact budgets below.',
            ...textBudgets.map((budget) => `Text budget - ${budget}`),
            'For story_reel.headline, prefer 1-2 words if possible. Three short words is the maximum.',
            'For story_reel.microcopy, use a label, not a sentence.',
        );
    }

    return instructions.map((instruction) => `- ${instruction}`).join('\n');
}

async function callModelWithSchemaRepair(
    preferredModel: ModelName,
    system: string,
    user: string,
): Promise<{ copySet: AdCopySet; modelId: string; warnings: string[]; schemaRepaired: boolean }> {
    try {
        return { ...(await callModel(preferredModel, system, user)), schemaRepaired: false };
    } catch (error) {
        const schemaHint = schemaFailureAsPromptHint(error);
        if (!schemaHint) {
            throw error;
        }

        const repairedUser = `${user}\n\nPREVIOUS_ATTEMPT_FAILED_SCHEMA_VALIDATION:\n${schemaHint}\n\nProduce a NEW AdCopySet that fixes every schema issue exactly. Count characters carefully. Do not exceed headline, subhead, microcopy, or CTA length limits.`;
        const repaired = await callModel(preferredModel, system, repairedUser);
        return {
            ...repaired,
            warnings: [
                ...repaired.warnings,
                'Copy Forge retried once after schema validation failed on the first structured output.',
            ],
            schemaRepaired: true,
        };
    }
}

export async function generateCopySet(input: CopyForgeInput): Promise<CopyForgeResult> {
    const warnings: string[] = [];
    const preferredModel = resolvePreferredModel(warnings);
    const { system, user } = assembleCopyForgePrompt(input);

    if (input.formats.length === 0) {
        throw new Error('Copy Forge requires at least one requested format.');
    }
    const missingLayouts = input.formats.filter((f) => !input.templateLayouts[f]);
    if (missingLayouts.length > 0) {
        throw new Error(
            `Copy Forge cannot run: no template layouts registered for formats [${missingLayouts.join(', ')}] under this (workflow, visualFlavor).`,
        );
    }

    const firstModelResult = await callModelWithSchemaRepair(preferredModel, system, user);
    warnings.push(...firstModelResult.warnings);
    const firstPass = firstModelResult.copySet;
    const modelId = firstModelResult.modelId;
    const firstGate = runQualityGate(firstPass, input);

    if (firstGate.passed) {
        return { copySet: firstPass, qualityGate: firstGate, warnings, modelId, regenerated: false };
    }

    const hint = failedChecksAsPromptHint(firstGate);
    if (!hint) {
        return { copySet: firstPass, qualityGate: firstGate, warnings, modelId, regenerated: false };
    }

    const reinforcedUser = `${user}\n\nPREVIOUS_ATTEMPT_FAILED_THESE_CHECKS:\n${hint}\n\nTARGETED_REPAIR_INSTRUCTIONS:\n${qualityRepairInstructions(input, firstGate)}\n\nProduce a NEW AdCopySet that resolves every failed check. Do not repeat the same headlines or directives.`;

    const secondModelResult = await callModelWithSchemaRepair(preferredModel, system, reinforcedUser);
    warnings.push(...secondModelResult.warnings);
    const secondPass = secondModelResult.copySet;
    const secondGate = runQualityGate(secondPass, input);

    const secondImproved = secondGate.passed || secondGate.blockerCount < firstGate.blockerCount;

    return {
        copySet: secondImproved ? secondPass : firstPass,
        qualityGate: secondImproved ? secondGate : firstGate,
        warnings,
        modelId,
        regenerated: true,
    };
}

export { runQualityGate } from './quality-gate';
export { AdCopySetSchema } from './schema';
export { assembleCopyForgePrompt } from './prompt';
