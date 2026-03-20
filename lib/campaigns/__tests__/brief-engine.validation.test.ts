import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, VideoBrief } from '../schema';
import type { Campaign } from '../types';
import { validateBrief } from '../brief-engine/validation';
import { applyAutoFixes } from '../brief-engine/auto-fix';

function makeVideoConcept(overrides: Partial<VideoBrief> = {}): VideoBrief {
    return {
        title: 'Test Video',
        durationSeconds: 15,
        tool: 'runwayml',
        scriptOrNarration: 'Join us at sea.',
        visualDirectionNotes: 'Wide establishing travel shot.',
        avatarRequired: false,
        backgroundDescription: 'Ocean horizon and open deck.',
        musicMood: 'warm travel pulse',
        ...overrides,
    };
}

function makeCampaign(): Campaign {
    return {
        PK: 'CAMPAIGN#brief-engine-test',
        SK: 'METADATA',
        id: 'brief-engine-test',
        name: 'Brief Engine Test',
        description: 'Regression coverage for brief-engine validation.',
        targetDates: '2027-08-01 to 2027-08-08',
        targetDestination: 'Caribbean',
        shipTarget: 'Rhapsody of the Seas',
        targetingKeywords: ['travel'],
        allowedThemeSignals: ['vacation-first'],
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
    };
}

function makeBrief(): CampaignAestheticBrief {
    return {
        slug: 'brief-engine-test',
        themeName: 'Brief Engine Test',
        visual: {
            aestheticLabel: 'Soft Dawn Grain at Sea',
            colorPalette: {
                primary: '#2D6A73',
                secondary: '#6B6F72',
                accent: '#FF6B5A',
                background: '#F6F1E8',
                textOnDark: '#F3F6F8',
                textOnLight: '#0E0E10',
            },
            typographyDirection: {
                headlineStyle: 'brand grotesk',
                bodyStyle: 'humanist sans',
                suggestedFonts: ['Inter'],
            },
            imageryMood: 'unhurried analog warmth at sea',
            lightingStyle: 'golden hour rim with open shade',
            compositionNotes: 'Ship-first framing with rail lines and horizon depth.',
            avoidList: ['crowded tables', 'tripods', 'staged programming'],
            referenceMoodboard: ['rail at dawn', 'window-side dining', 'wake line'],
            plausibilityFramework: {
                governingPrinciple: 'Keep the niche folded into ordinary cruise life.',
                cruiseNativeMoments: ['rail stroll', 'window-side coffee'],
                nicheEnhancedMoments: ['small print exchange'],
                implausibleLiteralizations: ['darkroom build', 'projector screening'],
                allowedProps: ['pocket notebook', 'postcard'],
                discouragedProps: ['tripod'],
            },
            humanRepresentation: {
                castingGoal: 'Show varied guests in believable ship life.',
                ageRangeGuidance: 'Late 20s to 60s+',
                diversityIntent: 'Visible diversity without tokenism.',
                pairingGuidance: 'Mix solos, friends, couples, and intergenerational pairs.',
                stylingGuidance: 'Cruise-casual with subtle analog cues.',
                antiStereotypeRules: ['No caricature.', 'No muse-photographer trope.'],
            },
        },
        messaging: {
            heroSlogan: 'Sail first, share tiny windows.',
            subSlogan: 'Swap a print, keep strolling.',
            ctaVariants: {
                waitlist: 'Get on the list',
                bookNow: 'Reserve your cabin',
                merch: 'Shop the tee',
                share: 'Invite a friend',
            },
            elevatorPitch: 'A cruise-native analog social concept for travelers who like quiet shared moments.',
            toneKeywords: ['ocean-first', 'analog-warm', 'welcoming'],
            voicePersona: 'The calm friend who spots good light first.',
        },
        communityExpression: {
            corePromise: 'Find your people in small analog moments between normal ship rhythms.',
            participationStyle: 'Entirely optional and low-pressure. Join for a moment, drift out whenever you want, or skip it completely without missing anything.',
            socialGravity: 'Shared taste sparks conversation.',
            optionalGatherings: ['Daily meetup in the same spot.'],
            belongingSignals: ['notebook', 'pin'],
            solitudeAntiPatterns: ['exclusive energy'],
            visualTogethernessNotes: 'Small groups at the rail or table.',
            copyFramingRule: 'Use explicitly optional language: join if you like, stay for a minute, or keep moving without missing anything.',
        },
        socialConcepts: {} as unknown as CampaignAestheticBrief['socialConcepts'],
        videoConcepts: {
            heroExplainer: makeVideoConcept({ title: 'Hero Explainer', durationSeconds: 60 }),
            tiktokSeed: makeVideoConcept({ title: 'TikTok Seed', durationSeconds: 15 }),
            thresholdAnnouncement: makeVideoConcept({ title: 'Threshold Announcement', durationSeconds: 30 }),
            merchReveal: makeVideoConcept({ title: 'Merch Reveal', durationSeconds: 20 }),
            countdownSeries: [makeVideoConcept({ title: 'Countdown', durationSeconds: 10 })],
        },
        merch: {
            conceptStatement: 'Analog-social cruise merch.',
            coreItem: {
                productType: 'T-Shirt',
                designDescription: 'Small wave stamp and frame icon.',
                colorway: 'navy and coral',
                dallePrompt: 'print-ready cruise t-shirt graphic',
                printfulProductId: 'bella-canvas-3001',
            },
            practicalItem: {
                productType: 'Pocket tee',
                designDescription: 'Pocket stamp icon.',
                colorway: 'cream and ink',
                dallePrompt: 'print-ready pocket tee graphic',
                printfulProductId: 'gildan-64000',
            },
            nicheSpecificItems: [],
            logoConceptDescription: 'Frame and stamp paired mark.',
            tagline: 'Sea-day simple.',
            printStyle: 'two-color vector',
        },
        audio: {
            ambientNarrationScript: 'Morning hush over the water.',
            hypeClipScript: 'A breeze, a rail, a postcard smile.',
            voiceProfile: 'calm and warm',
            musicMood: 'lo-fi bossa travel',
        },
        generatedAt: '2026-03-18T00:00:00.000Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
        productionBible: {
            sceneLibrary: [
                {
                    sceneId: 'scene_sailaway_rail',
                    location: 'open deck rail at sailaway',
                    timeOfDay: 'golden hour',
                    lighting: 'soft directional daylight',
                    cameraAngle: 'handheld medium-wide from shoulder height',
                    subjectAction: 'two guests lean on the rail and trade quick recommendations',
                    environmentDetails: 'breeze through jackets, wake line behind the ship, horizon glow',
                    mood: 'unhurried analog warmth',
                    imagePrompt: 'cruise sailaway moment with relaxed companionship',
                    referenceCategory: 'exterior',
                },
            ],
            storyboards: [
                {
                    deliverableId: 'tiktok_seed',
                    title: 'TikTok Seed',
                    totalDurationSeconds: 15,
                    shotSequence: [
                        {
                            shotNumber: 1,
                            sceneId: 'scene_sailaway_rail',
                            durationSeconds: 15,
                            cameraMovement: 'handheld',
                            subjectMotion: 'lean and glance outward',
                            environmentMotion: 'ship wake and breeze',
                            transitionIn: 'hard cut',
                            transitionOut: 'end card',
                            emotionalBeat: 'instant vacation pull',
                            narrationSegment: 'Sail first, share tiny windows.',
                            musicCue: 'light percussion with forward motion',
                        },
                    ],
                    narrationScript: 'Sail first, share tiny windows.',
                    musicDirection: 'Buoyant, modern, travel-forward rhythm.',
                    editingStyle: 'Fast but legible cuts, vacation-first clarity.',
                },
            ],
            globalDirectionNotes: 'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded. Keep every moment cruise-first and optional.',
            avoidDirectives: [
                'No crane, dolly, tracking shot, slider, or cable-cam language.',
                'No gangway exchanges, handoffs, or choreographed embarkation moments.',
            ],
        },
        landingStillBible: {
            stillLibrary: [
                {
                    stillId: 'hero_primary',
                    usage: 'hero_primary',
                    location: 'open deck rail at sailaway',
                    timeOfDay: 'golden hour',
                    lighting: 'soft directional daylight',
                    composition: 'rule of thirds with horizon depth',
                    subjectAction: 'two guests share a quiet laugh at the rail',
                    environmentDetails: 'wake line, open water, relaxed spacing',
                    mood: 'unhurried analog warmth',
                    imagePrompt: 'cruise sailaway moment with relaxed companionship',
                    referenceCategory: 'exterior',
                },
            ],
            globalDirectionNotes: 'Cruise-first, horizon-led, plausible ship-life moments.',
            avoidDirectives: ['No staged event energy.'],
        },
    };
}

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${label}`);
        passed++;
    } catch (error) {
        console.error(`  ✗ ${label}`);
        console.error(`    ${error instanceof Error ? error.message : String(error)}`);
        failed++;
    }
}

console.log('\nBrief Engine Validation Regression\n');

const campaign = makeCampaign();

test('policy-only avoidDirectives do not trigger executable media blockers', () => {
    const validation = validateBrief(makeBrief(), campaign);

    assert.equal(validation.passed, true);
    assert.ok(!validation.issues.some((issue) => issue.code === 'camera_move_feasibility'));
    assert.ok(!validation.issues.some((issue) => issue.code === 'gangway_exchange_prohibited'));
});

test('auto-fixes clear executable camera and gangway blockers', () => {
    const failingBrief = makeBrief();
    failingBrief.productionBible!.sceneLibrary[0].cameraAngle = 'crane move over the rail';
    failingBrief.productionBible!.sceneLibrary[0].subjectAction = 'friends stage gangway exchanges before embarkation';
    failingBrief.productionBible!.sceneLibrary[0].imagePrompt = 'tracking shot of guests trading prints at the gangway';
    failingBrief.productionBible!.storyboards[0].shotSequence[0].cameraMovement = 'slider push-in';
    failingBrief.productionBible!.storyboards[0].narrationScript = 'A gangway handoff opens the story.';

    const initialValidation = validateBrief(failingBrief, campaign);
    assert.ok(initialValidation.issues.some((issue) => issue.code === 'camera_move_feasibility'));
    assert.ok(initialValidation.issues.some((issue) => issue.code === 'gangway_exchange_prohibited'));

    const fixResult = applyAutoFixes(failingBrief, initialValidation.issues);
    const finalValidation = validateBrief(fixResult.brief, campaign);

    assert.ok(fixResult.fixedCodes.includes('camera_move_feasibility'));
    assert.ok(fixResult.fixedCodes.includes('gangway_exchange_prohibited'));
    assert.ok(!finalValidation.issues.some((issue) => issue.code === 'camera_move_feasibility'));
    assert.ok(!finalValidation.issues.some((issue) => issue.code === 'gangway_exchange_prohibited'));
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}