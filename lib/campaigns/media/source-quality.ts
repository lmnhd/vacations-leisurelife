// lib/campaigns/media/source-quality.ts
//
// Phase 3 (IMAGE_GEN_REVAMP_5-26): deterministic source-quality scoring.
//
// Every generated source image carries a SourceQualityMetadata stamp. The
// fields are inferred from the scene spec, generation prompt, and campaign
// brief. Scores are 0..1 heuristics — Phase 5 will refine the visual-compass
// score with vision-based evaluation, but the deterministic baseline is
// enough for Copy Forge selection and production-build lint to react.

import type {
    ArtisticTreatment,
    CampaignAestheticBrief,
    CompositionFamily,
    SceneSpec,
    SourceQualityMetadata,
    TimeOfDay,
} from '../schema';

// ─── Composition family inference ────────────────────────────────────────────

// Ordered by specificity — more specific patterns come first so that a
// "dining room" string is not stolen by a generic "table" match, etc.
const COMPOSITION_PATTERNS: Array<{ family: CompositionFamily; pattern: RegExp }> = [
    { family: 'dining_communal',       pattern: /\b(dining room|restaurant|dinner|communal table|long table|banquet)\b/i },
    { family: 'treatment_room',        pattern: /\b(spa|treatment room|sauna|hammam|massage|solarium)\b/i },
    { family: 'studio_class',          pattern: /\b(studio|workshop|class|classroom|practice space)\b/i },
    { family: 'pool_apron',            pattern: /\b(pool|deck pool|aft pool|lounger|cabana)\b/i },
    { family: 'off_ship_excursion',    pattern: /\b(port|pier|excursion|tender|shoreline|harbor|town|ruin|local culture)\b/i },
    { family: 'corridor_architecture', pattern: /\b(corridor|atrium|hallway|elevator|gangway|threshold)\b/i },
    { family: 'nature_overlook',       pattern: /\b(nature overlook|ocean view|wildlife|forest|mountain|vista|overlook)\b/i },
    { family: 'window',                pattern: /\b(window|porthole|stateroom view|cabin view)\b/i },
    { family: 'rail',                  pattern: /\b(rail|railing|balcony|promenade)\b/i },
    { family: 'table',                 pattern: /\b(cafe table|dining table|bar top|counter|table-side|\btable\b)\b/i },
    { family: 'interior_lounge',       pattern: /\b(lounge|library|sitting area)\b/i },
    { family: 'open_deck',             pattern: /\b(deck|teak|stern|bow|sundeck|sports deck)\b/i },
];

/** Map a scene's location/composition text to a CompositionFamily. */
export function inferCompositionFamily(input: { location?: string; composition?: string; imagePrompt?: string }): CompositionFamily {
    const text = [input.location, input.composition, input.imagePrompt].filter(Boolean).join(' ');
    for (const { family, pattern } of COMPOSITION_PATTERNS) {
        if (pattern.test(text)) return family;
    }
    return 'other';
}

// ─── Time of day inference ───────────────────────────────────────────────────

const TIME_OF_DAY_PATTERNS: Array<{ value: TimeOfDay; pattern: RegExp }> = [
    { value: 'sunrise',        pattern: /\b(sunrise|dawn|first light)\b/i },
    { value: 'golden_hour',    pattern: /\b(golden hour|sunset|late afternoon|warm late light)\b/i },
    { value: 'dusk_blue_hour', pattern: /\b(dusk|blue hour|twilight|evening glow)\b/i },
    { value: 'night',          pattern: /\b(night|after dark|lantern|moon|starlit|nighttime)\b/i },
    { value: 'morning',        pattern: /\b(morning|early|breakfast|just after sunrise)\b/i },
    { value: 'midday',         pattern: /\b(midday|noon|bright daylight|high sun)\b/i },
];

/** Map a scene's timeOfDay text to a canonical TimeOfDay enum value. */
export function inferTimeOfDay(timeOfDayText: string): TimeOfDay {
    for (const { value, pattern } of TIME_OF_DAY_PATTERNS) {
        if (pattern.test(timeOfDayText)) return value;
    }
    // Default to midday — most ambiguous cruise imagery reads as midday daylight.
    return 'midday';
}

// ─── Artistic treatment inference ────────────────────────────────────────────

const TREATMENT_PATTERNS: Array<{ value: ArtisticTreatment; pattern: RegExp }> = [
    {
        // Narrowed: "painterly" removed (too broad — appears in photo-real prompts like
        // "painterly golden hour light"). "painted style/scene" removed for same reason.
        // Only explicit non-photo art terms remain to avoid alternate_art_leak false positives.
        value: 'watercolor_illustration',
        pattern: /\b(watercolor|illustration|illustrated|sketch(?:ed)?|painted\s+(?:art|illustration|poster|watercolor))\b/i,
    },
    { value: 'sepia',                   pattern: /\b(sepia|toned warm vintage|brown tone)\b/i },
    { value: 'black_and_white',         pattern: /(\bblack[\s-]+(?:and[\s-]+)?white\b|\bmonochrome\b|\bb&w\b|\bnoir\b)/i },
    { value: 'film_grain_35mm',         pattern: /\b(35mm|film grain|kodak|fuji velvia|portra)\b/i },
    { value: 'high_contrast_editorial', pattern: /\b(high contrast|editorial contrast|dramatic shadow)\b/i },
    { value: 'color_shifted',           pattern: /\b(color shifted|graded|teal[- ]orange|palette wash)\b/i },
    { value: 'overlay_texture',         pattern: /\b(overlay|texture overlay|grain overlay)\b/i },
];

/** Map prompt + tags text to an ArtisticTreatment. Defaults to natural_documentary. */
export function inferArtisticTreatment(input: { prompt?: string; tags?: readonly string[] }): ArtisticTreatment {
    const text = [input.prompt, ...(input.tags ?? [])].filter(Boolean).join(' ');
    for (const { value, pattern } of TREATMENT_PATTERNS) {
        if (pattern.test(text)) return value;
    }
    return 'natural_documentary';
}

// ─── People count inference ──────────────────────────────────────────────────

const PEOPLE_TOKEN_PATTERN = /\b(\d+)\s+(?:people|guests|friends|travelers|travellers|figures|members)\b/i;
const SOLO_PATTERN = /\b(solo|alone|single guest|one person)\b/i;
const PAIR_PATTERN = /\b(pair|couple|two people|duo|two friends)\b/i;
const SMALL_GROUP_PATTERN = /\b(small group|trio|cluster|three|four|group of \d+)\b/i;
const LARGE_GROUP_PATTERN = /\b(crowd|large group|many|dozen|gathering|atmosphere)\b/i;

/** Estimate the people count visible in a scene from its prompt + subjectAction. */
export function inferPeopleCount(input: { imagePrompt?: string; subjectAction?: string; minimumVisiblePeople?: number }): number {
    const text = [input.imagePrompt, input.subjectAction].filter(Boolean).join(' ');
    const numericMatch = text.match(PEOPLE_TOKEN_PATTERN);
    if (numericMatch) {
        const n = parseInt(numericMatch[1], 10);
        if (!Number.isNaN(n)) return Math.min(n, 50);
    }
    if (LARGE_GROUP_PATTERN.test(text)) return 8;
    if (SMALL_GROUP_PATTERN.test(text)) return 4;
    if (PAIR_PATTERN.test(text)) return 2;
    if (SOLO_PATTERN.test(text)) return 1;
    // Fallback: respect the brief's minimumVisiblePeople if set, otherwise assume the
    // GROUP ACTION GRAMMAR default (4 people) which is what Phase 1 established.
    return input.minimumVisiblePeople ?? 4;
}

// ─── Demographic coverage inference (heuristic) ──────────────────────────────

const AGE_BAND_PATTERNS: Record<string, RegExp> = {
    child:        /\b(child|kid|toddler|infant)\b/i,
    teen:         /\b(teen|teenager|adolescent|young adult|teen pair)\b/i,
    young_adult:  /\b(young couple|millennial|young professional|twenty[- ]something|thirty[- ]something)\b/i,
    middle_aged:  /\b(middle[- ]aged|forties|fifties|mid-career)\b/i,
    senior:       /\b(senior|retired|elder|grandparent|sixties|seventies|silver)\b/i,
    multi_gen:    /\b(multi[- ]generational|mixed[- ]age|family[- ]adjacent|parent[- ]teen)\b/i,
};

const ETHNICITY_BAND_PATTERNS: Record<string, RegExp> = {
    diverse_mixed:    /\b(diverse|multi[- ]ethnic|mixed ethnicity|visibly diverse)\b/i,
    east_asian:       /\b(east asian|japanese|chinese|korean|taiwanese)\b/i,
    south_asian:      /\b(south asian|indian|pakistani|bangladeshi)\b/i,
    southeast_asian:  /\b(southeast asian|filipino|vietnamese|thai|indonesian)\b/i,
    black:            /\b(black|african|afro[- ]caribbean|african[- ]american)\b/i,
    latino:           /\b(latino|latina|latinx|hispanic)\b/i,
    middle_eastern:   /\b(middle eastern|arab|persian)\b/i,
    indigenous:       /\b(indigenous|native|first nations)\b/i,
    white:            /\b(white|caucasian|nordic|european)\b/i,
};

function extractDemographicBands(patterns: Record<string, RegExp>, text: string): string[] {
    const matched: string[] = [];
    for (const [band, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) matched.push(band);
    }
    return matched;
}

// ─── Scoring: theme legibility ───────────────────────────────────────────────

/**
 * Score how legibly the scene communicates the campaign's niche identity
 * without relying on caption.
 *
 * The heuristic is intentionally simple and stable:
 *   - +0.25 if a niche signal appears in imagePrompt
 *   - +0.25 if a niche signal appears in subjectAction
 *   - +0.25 if subjectAction is specific (10+ characters of activity verb)
 *   - +0.25 if mustPreserveShipFeatures is non-empty (anchored to vessel)
 *
 * Returns a value in [0, 1].
 */
export function scoreThemeLegibility(scene: SceneSpec, brief: CampaignAestheticBrief): number {
    const nicheSignals = extractNicheSignals(brief);
    let score = 0;

    if (nicheSignals.length > 0) {
        const lowerPrompt = scene.imagePrompt.toLowerCase();
        const lowerAction = scene.subjectAction.toLowerCase();
        if (nicheSignals.some((sig) => lowerPrompt.includes(sig))) score += 0.25;
        if (nicheSignals.some((sig) => lowerAction.includes(sig))) score += 0.25;
    } else {
        // No niche signals defined: give partial credit if prompt is specific.
        if (scene.imagePrompt.length > 80) score += 0.25;
        if (scene.subjectAction.length > 20) score += 0.25;
    }

    if (scene.subjectAction.trim().length >= 10) score += 0.25;
    if (scene.mustPreserveShipFeatures && scene.mustPreserveShipFeatures.length > 0) score += 0.25;

    return Math.min(1, score);
}

function extractNicheSignals(brief: CampaignAestheticBrief): string[] {
    const blueprint = brief.identityBlueprint;
    const signals: string[] = [];
    if (blueprint?.evidenceOfBelonging) signals.push(...blueprint.evidenceOfBelonging);
    if (blueprint?.imageBehavior) signals.push(...blueprint.imageBehavior);
    return signals
        .map((s) => s.toLowerCase().trim())
        .filter((s) => s.length >= 4);
}

// ─── Scoring: group action ───────────────────────────────────────────────────

/**
 * Score how strongly the scene reads as group action (the primary ad-source
 * shape). 4–6 people is the target; solo/pair is low score; larger groups
 * are also strong.
 */
export function scoreGroupAction(input: { peopleCount: number; subjectAction?: string }): number {
    const action = (input.subjectAction ?? '').toLowerCase();
    const hasActivityVerb = /(laugh|gather|share|toast|play|explore|stretch|practice|cluster|chat|dance|meet|connect|notice|point|lean)/.test(action);

    let countScore: number;
    if (input.peopleCount >= 4 && input.peopleCount <= 10) {
        countScore = 1;
    } else if (input.peopleCount === 3 || (input.peopleCount > 10 && input.peopleCount <= 15)) {
        countScore = 0.6;
    } else if (input.peopleCount === 2) {
        countScore = 0.3;
    } else {
        countScore = 0;
    }

    const verbBoost = hasActivityVerb ? 0.2 : 0;
    return Math.min(1, countScore + verbBoost);
}

// ─── Orchestrator: compute full SourceQualityMetadata ────────────────────────

export interface ComputeSourceQualityInput {
    scene: SceneSpec;
    brief: CampaignAestheticBrief;
    promptUsed: string;
    tags: readonly string[];
}

export interface ComputeSourceQualityForAssetInput {
    assetId?: string;
    location?: string;
    timeOfDay?: string;
    subjectAction?: string;
    promptUsed: string;
    tags: readonly string[];
    brief?: CampaignAestheticBrief | null;
    roleHint?: string;
}

/**
 * Compute the SourceQualityMetadata for a generated scene image.
 * Pure and deterministic — same inputs always produce the same output.
 */
export function computeSourceQuality(input: ComputeSourceQualityInput): SourceQualityMetadata {
    const { scene, brief, promptUsed, tags } = input;

    const compositionFamily = inferCompositionFamily({
        location: scene.location,
        composition: '',
        imagePrompt: scene.imagePrompt,
    });

    const timeOfDay = inferTimeOfDay(scene.timeOfDay);
    const artisticTreatment = inferArtisticTreatment({ prompt: promptUsed, tags });

    const peopleCount = inferPeopleCount({
        imagePrompt: scene.imagePrompt,
        subjectAction: scene.subjectAction,
        minimumVisiblePeople: brief.visual.humanRepresentation?.minimumVisiblePeople,
    });

    const demographicText = [
        scene.imagePrompt,
        scene.subjectAction,
        brief.visual.humanRepresentation?.ageRangeGuidance ?? '',
        brief.visual.humanRepresentation?.diversityIntent ?? '',
    ].join(' ');

    const demographicCoverage = {
        ageBands: extractDemographicBands(AGE_BAND_PATTERNS, demographicText),
        ethnicityBands: extractDemographicBands(ETHNICITY_BAND_PATTERNS, demographicText),
    };

    const themeLegibilityScore = scoreThemeLegibility(scene, brief);
    const groupActionScore = scoreGroupAction({ peopleCount, subjectAction: scene.subjectAction });

    return {
        compositionFamily,
        peopleCount,
        demographicCoverage,
        timeOfDay,
        shipLocationFamily: scene.referenceCategory || undefined,
        themeLegibilityScore,
        groupActionScore,
        artisticTreatment,
        scoringSource: 'deterministic',
    };
}

export function computeSourceQualityForAsset(input: ComputeSourceQualityForAssetInput): SourceQualityMetadata {
    const subjectAction = input.subjectAction ?? input.roleHint ?? '';
    const syntheticScene: SceneSpec = {
        sceneId: input.assetId ?? 'asset',
        location: input.location ?? '',
        timeOfDay: input.timeOfDay ?? input.promptUsed,
        lighting: '',
        cameraAngle: '',
        subjectAction,
        environmentDetails: '',
        mood: '',
        imagePrompt: input.promptUsed,
        referenceCategory: '',
    };

    const compositionFamily = inferCompositionFamily({
        location: input.location,
        composition: input.roleHint,
        imagePrompt: input.promptUsed,
    });
    const timeOfDay = inferTimeOfDay(input.timeOfDay ?? input.promptUsed);
    const artisticTreatment = inferArtisticTreatment({ prompt: input.promptUsed, tags: input.tags });
    const peopleCount = inferPeopleCount({
        imagePrompt: input.promptUsed,
        subjectAction,
        minimumVisiblePeople: input.brief?.visual.humanRepresentation?.minimumVisiblePeople,
    });
    const demographicText = [
        input.promptUsed,
        subjectAction,
        input.brief?.visual.humanRepresentation?.ageRangeGuidance ?? '',
        input.brief?.visual.humanRepresentation?.diversityIntent ?? '',
    ].join(' ');

    return {
        compositionFamily,
        peopleCount,
        demographicCoverage: {
            ageBands: extractDemographicBands(AGE_BAND_PATTERNS, demographicText),
            ethnicityBands: extractDemographicBands(ETHNICITY_BAND_PATTERNS, demographicText),
        },
        timeOfDay,
        themeLegibilityScore: input.brief ? scoreThemeLegibility(syntheticScene, input.brief) : 0.5,
        groupActionScore: scoreGroupAction({ peopleCount, subjectAction }),
        artisticTreatment,
        scoringSource: 'deterministic',
    };
}

export interface VisionSourceQualityEvaluation {
    themeLegibilityScore?: number;
    groupActionScore?: number;
    peopleCount?: number;
    ageBands?: string[];
    ethnicityBands?: string[];
    preservedFeaturesReported?: string[];
    supportSurfaceIntegrity?: {
        supported: boolean;
        issue?: string;
    };
    evaluatedAt?: string;
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function applyVisionVerifiedSourceQuality(
    metadata: SourceQualityMetadata,
    evaluation: VisionSourceQualityEvaluation,
): SourceQualityMetadata {
    return {
        ...metadata,
        themeLegibilityScore: typeof evaluation.themeLegibilityScore === 'number'
            ? clampScore(evaluation.themeLegibilityScore)
            : metadata.themeLegibilityScore,
        groupActionScore: typeof evaluation.groupActionScore === 'number'
            ? clampScore(evaluation.groupActionScore)
            : metadata.groupActionScore,
        peopleCount: typeof evaluation.peopleCount === 'number'
            ? Math.max(0, Math.round(evaluation.peopleCount))
            : metadata.peopleCount,
        demographicCoverage: {
            ageBands: evaluation.ageBands ?? metadata.demographicCoverage.ageBands,
            ethnicityBands: evaluation.ethnicityBands ?? metadata.demographicCoverage.ethnicityBands,
        },
        supportSurfaceIntegrity: evaluation.supportSurfaceIntegrity ?? metadata.supportSurfaceIntegrity,
        scoringSource: 'vision_verified',
        visionEvaluatedAt: evaluation.evaluatedAt ?? new Date().toISOString(),
    };
}

// ─── Pool advisory (for Copy Forge) ──────────────────────────────────────────

export interface SourcePoolAdvisory {
    sampleSize: number;
    averagePeopleCount: number;
    bestGroupActionScore: number;
    bestThemeLegibilityScore: number;
    compositionFamilyBreakdown: Partial<Record<CompositionFamily, number>>;
    timeOfDayBreakdown: Partial<Record<TimeOfDay, number>>;
    artisticTreatmentBreakdown: Partial<Record<ArtisticTreatment, number>>;
}

/**
 * Build an aggregate advisory summary over a set of source assets' quality
 * metadata. Used to surface pool shape into Copy Forge so it can write
 * narrative roles aligned with what the pool actually contains.
 */
export function buildSourcePoolAdvisory(metadata: readonly SourceQualityMetadata[]): SourcePoolAdvisory {
    if (metadata.length === 0) {
        return {
            sampleSize: 0,
            averagePeopleCount: 0,
            bestGroupActionScore: 0,
            bestThemeLegibilityScore: 0,
            compositionFamilyBreakdown: {},
            timeOfDayBreakdown: {},
            artisticTreatmentBreakdown: {},
        };
    }

    const compositionBreakdown: Partial<Record<CompositionFamily, number>> = {};
    const timeBreakdown: Partial<Record<TimeOfDay, number>> = {};
    const treatmentBreakdown: Partial<Record<ArtisticTreatment, number>> = {};
    let totalPeople = 0;
    let bestGroup = 0;
    let bestTheme = 0;

    for (const m of metadata) {
        compositionBreakdown[m.compositionFamily] = (compositionBreakdown[m.compositionFamily] ?? 0) + 1;
        timeBreakdown[m.timeOfDay] = (timeBreakdown[m.timeOfDay] ?? 0) + 1;
        treatmentBreakdown[m.artisticTreatment] = (treatmentBreakdown[m.artisticTreatment] ?? 0) + 1;
        totalPeople += m.peopleCount;
        if (m.groupActionScore > bestGroup) bestGroup = m.groupActionScore;
        if (m.themeLegibilityScore > bestTheme) bestTheme = m.themeLegibilityScore;
    }

    return {
        sampleSize: metadata.length,
        averagePeopleCount: Math.round((totalPeople / metadata.length) * 10) / 10,
        bestGroupActionScore: bestGroup,
        bestThemeLegibilityScore: bestTheme,
        compositionFamilyBreakdown: compositionBreakdown,
        timeOfDayBreakdown: timeBreakdown,
        artisticTreatmentBreakdown: treatmentBreakdown,
    };
}
