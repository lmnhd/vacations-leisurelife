import { randomUUID } from 'crypto';
import { CampaignAestheticBrief, LandingStillSpec, ShipReferenceCandidate, SceneSpec } from '../../schema';
import { NANO_BANANA_CONFIG } from '../media-pipeline-config';
import sharp from 'sharp';
import { buildShipLandscapeGuardrails } from '../ship-environment-profile';
import { sceneHasVisiblePeople, stillHasVisiblePeople } from '../storyboard-motion-policy';
import { resolveMediaStyle, type StyleId } from '../style-prompts';

const NANO_BANANA_PROMPT_CHAR_LIMIT = 6000;
const NANO_BANANA_REFERENCE_MAX_DIMENSION = 1280;
const NANO_BANANA_REFERENCE_JPEG_QUALITY = 70;
const NANO_BANANA_MAX_ATTEMPTS = 3;
const NANO_BANANA_RETRY_DELAY_MS = 1200;
const REMOTE_FETCH_TIMEOUT_MS = 90000;

// ────────────────────────────────────────────────────────────────────────────
// Stability AI Image Generator
// Primary hero image + aesthetic concept art generation.
// All settings controlled via STABILITY_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set in environment');
    return key;
}

function trimPromptForNanoBanana(prompt: string): string {
    if (prompt.length <= NANO_BANANA_PROMPT_CHAR_LIMIT) {
        return prompt;
    }

    return `${prompt.slice(0, NANO_BANANA_PROMPT_CHAR_LIMIT - 32).trimEnd()}... [truncated]`;
}

async function optimizeReferenceImageForNanoBanana(
    sourceBuffer: Buffer,
    sourceMimeType?: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!sourceMimeType?.startsWith('image/')) {
        return null;
    }

    try {
        const pipeline = sharp(sourceBuffer).rotate();
        const metadata = await pipeline.metadata();
        const width = metadata.width ?? NANO_BANANA_REFERENCE_MAX_DIMENSION;
        const height = metadata.height ?? NANO_BANANA_REFERENCE_MAX_DIMENSION;

        const needsResize = Math.max(width, height) > NANO_BANANA_REFERENCE_MAX_DIMENSION;
        const normalizedPipeline = needsResize
            ? pipeline.resize({
                width: NANO_BANANA_REFERENCE_MAX_DIMENSION,
                height: NANO_BANANA_REFERENCE_MAX_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            })
            : pipeline;

        const hasAlpha = metadata.hasAlpha === true;
        if (hasAlpha && sourceMimeType === 'image/png') {
            return {
                buffer: await normalizedPipeline.png({ compressionLevel: 9, palette: true }).toBuffer(),
                mimeType: 'image/png',
            };
        }

        return {
            buffer: await normalizedPipeline.jpeg({ quality: NANO_BANANA_REFERENCE_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
            mimeType: 'image/jpeg',
        };
    } catch (error) {
        console.warn('Skipping unusable Nano-Banana reference image', {
            sourceMimeType,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function fetchUsableReferenceImage(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const response = await fetchWithTimeout(url, {}, REMOTE_FETCH_TIMEOUT_MS);
        if (!response.ok) {
            return null;
        }

        const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
        if (!mimeType.startsWith('image/')) {
            return null;
        }

        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            mimeType,
        };
    } catch (error) {
        console.warn('Failed to fetch reference image for generation', {
            url,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Derives prop allowance rules from the campaign's own plausibility framework.
 * When the brief names allowed props, those specific cues are permitted as incidental
 * details. When no props are listed the rule is a generic "no prop required" without
 * suppressing any particular category of object.
 */
function buildPropAllowanceRules(allowedProps: readonly string[]): string[] {
    if (allowedProps.length > 0) {
        const topProps = allowedProps.slice(0, 3).join(', ');
        return [
            `Approved incidental cue for this campaign: ${topProps} — one may appear as a small background detail`,
            'Keep any approved prop secondary — ship, sea, people, and light carry the frame first',
            'One cue maximum; never spread multiple props or arrange a tabletop display',
            'The prop appears only after the ship and human moment are already working without it',
            'Skip the prop entirely when setting and people already read clearly on their own',
        ];
    }
    return [
        'No specific prop cue required for this frame',
        'If any object appears, keep it nearly subliminal and never the visual anchor',
        'Ship environment, human moment, and light must read clearly before any object',
        'Object is optional and only appears after ship and people are already carrying the frame',
        'Prefer a prop-free composition unless one small detail clearly improves believability',
    ];
}

function buildHeroPrompts(brief: CampaignAestheticBrief, shipName: string): string[] {
    const { imageryMood, lightingStyle, compositionNotes } = brief.visual;
    const casting = brief.visual.humanRepresentation;
    const docDirection = brief.landingStillBible?.globalDirectionNotes
        ?? brief.productionBible?.globalDirectionNotes
        ?? compositionNotes;
    const landscapeGuardrails = buildShipLandscapeGuardrails(shipName);
    const plausibility = brief.visual.plausibilityFramework;
    const allowedPropsText = plausibility.allowedProps.slice(0, 5).join(', ');
    const discouragedPropsText = plausibility.discouragedProps.slice(0, 5).join(', ');
    const implausibleText = plausibility.implausibleLiteralizations.slice(0, 5).join(', ');
    const stagedEventAvoidText = 'visible stages, risers, performance platforms, PA speakers, drum kits, full bands, formal concerts, organized demonstrations, workshops, staged activity setups, literal onboard niche events';
    const nicheMoments = plausibility.nicheEnhancedMoments;
    const visualFlavor = brief.identityBlueprint?.visualFlavor;
    const nonObjectSignals = [
        'signal the niche through side-by-side ease, shared attention, and relaxed timing',
        'use wardrobe texture, color accents, or subtle personal styling before any explicit prop',
        'let seat choice, body angle, and window-facing posture carry the niche mood',
        'favor environmental storytelling through architecture, rail lines, harbor light, and ship atmosphere',
        'show quiet familiarity, anticipation, or low-pressure companionship rather than explicit prop display',
    ];
    const cueStrategies = [
        'express the niche through easy two-person chemistry or a shared glance first, before any staged arrangement',
        'favor wardrobe or carry-on identity cues over handheld objects',
        'if a prop appears, keep it singular, incidental, and secondary to the travel moment',
        'let the niche read through posture, pacing, and quiet companionship rather than gear',
        'use environmental or styling cues before object cues whenever possible',
    ];
    const propAllowanceRules = buildPropAllowanceRules(plausibility.allowedProps);

    const landingStillSpecs = selectHeroLandingStillSpecs(brief);
    if (landingStillSpecs.length > 0) {
        return landingStillSpecs.map((still, index) => {
            const cueStrategy = cueStrategies[index % cueStrategies.length];
            const nicheMoment = nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle shared niche energy within an ordinary cruise moment';
            const heroVariant = getHeroShotVariant(index);
            const resolvedStyle = resolveMediaStyle({
                assetKind: 'hero',
                hasPeople: stillHasVisiblePeople(still),
                seed: still.stillId,
                themeAnchorProps: plausibility.allowedProps.slice(0, 2),
                visualFlavor,
            });

            return [
                `Primary image blueprint from approved Landing Still Bible: ${still.imagePrompt}`,
                `On ${shipName}`,
                `Still usage: ${still.usage}`,
                `Still action: ${still.subjectAction}`,
                `Still location: ${still.location}`,
                `Still mood: ${still.mood}`,
                `Reference category: ${still.referenceCategory}`,
                `Overall direction: ${buildTravelFirstHeroDirection(brief, shipName)}`,
                resolvedStyle.allowPhotographicReinforcers ? `Atmosphere: ${docDirection}` : '',
                resolvedStyle.allowPhotographicReinforcers ? `Lighting: ${still.lighting || lightingStyle}` : '',
                resolvedStyle.allowPhotographicReinforcers ? `Composition: ${still.composition || compositionNotes}` : '',
                `Plausibility rule: ${plausibility.governingPrinciple}`,
                `Niche cue strategy: ${cueStrategy}`,
                `Believable niche moment: ${nicheMoment}`,
                `Hero shot type: ${heroVariant.label}`,
                `Variation bias: ${heroVariant.cameraBias}`,
                `Time-of-day bias: ${heroVariant.temporalBias}`,
                `Staging bias: ${heroVariant.stagingBias}`,
                `Hero framing: ${heroVariant.framing}`,
                `Layout: 35-45% intentional negative space for headline and CTA, clean horizon, uncluttered edges`,
                `People count: 1-3 max, no crowds, no dense group scenes`,
                `Casting goal: ${casting.castingGoal}`,
                `Age guidance: ${casting.ageRangeGuidance}`,
                `Diversity guidance: ${casting.diversityIntent}`,
                `Pairing guidance: ${casting.pairingGuidance}`,
                `Styling guidance: ${casting.stylingGuidance}`,
                `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}`,
                allowedPropsText ? `Believable cues: ${allowedPropsText}` : '',
                `Ship realism: hard marine deck surfaces, railings, teak, metal, glass, pool tile, ocean horizon, and real vessel architecture only`,
                landscapeGuardrails.reality,
                resolvedStyle.promptBlock,
                `Avoid: generic cruise imagery, over-polished styling, empty luxury, staged poses, busy signage, dense props, the same niche prop repeated in every frame, visual clutter, ${stagedEventAvoidText}, ${landscapeGuardrails.avoid}, resort cabanas, suburban furniture, ${discouragedPropsText || 'clinical or industrial props inconsistent with cruise leisure'}, ${implausibleText || 'equipment-heavy demos, classroom scenes, formal workshop setups'}`,
            ].filter(Boolean).join('. ');
        });
    }

    const productionBibleScenes = selectHeroSourceScenes(brief);
    if (productionBibleScenes.length > 0) {
        return productionBibleScenes.map((scene, index) => {
            const cueStrategy = cueStrategies[index % cueStrategies.length];
            const nicheMoment = nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle shared niche energy within an ordinary cruise moment';
            const heroVariant = getHeroShotVariant(index);
            const resolvedStyle = resolveMediaStyle({
                assetKind: 'hero',
                hasPeople: sceneHasVisiblePeople(scene),
                seed: scene.sceneId,
                themeAnchorProps: plausibility.allowedProps.slice(0, 2),
                visualFlavor,
            });

            return [
                `Primary image blueprint from approved Production Bible: ${scene.imagePrompt}`,
                `On ${shipName}`,
                `Scene action: ${scene.subjectAction}`,
                `Scene location: ${scene.location}`,
                `Scene mood: ${scene.mood}`,
                `Reference category: ${scene.referenceCategory}`,
                `Overall direction: ${buildTravelFirstHeroDirection(brief, shipName)}`,
                resolvedStyle.allowPhotographicReinforcers ? `Atmosphere: ${docDirection}` : '',
                resolvedStyle.allowPhotographicReinforcers ? `Lighting: ${lightingStyle}` : '',
                resolvedStyle.allowPhotographicReinforcers ? `Composition: ${compositionNotes}` : '',
                `Plausibility rule: ${plausibility.governingPrinciple}`,
                `Niche cue strategy: ${cueStrategy}`,
                `Believable niche moment: ${nicheMoment}`,
                `Hero shot type: ${heroVariant.label}`,
                `Variation bias: ${heroVariant.cameraBias}`,
                `Time-of-day bias: ${heroVariant.temporalBias}`,
                `Staging bias: ${heroVariant.stagingBias}`,
                `Hero framing: ${heroVariant.framing}`,
                `Layout: 35-45% intentional negative space for headline and CTA, clean horizon, uncluttered edges`,
                `People count: 1-3 max, no crowds, no dense group scenes`,
                allowedPropsText ? `Believable cues: ${allowedPropsText}` : '',
                `Ship realism: hard marine deck surfaces, railings, teak, metal, glass, pool tile, ocean horizon, and real vessel architecture only`,
                landscapeGuardrails.reality,
                resolvedStyle.promptBlock,
                `Avoid: generic cruise imagery, over-polished styling, empty luxury, staged poses, busy signage, dense props, the same niche prop repeated in every frame, visual clutter, ${stagedEventAvoidText}, ${landscapeGuardrails.avoid}, resort cabanas, suburban furniture, ${discouragedPropsText || 'clinical or industrial props inconsistent with cruise leisure'}, ${implausibleText || 'equipment-heavy demos, classroom scenes, formal workshop setups'}`,
            ].filter(Boolean).join('. ');
        });
    }

    const scenes = [
        { description: 'quiet rail-side observation with one subtle field cue', location: `${shipName} exterior deck`, mood: 'authentic wonder' },
        { description: 'shared discovery moment while looking outward to sea', location: `${shipName} observation area`, mood: 'genuine curiosity' },
        { description: 'small conversational moment shaped by wind, light, and horizon', location: `${shipName} social deck`, mood: 'collaborative ease' },
        { description: 'individual pause against ocean and sky', location: `${shipName} observation point`, mood: 'personal connection' },
        { description: 'hands, notebook, and sea breeze in a simple observational beat', location: `${shipName} open-air deck`, mood: 'grounded discovery' },
    ];

    return scenes.map((scene, index) => {
        const cueStrategy = cueStrategies[index % cueStrategies.length];
        const nicheMoment = nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle shared niche energy within an ordinary cruise moment';
        const resolvedStyle = resolveMediaStyle({
            assetKind: 'hero',
            hasPeople: true,
            seed: `fallback_hero_${index}`,
            themeAnchorProps: plausibility.allowedProps.slice(0, 2),
            visualFlavor,
        });

        return [
            `On ${shipName}`,
            `Scene: ${scene.description} at ${scene.location}`,
            `Mood: ${scene.mood}, ${imageryMood}`,
            resolvedStyle.allowPhotographicReinforcers ? `Atmosphere: ${docDirection}` : '',
            resolvedStyle.allowPhotographicReinforcers ? `Lighting: ${lightingStyle}` : '',
            resolvedStyle.allowPhotographicReinforcers ? `Composition: ${compositionNotes}` : '',
            `Plausibility rule: ${plausibility.governingPrinciple}`,
            `Niche cue strategy: ${cueStrategy}`,
            `Non-object priority: ${nonObjectSignals[index % nonObjectSignals.length]}`,
            `Believable niche moment: ${nicheMoment}`,
            `Prop rule: ${propAllowanceRules[index % propAllowanceRules.length]}`,
            `Hero framing: single clear focal subject, one activity only, minimal background distractions`,
            `Layout: 35-45% intentional negative space for headline and CTA, clean horizon, uncluttered edges`,
            `People count: 1-3 max, no crowds, no dense group scenes; at least some prompts should feel softly social rather than isolated`,
            `Casting goal: ${casting.castingGoal}`,
            `Age guidance: ${casting.ageRangeGuidance}`,
            `Diversity guidance: ${casting.diversityIntent}`,
            `Pairing guidance: ${casting.pairingGuidance}`,
            `Styling guidance: ${casting.stylingGuidance}`,
            `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}`,
            allowedPropsText ? `Believable cues: ${allowedPropsText}` : '',
            `Ship realism: hard marine deck surfaces, railings, teak, metal, glass, pool tile, ocean horizon, and real vessel architecture only`,
            landscapeGuardrails.reality,
            resolvedStyle.promptBlock,
            `Avoid: generic cruise imagery, over-polished styling, empty luxury, staged poses, busy signage, dense props, the same niche prop repeated in every frame, visual clutter, ${stagedEventAvoidText}, ${landscapeGuardrails.avoid}, resort cabanas, suburban furniture, ${discouragedPropsText || 'clinical or industrial props inconsistent with cruise leisure'}, ${implausibleText || 'equipment-heavy demos, classroom scenes, formal workshop setups'}`,
        ].filter(Boolean).join('. ');
    });
}

function selectLandingStillSourceSpecs(
    brief: CampaignAestheticBrief,
    allowedUsages: ReadonlySet<LandingStillSpec['usage']>,
): LandingStillSpec[] {
    const stills = brief.landingStillBible?.stillLibrary ?? [];
    if (stills.length === 0) {
        return [];
    }

    const preferredCategories = new Set(['exterior', 'destination_view', 'pool_deck', 'offboard_excursion']);
    const matchingUsages = stills.filter((still) => allowedUsages.has(still.usage));
    const preferredStills = matchingUsages.filter((still) => preferredCategories.has(still.referenceCategory));
    return dedupeAndDiversifyStillSpecs(preferredStills.length > 0 ? preferredStills : matchingUsages, 5);
}

function dedupeAndDiversifyStillSpecs(
    stills: readonly LandingStillSpec[],
    maxCount: number,
): LandingStillSpec[] {
    const unique = stills.filter((still, index, array) =>
        array.findIndex((candidate) => candidate.stillId === still.stillId) === index,
    );

    const byUsage = new Map<LandingStillSpec['usage'], LandingStillSpec[]>();
    for (const still of unique) {
        const existing = byUsage.get(still.usage) ?? [];
        existing.push(still);
        byUsage.set(still.usage, existing);
    }

    const usageOrder: LandingStillSpec['usage'][] = ['hero_primary', 'hero_alt', 'concept', 'email_header', 'social_square'];
    const picked: LandingStillSpec[] = [];
    const usedCategories = new Set<string>();

    for (let pass = 0; picked.length < maxCount && pass < unique.length; pass += 1) {
        for (const usage of usageOrder) {
            const candidates = byUsage.get(usage) ?? [];
            const nextCandidate = candidates.find((candidate) =>
                !picked.some((pickedStill) => pickedStill.stillId === candidate.stillId)
                && !usedCategories.has(candidate.referenceCategory),
            ) ?? candidates.find((candidate) => !picked.some((pickedStill) => pickedStill.stillId === candidate.stillId));

            if (!nextCandidate) {
                continue;
            }

            picked.push(nextCandidate);
            usedCategories.add(nextCandidate.referenceCategory);
            if (picked.length >= maxCount) {
                break;
            }
        }
    }

    return picked;
}

function selectHeroLandingStillSpecs(brief: CampaignAestheticBrief): LandingStillSpec[] {
    return selectLandingStillSourceSpecs(brief, new Set(['hero_primary', 'hero_alt', 'concept']));
}

function selectConceptLandingStillSpecs(brief: CampaignAestheticBrief): LandingStillSpec[] {
    const stills = brief.landingStillBible?.stillLibrary ?? [];
    if (stills.length === 0) {
        return [];
    }

    const conceptFirst = stills.filter((still) => still.usage === 'concept');
    const conceptFriendly = conceptFirst.length > 0
        ? conceptFirst
        : stills.filter((still) => still.usage === 'hero_alt' || still.usage === 'social_square' || still.usage === 'email_header');
    const editorialCategories = new Set(['interior', 'destination_view', 'observation_lounge', 'pool_deck', 'exterior', 'offboard_excursion']);
    const categoryWeighted = conceptFriendly.filter((still) => editorialCategories.has(still.referenceCategory));

    return dedupeAndDiversifyStillSpecs(categoryWeighted.length > 0 ? categoryWeighted : conceptFriendly, 4);
}

function selectHeroSourceScenes(brief: CampaignAestheticBrief): SceneSpec[] {
    const scenes = brief.productionBible?.sceneLibrary ?? [];
    if (scenes.length === 0) {
        return [];
    }

    const preferredCategories = new Set(['exterior', 'destination_view', 'pool_deck', 'offboard_excursion']);
    const preferredScenes = scenes.filter((scene) => preferredCategories.has(scene.referenceCategory));
    return (preferredScenes.length > 0 ? preferredScenes : scenes).slice(0, 5);
}

function selectConceptSourceScenes(brief: CampaignAestheticBrief): SceneSpec[] {
    const scenes = brief.productionBible?.sceneLibrary ?? [];
    if (scenes.length === 0) {
        return [];
    }

    const conceptCategories = ['destination_view', 'interior', 'pool_deck', 'exterior', 'atrium', 'offboard_excursion'];
    const preferred = conceptCategories.flatMap((category) =>
        scenes.filter((scene) => scene.referenceCategory === category),
    );
    const source = preferred.length > 0 ? preferred : scenes;

    const picked: SceneSpec[] = [];
    const usedCategories = new Set<string>();
    for (const scene of source) {
        if (picked.length >= 4) {
            break;
        }
        if (usedCategories.has(scene.referenceCategory) && picked.length + 1 < Math.min(4, source.length)) {
            continue;
        }
        picked.push(scene);
        usedCategories.add(scene.referenceCategory);
    }

    if (picked.length < 4) {
        for (const scene of source) {
            if (picked.length >= 4) {
                break;
            }
            if (!picked.some((pickedScene) => pickedScene.sceneId === scene.sceneId)) {
                picked.push(scene);
            }
        }
    }

    return picked;
}

function buildTravelFirstHeroDirection(brief: CampaignAestheticBrief, shipName: string): string {
    const destinationSignals = [brief.themeName, brief.visual.aestheticLabel, shipName]
        .filter(Boolean)
        .join(', ');

    return [
        `Travel-first hero direction for ${destinationSignals}`,
        `The frame should primarily sell being on a cruise: open sea, horizon, ship identity, atmosphere, light, and emotional escape`,
        `The niche identity must appear only as one subtle believable cue, not as a staged activity or workshop`,
        `Prefer timeless cruise emotions: wonder, anticipation, calm, belonging, discovery, freedom`,
        `Keep the image legible in one second as a landing-page hero`,
    ].join('. ');
}

function getHeroShotVariant(index: number): {
    label: string;
    framing: string;
    activity: string;
    cameraBias: string;
    temporalBias: string;
    stagingBias: string;
} {
    const variants = [
        {
            label: 'iconic rail moment',
            framing: 'single subject, medium-wide frame, subject offset to one side with open ocean negative space',
            activity: 'one person holding a sample jar or field notebook at the rail',
            cameraBias: 'eye-level perspective with clean side-profile or three-quarter orientation, avoiding straight-on repetition',
            temporalBias: 'soft early-golden or late-golden light with crisp separation between subject and sea',
            stagingBias: 'keep the ship visible but secondary, with ocean and horizon doing most of the visual work',
        },
        {
            label: 'paired discovery close-up',
            framing: 'two subjects max, medium shot, shallow composition, uncluttered background',
            activity: 'two people sharing one discovery moment over a notebook, sample jar, or simple field guide',
            cameraBias: 'closer crop with intimate documentary distance, tighter than a classic hero wide shot',
            temporalBias: 'neutral daylight or soft overcast realism rather than dramatic sunset repetition',
            stagingBias: 'background should collapse into simple ship lines or sea tones, not a readable full-ship portrait',
        },
        {
            label: 'instrument-first field beat',
            framing: 'hands and instrument dominant in foreground, simple horizon or deck lines behind',
            activity: 'one clean observational action such as holding binoculars, comparing a field note, or examining a small sample jar',
            cameraBias: 'foreground-led composition with partial subject framing and subtle deck geometry',
            temporalBias: 'clear daytime realism with natural contrast and no theatrical sky',
            stagingBias: 'make the action lead the frame while keeping background minimal and abstracted',
        },
        {
            label: 'quiet observation frame',
            framing: 'single subject with strong negative space and minimal deck information',
            activity: 'one participant scanning the sea or recording a field note',
            cameraBias: 'wider environmental frame with the subject placed near an edge rather than centered',
            temporalBias: 'calm blue-hour or pale-morning atmosphere with restrained color',
            stagingBias: 'favor sky and sea over ship mass so this slot does not repeat the exterior-profile look',
        },
        {
            label: 'dawn or dusk hero silhouette',
            framing: 'one or two figures max against calm sea and sky, sparse visual field',
            activity: 'one restrained moment of focus, wonder, or observation at sea',
            cameraBias: 'graphic silhouette read with strong horizon separation and minimal vessel detail',
            temporalBias: 'true dawn or dusk tonality reserved specifically for this slot only',
            stagingBias: 'treat the ship as a framing edge or implied location, not the main subject mass',
        },
    ] as const;

    return variants[index % variants.length];
}

function getConceptShotVariant(index: number): {
    label: string;
    framing: string;
    compositionBias: string;
    subjectStrategy: string;
    environmentPriority: string;
    paletteBias: string;
} {
    const variants = [
        {
            label: 'editorial environment frame',
            framing: 'wide composition with architecture and horizon carrying the image before any one person does',
            compositionBias: 'prioritize place, atmosphere, and ship geometry over a single hero pose',
            subjectStrategy: 'people are secondary and natural, appearing as part of the scene rather than the whole point of it',
            environmentPriority: 'let sea, skyline, window light, or deck lines dominate the composition',
            paletteBias: 'lean into the broad mood of the palette through ambient light and material tones',
        },
        {
            label: 'social chemistry frame',
            framing: 'two-person or small-cluster composition with visible relational spacing and relaxed interaction',
            compositionBias: 'make the image about companionship, timing, and emotional ease rather than about a hero silhouette',
            subjectStrategy: 'use a pair or trio with distinct posture and believable conversation energy',
            environmentPriority: 'keep ship context readable but not poster-like',
            paletteBias: 'let wardrobe accents and reflected light carry the palette more than the background',
        },
        {
            label: 'detail-led travel texture',
            framing: 'cropped or mid-range composition led by tactile details, surfaces, and one restrained human cue',
            compositionBias: 'favor texture, objects-in-context, and material atmosphere without becoming product photography',
            subjectStrategy: 'show partial figures, hands-at-rest, or seated posture rather than a full posed subject',
            environmentPriority: 'use ship materials, tabletops, windows, textiles, and light falloff as the emotional carrier',
            paletteBias: 'push accent colors and tonal contrast more strongly than in the other concept slots',
        },
        {
            label: 'destination mood postcard',
            framing: 'travel-poster-like square frame with destination atmosphere or sea relation strongly present',
            compositionBias: 'make the concept feel collectible and moodboard-worthy rather than headline-safe',
            subjectStrategy: 'subjects can be small in frame or absent if the place itself is doing the work',
            environmentPriority: 'destination air, harbor light, railings, or open sea should clearly differentiate this from the other concepts',
            paletteBias: 'use the palette through sky, water, and environmental color harmony',
        },
    ] as const;

    return variants[index % variants.length];
}

function buildConceptPrompts(brief: CampaignAestheticBrief): string[] {
    const { aestheticLabel, imageryMood, colorPalette, lightingStyle } = brief.visual;
    const casting = brief.visual.humanRepresentation;
    const landscapeGuardrails = buildShipLandscapeGuardrails();
    const travelFirstDirection = buildTravelFirstHeroDirection(brief, brief.themeName);
    const plausibility = brief.visual.plausibilityFramework;
    const nicheMoments = plausibility.nicheEnhancedMoments;
    const visualFlavor = brief.identityBlueprint?.visualFlavor;
    const conceptSignalRotation = [
        'shared glances, relaxed timing, and easy two-person chemistry',
        'wardrobe accents, personal styling, and tactile travel textures',
        'window choice, seating posture, and ship architecture as social context',
        'harbor haze, rail light, and destination atmosphere rather than any explicit prop',
    ];
    const stagedEventAvoidText = 'visible stages, risers, performance platforms, PA speakers, drum kits, full bands, formal concerts, organized demonstrations, workshops, staged activity setups, literal onboard niche events';

    const conceptSourceStills = selectConceptLandingStillSpecs(brief);
    if (conceptSourceStills.length > 0) {
        return conceptSourceStills.slice(0, 4).map((still, index) => {
            const conceptVariant = getConceptShotVariant(index);
            const resolvedStyle = resolveMediaStyle({
                assetKind: 'concept',
                hasPeople: true,
                seed: still.stillId,
                themeAnchorProps: plausibility.allowedProps.slice(0, 2),
                visualFlavor,
            });

            return [
            `${aestheticLabel} atmospheric concept frame derived from approved Landing Still Bible`,
            `Primary image blueprint: ${still.imagePrompt}`,
            `Still usage: ${still.usage}`,
            `Still action: ${still.subjectAction}`,
            `Still location: ${still.location}`,
            `Still mood: ${still.mood}`,
            `Reference category: ${still.referenceCategory}`,
            `Concept role: ${conceptVariant.label}`,
            `Framing bias: ${conceptVariant.framing}`,
            `Composition bias: ${conceptVariant.compositionBias}`,
            `Subject strategy: ${conceptVariant.subjectStrategy}`,
            `Environment priority: ${conceptVariant.environmentPriority}`,
            `Palette bias: ${conceptVariant.paletteBias}`,
            `Direction: ${travelFirstDirection}`,
            `Believable niche cue: ${nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle social or styling cue only'}`,
            `Signal priority: ${conceptSignalRotation[index % conceptSignalRotation.length]}`,
            `Casting goal: ${casting.castingGoal}`,
            `Diversity guidance: ${casting.diversityIntent}`,
            `Age guidance: ${casting.ageRangeGuidance}`,
            `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}`,
            `Palette treatment: ${colorPalette.primary}, ${colorPalette.secondary}, ${colorPalette.accent}`,
            resolvedStyle.allowPhotographicReinforcers ? `Lighting: ${still.lighting || lightingStyle}` : '',
            `Environment rule: remain clearly ship-based or sea-facing; preserve marine architecture, deck materials, railings, windows, horizon, or believable cruise interiors`,
            landscapeGuardrails.reality,
            resolvedStyle.promptBlock,
            `Avoid: explicit workshops, tables full of gear, whiteboards, crowded demo scenes, repeating the same small tabletop prop in every image, ${stagedEventAvoidText}, fantasy elements, loss of authenticity, ${landscapeGuardrails.avoid}, land hotels, patio furniture sets, home terraces`,
        ].filter(Boolean).join('. ');
        });
    }

    const conceptSourceScenes = selectConceptSourceScenes(brief);
    if (conceptSourceScenes.length > 0) {
        return conceptSourceScenes.slice(0, 4).map((scene, index) => {
            const conceptVariant = getConceptShotVariant(index);
            const resolvedStyle = resolveMediaStyle({
                assetKind: 'concept',
                hasPeople: true,
                seed: scene.sceneId,
                themeAnchorProps: plausibility.allowedProps.slice(0, 2),
                visualFlavor,
            });

            return [
            `${aestheticLabel} atmospheric concept frame derived from approved Production Bible scene`,
            `Primary image blueprint: ${scene.imagePrompt}`,
            `Scene action: ${scene.subjectAction}`,
            `Scene location: ${scene.location}`,
            `Scene mood: ${scene.mood}`,
            `Reference category: ${scene.referenceCategory}`,
            `Concept role: ${conceptVariant.label}`,
            `Framing bias: ${conceptVariant.framing}`,
            `Composition bias: ${conceptVariant.compositionBias}`,
            `Subject strategy: ${conceptVariant.subjectStrategy}`,
            `Environment priority: ${conceptVariant.environmentPriority}`,
            `Palette bias: ${conceptVariant.paletteBias}`,
            `Direction: ${travelFirstDirection}`,
            `Believable niche cue: ${nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle social or styling cue only'}`,
            `Signal priority: ${conceptSignalRotation[index % conceptSignalRotation.length]}`,
            `Casting goal: ${casting.castingGoal}`,
            `Diversity guidance: ${casting.diversityIntent}`,
            `Age guidance: ${casting.ageRangeGuidance}`,
            `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}`,
            `Palette treatment: ${colorPalette.primary}, ${colorPalette.secondary}, ${colorPalette.accent}`,
            resolvedStyle.allowPhotographicReinforcers ? `Lighting: ${lightingStyle}` : '',
            `Environment rule: remain clearly ship-based or sea-facing; preserve marine architecture, deck materials, railings, windows, horizon, or believable cruise interiors`,
            landscapeGuardrails.reality,
            resolvedStyle.promptBlock,
            `Avoid: explicit workshops, tables full of gear, whiteboards, crowded demo scenes, repeating the same small tabletop prop in every image, ${stagedEventAvoidText}, fantasy elements, loss of authenticity, ${landscapeGuardrails.avoid}, land hotels, patio furniture sets, home terraces`,
        ].filter(Boolean).join('. ');
        });
    }

    const concepts = [
        `${aestheticLabel}: cruise travel mood image with ${colorPalette.primary} accents and ${imageryMood} atmosphere`,
        `${aestheticLabel} lifestyle essence through ${colorPalette.secondary} and ${colorPalette.accent} tones; niche cues kept subtle and believable`,
        `${aestheticLabel} scene atmosphere, ${imageryMood}, grounded reality; ${lightingStyle}; ocean-forward composition`,
        `${aestheticLabel} visual identity through color and mood: ${colorPalette.primary} dominant with ${colorPalette.background} clarity; calm travel editorial`,
    ];

    return concepts.map((concept, index) => {
        const conceptVariant = getConceptShotVariant(index);
        const resolvedStyle = resolveMediaStyle({
            assetKind: 'concept',
            hasPeople: true,
            seed: `fallback_concept_${index}`,
            themeAnchorProps: plausibility.allowedProps.slice(0, 2),
            visualFlavor,
        });

        return [
            concept,
            `Concept role: ${conceptVariant.label}`,
            `Framing bias: ${conceptVariant.framing}`,
            `Composition bias: ${conceptVariant.compositionBias}`,
            `Subject strategy: ${conceptVariant.subjectStrategy}`,
            `Environment priority: ${conceptVariant.environmentPriority}`,
            `Palette bias: ${conceptVariant.paletteBias}`,
            `Direction: ${travelFirstDirection}`,
            `Believable niche cue: ${nicheMoments[index % Math.max(nicheMoments.length, 1)] ?? 'subtle social or styling cue only'}`,
            `Signal priority: ${conceptSignalRotation[index % conceptSignalRotation.length]}`,
            `Casting goal: ${casting.castingGoal}`,
            `Diversity guidance: ${casting.diversityIntent}`,
            `Age guidance: ${casting.ageRangeGuidance}`,
            `Anti-stereotype rules: ${casting.antiStereotypeRules.join(', ')}`,
            `Prop rule: if any object appears, it must be incidental and secondary — never the main read of the frame`,
            `Environment rule: remain clearly ship-based or sea-facing; preserve marine architecture, deck materials, railings, windows, horizon, or believable cruise interiors`,
            landscapeGuardrails.reality,
            resolvedStyle.promptBlock,
            `Avoid: explicit workshops, tables full of gear, whiteboards, crowded demo scenes, the same prop repeated in every image, ${stagedEventAvoidText}, fantasy elements, loss of authenticity, ${landscapeGuardrails.avoid}, land hotels, patio furniture sets, home terraces`,
        ].filter(Boolean).join('. ');
    });
}

function buildReferenceGroundedHeroPrompt(
    brief: CampaignAestheticBrief,
    shipName: string,
    candidate: ShipReferenceCandidate,
    heroIndex: number = 0,
): string {
    const { aestheticLabel, imageryMood, lightingStyle, compositionNotes, colorPalette, avoidList } = brief.visual;
    const landscapeGuardrails = buildShipLandscapeGuardrails(shipName);
    const plausibility = brief.visual.plausibilityFramework;
    const heroSlogan = brief.messaging.heroSlogan;
    const heroVariant = getHeroShotVariant(heroIndex);

    const travelFirstDirection = buildTravelFirstHeroDirection(brief, shipName);
    const avoidDirectives = [
        ...(brief.landingStillBible?.avoidDirectives ?? []),
        ...(brief.productionBible?.avoidDirectives ?? []),
    ];

    const avoidText = [
        ...(avoidList ?? []),
        ...avoidDirectives,
        ...plausibility.discouragedProps,
        ...plausibility.implausibleLiteralizations,
    ].join(', ').slice(0, 220);
    const allowedPropsText = plausibility.allowedProps.slice(0, 5).join(', ');
    const plausibleMomentsText = plausibility.nicheEnhancedMoments.slice(0, 4).join(', ');
    const heroSourceStills = selectLandingStillSourceSpecs(brief, new Set(['hero_primary', 'hero_alt', 'concept']));
    const sourceStill = heroSourceStills.length > 0
        ? heroSourceStills[heroIndex % heroSourceStills.length]
        : null;
    const heroSourceScenes = selectHeroSourceScenes(brief);
    const sourceScene = sourceStill
        ? null
        : heroSourceScenes.length > 0
            ? heroSourceScenes[heroIndex % heroSourceScenes.length]
            : null;
    const refVisualFlavor = brief.identityBlueprint?.visualFlavor;
    const resolvedStyle = resolveMediaStyle({
        assetKind: 'ref_hero',
        hasPeople: sourceStill
            ? stillHasVisiblePeople(sourceStill)
            : sourceScene
                ? sceneHasVisiblePeople(sourceScene)
                : true,
        seed: sourceStill?.stillId ?? sourceScene?.sceneId ?? `ref_hero_${heroIndex}`,
        themeAnchorProps: plausibility.allowedProps.slice(0, 2),
        visualFlavor: refVisualFlavor,
    });
    const cueStrategy = [
        'favor interpersonal chemistry and side-by-side ease',
        'favor wardrobe texture, color accent, or personal styling over object display',
        'if a prop appears, keep it singular, peripheral, and easy to miss',
        'let the ocean, ship architecture, and body language dominate over the niche cue',
    ][heroIndex % 4];
    const refPropAllowanceRules = buildPropAllowanceRules(plausibility.allowedProps);
    const propRule = refPropAllowanceRules[heroIndex % refPropAllowanceRules.length];

    return [
        `Transform this photo of ${shipName} into an authentic campaign hero image preserving ship identity, architecture, deck geometry, and visual integrity`,
        `Use ${candidate.category.replace(/_/g, ' ')} as the anchor scene`,
        sourceStill ? `Primary approved image blueprint: ${sourceStill.imagePrompt}` : '',
        sourceStill ? `Approved still action: ${sourceStill.subjectAction}` : '',
        sourceStill ? `Approved still location: ${sourceStill.location}` : '',
        sourceStill ? `Approved still mood: ${sourceStill.mood}` : '',
        sourceScene ? `Primary approved image blueprint: ${sourceScene.imagePrompt}` : '',
        sourceScene ? `Approved scene action: ${sourceScene.subjectAction}` : '',
        sourceScene ? `Approved scene location: ${sourceScene.location}` : '',
        sourceScene ? `Approved scene mood: ${sourceScene.mood}` : '',
        `Campaign identity: ${aestheticLabel}`,
        `Slogan energy: "${heroSlogan}"`,
        `Hero shot type: ${heroVariant.label}`,
        `Overall direction: ${travelFirstDirection}`,
        `Plausibility rule: ${plausibility.governingPrinciple}`,
        `Cue strategy: ${cueStrategy}`,
        `Prop rule: ${propRule}`,
        resolvedStyle.allowPhotographicReinforcers ? `Mood and tone: ${imageryMood}, ${lightingStyle}` : '',
        resolvedStyle.style === 'sketched'
            ? `Art direction: Feature ${heroVariant.activity}, one dominant subject story beat, genuine human moment, clear subject engagement`
            : `Art direction: Feature the ${candidate.category.replace(/_/g, ' ')} ship environment as the subject; no dominant people or staged human activity`,
        `Believable niche expression: ${plausibleMomentsText || 'guided noticing, field notes, simple observation, conversational discovery'}`,
        `Variation bias: ${heroVariant.cameraBias}`,
        `Time-of-day bias: ${heroVariant.temporalBias}`,
        `Staging bias: ${heroVariant.stagingBias}`,
        `Hero simplicity constraints: keep composition minimal, no crowded decks, no visual noise, no collage-like storytelling`,
        resolvedStyle.style === 'sketched'
            ? `Framing constraints: ${heroVariant.framing}, one focal plane, 1-2 people preferred and never more than 3, background simplified and readable`
            : `Framing constraints: one focal plane, ship-led composition, tiny background figures or silhouettes acceptable only if incidental`,
        `Negative space requirement: reserve clean breathing room for headline overlay; keep sky/sea or deck areas uncluttered`,
        `Environment integrity: preserve marine deck materials, railings, glazing, pool surfaces, and vessel architecture from the source reference; do not convert ship spaces into landscaped resort spaces`,
        landscapeGuardrails.reality,
        `Apply campaign palette through lighting and atmosphere only: ${colorPalette.primary}, ${colorPalette.secondary}, ${colorPalette.accent}`,
        resolvedStyle.style === 'sketched'
            ? `Wardrobe, props, and environment should reflect the niche identity naturally with one subtle incidental cue${allowedPropsText ? ` such as ${allowedPropsText}` : ' consistent with the campaign theme'}`
            : `Environment should reflect the niche identity naturally with one subtle environmental cue${allowedPropsText ? ` such as ${allowedPropsText}` : ' consistent with the campaign theme'}`,
        resolvedStyle.promptBlock,
        resolvedStyle.allowPhotographicReinforcers ? `Critical: The image must feel like a moment captured from real life on this ship, not a fantasy render or over-styled editorial shoot` : '',
        `AVOID: ${avoidText}; fantasy sci-fi props; cinematic color grades; empty luxury; loss of ship authenticity; complex multi-action scenes; excessive people; large text signage; visible stages; risers; performance platforms; PA speakers; drum kits; full bands; formal concerts; organized demonstrations; conference-room energy; workshop-table compositions; wide busy interiors; literal activity demos that may not actually happen; the same niche prop repeated across hero images; ${landscapeGuardrails.avoid}; land-based hotel cues`,
    ].filter(Boolean).join('. ');
}

async function generateNanoBananaImage(
    prompt: string,
    aspectRatio: typeof NANO_BANANA_CONFIG.heroAspectRatio | typeof NANO_BANANA_CONFIG.conceptAspectRatio | typeof NANO_BANANA_CONFIG.merchAspectRatio,
    imageSize: typeof NANO_BANANA_CONFIG.heroImageSize | typeof NANO_BANANA_CONFIG.conceptImageSize | typeof NANO_BANANA_CONFIG.merchImageSize,
    referenceImage?: Buffer,
    referenceMimeType?: string
): Promise<Buffer> {
    const normalizedPrompt = trimPromptForNanoBanana(prompt);
    const optimizedReference = referenceImage
        ? await optimizeReferenceImageForNanoBanana(referenceImage, referenceMimeType)
        : null;

    const parts = optimizedReference
        ? [
            { text: normalizedPrompt },
            {
                inline_data: {
                    mime_type: optimizedReference.mimeType,
                    data: optimizedReference.buffer.toString('base64'),
                },
            },
        ]
        : [{ text: normalizedPrompt }];

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= NANO_BANANA_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetchWithTimeout(
                `${NANO_BANANA_CONFIG.apiBase}/models/${NANO_BANANA_CONFIG.model}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'x-goog-api-key': getApiKey(),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: {
                            responseModalities: ['TEXT', 'IMAGE'],
                            imageConfig: {
                                aspectRatio,
                                imageSize,
                            },
                        },
                    }),
                },
                REMOTE_FETCH_TIMEOUT_MS
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Nano-Banana error ${response.status}: ${errorText}`);
            }

            const payload = await response.json() as {
                candidates?: Array<{
                    content?: {
                        parts?: Array<{
                            text?: string;
                            inlineData?: { data?: string; mimeType?: string };
                            inline_data?: { data?: string; mime_type?: string };
                        }>;
                    };
                }>;
            };
            const contentParts = payload.candidates?.[0]?.content?.parts ?? [];
            const imagePart = contentParts.find((part) => part.inlineData?.data || part.inline_data?.data);
            const imageData = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;

            if (!imageData) {
                throw new Error('Nano-Banana did not return an image payload');
            }

            return Buffer.from(imageData, 'base64');
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === NANO_BANANA_MAX_ATTEMPTS) {
                break;
            }

            await delay(NANO_BANANA_RETRY_DELAY_MS * attempt);
        }
    }

    throw lastError ?? new Error('Nano-Banana generation failed');
}

export interface GeneratedImage {
    buffer: Buffer;
    prompt: string;
    assetId: string;
    fileName: string;
}

export async function generateHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    count: number = 5
): Promise<GeneratedImage[]> {
    const prompts = buildHeroPrompts(brief, shipName).slice(0, count);
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateNanoBananaImage(
            prompts[i],
            NANO_BANANA_CONFIG.heroAspectRatio,
            NANO_BANANA_CONFIG.heroImageSize
        );
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_hero_${idx}`,
            fileName: `images/hero/hero_${idx}_source.png`,
        });
    }

    return results;
}

export async function generateReferenceGroundedHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    referenceCandidate: ShipReferenceCandidate,
    heroIndex: number = 0,
    count: number = 1
): Promise<GeneratedImage[]> {
    const prompt = buildReferenceGroundedHeroPrompt(brief, shipName, referenceCandidate, heroIndex);
    const referenceImage = await fetchUsableReferenceImage(referenceCandidate.imageUrl);
    const results: GeneratedImage[] = [];

    for (let index = 0; index < count; index += 1) {
        const transformedBuffer = await generateNanoBananaImage(
            prompt,
            NANO_BANANA_CONFIG.heroAspectRatio,
            NANO_BANANA_CONFIG.heroImageSize,
            referenceImage?.buffer,
            referenceImage?.mimeType
        );
        const itemIndex = String(heroIndex + index + 1).padStart(3, '0');
        results.push({
            buffer: transformedBuffer,
            prompt,
            assetId: `img_hero_${itemIndex}`,
            fileName: `images/hero/hero_${itemIndex}_embellished.png`,
        });
    }

    return results;
}

export async function generateAestheticConcepts(
    brief: CampaignAestheticBrief,
    count: number = 4
): Promise<GeneratedImage[]> {
    const prompts = buildConceptPrompts(brief).slice(0, count);
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateNanoBananaImage(
            prompts[i],
            NANO_BANANA_CONFIG.conceptAspectRatio,
            NANO_BANANA_CONFIG.conceptImageSize
        );
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_concept_${idx}`,
            fileName: `images/concepts/concept_${idx}.png`,
        });
    }

    return results;
}

/**
 * Generates a single probe image from a still spec's imagePrompt.
 * Uses concept dimensions (1:1, 2K) — cheaper than hero scale, sufficient for direction validation.
 */
export async function generateProbeImage(
    prompt: string,
    style: StyleId,
    options: { seed?: string; themeAnchorProps?: readonly string[] } = {},
): Promise<GeneratedImage> {
    const id = randomUUID().slice(0, 8);
    const resolvedStyle = resolveMediaStyle({
        assetKind: 'probe',
        hasPeople: style === 'sketched',
        seed: options.seed ?? `probe_${id}`,
        themeAnchorProps: options.themeAnchorProps,
    });
    const styledPrompt = [
        resolvedStyle.promptBlock,
        prompt,
    ].join('. ');
    const buffer = await generateNanoBananaImage(
        styledPrompt,
        NANO_BANANA_CONFIG.conceptAspectRatio,
        NANO_BANANA_CONFIG.conceptImageSize
    );
    return {
        buffer,
        prompt: styledPrompt,
        assetId: `probe_${id}`,
        fileName: `images/probes/probe_${id}.png`,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Scene-Driven Image Generation (Production Bible)
// Each scene in the library gets its own distinct source image.
// ────────────────────────────────────────────────────────────────────────────

export interface GeneratedSceneImage extends GeneratedImage {
    sceneId: string;
}

function buildStoryboardSafeSceneDirection(scene: SceneSpec): string {
    if (!sceneHasVisiblePeople(scene)) {
        return 'Storyboard source frame direction: lead with ship architecture, sea, horizon, and layered atmosphere; let motion come from environment rather than anatomy';
    }

    return [
        'Storyboard source frame direction: do NOT focus on human subjects; keep people secondary to the ship and sea and never dominant foreground subjects',
        'Favor wide or medium-wide ship-led framing with background silhouettes, rail-side profiles, or over-the-shoulder figures only',
        'Capture a settled end-state only: no mid-gesture hands, no hand-to-object action, no mugs, glasses, cups, walking, or drinking motion in frame',
    ].join('. ');
}

export async function generateSceneImages(
    scenes: readonly SceneSpec[],
    shipReferences: readonly ShipReferenceCandidate[],
    shipName: string,
    themeAnchorProps: readonly string[] = [],
): Promise<GeneratedSceneImage[]> {
    const results: GeneratedSceneImage[] = [];
    const landscapeGuardrails = buildShipLandscapeGuardrails(shipName);

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const matchedReference = shipReferences.find(
            (ref) => ref.category === scene.referenceCategory
        );
        const resolvedStyle = resolveMediaStyle({
            assetKind: 'scene',
            hasPeople: sceneHasVisiblePeople(scene),
            seed: scene.sceneId,
            themeAnchorProps: themeAnchorProps.slice(0, 2),
        });

        const enrichedPrompt = [
            // Style + emotional framing FIRST — highest weight for image gen
            resolvedStyle.promptBlock,
            `Mood: ${scene.mood}`,
            // Primary creative direction from Production Bible
            scene.imagePrompt,
            buildStoryboardSafeSceneDirection(scene),
            // Atmosphere context (no task descriptions)
            `Setting: ${scene.location}`,
            `Time: ${scene.timeOfDay}`,
            `Light: ${scene.lighting}`,
            `Framing: ${scene.cameraAngle}`,
            shipName !== 'TBD' ? `Aboard the ${shipName}` : '',
            // Reinforce: vacation, not work
            'If people appear at all, they must be incidental background figures or silhouettes, never the focal subject, never holding hero props, and never interacting with handheld objects',
            'Location integrity: the scene must remain visibly aboard a real cruise ship or on a clearly ship-adjacent sea-facing deck, not a land resort or backyard setting',
            'Environment rule: preserve marine railings, glazing, teak, pool tile, steel, painted deck surfaces, and believable vessel architecture',
            landscapeGuardrails.reality,
            `Avoid ${landscapeGuardrails.avoid}`,
        ].filter(Boolean).join('. ');

        let buffer: Buffer;
        if (matchedReference) {
            const referenceImage = await fetchUsableReferenceImage(matchedReference.imageUrl);
            if (referenceImage) {
                buffer = await generateNanoBananaImage(
                    enrichedPrompt,
                    NANO_BANANA_CONFIG.heroAspectRatio,
                    NANO_BANANA_CONFIG.heroImageSize,
                    referenceImage.buffer,
                    referenceImage.mimeType
                );
            } else {
                buffer = await generateNanoBananaImage(
                    enrichedPrompt,
                    NANO_BANANA_CONFIG.heroAspectRatio,
                    NANO_BANANA_CONFIG.heroImageSize
                );
            }
        } else {
            buffer = await generateNanoBananaImage(
                enrichedPrompt,
                NANO_BANANA_CONFIG.heroAspectRatio,
                NANO_BANANA_CONFIG.heroImageSize
            );
        }

        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: enrichedPrompt,
            assetId: `img_scene_${scene.sceneId}_${idx}`,
            fileName: `images/scenes/${scene.sceneId}_${idx}.png`,
            sceneId: scene.sceneId,
        });
    }

    return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-driven single image generation — used by revision regeneration
// ────────────────────────────────────────────────────────────────────────────

export async function generateImageFromPrompt(prompt: string): Promise<Buffer> {
    return generateNanoBananaImage(
        prompt,
        NANO_BANANA_CONFIG.heroAspectRatio,
        NANO_BANANA_CONFIG.heroImageSize
    );
}

export interface ImageFingerprint {
    width: number;
    height: number;
    grayscalePixels: Buffer;
}

export async function createImageFingerprint(buffer: Buffer): Promise<ImageFingerprint> {
    const resized = await sharp(buffer)
        .resize(24, 24, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        width: resized.info.width,
        height: resized.info.height,
        grayscalePixels: resized.data,
    };
}

export function measureImageFingerprintDistance(left: ImageFingerprint, right: ImageFingerprint): number {
    const sampleCount = Math.min(left.grayscalePixels.length, right.grayscalePixels.length);
    if (sampleCount === 0) {
        return 1;
    }

    let totalDifference = 0;
    for (let index = 0; index < sampleCount; index += 1) {
        totalDifference += Math.abs(left.grayscalePixels[index] - right.grayscalePixels[index]);
    }

    return totalDifference / (sampleCount * 255);
}
