import type { CampaignAestheticBrief } from './schema';
import type { CampaignDirective, DirectivePatch } from './schema';

/**
 * Merges all applied directives into a single patch, with later directives
 * winning on conflicting fields. Skips non-applied directives.
 */
export function mergeActiveDirectivePatches(directives: CampaignDirective[]): DirectivePatch {
    const applied = directives.filter((d) => d.status === 'applied');
    if (applied.length === 0) return {};

    const merged: DirectivePatch = {};

    for (const directive of applied) {
        const patch = directive.patch;

        if (patch.allowedProps?.length) merged.allowedProps = patch.allowedProps;
        if (patch.discouragedProps?.length) merged.discouragedProps = patch.discouragedProps;
        if (patch.nicheEnhancedMoments?.length) merged.nicheEnhancedMoments = patch.nicheEnhancedMoments;
        if (patch.propFamilies?.length) merged.propFamilies = patch.propFamilies;

        if (patch.stillPatches?.length) {
            const existing = merged.stillPatches ?? [];
            const incoming = patch.stillPatches;
            const map = new Map(existing.map((s) => [s.stillId, s]));
            for (const s of incoming) map.set(s.stillId, s);
            merged.stillPatches = Array.from(map.values());
        }

        if (patch.scenePatches?.length) {
            const existing = merged.scenePatches ?? [];
            const incoming = patch.scenePatches;
            const map = new Map(existing.map((s) => [s.sceneId, s]));
            for (const s of incoming) map.set(s.sceneId, s);
            merged.scenePatches = Array.from(map.values());
        }
    }

    return merged;
}

/**
 * Returns a new brief with the directive patch applied.
 * Does not mutate the original brief. Only overwrites fields that the patch
 * explicitly provides — all other brief fields are preserved exactly.
 */
export function patchBriefForDirective(
    brief: CampaignAestheticBrief,
    patch: DirectivePatch,
): CampaignAestheticBrief {
    if (Object.keys(patch).length === 0) return brief;

    const plausibility = brief.visual.plausibilityFramework;

    const patchedPlausibility = {
        ...plausibility,
        ...(patch.allowedProps ? { allowedProps: patch.allowedProps } : {}),
        ...(patch.discouragedProps ? { discouragedProps: patch.discouragedProps } : {}),
        ...(patch.nicheEnhancedMoments ? { nicheEnhancedMoments: patch.nicheEnhancedMoments } : {}),
    };

    const patchedIdentityBlueprint = brief.identityBlueprint && patch.propFamilies
        ? { ...brief.identityBlueprint, propFamilies: patch.propFamilies }
        : brief.identityBlueprint;

    let patchedStillBible = brief.landingStillBible;
    if (patch.stillPatches?.length && brief.landingStillBible) {
        const patchMap = new Map(patch.stillPatches.map((s) => [s.stillId, s.imagePrompt]));
        patchedStillBible = {
            ...brief.landingStillBible,
            stillLibrary: brief.landingStillBible.stillLibrary.map((still) => {
                const newPrompt = patchMap.get(still.stillId);
                return newPrompt ? { ...still, imagePrompt: newPrompt } : still;
            }),
        };
    }

    let patchedProductionBible = brief.productionBible;
    if (patch.scenePatches?.length && brief.productionBible) {
        const patchMap = new Map(patch.scenePatches.map((s) => [s.sceneId, s.imagePrompt]));
        patchedProductionBible = {
            ...brief.productionBible,
            sceneLibrary: brief.productionBible.sceneLibrary.map((scene) => {
                const newPrompt = patchMap.get(scene.sceneId);
                return newPrompt ? { ...scene, imagePrompt: newPrompt } : scene;
            }),
        };
    }

    return {
        ...brief,
        visual: {
            ...brief.visual,
            plausibilityFramework: patchedPlausibility,
        },
        identityBlueprint: patchedIdentityBlueprint,
        landingStillBible: patchedStillBible,
        productionBible: patchedProductionBible,
    };
}

/**
 * Returns the asset IDs in the manifest sections affected by the given scopes.
 */
export function collectStaleAssetIds(
    manifest: {
        images: {
            hero: Array<{ assetId: string }>;
            aestheticConcepts: Array<{ assetId: string }>;
            documentaryDetails?: Array<{ assetId: string }>;
            designedAdArtifacts?: Array<{ assetId: string }>;
            sceneImages: Array<{ assetId: string }>;
        };
    },
    scopes: string[],
): string[] {
    const ids: string[] = [];
    const s = new Set(scopes);

    if (s.has('heroes') || s.has('still_bible')) {
        ids.push(...manifest.images.hero.map((a) => a.assetId));
    }
    if (s.has('concepts')) {
        ids.push(...manifest.images.aestheticConcepts.map((a) => a.assetId));
    }
    if (s.has('documentary_details') || s.has('prop_families')) {
        ids.push(...(manifest.images.documentaryDetails ?? []).map((a) => a.assetId));
    }
    if (s.has('designed_ads')) {
        ids.push(...(manifest.images.designedAdArtifacts ?? []).map((a) => a.assetId));
    }
    if (s.has('scenes')) {
        ids.push(...manifest.images.sceneImages.map((a) => a.assetId));
    }

    return [...new Set(ids)];
}
