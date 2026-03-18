/**
 * Production-Bible Deterministic Fixers
 *
 * Five targeted fixers for film-and-zine-afloat-2026 and similar campaigns
 * that deadlock because production-feasibility contradictions live in the
 * productionBible / storyboard layer rather than the top-level brief.
 *
 * Each fixer is pure and idempotent: applying it twice produces the same result
 * as applying it once.
 */

import type { CampaignAestheticBrief, ShotSpec, Storyboard, SceneSpec } from '../schema';
import type { FixerResult } from './registry';
import { noOpResult, appliedResult } from './registry';
import type { AestheticOperationKind } from '../schema';

// ── Camera move replacements ──────────────────────────────────────────────────

const CAMERA_MOVE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /crane\s+drop(\s+from\s+sky)?/gi, replacement: 'high-angle handheld settle' },
    { pattern: /crane\s+rise/gi, replacement: 'slow gimbal lift' },
    { pattern: /crane\s+shot/gi, replacement: 'handheld high angle' },
    { pattern: /\bcrane\b/gi, replacement: 'handheld high angle' },
    { pattern: /low\s+dolly\b/gi, replacement: 'slow handheld walk-and-settle from fixed safe edge' },
    { pattern: /dolly\s+forward/gi, replacement: 'gentle gimbal drift forward' },
    { pattern: /dolly\s+back(ward)?/gi, replacement: 'gentle gimbal drift back' },
    { pattern: /dolly\s+along/gi, replacement: 'slow handheld walk-and-settle' },
    { pattern: /\bdolly\b/gi, replacement: 'gentle gimbal drift' },
    { pattern: /track\s+left/gi, replacement: 'small lateral handheld shift left' },
    { pattern: /track\s+right/gi, replacement: 'small lateral handheld shift right' },
    { pattern: /tracking\s+shot/gi, replacement: 'gimbal follow shot' },
    { pattern: /\btrack(ing)?\b/gi, replacement: 'gimbal follow' },
    { pattern: /\bslider\b/gi, replacement: 'compact gimbal sweep' },
    { pattern: /cable\s+cam/gi, replacement: 'gimbal arc' },
    { pattern: /\bcable\b/gi, replacement: 'gimbal' },
];

const CAMERA_SAFETY_NOTE =
    'No tracks, cranes, sliders, or floor cables in passenger walkways. Use handheld or compact gimbal only.';

function hasBannedCameraMove(text: string): boolean {
    return CAMERA_MOVE_REPLACEMENTS.some(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(text);
    });
}

function replaceBannedCameraMoves(text: string): string {
    let result = text;
    for (const { pattern, replacement } of CAMERA_MOVE_REPLACEMENTS) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, replacement);
    }
    return result;
}

export function fixCameraMoveFeasibility(brief: CampaignAestheticBrief): FixerResult {
    const KIND: AestheticOperationKind = 'normalize_camera_movements';
    if (!brief.productionBible) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'No productionBible present — nothing to fix.');
    }

    let anyChange = false;
    const updatedStoryboards: Storyboard[] = brief.productionBible.storyboards.map(storyboard => {
        const updatedShots: ShotSpec[] = storyboard.shotSequence.map(shot => {
            if (!hasBannedCameraMove(shot.cameraMovement)) return shot;
            anyChange = true;
            return { ...shot, cameraMovement: replaceBannedCameraMoves(shot.cameraMovement) };
        });
        const editingStyle = hasBannedCameraMove(storyboard.editingStyle)
            ? (() => { anyChange = true; return replaceBannedCameraMoves(storyboard.editingStyle); })()
            : storyboard.editingStyle;
        return { ...storyboard, shotSequence: updatedShots, editingStyle };
    });

    const currentGlobal = brief.productionBible.globalDirectionNotes;
    const safetyAlreadyPresent = currentGlobal.includes(CAMERA_SAFETY_NOTE);
    const updatedGlobal = safetyAlreadyPresent
        ? currentGlobal
        : `${currentGlobal} ${CAMERA_SAFETY_NOTE}`.trim();
    if (!safetyAlreadyPresent) anyChange = true;

    if (!anyChange) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'No infeasible camera movements found — already compliant.');
    }

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        productionBible: {
            ...brief.productionBible,
            storyboards: updatedStoryboards,
            globalDirectionNotes: updatedGlobal,
        },
    };
    return appliedResult(
        updatedBrief,
        KIND,
        'productionBible.storyboards',
        'Replaced crane/dolly/track/slider/cable movement language with handheld/gimbal-safe equivalents. Injected no-tracks/no-cranes/no-cables guardrail into globalDirectionNotes.',
        ['productionBible.storyboards', 'productionBible.globalDirectionNotes'],
    );
}

// ── Cabin type plausibility ───────────────────────────────────────────────────

const CONTRADICTORY_CABIN_PATTERN = /interior\b.*\bwindow|\bwindow\b.*\binterior/i;
const VALID_CABIN_REPLACEMENT = 'Oceanview stateroom';

function fixCabinText(text: string): { fixed: string; changed: boolean } {
    if (!CONTRADICTORY_CABIN_PATTERN.test(text)) return { fixed: text, changed: false };
    const fixed = text
        .replace(/interior\s+stateroom\s+desk\s+with\s+ocean[- ]?view\s+window/gi, `${VALID_CABIN_REPLACEMENT} desk`)
        .replace(/interior\s+stateroom\s+with\s+window/gi, `${VALID_CABIN_REPLACEMENT}`)
        .replace(/interior\s+cabin\s+with\s+(ocean[- ]?view\s+)?window/gi, `${VALID_CABIN_REPLACEMENT}`)
        .replace(/interior\b([^.]*?)\bwindow/gi, `${VALID_CABIN_REPLACEMENT}$1`)
        .replace(/interior\s+stateroom/gi, `${VALID_CABIN_REPLACEMENT}`);
    return { fixed, changed: fixed !== text };
}

export function fixCabinTypePlausibility(brief: CampaignAestheticBrief): FixerResult {
    const KIND: AestheticOperationKind = 'normalize_cabin_type';
    if (!brief.productionBible) {
        return noOpResult(brief, KIND, 'productionBible.sceneLibrary', 'No productionBible present — nothing to fix.');
    }

    let anyChange = false;

    const updatedSceneLibrary: SceneSpec[] = brief.productionBible.sceneLibrary.map(scene => {
        const locResult = fixCabinText(scene.location);
        const envResult = fixCabinText(scene.environmentDetails);
        const imgResult = fixCabinText(scene.imagePrompt);
        if (locResult.changed || envResult.changed || imgResult.changed) {
            anyChange = true;
            return {
                ...scene,
                location: locResult.fixed,
                environmentDetails: envResult.fixed,
                imagePrompt: imgResult.fixed,
            };
        }
        return scene;
    });

    const updatedStoryboards: Storyboard[] = brief.productionBible.storyboards.map(storyboard => {
        const updatedShots: ShotSpec[] = storyboard.shotSequence.map(shot => {
            const narResult = fixCabinText(shot.narrationSegment);
            const subResult = fixCabinText(shot.subjectMotion);
            const beatResult = fixCabinText(shot.emotionalBeat);
            if (narResult.changed || subResult.changed || beatResult.changed) {
                anyChange = true;
                return {
                    ...shot,
                    narrationSegment: narResult.fixed,
                    subjectMotion: subResult.fixed,
                    emotionalBeat: beatResult.fixed,
                };
            }
            return shot;
        });
        const narResult = fixCabinText(storyboard.narrationScript);
        if (narResult.changed) anyChange = true;
        return { ...storyboard, shotSequence: updatedShots, narrationScript: narResult.changed ? narResult.fixed : storyboard.narrationScript };
    });

    if (!anyChange) {
        return noOpResult(brief, KIND, 'productionBible.sceneLibrary', 'No interior+window contradictions found — cabin types already valid.');
    }

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        productionBible: {
            ...brief.productionBible,
            sceneLibrary: updatedSceneLibrary,
            storyboards: updatedStoryboards,
        },
    };
    return appliedResult(
        updatedBrief,
        KIND,
        'productionBible.sceneLibrary',
        `Resolved interior+window cabin contradictions to "${VALID_CABIN_REPLACEMENT}" across sceneLibrary and storyboard shot text.`,
        ['productionBible.sceneLibrary', 'productionBible.storyboards'],
    );
}

// ── Gangway exchange prohibited ───────────────────────────────────────────────

const GANGWAY_EXCHANGE_PATTERN = /\b(exchanges?|handoffs?|hand[-\s]off|greetings?|hand\s+off|trades?)\b/i;
const GANGWAY_LOCATION_PATTERN = /\bgangway\b/i;
const COMPLIANT_LOCATION = 'dockside away from the boarding area, clear of primary ingress/egress flow';
const GANGWAY_RULE_NOTE =
    'No exchanges, greetings, or handoffs on gangways or in primary embark/disembark flow paths.';

function isGangwayExchangeScene(text: string): boolean {
    return GANGWAY_EXCHANGE_PATTERN.test(text) && GANGWAY_LOCATION_PATTERN.test(text);
}

function relocateGangwayText(text: string): string {
    return text
        .replace(/\bon\s+the\s+gangway\b/gi, `at ${COMPLIANT_LOCATION}`)
        .replace(/\bat\s+the\s+gangway\b/gi, `at ${COMPLIANT_LOCATION}`)
        .replace(/\balong\s+the\s+gangway\b/gi, `at ${COMPLIANT_LOCATION}`)
        .replace(/\bgangway\b/gi, COMPLIANT_LOCATION);
}

export function fixGangwayExchangeProhibited(brief: CampaignAestheticBrief): FixerResult {
    const KIND: AestheticOperationKind = 'remove_or_relocate_scene_beat';
    if (!brief.productionBible) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'No productionBible present — nothing to fix.');
    }

    let anyChange = false;

    const updatedStoryboards: Storyboard[] = brief.productionBible.storyboards.map(storyboard => {
        const updatedShots: ShotSpec[] = storyboard.shotSequence.map(shot => {
            const needsFix = isGangwayExchangeScene(shot.narrationSegment)
                || isGangwayExchangeScene(shot.subjectMotion)
                || isGangwayExchangeScene(shot.emotionalBeat);
            if (!needsFix) return shot;
            anyChange = true;
            return {
                ...shot,
                narrationSegment: relocateGangwayText(shot.narrationSegment),
                subjectMotion: relocateGangwayText(shot.subjectMotion),
                emotionalBeat: relocateGangwayText(shot.emotionalBeat),
            };
        });
        const narNeedsFix = isGangwayExchangeScene(storyboard.narrationScript);
        if (narNeedsFix) anyChange = true;
        return {
            ...storyboard,
            shotSequence: updatedShots,
            narrationScript: narNeedsFix ? relocateGangwayText(storyboard.narrationScript) : storyboard.narrationScript,
        };
    });

    const currentGlobal = brief.productionBible.globalDirectionNotes;
    const ruleAlreadyPresent = currentGlobal.includes(GANGWAY_RULE_NOTE);
    const updatedGlobal = ruleAlreadyPresent
        ? currentGlobal
        : `${currentGlobal} ${GANGWAY_RULE_NOTE}`.trim();
    if (!ruleAlreadyPresent) anyChange = true;

    if (!anyChange) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'No gangway exchange scenes found — already compliant.');
    }

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        productionBible: {
            ...brief.productionBible,
            storyboards: updatedStoryboards,
            globalDirectionNotes: updatedGlobal,
        },
    };
    return appliedResult(
        updatedBrief,
        KIND,
        'productionBible.storyboards',
        'Relocated gangway exchange/handoff scenes to compliant dockside location. Injected no-exchanges-on-gangways rule into globalDirectionNotes.',
        ['productionBible.storyboards', 'productionBible.globalDirectionNotes'],
    );
}

// ── Storyboard duration alignment ─────────────────────────────────────────────

const DELIVERABLE_TO_VIDEO_CONCEPT = {
    tiktok_seed: 'tiktokSeed',
    hero_explainer: 'heroExplainer',
    threshold_announcement: 'thresholdAnnouncement',
    merch_reveal: 'merchReveal',
} as const satisfies Record<string, keyof CampaignAestheticBrief['videoConcepts']>;

type NamedDeliverableId = keyof typeof DELIVERABLE_TO_VIDEO_CONCEPT;

function isNamedDeliverableId(id: string): id is NamedDeliverableId {
    return id in DELIVERABLE_TO_VIDEO_CONCEPT;
}

function rebalanceShotDurations(shots: ShotSpec[], targetTotal: number): ShotSpec[] {
    if (shots.length === 0) return shots;
    const perShot = Math.floor(targetTotal / shots.length);
    const remainder = targetTotal - perShot * shots.length;
    return shots.map((shot, idx) => ({
        ...shot,
        durationSeconds: perShot + (idx < remainder ? 1 : 0),
    }));
}

export function fixStoryboardDurationAlignment(brief: CampaignAestheticBrief): FixerResult {
    const KIND: AestheticOperationKind = 'align_storyboard_durations';
    if (!brief.productionBible) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'No productionBible present — nothing to fix.');
    }

    let anyChange = false;

    const updatedStoryboards: Storyboard[] = brief.productionBible.storyboards.map(storyboard => {
        if (!isNamedDeliverableId(storyboard.deliverableId)) return storyboard;
        const conceptKey = DELIVERABLE_TO_VIDEO_CONCEPT[storyboard.deliverableId];
        const authoritativeDuration = brief.videoConcepts[conceptKey].durationSeconds;
        if (storyboard.totalDurationSeconds === authoritativeDuration) return storyboard;
        anyChange = true;
        const rebalancedShots = rebalanceShotDurations(storyboard.shotSequence, authoritativeDuration);
        return {
            ...storyboard,
            totalDurationSeconds: authoritativeDuration,
            shotSequence: rebalancedShots,
        };
    });

    if (!anyChange) {
        return noOpResult(brief, KIND, 'productionBible.storyboards', 'All storyboard durations already match videoConcepts — no alignment needed.');
    }

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        productionBible: { ...brief.productionBible, storyboards: updatedStoryboards },
    };
    return appliedResult(
        updatedBrief,
        KIND,
        'productionBible.storyboards',
        'Aligned storyboard totalDurationSeconds to videoConcepts authoritative durations. Rebalanced per-shot durations proportionally.',
        ['productionBible.storyboards'],
    );
}

// ── Production safety ops missing ────────────────────────────────────────────

const PASSENGER_SAFETY_OPS_BUNDLE =
    'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.';

const WALKWAY_SCENE_PATTERN = /\b(gangway|walkway|promenade|corridor|passageway|atrium)\b/i;

function isWalkwaySensitiveStoryboard(storyboard: Storyboard): boolean {
    if (WALKWAY_SCENE_PATTERN.test(storyboard.narrationScript)) return true;
    if (WALKWAY_SCENE_PATTERN.test(storyboard.editingStyle)) return true;
    return storyboard.shotSequence.some(
        shot =>
            WALKWAY_SCENE_PATTERN.test(shot.subjectMotion) ||
            WALKWAY_SCENE_PATTERN.test(shot.narrationSegment) ||
            WALKWAY_SCENE_PATTERN.test(shot.emotionalBeat),
    );
}

export function fixProductionSafetyOpsMissing(brief: CampaignAestheticBrief): FixerResult {
    const KIND: AestheticOperationKind = 'inject_production_safety_ops';
    if (!brief.productionBible) {
        return noOpResult(brief, KIND, 'productionBible.globalDirectionNotes', 'No productionBible present — nothing to fix.');
    }

    let anyChange = false;

    const currentGlobal = brief.productionBible.globalDirectionNotes;
    const globalAlreadyPresent = currentGlobal.includes(PASSENGER_SAFETY_OPS_BUNDLE);
    const updatedGlobal = globalAlreadyPresent
        ? currentGlobal
        : `${currentGlobal} ${PASSENGER_SAFETY_OPS_BUNDLE}`.trim();
    if (!globalAlreadyPresent) anyChange = true;

    const updatedStoryboards: Storyboard[] = brief.productionBible.storyboards.map(storyboard => {
        if (!isWalkwaySensitiveStoryboard(storyboard)) return storyboard;
        if (storyboard.editingStyle.includes(PASSENGER_SAFETY_OPS_BUNDLE)) return storyboard;
        anyChange = true;
        return {
            ...storyboard,
            editingStyle: `${storyboard.editingStyle} | Ops: ${PASSENGER_SAFETY_OPS_BUNDLE}`.trim(),
        };
    });

    if (!anyChange) {
        return noOpResult(brief, KIND, 'productionBible.globalDirectionNotes', 'Production safety ops bundle already present in all required locations.');
    }

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        productionBible: {
            ...brief.productionBible,
            globalDirectionNotes: updatedGlobal,
            storyboards: updatedStoryboards,
        },
    };
    return appliedResult(
        updatedBrief,
        KIND,
        'productionBible.globalDirectionNotes',
        'Injected passenger-area capture ops bundle into globalDirectionNotes and walkway-sensitive storyboard editingStyle fields.',
        ['productionBible.globalDirectionNotes', 'productionBible.storyboards'],
    );
}
