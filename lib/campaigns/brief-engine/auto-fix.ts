import type { CampaignAestheticBrief } from '../schema';
import type { ValidationIssue } from './validation';

// ────────────────────────────────────────────────────────────────────────────
// One-strike deterministic auto-fix layer
// Applies cheap, safe fixes for known issue codes. No LLM calls. No loops.
// ────────────────────────────────────────────────────────────────────────────

const REQUIRED_SAFETY_OPS = 'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.';

function replaceProblematicPhrases(value: string): string {
    return value
        .replace(/\bworkshop\b/gi, 'hangout')
        .replace(/\bsalon\b/gi, 'conversation')
        .replace(/hosted session/gi, 'casual meetup')
        .replace(/event[- ]program/gi, 'shared ship rhythm')
        .replace(/managed program/gi, 'shared ship energy')
        .replace(/quiet-luxe/gi, 'warm and relaxed')
        .replace(/elevated salon/gi, 'easy conversation')
        .replace(/elevated conversation/gi, 'easy conversation')
        .replace(/collector-grade/gi, 'keepsake-friendly')
        .replace(/rarefied/gi, 'welcoming');
}

function deepRewriteStrings<T>(value: T): T {
    if (typeof value === 'string') {
        return replaceProblematicPhrases(normalizeCameraMovements(replaceGangwayChoreography(value))) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => deepRewriteStrings(item)) as T;
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, deepRewriteStrings(nested)]),
        ) as T;
    }
    return value;
}

function normalizeCameraMovements(text: string): string {
    return text
        .replace(/\bcrane\b/gi, 'handheld high angle')
        .replace(/\bdolly\b/gi, 'gentle gimbal drift')
        .replace(/\btracking shot\b/gi, 'gimbal follow shot')
        .replace(/\bslider\b/gi, 'compact gimbal sweep')
        .replace(/\bcable[- ]?cam\b/gi, 'gimbal arc');
}

function replaceGangwayChoreography(text: string): string {
    return text
        .replace(/gangway\s+exchanges?/gi, 'dockside greetings')
        .replace(/gangway\s+handoffs?/gi, 'dockside moments')
        .replace(/gangway\s+choreograph\w*/gi, 'dockside flow')
        .replace(/\bgangway\b/gi, 'port-side walkway')
        .replace(/\bhandoffs?\b/gi, 'shared moments')
        .replace(/\bchoreograph\w*\b/gi, 'natural');
}

interface AutoFixResult {
    brief: CampaignAestheticBrief;
    fixedCodes: string[];
    unfixableCodes: string[];
}

export function applyAutoFixes(brief: CampaignAestheticBrief, issues: ValidationIssue[]): AutoFixResult {
    const autoFixableIssues = issues.filter((i) => i.autoFixable);
    const unfixableIssues = issues.filter((i) => !i.autoFixable && i.severity === 'blocker');

    if (autoFixableIssues.length === 0) {
        return { brief, fixedCodes: [], unfixableCodes: unfixableIssues.map((i) => i.code) };
    }

    let fixed = deepRewriteStrings(brief);
    const fixedCodes: string[] = [];

    for (const issue of autoFixableIssues) {
        switch (issue.code) {
            case 'workshop_language_survives':
            case 'exclusive_lifestyle_language':
                // Already handled by deepRewriteStrings above
                fixedCodes.push(issue.code);
                break;

            case 'optionality_language_missing':
                fixed = {
                    ...fixed,
                    communityExpression: {
                        ...fixed.communityExpression,
                        participationStyle: 'Entirely optional and low-pressure. Join for a moment, drift out whenever you want, or skip it completely without missing anything.',
                        copyFramingRule: 'Use explicitly optional language: join if you like, stay for a minute, or keep moving without missing anything.',
                    },
                };
                fixedCodes.push(issue.code);
                break;

            case 'hero_slogan_too_long': {
                const trimmed = fixed.messaging.heroSlogan.split(/\s+/).filter(Boolean).slice(0, 6).join(' ').replace(/[\s.,;:!?-]+$/, '');
                fixed = { ...fixed, messaging: { ...fixed.messaging, heroSlogan: trimmed || fixed.messaging.heroSlogan } };
                fixedCodes.push(issue.code);
                break;
            }

            case 'merch_not_tshirt_first':
                fixed = { ...fixed, merch: { ...fixed.merch, coreItem: { ...fixed.merch.coreItem, productType: 'T-Shirt' } } };
                fixedCodes.push(issue.code);
                break;

            case 'camera_move_feasibility':
                if (fixed.productionBible) {
                    fixed = {
                        ...fixed,
                        productionBible: {
                            ...fixed.productionBible,
                            sceneLibrary: fixed.productionBible.sceneLibrary.map((scene) => ({
                                ...scene,
                                cameraAngle: normalizeCameraMovements(scene.cameraAngle),
                                imagePrompt: normalizeCameraMovements(scene.imagePrompt),
                            })),
                            storyboards: fixed.productionBible.storyboards.map((sb) => ({
                                ...sb,
                                editingStyle: normalizeCameraMovements(sb.editingStyle),
                                shotSequence: sb.shotSequence.map((shot) => ({
                                    ...shot,
                                    cameraMovement: normalizeCameraMovements(shot.cameraMovement),
                                })),
                            })),
                        },
                    };
                }
                fixedCodes.push(issue.code);
                break;

            case 'storyboard_duration_alignment':
                if (fixed.productionBible) {
                    fixed = {
                        ...fixed,
                        productionBible: {
                            ...fixed.productionBible,
                            storyboards: fixed.productionBible.storyboards.map((sb) => {
                                const shotSum = sb.shotSequence.reduce((sum, s) => sum + s.durationSeconds, 0);
                                if (shotSum !== sb.totalDurationSeconds) {
                                    return { ...sb, totalDurationSeconds: shotSum };
                                }
                                return sb;
                            }),
                        },
                    };
                }
                fixedCodes.push(issue.code);
                break;

            case 'production_safety_ops_missing':
                if (fixed.productionBible) {
                    const notes = fixed.productionBible.globalDirectionNotes;
                    fixed = {
                        ...fixed,
                        productionBible: {
                            ...fixed.productionBible,
                            globalDirectionNotes: notes.includes(REQUIRED_SAFETY_OPS) ? notes : `${REQUIRED_SAFETY_OPS} ${notes}`,
                        },
                    };
                }
                fixedCodes.push(issue.code);
                break;

            case 'cabin_type_plausibility':
                if (fixed.productionBible) {
                    fixed = {
                        ...fixed,
                        productionBible: {
                            ...fixed.productionBible,
                            sceneLibrary: fixed.productionBible.sceneLibrary.map((scene) => {
                                const text = `${scene.location} ${scene.environmentDetails}`;
                                if (/interior/i.test(text) && /ocean[- ]?view|window/i.test(text)) {
                                    return { ...scene, location: scene.location.replace(/interior\s+stateroom/gi, 'Oceanview stateroom') };
                                }
                                return scene;
                            }),
                        },
                    };
                }
                fixedCodes.push(issue.code);
                break;

            case 'gangway_exchange_prohibited':
                if (fixed.productionBible) {
                    fixed = {
                        ...fixed,
                        productionBible: {
                            ...fixed.productionBible,
                            sceneLibrary: fixed.productionBible.sceneLibrary.map((scene) => ({
                                ...scene,
                                location: replaceGangwayChoreography(scene.location),
                                subjectAction: replaceGangwayChoreography(scene.subjectAction),
                                environmentDetails: replaceGangwayChoreography(scene.environmentDetails),
                                imagePrompt: replaceGangwayChoreography(scene.imagePrompt),
                            })),
                            storyboards: fixed.productionBible.storyboards.map((sb) => ({
                                ...sb,
                                narrationScript: replaceGangwayChoreography(sb.narrationScript),
                                shotSequence: sb.shotSequence.map((shot) => ({
                                    ...shot,
                                    narrationSegment: replaceGangwayChoreography(shot.narrationSegment),
                                })),
                            })),
                        },
                    };
                }
                fixedCodes.push(issue.code);
                break;

            default:
                break;
        }
    }

    return { brief: fixed, fixedCodes, unfixableCodes: unfixableIssues.map((i) => i.code) };
}
