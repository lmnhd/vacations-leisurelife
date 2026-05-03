/**
 * TikTok seed format tests.
 * Run with: npx tsx --env-file=.env.local lib/campaigns/media/__tests__/tiktok-seed-format.test.ts
 */

import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, ProductionBible, SceneSpec, Storyboard } from '../../../schema';
import { buildOrganicSeedShotPrompts } from '../generators/tiktok-formats/organic-seed';

async function main() {
    let passedCount = 0;
    let failedCount = 0;

    async function test(label: string, fn: () => Promise<void> | void): Promise<void> {
        try {
            await fn();
            console.log(`PASS ${label}`);
            passedCount += 1;
        } catch (error) {
            console.error(`FAIL ${label}`);
            console.error(`  ${error instanceof Error ? error.message : String(error)}`);
            failedCount += 1;
        }
    }

    await test('organic tiktok prompts read the storyboard scene menu', () => {
        const sceneLibrary: SceneSpec[] = [
            {
                sceneId: 'exterior',
                location: 'aft deck rail',
                timeOfDay: 'sunset',
                lighting: 'warm sunset',
                cameraAngle: 'wide ship-first frame',
                subjectAction: 'two guests lean over a rail while a dice tray rests nearby',
                environmentDetails: 'board-game cruise atmosphere with ocean light',
                mood: 'sunset wonder',
                imagePrompt: 'Sunset light spills over the aft deck as two guests lean at the rail, a dice tray and a tucked game box signaling a playful board-game cruise moment, observational travel photography, natural available light, 35mm film grain, Fuji Velvia warmth, casual editorial, mid-distance candid framing',
                referenceCategory: 'exterior',
            },
            {
                sceneId: 'dining',
                location: 'window-side dining table',
                timeOfDay: 'blue hour',
                lighting: 'soft dining light',
                cameraAngle: 'static table angle',
                subjectAction: 'friends compare score sheets between courses',
                environmentDetails: 'board-game pieces near the bread basket and harbor reflections outside',
                mood: 'belonging',
                imagePrompt: 'Blue-hour dining glow frames friends comparing score sheets beside a visible board edge, a real board-game cruise dinner with easy social warmth, observational travel photography, natural available light, 35mm film grain, Fuji Velvia warmth, casual editorial, mid-distance candid framing',
                referenceCategory: 'dining',
            },
            {
                sceneId: 'atrium',
                location: 'atrium landing',
                timeOfDay: 'evening',
                lighting: 'warm atrium glow',
                cameraAngle: 'eye-level',
                subjectAction: 'a pair pauses with a game box before heading onward',
                environmentDetails: 'glass elevators and layered balconies',
                mood: 'playful discovery',
                imagePrompt: 'Warm atrium light catches a pair pausing with a game box before heading onward, a board-game cruise cue in a real ship interior, observational travel photography, natural available light, 35mm film grain, Fuji Velvia warmth, casual editorial, mid-distance candid framing',
                referenceCategory: 'atrium',
            },
            {
                sceneId: 'nightclub',
                location: 'night lounge corner',
                timeOfDay: 'night',
                lighting: 'dim practicals',
                cameraAngle: 'intimate static medium shot',
                subjectAction: 'friends lean in over a long game in progress',
                environmentDetails: 'music spill and table-side concentration',
                mood: 'after-hours electric',
                imagePrompt: 'Night lounge practicals glow around friends leaning in over a long game in progress, a board-game cruise scene with real social texture and no staged workshop energy, observational travel photography, natural available light, 35mm film grain, Fuji Velvia warmth, casual editorial, mid-distance candid framing',
                referenceCategory: 'nightclub',
            },
        ];

        const storyboard: Storyboard = {
            deliverableId: 'tiktok_seed',
            title: 'Board Games at Sea TikTok Seed',
            totalDurationSeconds: 35,
            shotSequence: [
                {
                    shotNumber: 1,
                    sceneId: 'exterior',
                    durationSeconds: 8,
                    cameraMovement: 'static',
                    subjectMotion: 'still presence',
                    environmentMotion: 'sea shimmer',
                    transitionIn: 'hard cut',
                    transitionOut: 'straight cut',
                    emotionalBeat: 'hook',
                    narrationSegment: 'Hook',
                    musicCue: 'ambient bed',
                },
                {
                    shotNumber: 2,
                    sceneId: 'dining',
                    durationSeconds: 9,
                    cameraMovement: 'static',
                    subjectMotion: 'still presence',
                    environmentMotion: 'table reflections',
                    transitionIn: 'straight cut',
                    transitionOut: 'straight cut',
                    emotionalBeat: 'build',
                    narrationSegment: 'Build',
                    musicCue: 'ambient bed',
                },
                {
                    shotNumber: 3,
                    sceneId: 'atrium',
                    durationSeconds: 9,
                    cameraMovement: 'static',
                    subjectMotion: 'still presence',
                    environmentMotion: 'atrium glow',
                    transitionIn: 'straight cut',
                    transitionOut: 'straight cut',
                    emotionalBeat: 'peak',
                    narrationSegment: 'Peak',
                    musicCue: 'ambient bed',
                },
                {
                    shotNumber: 4,
                    sceneId: 'nightclub',
                    durationSeconds: 9,
                    cameraMovement: 'static',
                    subjectMotion: 'still presence',
                    environmentMotion: 'lights and reflections',
                    transitionIn: 'straight cut',
                    transitionOut: 'fade out',
                    emotionalBeat: 'payoff',
                    narrationSegment: 'Payoff',
                    musicCue: 'fade out',
                },
            ],
            narrationScript: 'Hook. Build. Peak. Payoff.',
            musicDirection: 'Text-first social montage',
            editingStyle: 'Static and legible',
        };

        const brief = {
            themeName: 'Board Games at Sea',
            visual: {
                aestheticLabel: 'playful collective',
                imageryMood: 'warm social cruising',
                lightingStyle: 'natural ship light',
                colorPalette: {
                    primary: '#000000',
                    secondary: '#ffffff',
                    accent: '#f0b000',
                },
                plausibilityFramework: {
                    governingPrinciple: 'Keep the board-game identity visible through a real playable object and social table energy.',
                    cruiseNativeMoments: ['sailaway rail conversation'],
                    nicheEnhancedMoments: ['shared table play', 'easy guest-to-guest comparison of game pieces'],
                    implausibleLiteralizations: ['classroom workshop staging'],
                    allowedProps: ['dice', 'cards', 'meeples', 'game box'],
                    discouragedProps: ['microscope'],
                },
                typographyDirection: {
                    headlineStyle: '',
                    bodyStyle: '',
                    suggestedFonts: [],
                },
                avoidList: [],
                referenceMoodboard: [],
                humanRepresentation: {
                    castingGoal: '',
                    ageRangeGuidance: '',
                    diversityIntent: '',
                    pairingGuidance: '',
                    stylingGuidance: '',
                    antiStereotypeRules: [],
                },
                compositionNotes: '',
            },
            messaging: {
                heroSlogan: 'Board Games at Sea',
                subSlogan: 'Play, cruise, repeat.',
                ctaVariants: {
                    waitlist: 'Waitlist',
                    bookNow: 'Book now',
                    merch: 'Merch',
                    share: 'Share',
                },
                elevatorPitch: 'A cruise with social play at the center.',
                toneKeywords: ['playful', 'social'],
                voicePersona: 'warm',
            },
            communityExpression: {
                corePromise: 'optional togetherness',
                participationStyle: 'easy',
                socialGravity: 'shared game nights',
                optionalGatherings: [],
                belongingSignals: ['dice trays', 'board edges'],
                solitudeAntiPatterns: [],
                visualTogethernessNotes: 'pairs at a table',
                copyFramingRule: 'keep it light',
            },
            socialConcepts: {
                tiktokOrganic: {
                    hook: 'Your kind of cruise.',
                    narrative: {
                        title: '',
                        durationSeconds: 35,
                        tool: 'runwayml',
                        scriptOrNarration: '',
                        visualDirectionNotes: '',
                        avatarRequired: false,
                        backgroundDescription: '',
                        musicMood: '',
                    },
                    caption: '',
                    hashtags: [],
                    callToAction: 'Book now',
                },
                instagramReels: { visualConcept: '', audioTrackType: '', caption: '', hashtags: [] },
                instagramFeed: { carouselSlides: [], singlePostConcept: '', caption: '' },
                facebookAd: { headline: '', primaryText: '', description: '', cta: '', visualDescription: '' },
                youtubeShort: { title: '', visualConcept: '', description: '', hashtags: [] },
                pinterest: { pinTitle: '', pinDescription: '', visualConcept: '' },
                emailHeader: { subjectLine: '', preheader: '', bodyDirection: '', visualDirection: '' },
                discordBanner: { serverBannerDescription: '', welcomeMessageDirection: '' },
            },
            videoConcepts: {
                heroExplainer: {
                    title: '',
                    durationSeconds: 60,
                    tool: 'runwayml',
                    scriptOrNarration: '',
                    visualDirectionNotes: '',
                    avatarRequired: false,
                    backgroundDescription: '',
                    musicMood: '',
                },
                tiktokSeed: {
                    title: '',
                    durationSeconds: 35,
                    tool: 'runwayml',
                    scriptOrNarration: '',
                    visualDirectionNotes: '',
                    avatarRequired: false,
                    backgroundDescription: '',
                    musicMood: '',
                },
                thresholdAnnouncement: {
                    title: '',
                    durationSeconds: 30,
                    tool: 'runwayml',
                    scriptOrNarration: '',
                    visualDirectionNotes: '',
                    avatarRequired: false,
                    backgroundDescription: '',
                    musicMood: '',
                },
                merchReveal: {
                    title: '',
                    durationSeconds: 30,
                    tool: 'runwayml',
                    scriptOrNarration: '',
                    visualDirectionNotes: '',
                    avatarRequired: false,
                    backgroundDescription: '',
                    musicMood: '',
                },
                countdownSeries: [],
            },
            merch: {
                conceptStatement: '',
                coreItem: {
                    productType: '',
                    designDescription: '',
                    colorway: '',
                    dallePrompt: '',
                    printfulProductId: '',
                },
                practicalItem: {
                    productType: '',
                    designDescription: '',
                    colorway: '',
                    dallePrompt: '',
                    printfulProductId: '',
                },
                nicheSpecificItems: [],
                logoConceptDescription: '',
                tagline: '',
                printStyle: '',
            },
            audio: {
                ambientNarrationScript: '',
                hypeClipScript: '',
                voiceProfile: '',
                musicMood: '',
            },
            productionBible: {
                sceneLibrary,
                storyboards: [storyboard],
                globalDirectionNotes: '',
                avoidDirectives: [],
            },
        } as CampaignAestheticBrief;

        const prompts = buildOrganicSeedShotPrompts(brief);

        assert.match(prompts[0], /exterior/i);
        assert.match(prompts[1], /dining/i);
        assert.match(prompts[2], /atrium/i);
        assert.match(prompts[3], /nightclub/i);
        assert.match(prompts[1], /dice|cards|meeples|game box/i);
    });

    if (failedCount > 0) {
        throw new Error(`${failedCount} TikTok seed format test(s) failed`);
    }

    console.log(`\n${passedCount} TikTok seed format tests passed`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
