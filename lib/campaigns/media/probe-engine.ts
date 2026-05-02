/**
 * Probe Engine
 *
 * Orchestrates the probe loop: generates one cheap image per still spec,
 * uploads it, scores it with Claude vision, and returns a ProbeRunRecord
 * with an aggregate verdict (approved / warn / blocked).
 *
 * Verdict thresholds:
 *   ≥4/6 pass → approved
 *   2-3/6 pass → warn
 *   <2/6 pass  → blocked
 */

import { randomUUID } from 'crypto';
import { getAestheticBrief, getCampaignBlueprint } from '../campaign-store';
import { getExpandedNicheKeywords } from '../reference-packs';
import { generateProbeImage } from './generators/stability-generator';
import { storeAsset } from './storage-client';
import { saveProbeRunRecord, saveSceneProbeRunRecord } from './media-store';
import { evaluateProbeImage } from './probe-evaluator';
import type { ProbeRunRecord, ProbeImageResult, ProbeRunVerdict, SceneSpec, LandingStillSpec } from '../schema';

// ── Verdict logic — exported for unit testing ─────────────────────────────────

export function deriveRunVerdict(
    passCount: number,
    totalProbed: number,
): { verdict: ProbeRunVerdict; verdictReason: string } {
    if (passCount >= 4) {
        return {
            verdict: 'approved',
            verdictReason: `${passCount}/${totalProbed} probes passed — directions approved for production.`,
        };
    }
    if (passCount >= 2) {
        return {
            verdict: 'warn',
            verdictReason: `${passCount}/${totalProbed} probes passed — partial directions may proceed with caution.`,
        };
    }
    return {
        verdict: 'blocked',
        verdictReason: `Only ${passCount}/${totalProbed} probes passed — directions must be revised before production.`,
    };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runProbeLoop(slug: string): Promise<ProbeRunRecord> {
    const brief = await getAestheticBrief(slug);
    if (!brief) {
        throw new Error(`No aesthetic brief found for "${slug}".`);
    }
    if (!brief.landingStillBible) {
        throw new Error(
            `Brief for "${slug}" has no landingStillBible — generate stills before running probes.`,
        );
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error(`Campaign not found: "${slug}".`);
    }

    const nicheKeywords = getExpandedNicheKeywords(campaign);
    const themeName = campaign.name ?? slug;
    const stills = brief.landingStillBible.stillLibrary;
    const ranAt = new Date().toISOString();

    console.log(`[probe-engine] Starting probe loop for ${slug} — ${stills.length} stills`);

    const results: ProbeImageResult[] = [];

    for (const still of stills) {
        console.log(`[probe-engine] Probing ${still.stillId} (${still.slotRole ?? 'unknown role'})`);
        try {
            const generated = await generateProbeImage(
                still.imagePrompt,
                'realistic',
                {
                    seed: still.stillId,
                    themeAnchorProps: brief.visual.plausibilityFramework.allowedProps.slice(0, 2),
                },
            );
            const imageBase64 = generated.buffer.toString('base64');
            const imageUrl = await storeAsset(
                slug,
                generated.assetId,
                generated.fileName,
                generated.buffer,
                'image/png',
            );
            const scored = await evaluateProbeImage(
                imageBase64,
                'image/png',
                still,
                themeName,
                nicheKeywords,
            );
            results.push({
                ...scored,
                imageUrl,
                promptUsed: generated.prompt,
                evaluatedAt: new Date().toISOString(),
            });
            console.log(
                `[probe-engine] ${still.stillId} → ${scored.probeStatus} (score: ${scored.aiScore})`,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[probe-engine] Error probing ${still.stillId}: ${message}`);
            results.push({
                stillId: still.stillId,
                slotRole: still.slotRole,
                probeStatus: 'probe_fail',
                aiScore: 0,
                aiReasoning: `Generation or evaluation error: ${message}`,
                nicheSignalPresent: false,
                roleMatchScore: 0,
                genericFallbackDetected: false,
                reasonCodes: ['generation_error'],
                imageUrl: '',
                promptUsed: still.imagePrompt,
                evaluatedAt: new Date().toISOString(),
            });
        }
    }

    const passCount = results.filter((r) => r.probeStatus === 'probe_pass').length;
    const warnCount = results.filter((r) => r.probeStatus === 'probe_warn').length;
    const failCount = results.filter((r) => r.probeStatus === 'probe_fail').length;
    const { verdict, verdictReason } = deriveRunVerdict(passCount, results.length);

    console.log(
        `[probe-engine] Complete — verdict: ${verdict} (${passCount} pass, ${warnCount} warn, ${failCount} fail)`,
    );

    const record: ProbeRunRecord = {
        probeRunId: randomUUID(),
        slug,
        ranAt,
        totalProbed: results.length,
        passCount,
        warnCount,
        failCount,
        verdict,
        verdictReason,
        results,
        probeType: 'landing_still',
    };
    await saveProbeRunRecord(slug, record);
    return record;
}

// ── Scene-aware probe loop ────────────────────────────────────────────────────
// Probes the productionBible.sceneLibrary (distinct from landingStillBible probes).
// Converts each SceneSpec to a LandingStillSpec-compatible object for evaluation.

function sceneSpecToProbeStill(scene: SceneSpec): LandingStillSpec {
    return {
        stillId: scene.sceneId,
        usage: 'hero_alt',
        slotRole: 'FLEX',
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        lighting: scene.lighting,
        composition: scene.cameraAngle,
        subjectAction: scene.subjectAction,
        environmentDetails: scene.environmentDetails,
        mood: scene.mood,
        imagePrompt: scene.imagePrompt || `${scene.location} at ${scene.timeOfDay}, ${scene.lighting}`,
        referenceCategory: scene.referenceCategory,
    };
}

export async function runSceneProbeLoop(slug: string): Promise<ProbeRunRecord> {
    const brief = await getAestheticBrief(slug);
    if (!brief) {
        throw new Error(`No aesthetic brief found for "${slug}".`);
    }
    if (!brief.productionBible) {
        throw new Error(`Brief for "${slug}" has no productionBible — generate the production bible before running scene probes.`);
    }
    if (brief.productionBible.sceneLibrary.length === 0) {
        throw new Error(`productionBible for "${slug}" has an empty sceneLibrary — regenerate the production bible first.`);
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error(`Campaign not found: "${slug}".`);
    }

    const nicheKeywords = getExpandedNicheKeywords(campaign);
    const themeName = campaign.name ?? slug;
    const scenes = brief.productionBible.sceneLibrary;
    const ranAt = new Date().toISOString();

    console.log(`[probe-engine] Starting scene probe loop for ${slug} — ${scenes.length} scenes`);

    const results: ProbeImageResult[] = [];

    for (const scene of scenes) {
        const probeStill = sceneSpecToProbeStill(scene);
        console.log(`[probe-engine] Probing scene ${scene.sceneId} (${scene.location})`);
        try {
            const generated = await generateProbeImage(
                probeStill.imagePrompt,
                'realistic',
                {
                    seed: scene.sceneId,
                    themeAnchorProps: brief.visual.plausibilityFramework.allowedProps.slice(0, 2),
                },
            );
            const imageBase64 = generated.buffer.toString('base64');
            const imageUrl = await storeAsset(slug, generated.assetId, generated.fileName, generated.buffer, 'image/png');
            const scored = await evaluateProbeImage(imageBase64, 'image/png', probeStill, themeName, nicheKeywords);
            results.push({ ...scored, imageUrl, promptUsed: generated.prompt, evaluatedAt: new Date().toISOString() });
            console.log(`[probe-engine] scene ${scene.sceneId} → ${scored.probeStatus} (score: ${scored.aiScore})`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[probe-engine] Error probing scene ${scene.sceneId}: ${message}`);
            results.push({
                stillId: scene.sceneId,
                slotRole: 'FLEX',
                probeStatus: 'probe_fail',
                aiScore: 0,
                aiReasoning: `Generation or evaluation error: ${message}`,
                nicheSignalPresent: false,
                roleMatchScore: 0,
                genericFallbackDetected: false,
                reasonCodes: ['generation_error'],
                imageUrl: '',
                promptUsed: probeStill.imagePrompt,
                evaluatedAt: new Date().toISOString(),
            });
        }
    }

    const passCount = results.filter((r) => r.probeStatus === 'probe_pass').length;
    const warnCount = results.filter((r) => r.probeStatus === 'probe_warn').length;
    const failCount = results.filter((r) => r.probeStatus === 'probe_fail').length;
    const { verdict, verdictReason } = deriveRunVerdict(passCount, results.length);

    console.log(`[probe-engine] Scene probe complete — verdict: ${verdict} (${passCount} pass, ${warnCount} warn, ${failCount} fail)`);

    const record: ProbeRunRecord = {
        probeRunId: randomUUID(),
        slug,
        ranAt,
        totalProbed: results.length,
        passCount,
        warnCount,
        failCount,
        verdict,
        verdictReason,
        results,
        probeType: 'scene',
    };
    await saveSceneProbeRunRecord(slug, record);
    return record;
}
