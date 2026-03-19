import { z } from 'zod';
import { ModelName, getModelConfig } from '@/lib/ai/llm-gateway';
import { ProductionBibleSchema, LandingStillBibleSchema, type LandingStillBible, type ProductionBible } from '../../schema';
import type { TrinityAgent, TrinityAgentContext, TrinityAgentResult, TrinityFeedbackItem } from '../types';
import { generateStructuredTrinityObject } from '../structured-generation';

// ────────────────────────────────────────────────────────────────────────────
// Schema — Builder produces ONLY production artifacts
// ────────────────────────────────────────────────────────────────────────────

const BuilderOutputSchema = z.object({
    productionBible: ProductionBibleSchema,
    landingStillBible: LandingStillBibleSchema,
});

const REQUIRED_SAFETY_OPS = 'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.';

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders — pure string functions, no conditional logic inside prompts
// ────────────────────────────────────────────────────────────────────────────

const BUILDER_SYSTEM_GENERATION = `
You are the Production Builder in the Trinity aesthetic pipeline for Leisure Life Interactive.

Your role is exclusive to production planning: the productionBible (sceneLibrary + storyboards) and landingStillBible.
You do not touch messaging, visual identity, community expression, or merch. Those belong to the Designer.

PRODUCTION RULES:
- Every scene in sceneLibrary must be filmable on a real cruise ship without special equipment.
- Forbidden camera moves: crane, dolly, tracking shots, slider, cable cam. Use handheld, steadicam, or static only.
- No interior-window cabin contradictions: interior staterooms never have ocean views in the same scene.
- No gangway exchange choreography of any kind.
- Storyboard shotSequence durations must sum exactly to totalDurationSeconds.
- globalDirectionNotes MUST include the exact sentence: "Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded."
- Scenes must read cruise-first. Niche identity emerges through subject actions, not onboard signage or infrastructure.
- Vary ship reference categories across the scene library: exterior, pool_deck, dining, stateroom, atrium, nightclub, spa, destination_port, theater, sports_deck.
- Landing stills must cover hero_primary, hero_alt, concept, email_header, and social_square usages.
- avoidDirectives must capture concrete prohibitions derived from the brief avoidList and plausibilityFramework.

DELIVERABLE STORYBOARDS:
Generate storyboards for at minimum: tiktok_seed (15s), hero_explainer (60s), threshold_announcement (30s), countdown_1 (10s).
`.trim();

const BUILDER_SYSTEM_REVISION = `
You are the Production Builder in the Trinity aesthetic pipeline for Leisure Life Interactive.

You are in a revision round. The Reviewer has returned structured feedback targeting your production artifacts.

REVISION RULES:
- Address each feedback item listed in REVIEWER_FEEDBACK exactly as described.
- Do not modify fields not mentioned in the feedback.
- globalDirectionNotes must always retain the full safety-ops sentence — never remove it.
- All kernel constraints remain in effect:
  - No crane/dolly/tracking camera moves
  - No interior-window contradictions
  - No gangway exchange choreography
  - Storyboard durations must still sum exactly
- Produce the complete productionBible and landingStillBible in the output even for minor patches.
`.trim();

function buildBriefContext(context: TrinityAgentContext): string {
    const { brief, campaign } = context;

    return [
        `Campaign: ${campaign.name}`,
        `Ship: ${campaign.shipTarget ?? campaign.matchedShipName ?? 'TBD'}`,
        `Destination: ${campaign.targetDestination ?? 'TBD'}`,
        `Sail Date: ${campaign.matchedSailDate ?? 'TBD'}`,
        `Nights: ${campaign.matchedNights ?? 'TBD'}`,
        '',
        `CREATIVE_BRIEF:\n${JSON.stringify({
            visual: brief.visual,
            messaging: brief.messaging,
            communityExpression: brief.communityExpression,
            audio: brief.audio,
            videoConcepts: brief.videoConcepts,
        }, null, 2)}`,
    ].join('\n');
}

function buildGenerationPrompt(context: TrinityAgentContext): string {
    const briefCtx = buildBriefContext(context);
    return `${briefCtx}\n\nGenerate the productionBible and landingStillBible for this campaign. All kernel constraints must be satisfied.`;
}

function buildRevisionPrompt(context: TrinityAgentContext, feedback: TrinityFeedbackItem[]): string {
    const feedbackJson = JSON.stringify(feedback, null, 2);
    const currentProduction = JSON.stringify({
        productionBible: context.brief.productionBible,
        landingStillBible: context.brief.landingStillBible,
    }, null, 2);

    return [
        buildBriefContext(context),
        `\nCURRENT_PRODUCTION:\n${currentProduction}`,
        `\nREVIEWER_FEEDBACK:\n${feedbackJson}`,
        `\nRevise productionBible and landingStillBible to address all REVIEWER_FEEDBACK items. Return both complete artifacts.`,
    ].join('');
}

// ────────────────────────────────────────────────────────────────────────────
// Agent implementation
// ────────────────────────────────────────────────────────────────────────────

function resolveBuilderFeedback(context: TrinityAgentContext): TrinityFeedbackItem[] {
    return context.history
        .filter((turn) => turn.agent === 'reviewer' && !turn.decision.approved)
        .flatMap((turn) => turn.decision.feedback)
        .filter((item) => item.targetRole === 'builder');
}

function summarizeThemeSignals(context: TrinityAgentContext): string {
    const signals = [
        ...(context.campaign.allowedThemeSignals ?? []),
        ...(context.campaign.targetingKeywords ?? []),
        ...context.brief.messaging.toneKeywords,
    ].map((value) => value.trim()).filter(Boolean);

    return signals.slice(0, 3).join(', ') || context.brief.themeName;
}

function buildSeedProductionArtifacts(context: TrinityAgentContext): {
    productionBible: ProductionBible;
    landingStillBible: LandingStillBible;
} {
    const ship = context.campaign.shipTarget ?? context.campaign.matchedShipName ?? 'the ship';
    const destination = context.campaign.targetDestination ?? 'open water';
    const cues = summarizeThemeSignals(context);
    const heroSlogan = context.brief.messaging.heroSlogan;
    const subSlogan = context.brief.messaging.subSlogan;
    const mood = context.brief.visual.imageryMood;
    const lighting = context.brief.visual.lightingStyle;
    const togetherness = context.brief.communityExpression.visualTogethernessNotes;
    const avoidDirectives = Array.from(new Set([
        ...context.brief.visual.avoidList,
        ...context.brief.visual.plausibilityFramework.implausibleLiteralizations,
        'No crane, dolly, tracking shot, slider, or cable-cam language.',
        'No interior stateroom scenes paired with ocean-view language.',
        'No gangway exchanges, handoffs, or choreographed embarkation moments.',
    ])).filter(Boolean);

    const sceneLibrary: ProductionBible['sceneLibrary'] = [
        {
            sceneId: 'scene_sailaway_rail',
            location: `open deck rail at sailaway on ${ship}`,
            timeOfDay: 'golden hour',
            lighting,
            cameraAngle: 'handheld medium-wide from shoulder height',
            subjectAction: `two guests lean on the rail, trading quick recommendations and looking out toward ${destination}`,
            environmentDetails: `breeze through jackets, wake line behind the ship, horizon glow, ${cues} expressed through posture and small personal details`,
            mood,
            imagePrompt: `${heroSlogan}; cinematic but plausible cruise sailaway moment on ${ship}, two guests at the rail, relaxed companionship, horizon-forward framing, ${cues}, no staged event energy`,
            referenceCategory: 'exterior',
        },
        {
            sceneId: 'scene_window_dining',
            location: 'window-side dining table',
            timeOfDay: 'blue hour',
            lighting: 'soft practical dining light with dusk reflection',
            cameraAngle: 'static three-quarter table angle',
            subjectAction: 'a small group settles into easy conversation between courses, passing along a recommendation rather than performing for camera',
            environmentDetails: `glass reflections, warm table light, ocean darkness outside, subtle group chemistry, ${togetherness}`,
            mood,
            imagePrompt: `real cruise dining scene with three guests at a window-side table, low-pressure conversation, polished but natural travel-ad feel, ${cues}, no staged meetup setup`,
            referenceCategory: 'dining',
        },
        {
            sceneId: 'scene_atrium_drift',
            location: 'atrium landing between decks',
            timeOfDay: 'early evening',
            lighting: 'warm atrium glow with reflective highlights',
            cameraAngle: 'steadicam walk-by at chest height',
            subjectAction: 'friends pause mid-walk to compare what they want to catch next, then drift onward together',
            environmentDetails: 'open vertical space, layered balconies, elegant movement through the ship without stopping traffic',
            mood,
            imagePrompt: `atrium walk-through on a modern cruise ship, two or three guests in motion, easy chemistry, horizon-trip anticipation, ${cues}, no crowd choreography`,
            referenceCategory: 'atrium',
        },
        {
            sceneId: 'scene_pool_deck_morning',
            location: 'quiet pool deck edge',
            timeOfDay: 'morning',
            lighting: 'clean morning sun with soft reflected water light',
            cameraAngle: 'static low-angle medium shot',
            subjectAction: 'a pair of guests share a laugh over coffee before the deck gets busy',
            environmentDetails: 'deck chairs in the distance, water shimmer, open sky, theme cues carried through styling rather than props',
            mood,
            imagePrompt: `morning pool deck on a real cruise ship, paired guests, coffee and conversation, relaxed vacation mood, ${cues}, no staged meetup infrastructure`,
            referenceCategory: 'pool_deck',
        },
        {
            sceneId: 'scene_destination_port',
            location: `${destination} waterfront promenade near port`,
            timeOfDay: 'late afternoon',
            lighting: 'sun-softened harbor light',
            cameraAngle: 'handheld medium tracking beside the subjects',
            subjectAction: 'two guests wander the waterfront, noticing texture and swapping quick observations as they move',
            environmentDetails: 'harbor edge, local color in the background, no excursion staging, walkable and casual',
            mood,
            imagePrompt: `vacation-forward waterfront stroll near cruise port, two guests moving naturally, atmospheric destination texture, ${cues}, no guided-tour framing`,
            referenceCategory: 'destination_port',
        },
        {
            sceneId: 'scene_night_lounge',
            location: 'late-night lounge corner with live-music energy nearby',
            timeOfDay: 'night',
            lighting: 'dim practical pools with warm highlights',
            cameraAngle: 'static intimate medium shot',
            subjectAction: 'friends settle into a quiet booth moment, still energized from the ship around them',
            environmentDetails: 'ambient music spill, glass reflections, layered nightlife background, close conversational focus',
            mood,
            imagePrompt: `cruise lounge at night, intimate booth conversation, chic but welcoming, small-group connection, ${cues}, no exclusive velvet-rope energy`,
            referenceCategory: 'nightclub',
        },
    ];

    const storyboards: ProductionBible['storyboards'] = [
        {
            deliverableId: 'tiktok_seed',
            title: `${heroSlogan} TikTok Seed`,
            totalDurationSeconds: 15,
            shotSequence: [
                { shotNumber: 1, sceneId: 'scene_sailaway_rail', durationSeconds: 5, cameraMovement: 'handheld', subjectMotion: 'lean and glance outward', environmentMotion: 'ship wake and breeze', transitionIn: 'hard cut', transitionOut: 'quick dissolve', emotionalBeat: 'instant vacation pull', narrationSegment: heroSlogan, musicCue: 'light percussion with forward motion' },
                { shotNumber: 2, sceneId: 'scene_window_dining', durationSeconds: 5, cameraMovement: 'static', subjectMotion: 'shared laugh and table gesture', environmentMotion: 'window reflections', transitionIn: 'quick dissolve', transitionOut: 'hard cut', emotionalBeat: 'easy social warmth', narrationSegment: subSlogan, musicCue: 'warm melodic lift' },
                { shotNumber: 3, sceneId: 'scene_destination_port', durationSeconds: 5, cameraMovement: 'handheld', subjectMotion: 'walking side by side', environmentMotion: 'harbor movement in background', transitionIn: 'hard cut', transitionOut: 'end card', emotionalBeat: 'book-the-trip urgency', narrationSegment: context.brief.messaging.ctaVariants.bookNow, musicCue: 'clean end-hit' },
            ],
            narrationScript: `${heroSlogan}. ${subSlogan}. ${context.brief.messaging.ctaVariants.bookNow}.`,
            musicDirection: 'Buoyant, modern, travel-forward rhythm with a warm analog texture.',
            editingStyle: 'Fast but legible cuts, no impossible transitions, vacation-first clarity.',
        },
        {
            deliverableId: 'hero_explainer',
            title: `${heroSlogan} Hero Explainer`,
            totalDurationSeconds: 60,
            shotSequence: [
                { shotNumber: 1, sceneId: 'scene_sailaway_rail', durationSeconds: 12, cameraMovement: 'handheld', subjectMotion: 'settling into the view', environmentMotion: 'breeze through clothing', transitionIn: 'fade in', transitionOut: 'straight cut', emotionalBeat: 'arrival into horizon scale', narrationSegment: heroSlogan, musicCue: 'opening swell' },
                { shotNumber: 2, sceneId: 'scene_pool_deck_morning', durationSeconds: 12, cameraMovement: 'static', subjectMotion: 'coffee sip and shared glance', environmentMotion: 'water shimmer', transitionIn: 'straight cut', transitionOut: 'straight cut', emotionalBeat: 'morning ease', narrationSegment: context.brief.messaging.elevatorPitch, musicCue: 'steady groove' },
                { shotNumber: 3, sceneId: 'scene_window_dining', durationSeconds: 12, cameraMovement: 'static', subjectMotion: 'conversation and recommendation pass', environmentMotion: 'dusk reflections', transitionIn: 'straight cut', transitionOut: 'straight cut', emotionalBeat: 'group belonging without pressure', narrationSegment: context.brief.communityExpression.corePromise, musicCue: 'warmer harmonic layer' },
                { shotNumber: 4, sceneId: 'scene_destination_port', durationSeconds: 12, cameraMovement: 'handheld', subjectMotion: 'walking and noticing', environmentMotion: 'harbor activity', transitionIn: 'straight cut', transitionOut: 'straight cut', emotionalBeat: 'destination texture', narrationSegment: context.brief.communityExpression.copyFramingRule, musicCue: 'open-air lift' },
                { shotNumber: 5, sceneId: 'scene_night_lounge', durationSeconds: 12, cameraMovement: 'static', subjectMotion: 'conversation settles into a smile', environmentMotion: 'ambient nightlife glow', transitionIn: 'straight cut', transitionOut: 'fade out', emotionalBeat: 'close on emotional afterglow', narrationSegment: context.brief.messaging.ctaVariants.waitlist, musicCue: 'soft resolving cadence' },
            ],
            narrationScript: [
                heroSlogan,
                context.brief.messaging.elevatorPitch,
                context.brief.communityExpression.corePromise,
                context.brief.communityExpression.copyFramingRule,
                context.brief.messaging.ctaVariants.waitlist,
            ].join(' '),
            musicDirection: 'Cinematic travel pulse with soft analog warmth and room to breathe.',
            editingStyle: 'Elegant pacing, restrained transitions, human-scale motion, no overcutting.',
        },
        {
            deliverableId: 'threshold_announcement',
            title: `${heroSlogan} Threshold Announcement`,
            totalDurationSeconds: 30,
            shotSequence: [
                { shotNumber: 1, sceneId: 'scene_atrium_drift', durationSeconds: 10, cameraMovement: 'steadicam', subjectMotion: 'walking conversation', environmentMotion: 'ship movement in the background', transitionIn: 'hard cut', transitionOut: 'straight cut', emotionalBeat: 'movement toward belonging', narrationSegment: heroSlogan, musicCue: 'confident downbeat' },
                { shotNumber: 2, sceneId: 'scene_window_dining', durationSeconds: 10, cameraMovement: 'static', subjectMotion: 'small group settles together', environmentMotion: 'evening reflections', transitionIn: 'straight cut', transitionOut: 'straight cut', emotionalBeat: 'proof of optional togetherness', narrationSegment: subSlogan, musicCue: 'steady lift' },
                { shotNumber: 3, sceneId: 'scene_sailaway_rail', durationSeconds: 10, cameraMovement: 'handheld', subjectMotion: 'turn back toward the ship view', environmentMotion: 'horizon glide', transitionIn: 'straight cut', transitionOut: 'end card', emotionalBeat: 'final invitation', narrationSegment: context.brief.messaging.ctaVariants.waitlist, musicCue: 'clean resolve' },
            ],
            narrationScript: `${heroSlogan}. ${subSlogan}. ${context.brief.messaging.ctaVariants.waitlist}.`,
            musicDirection: 'Confident travel cue with clear rhythmic resolve.',
            editingStyle: 'Direct announcement pacing with clean cuts and legible action.',
        },
        {
            deliverableId: 'countdown_1',
            title: `${heroSlogan} Countdown`,
            totalDurationSeconds: 10,
            shotSequence: [
                { shotNumber: 1, sceneId: 'scene_pool_deck_morning', durationSeconds: 5, cameraMovement: 'static', subjectMotion: 'coffee and glance exchange', environmentMotion: 'light water movement', transitionIn: 'hard cut', transitionOut: 'straight cut', emotionalBeat: 'quiet anticipation', narrationSegment: heroSlogan, musicCue: 'tight rhythmic pulse' },
                { shotNumber: 2, sceneId: 'scene_destination_port', durationSeconds: 5, cameraMovement: 'handheld', subjectMotion: 'walking into the next moment', environmentMotion: 'harbor background drift', transitionIn: 'straight cut', transitionOut: 'end card', emotionalBeat: 'trip momentum', narrationSegment: context.brief.messaging.ctaVariants.bookNow, musicCue: 'short uplift finish' },
            ],
            narrationScript: `${heroSlogan}. ${context.brief.messaging.ctaVariants.bookNow}.`,
            musicDirection: 'Short-form upbeat travel sting.',
            editingStyle: 'Punchy and clean with two decisive beats.',
        },
    ];

    const stillLibrary: LandingStillBible['stillLibrary'] = [
        {
            stillId: 'still_hero_primary', usage: 'hero_primary', location: `open deck rail on ${ship}`, timeOfDay: 'golden hour', lighting, composition: 'wide hero frame with horizon occupying the upper third and subjects anchored at the rail', subjectAction: 'two guests share a low-pressure moment of recognition while facing the horizon', environmentDetails: 'wake line, open sky, layered deck geometry, natural styling cues', mood, imagePrompt: `${heroSlogan}; premium-but-real cruise hero still, horizon first, two guests at sailaway rail, ${cues}, no staged event mechanics`, referenceCategory: 'exterior',
        },
        {
            stillId: 'still_hero_alt', usage: 'hero_alt', location: 'window-side dining table', timeOfDay: 'blue hour', lighting: 'soft interior practicals with dusk reflections', composition: 'editorial medium shot with layered table depth and water reflections', subjectAction: 'three guests fall into an easy conversation over dinner', environmentDetails: 'glass reflection, warm table light, visible companionship without crowding', mood, imagePrompt: `window-side cruise dining still with three guests, natural chemistry, travel-ad polish, ${cues}, optional togetherness`, referenceCategory: 'dining',
        },
        {
            stillId: 'still_concept', usage: 'concept', location: `${destination} promenade near port`, timeOfDay: 'late afternoon', lighting: 'soft harbor daylight', composition: 'walking side-profile with destination texture behind the subjects', subjectAction: 'two guests notice something off-frame and keep moving together', environmentDetails: 'waterfront color, relaxed stride, no excursion choreography', mood, imagePrompt: `destination-port concept still, relaxed waterfront walk, cruise vacation atmosphere, ${cues}, believable movement`, referenceCategory: 'destination_port',
        },
        {
            stillId: 'still_email_header', usage: 'email_header', location: 'atrium landing', timeOfDay: 'early evening', lighting: 'warm atrium glow', composition: 'horizontal banner composition with open negative space for headline copy', subjectAction: 'a pair pauses mid-walk and smiles before heading onward', environmentDetails: 'balcony lines, reflective surfaces, travel momentum through the ship', mood, imagePrompt: `email-header cruise still, atrium depth, pair in motion, premium but accessible vacation mood, ${cues}`, referenceCategory: 'atrium',
        },
        {
            stillId: 'still_social_square', usage: 'social_square', location: 'late-night lounge corner', timeOfDay: 'night', lighting: 'warm pools of practical light', composition: 'tight square crop on faces, hands, and table-edge atmosphere', subjectAction: 'friends lean in with a shared laugh as the surrounding ship energy glows softly behind them', environmentDetails: 'nightlife texture, intimate conversation, no exclusivity theater', mood, imagePrompt: `social-square cruise still, close conversation in a lounge corner, warm nightlife energy, ${cues}, approachable and real`, referenceCategory: 'nightclub',
        },
    ];

    return {
        productionBible: {
            sceneLibrary,
            storyboards,
            globalDirectionNotes: `${REQUIRED_SAFETY_OPS} Keep every moment cruise-first, optional, and socially alive without staged agendas, formal facilitation, or orchestrated meetup infrastructure. Niche identity should appear through styling, conversation, and emotional recognition rather than prop-heavy literalization.`,
            avoidDirectives,
        },
        landingStillBible: {
            stillLibrary,
            globalDirectionNotes: `Favor horizon-first vacation energy, small-group companionship, and low-pressure recognition cues. ${REQUIRED_SAFETY_OPS}`,
            avoidDirectives,
        },
    };
}

function supportsDeterministicBuilderRevision(feedback: TrinityFeedbackItem[]): boolean {
    const supportedCodes = new Set([
        'production_artifacts_missing',
        'production_kernel_failure',
        'avoid_directives_too_weak',
    ]);

    return feedback.length > 0 && feedback.every((item) => supportedCodes.has(item.code));
}

function applyDeterministicBuilderRevision(context: TrinityAgentContext): TrinityAgentResult {
    const visualPlanning = buildSeedProductionArtifacts(context);

    return {
        brief: {
            ...context.brief,
            productionBible: visualPlanning.productionBible,
            landingStillBible: visualPlanning.landingStillBible,
        },
        decision: { approved: true, feedback: [] },
    };
}

export const trinityBuilderAgent: TrinityAgent = {
    name: 'builder',

    async run(context: TrinityAgentContext): Promise<TrinityAgentResult> {
        const modelConfig = getModelConfig(ModelName.GPT_5_HIGH);

        const builderFeedback = resolveBuilderFeedback(context);
        const isRevisionRound = builderFeedback.length > 0;
        const canApplyDeterministicRevision = supportsDeterministicBuilderRevision(builderFeedback);

        const hasExistingProduction = !!(context.brief.productionBible && context.brief.landingStillBible);
        const needsGeneration = !hasExistingProduction || isRevisionRound;

        if (!needsGeneration) {
            console.log(`[trinity:builder] round=${context.round} skipping — production artifacts already present, no feedback`);
            return {
                brief: context.brief,
                decision: { approved: true, feedback: [] },
            };
        }

        if (!isRevisionRound) {
            console.log(`[trinity:builder] round=${context.round} generating deterministic seed production artifacts`);
            const visualPlanning = buildSeedProductionArtifacts(context);

            return {
                brief: {
                    ...context.brief,
                    productionBible: visualPlanning.productionBible,
                    landingStillBible: visualPlanning.landingStillBible,
                },
                decision: { approved: true, feedback: [] },
            };
        }

        if (canApplyDeterministicRevision) {
            console.log(`[trinity:builder] round=${context.round} applying deterministic revision for ${builderFeedback.map((item) => item.code).join(', ')}`);
            return applyDeterministicBuilderRevision(context);
        }

        const systemPrompt = isRevisionRound ? BUILDER_SYSTEM_REVISION : BUILDER_SYSTEM_GENERATION;
        const userPrompt = isRevisionRound
            ? buildRevisionPrompt(context, builderFeedback)
            : buildGenerationPrompt(context);

        console.log(`[trinity:builder] round=${context.round} revision=${isRevisionRound} feedbackItems=${builderFeedback.length}`);

        const { object, warnings, modelId } = await generateStructuredTrinityObject({
            preferredModel: ModelName.GPT_5_HIGH,
            schema: BuilderOutputSchema,
            system: systemPrompt,
            prompt: userPrompt,
        });

        if (warnings.length > 0) {
            console.warn(`[trinity:builder] ${warnings.join(' ')}`);
        }

        console.log(`[trinity:builder] using structured model ${modelId} (requested provider=${modelConfig.provider})`);

        const updatedBrief = {
            ...context.brief,
            productionBible: object.productionBible,
            landingStillBible: object.landingStillBible,
        };

        return {
            brief: updatedBrief,
            decision: { approved: true, feedback: [] },
        };
    },
};
