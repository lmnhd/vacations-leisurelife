import { CampaignAestheticBrief, SceneSpec, ShotSpec } from '../schema';
import { RUNWAYML_CONFIG } from './media-pipeline-config';

export type MotionRiskLevel = 'low' | 'medium' | 'high';

export interface StoryboardShotDiagnostic {
    hasVisiblePeople: boolean;
    riskLevel: MotionRiskLevel;
    riskFlags: string[];
    recommendedSourceImageDirection: string;
}

const HUMAN_PRESENCE_PATTERN = /\b(guest|guests|traveler|travellers|person|people|friend|friends|couple|pair|bartender|server|figure|figures|silhouette|hand|hands|face|faces|shoulder|shoulders|smile|smiles|eye contact|side-by-side|side profile|woman|man|host)\b/i;
const RISKY_HUMAN_MOTION_PATTERN = /\b(walk(?:ing)?|run(?:ning)?|dance(?:ing)?|spin(?:ning)?|twirl(?:ing)?|jump(?:ing)?|clink(?:ing)?|sip(?:ping)?|drink(?:ing)?|raise(?:ing)?|toast(?:ing)?|hug(?:ging)?|embrac(?:e|ing)|kiss(?:ing)?|pass(?:ing)?|exchange|pour(?:ing)?|stir(?:ring)?|mix(?:ing)?|serve(?:ing)?|page turn(?:ing)?|flip(?:ping)?|shuffle(?:ing)?|deal(?:ing)?|gesture(?:ing)?|wave(?:ing)?|applaud(?:ing)?)\b/i;
const FOREGROUND_HUMAN_PATTERN = /\b(close(?: |-)?up|closeup|portrait|tight(?: crop)?|intimate|hero framing|hero shot|single subject|single clear focal subject|featured subject|foreground|face-led|hands? dominant|eye contact|three-quarter)\b/i;
const OBJECT_INTERACTION_PATTERN = /\b(glass|cup|drink|card|dice|token|notebook|sample jar|binocular|camera|phone|instrument|menu|prop)\b/i;
const ANCHORED_HUMAN_PATTERN = /\b(seated|sitting|rail-side|rail side|leaning|resting|side-profile|side profile|silhouette|over-the-shoulder|over the shoulder|anchored|settled|still|calm posture|back turned)\b/i;
const ENVIRONMENT_LED_PATTERN = /\b(wide|medium-wide|establishing|horizon|ocean|ship architecture|deck lines|negative space|reflection|reflections|sea-facing|environment-led)\b/i;
const RUNWAY_GUARDRAIL_RESERVE = 180;
const STORYBOARD_PROMPT_BUDGET = Math.max(180, RUNWAYML_CONFIG.motionPromptMaxChars - RUNWAY_GUARDRAIL_RESERVE);

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function shorten(value: string, maxChars: number): string {
    const normalized = normalizeText(value);
    if (normalized.length <= maxChars) {
        return normalized;
    }

    if (maxChars <= 1) {
        return normalized.slice(0, maxChars);
    }

    return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function firstSentence(value: string): string {
    const normalized = normalizeText(value);
    const sentence = normalized.split(/[.!?]/)[0] ?? normalized;
    return sentence.trim();
}

function buildCombinedShotText(shot: ShotSpec, scene?: SceneSpec): string {
    return [
        shot.cameraMovement,
        shot.subjectMotion,
        shot.environmentMotion,
        shot.emotionalBeat,
        shot.narrationSegment,
        scene?.subjectAction,
        scene?.imagePrompt,
        scene?.environmentDetails,
        scene?.cameraAngle,
    ]
        .filter(Boolean)
        .join(' ');
}

export function joinSegmentsWithinLimit(segments: readonly string[], maxChars: number): string {
    let result = '';

    for (const segment of segments) {
        const normalized = normalizeText(segment);
        if (!normalized) {
            continue;
        }

        if (!result) {
            result = normalized.length <= maxChars ? normalized : shorten(normalized, maxChars);
            if (result.length >= maxChars) {
                break;
            }
            continue;
        }

        const candidate = `${result}. ${normalized}`;
        if (candidate.length <= maxChars) {
            result = candidate;
            continue;
        }

        const remaining = maxChars - result.length - 2;
        if (remaining > 24) {
            result = `${result}. ${shorten(normalized, remaining)}`;
        }
        break;
    }

    return result;
}

export function shotHasVisiblePeople(shot: ShotSpec, scene?: SceneSpec): boolean {
    return HUMAN_PRESENCE_PATTERN.test(buildCombinedShotText(shot, scene));
}

export function sceneHasVisiblePeople(scene: SceneSpec): boolean {
    return HUMAN_PRESENCE_PATTERN.test([
        scene.subjectAction,
        scene.imagePrompt,
        scene.environmentDetails,
        scene.cameraAngle,
    ].join(' '));
}

export function analyzeStoryboardShot(shot: ShotSpec, scene?: SceneSpec): StoryboardShotDiagnostic {
    const combinedText = buildCombinedShotText(shot, scene);
    const hasVisiblePeople = shotHasVisiblePeople(shot, scene);

    if (!hasVisiblePeople) {
        return {
            hasVisiblePeople: false,
            riskLevel: 'low',
            riskFlags: [],
            recommendedSourceImageDirection: 'Use an environment-led frame with layered ship architecture, water, reflections, and negative space so motion can come from atmosphere instead of anatomy.',
        };
    }

    const riskFlags: string[] = ['human-visible'];
    let score = 2;

    if (RISKY_HUMAN_MOTION_PATTERN.test(combinedText)) {
        riskFlags.push('complex-human-motion');
        score += 2;
    }

    if (FOREGROUND_HUMAN_PATTERN.test(combinedText)) {
        riskFlags.push('foreground-human-framing');
        score += 2;
    }

    if (OBJECT_INTERACTION_PATTERN.test(combinedText)) {
        riskFlags.push('object-interaction');
        score += 1;
    }

    if (!ANCHORED_HUMAN_PATTERN.test(combinedText)) {
        riskFlags.push('unanchored-posture');
        score += 1;
    }

    if (!ENVIRONMENT_LED_PATTERN.test(combinedText)) {
        riskFlags.push('weak-environment-anchor');
        score += 1;
    }

    const riskLevel: MotionRiskLevel = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
    const recommendedSourceImageDirection = riskLevel === 'high'
        ? 'Avoid human-led source frames. Use ship-first, environment-led compositions with no dominant foreground people; if people remain, they must be tiny background silhouettes with no handheld props.'
        : riskLevel === 'medium'
        ? 'Push people out of focus and away from the foreground; prefer rail-side silhouettes or over-the-shoulder background figures while the ship, sea, and light carry the frame.'
        : 'Keep people incidental only, never the focal subject; the frame should still read as ship-and-sea first.';

    return {
        hasVisiblePeople,
        riskLevel,
        riskFlags,
        recommendedSourceImageDirection,
    };
}

function normalizeCameraMovement(cameraMovement: string, hasVisiblePeople: boolean): string {
    const normalizedMovement = normalizeText(cameraMovement) || 'slow cinematic drift anchored to the original framing';
    return hasVisiblePeople
        ? `${shorten(normalizedMovement, 64)}; camera-only movement, no subject-driven motion`
        : `${shorten(normalizedMovement, 64)}; let depth and atmosphere carry the motion`;
}

function normalizeSubjectMotion(subjectMotion: string, diagnostic: StoryboardShotDiagnostic): string {
    const normalizedMotion = normalizeText(subjectMotion);

    if (!diagnostic.hasVisiblePeople) {
        return normalizedMotion || 'subjects stay visually stable';
    }

    if (!normalizedMotion || diagnostic.riskFlags.includes('complex-human-motion') || diagnostic.riskFlags.includes('object-interaction')) {
        return 'freeze all visible people completely; no walking, hand motion, sipping, head turns, or limb movement';
    }

    return `ignore requested human action "${shorten(normalizedMotion, 36)}" and freeze all visible people completely`;
}

function normalizeEnvironmentMotion(environmentMotion: string, hasVisiblePeople: boolean): string {
    const fallbackMotion = hasVisiblePeople
        ? 'sea shimmer, reflections, clouds, steam, and changing light'
        : 'sea shimmer, reflections, fabric lift, and changing light';
    const normalizedMotion = normalizeText(environmentMotion) || fallbackMotion;
    return `${shorten(normalizedMotion, 72)}; no scene replacement`;
}

function buildSourceAnchor(scene: SceneSpec | undefined, diagnostic: StoryboardShotDiagnostic): string {
    if (!scene) {
        return 'Preserve the exact source frame, identities, ship architecture, and horizon.';
    }

    const sceneSummary = shorten(firstSentence(scene.imagePrompt) || `${scene.location} at ${scene.timeOfDay}`, 110);

    if (!diagnostic.hasVisiblePeople) {
        return `Source frame: ${sceneSummary}; keep the ship, sea, and light exactly as shown.`;
    }

    const humanPlacement = diagnostic.riskLevel === 'high'
        ? 'Keep people tiny, backgrounded, and never dominant in the foreground; no handheld props, mugs, glasses, or object interaction'
        : 'Keep people incidental, backgrounded, and out of focal prominence';

    return `Source frame: ${sceneSummary}; ${humanPlacement}; preserve ship identity, sea line, and subject identity exactly.`;
}

export function buildStoryboardShotPrompt(
    shot: ShotSpec,
    brief: CampaignAestheticBrief,
    scene: SceneSpec | undefined,
): string {
    const diagnostic = analyzeStoryboardShot(shot, scene);
    const cameraMovement = normalizeCameraMovement(shot.cameraMovement, diagnostic.hasVisiblePeople);
    const subjectMotion = normalizeSubjectMotion(shot.subjectMotion, diagnostic);
    const environmentMotion = normalizeEnvironmentMotion(shot.environmentMotion, diagnostic.hasVisiblePeople);
    const emotionalBeat = shorten(normalizeText(shot.emotionalBeat), 56);
    const colorAndLight = shorten(`${brief.visual.colorPalette.primary}, ${brief.visual.colorPalette.accent}, ${brief.visual.lightingStyle}`, 64);
    const sourceImageDirection = shorten(diagnostic.recommendedSourceImageDirection, 110);

    return joinSegmentsWithinLimit([
        buildSourceAnchor(scene, diagnostic),
        `Camera: ${cameraMovement}`,
        `People: ${subjectMotion}`,
        `Environment: ${environmentMotion}`,
        `Feeling: ${emotionalBeat}`,
        `Look: ${colorAndLight}`,
        `Source image direction: ${sourceImageDirection}`,
        'Avoid parallax, warped anatomy, extra limbs, prop duplication, mugs with altered geometry, or scene swaps',
    ], STORYBOARD_PROMPT_BUDGET);
}