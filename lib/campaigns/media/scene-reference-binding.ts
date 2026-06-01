// lib/campaigns/media/scene-reference-binding.ts
//
// Phase 2 (IMAGE_GEN_REVAMP_5-26): explicit per-scene reference binding.
//
// The production bible writes scene specs with a referenceCategory (e.g.,
// "atrium", "pool_deck"). After ship references are loaded, this module binds
// each scene to:
//   - referenceAssetIds[]: specific AssetRecord ids the generator must use
//   - mustPreserveShipFeatures[]: distinctive features the generated image
//     must carry (derived from the matched reference's vision-detected tags)
//
// The binding is pure, deterministic, and idempotent — re-running it on
// already-bound scenes is a no-op when the inputs are unchanged.

import type {
    AssetRecord,
    SceneSpec,
    ShipReferenceCandidate,
} from '../schema';

const MAX_FEATURES_PER_SCENE = 5;
const MAX_REFERENCES_PER_SCENE = 2;

interface ScoredMatch {
    candidate: ShipReferenceCandidate;
    record: AssetRecord | undefined;
    score: number;
}

/** Sum of selectionScore (heuristic) and aiScore (vision evaluation, optional). */
function combinedScore(candidate: ShipReferenceCandidate): number {
    return candidate.selectionScore + (candidate.aiScore ?? 0);
}

/** Join candidates to records via imageUrl. AssetRecord.url is the same field. */
function findRecordForCandidate(
    candidate: ShipReferenceCandidate,
    records: readonly AssetRecord[],
): AssetRecord | undefined {
    return records.find((rec) => rec.url === candidate.imageUrl);
}

/**
 * Distinctive features the generator must preserve. Pulled from the matched
 * reference's vision-detected tags, with antiTags excluded (those describe
 * what to avoid, not what to keep).
 */
function extractMustPreserveFeatures(candidate: ShipReferenceCandidate): string[] {
    const detected = candidate.detectedTags ?? [];
    const antis = new Set(candidate.antiTags ?? []);
    const usable = detected
        .filter((tag) => tag.trim().length > 0)
        .filter((tag) => !antis.has(tag));

    if (usable.length > 0) {
        return usable.slice(0, MAX_FEATURES_PER_SCENE);
    }

    // Fallback: derive a single feature from the category if no tags exist.
    // This keeps the contract non-empty so the generator can emit a preserve
    // clause even for references without vision evaluation.
    const category = candidate.category.trim();
    return category ? [`${category}_architecture`] : [];
}

/**
 * Per-scene binding: pick the top-scoring matched references by category,
 * collect their asset IDs, and merge their distinctive features.
 */
function bindScene(
    scene: SceneSpec,
    candidates: readonly ShipReferenceCandidate[],
    records: readonly AssetRecord[],
): SceneSpec {
    const matches: ScoredMatch[] = candidates
        .filter((c) => c.category === scene.referenceCategory)
        .map((candidate) => ({
            candidate,
            record: findRecordForCandidate(candidate, records),
            score: combinedScore(candidate),
        }))
        .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
        // No matching reference. Leave scene's binding fields empty.
        // Downstream lint (Phase 5) will flag scenes that need but lack a reference.
        return scene;
    }

    const top = matches.slice(0, MAX_REFERENCES_PER_SCENE);
    const referenceAssetIds = top
        .map((m) => m.record?.assetId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const seen = new Set<string>();
    const mustPreserveShipFeatures: string[] = [];
    for (const match of top) {
        for (const feature of extractMustPreserveFeatures(match.candidate)) {
            if (seen.has(feature)) continue;
            seen.add(feature);
            mustPreserveShipFeatures.push(feature);
            if (mustPreserveShipFeatures.length >= MAX_FEATURES_PER_SCENE) break;
        }
        if (mustPreserveShipFeatures.length >= MAX_FEATURES_PER_SCENE) break;
    }

    return {
        ...scene,
        referenceAssetIds: referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
        mustPreserveShipFeatures: mustPreserveShipFeatures.length > 0 ? mustPreserveShipFeatures : undefined,
    };
}

/**
 * Bind reference candidates to scenes by category. Pure and idempotent.
 *
 * Each returned scene carries:
 *   - referenceAssetIds: up to 2 AssetRecord ids the generator should consume.
 *   - mustPreserveShipFeatures: up to 5 distinctive features (vision-detected
 *     tags from the matched candidates, antiTags excluded). If the candidate
 *     has no detected tags, a single category-derived fallback is used.
 *
 * Scenes that already carry referenceAssetIds (e.g., from a previous run) are
 * left untouched.
 */
export function bindReferencesToScenes(
    scenes: readonly SceneSpec[],
    candidates: readonly ShipReferenceCandidate[],
    records: readonly AssetRecord[],
): SceneSpec[] {
    return scenes.map((scene) => {
        // Idempotent: an already-bound scene is returned as-is.
        if (scene.referenceAssetIds && scene.referenceAssetIds.length > 0) {
            return scene;
        }
        return bindScene(scene, candidates, records);
    });
}
