import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, VideoBrief } from '../schema';
import type { Campaign } from '../types';
import type { TrinityAgentTurn } from '../trinity/types';
import { trinityBuilderAgent } from '../trinity/agents/builder';
import { trinityDesignerAgent } from '../trinity/agents/designer';
import { trinityReviewerAgent } from '../trinity/agents/reviewer';
import { trinityDeterministicKernel } from '../trinity/deterministic-kernel';

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
        PK: 'CAMPAIGN#film-and-zine-afloat-2026',
        SK: 'METADATA',
        id: 'film-and-zine-afloat-2026',
        name: 'Film & Zine Afloat: Two Tiny Windows',
        description: 'Cruise-native analog-social campaign.',
        targetDates: '2026-08-01 to 2026-08-08',
        targetDestination: 'Caribbean & Bahamas',
        shipTarget: 'Rhapsody of the Seas',
        targetingKeywords: ['film', 'zines', 'analog travel'],
        allowedThemeSignals: ['analog warmth', 'rail-side companionship', 'postcard exchange'],
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
    };
}

function makeBrief(): CampaignAestheticBrief {
    return {
        slug: 'film-and-zine-afloat-2026',
        themeName: 'Film & Zine Afloat: Two Tiny Windows',
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
            avoidList: ['crowded tables', 'tripods', 'workshop staging'],
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
            elevatorPitch: 'A hosted session at sea for analog travelers.',
            toneKeywords: ['ocean-first', 'analog-warm', 'welcoming'],
            voicePersona: 'The calm friend who spots good light first.',
        },
        communityExpression: {
            corePromise: 'Find your people in small analog moments between normal ship rhythms.',
            participationStyle: 'Structured, scheduled, and easy to attend.',
            socialGravity: 'Shared taste sparks conversation.',
            optionalGatherings: ['Daily meetup in the same spot.'],
            belongingSignals: ['notebook', 'pin'],
            solitudeAntiPatterns: ['exclusive energy'],
            visualTogethernessNotes: 'Small groups at the rail or table.',
            copyFramingRule: 'Attend the hosted session and stay on schedule.',
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
    };
}

let passed = 0;
let failed = 0;

function test(label: string, fn: () => Promise<void> | void): Promise<void> {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            console.log(`  ✓ ${label}`);
            passed++;
        })
        .catch((error) => {
            console.error(`  ✗ ${label}`);
            console.error(`    ${error instanceof Error ? error.message : String(error)}`);
            failed++;
        });
}

console.log('\nTrinity Pipeline Regression\n');

async function main(): Promise<void> {
    await test('builder seeds feasible production artifacts on round one', async () => {
        const campaign = makeCampaign();
        const brief = makeBrief();

        const result = await trinityBuilderAgent.run({
            campaign,
            brief,
            round: 1,
            history: [],
            kernelNotes: [],
        });

        assert.ok(result.brief.productionBible, 'productionBible should be present');
        assert.ok(result.brief.landingStillBible, 'landingStillBible should be present');
        trinityDeterministicKernel.assertProductionBibleFeasibility(result.brief.productionBible!);
    });

    await test('reviewer rejects workshop drift and optionality drift, then approves after designer deterministic revision', async () => {
        const campaign = makeCampaign();
        const initialBrief = makeBrief();

        const builderTurnResult = await trinityBuilderAgent.run({
            campaign,
            brief: initialBrief,
            round: 1,
            history: [],
            kernelNotes: [],
        });

        const reviewerRoundOne = await trinityReviewerAgent.run({
            campaign,
            brief: builderTurnResult.brief,
            round: 1,
            history: [],
            kernelNotes: [],
        });

        assert.equal(reviewerRoundOne.decision.approved, false);
        assert.deepEqual(
            reviewerRoundOne.decision.feedback.map((item) => item.code).sort(),
            ['optionality_language_missing', 'workshop_language_survives'],
        );

        const reviewerTurn: TrinityAgentTurn = {
            agent: 'reviewer',
            round: 1,
            brief: builderTurnResult.brief,
            decision: reviewerRoundOne.decision,
            createdAt: '2026-03-18T00:00:01.000Z',
        };

        const designerRoundTwo = await trinityDesignerAgent.run({
            campaign,
            brief: builderTurnResult.brief,
            round: 2,
            history: [reviewerTurn],
            kernelNotes: [],
        });

        assert.match(designerRoundTwo.brief.communityExpression.participationStyle, /optional|low-pressure/i);
        assert.match(designerRoundTwo.brief.communityExpression.copyFramingRule, /join if you like|without missing anything/i);
        assert.doesNotMatch(JSON.stringify(designerRoundTwo.brief), /hosted session|event-program|managed program|\bworkshop\b/i);

        const reviewerRoundTwo = await trinityReviewerAgent.run({
            campaign,
            brief: designerRoundTwo.brief,
            round: 2,
            history: [reviewerTurn],
            kernelNotes: [],
        });

        assert.equal(reviewerRoundTwo.decision.approved, true);
        assert.deepEqual(reviewerRoundTwo.decision.feedback, []);
    });

    await test('builder deterministically rebuilds invalid production artifacts after reviewer kernel failure', async () => {
        const campaign = makeCampaign();
        const baseBrief = makeBrief();
        const designerReviewerTurn: TrinityAgentTurn = {
            agent: 'reviewer',
            round: 1,
            brief: baseBrief,
            decision: {
                approved: false,
                feedback: [
                    {
                        code: 'workshop_language_survives',
                        message: 'Workshop, salon, hosted-session, or event-program language still appears in the brief.',
                        targetRole: 'designer',
                        severity: 'blocker',
                    },
                    {
                        code: 'optionality_language_missing',
                        message: 'communityExpression no longer clearly signals optional, low-pressure participation.',
                        targetRole: 'designer',
                        severity: 'blocker',
                    },
                ],
            },
            createdAt: '2026-03-18T00:00:01.500Z',
        };

        const designerFixedBrief = (await trinityDesignerAgent.run({
            campaign,
            brief: baseBrief,
            round: 2,
            history: [designerReviewerTurn],
            kernelNotes: [],
        })).brief;

        const seededBrief = (await trinityBuilderAgent.run({
            campaign,
            brief: designerFixedBrief,
            round: 1,
            history: [],
            kernelNotes: [],
        })).brief;

        assert.ok(seededBrief.productionBible, 'seeded productionBible should be present');
        assert.ok(seededBrief.landingStillBible, 'seeded landingStillBible should be present');

        const invalidBrief: CampaignAestheticBrief = {
            ...seededBrief,
            productionBible: {
                ...seededBrief.productionBible!,
                avoidDirectives: ['No generic interiors without ship identity'],
                storyboards: seededBrief.productionBible!.storyboards.map((storyboard, index) => (
                    index === 0
                        ? {
                            ...storyboard,
                            shotSequence: storyboard.shotSequence.map((shot, shotIndex) => (
                                shotIndex === 0
                                    ? { ...shot, cameraMovement: 'crane drop revealing the table' }
                                    : shot
                            )),
                        }
                        : storyboard
                )),
            },
            landingStillBible: {
                ...seededBrief.landingStillBible!,
                avoidDirectives: ['No generic interiors without ship identity'],
            },
        };

        const reviewerRoundOne = await trinityReviewerAgent.run({
            campaign,
            brief: invalidBrief,
            round: 1,
            history: [],
            kernelNotes: [],
        });

        assert.equal(reviewerRoundOne.decision.approved, false);
        assert.deepEqual(
            reviewerRoundOne.decision.feedback.map((item) => item.code).sort(),
            ['avoid_directives_too_weak', 'production_kernel_failure'],
        );

        const reviewerTurn: TrinityAgentTurn = {
            agent: 'reviewer',
            round: 1,
            brief: invalidBrief,
            decision: reviewerRoundOne.decision,
            createdAt: '2026-03-18T00:00:02.000Z',
        };

        const builderRoundTwo = await trinityBuilderAgent.run({
            campaign,
            brief: invalidBrief,
            round: 2,
            history: [reviewerTurn],
            kernelNotes: [],
        });

        trinityDeterministicKernel.assertProductionBibleFeasibility(builderRoundTwo.brief.productionBible!);
        assert.ok(
            builderRoundTwo.brief.productionBible!.avoidDirectives.some((directive) => directive.includes('crowded tables')),
            'deterministic rebuild should restore avoid-list coverage',
        );

        const reviewerRoundTwo = await trinityReviewerAgent.run({
            campaign,
            brief: builderRoundTwo.brief,
            round: 2,
            history: [reviewerTurn],
            kernelNotes: [],
        });

        assert.equal(reviewerRoundTwo.decision.approved, true);
        assert.deepEqual(reviewerRoundTwo.decision.feedback, []);
    });

    console.log(`\nPassed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
