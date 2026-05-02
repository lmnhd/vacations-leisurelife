import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';
import type { CampaignAestheticBrief } from './schema';
import { DirectivePatchSchema, DirectiveScopeEnum } from './schema';
import type { DirectivePatch, DirectiveScope } from './schema';

function tryParseJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    let cleaned = trimmed;
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    try {
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first >= 0 && last > first) {
            try {
                return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
            } catch {
                return null;
            }
        }
        return null;
    }
}

function briefSummaryForAgent(brief: CampaignAestheticBrief): Record<string, unknown> {
    const plausibility = brief.visual.plausibilityFramework;
    return {
        themeName: brief.themeName,
        aestheticLabel: brief.visual.aestheticLabel,
        imageryMood: brief.visual.imageryMood,
        heroSlogan: brief.messaging.heroSlogan,
        currentAllowedProps: plausibility.allowedProps,
        currentDiscouragedProps: plausibility.discouragedProps,
        currentNicheEnhancedMoments: plausibility.nicheEnhancedMoments,
        currentPropFamilies: brief.identityBlueprint?.propFamilies ?? [],
        stillLibrarySample: (brief.landingStillBible?.stillLibrary ?? [])
            .slice(0, 6)
            .map((s) => ({ stillId: s.stillId, usage: s.usage, imagePrompt: s.imagePrompt })),
    };
}

/** Infers which asset pools a directive affects from its resolved patch. */
export function inferScopeFromPatch(patch: DirectivePatch): DirectiveScope[] {
    const scopes = new Set<DirectiveScope>();

    if (patch.allowedProps?.length || patch.discouragedProps?.length || patch.nicheEnhancedMoments?.length) {
        scopes.add('heroes');
        scopes.add('concepts');
        scopes.add('documentary_details');
    }
    if (patch.propFamilies?.length) {
        scopes.add('prop_families');
        scopes.add('heroes');
        scopes.add('concepts');
    }
    if (patch.stillPatches?.length) {
        scopes.add('still_bible');
        scopes.add('heroes');
    }
    if (patch.scenePatches?.length) {
        scopes.add('scenes');
    }

    // All scopes imply designed_ads should also update (they may use stale modules)
    if (scopes.size > 0) scopes.add('designed_ads');

    return Array.from(scopes);
}

/**
 * Resolves a natural language directive into a concrete DirectivePatch.
 * Reads the current brief fields and produces specific overrides that
 * the patch function can apply before generators run.
 */
export async function resolveDirective(
    text: string,
    brief: CampaignAestheticBrief,
): Promise<DirectivePatch> {
    const briefSummary = briefSummaryForAgent(brief);
    const scopeValues = DirectiveScopeEnum.options.join(' | ');

    const prompt = JSON.stringify({
        task: 'resolve_campaign_directive',
        directive: text,
        currentBriefState: briefSummary,
        instructions: [
            'You are an expert campaign art director resolving an editorial directive into concrete field overrides.',
            'Read the directive text and the current brief state, then produce a DirectivePatch that implements the intent.',
            'Be specific: if the directive says "use Azul, Catan, Ticket to Ride" then allowedProps must name those games as concrete physical props with placement context.',
            'stillPatches: rewrite imagePrompt fields only for stills where the directive clearly applies. Copy stillId exactly from stillLibrarySample.',
            'If a field is not affected by this directive, omit it entirely — do not include empty arrays.',
            'nicheEnhancedMoments should describe specific physical scenes, not event names.',
            `Valid scope values: ${scopeValues}`,
        ],
        outputSchema: {
            allowedProps: 'string[] — specific renderable props with placement (e.g. "half-finished Azul tile board on teak café table, morning light")',
            discouragedProps: 'string[] — props to remove from allowed list',
            nicheEnhancedMoments: 'string[] — scene descriptions with physical detail',
            propFamilies: 'string[] — short prop family labels for identity blueprint',
            stillPatches: 'Array<{ stillId: string; imagePrompt: string }> — per-still overrides',
            scenePatches: 'Array<{ sceneId: string; imagePrompt: string }> — per-scene overrides',
        },
    });

    const { content } = await callLLM(modelForTask('agentic'), prompt, {
        systemPrompt: 'You are a campaign art director. Respond only with a JSON object matching the outputSchema. No markdown, no explanation.',
        jsonMode: true,
        temperature: 0,
        maxTokens: 1200,
    });

    const parsed = tryParseJson(content);
    if (!parsed) {
        console.warn('[directive-agent] Could not parse LLM response, returning empty patch');
        return {};
    }

    const result = DirectivePatchSchema.safeParse(parsed);
    if (!result.success) {
        console.warn('[directive-agent] Patch failed schema validation, returning partial:', result.error.issues);
        return DirectivePatchSchema.catch({}).parse(parsed);
    }

    return result.data;
}
