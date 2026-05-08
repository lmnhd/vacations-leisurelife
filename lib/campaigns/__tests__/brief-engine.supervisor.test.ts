import assert from 'node:assert/strict';

import type { CampaignAestheticBrief, VideoBrief } from '../schema';
import { applySupervisorState, buildSupervisorIssueLedger, buildSupervisorRemediationPlan } from '../brief-engine/supervisor';
import type { ValidationIssue } from '../brief-engine/validation';

function makeVideoConcept(overrides: Partial<VideoBrief> = {}): VideoBrief {
    return {
        title: 'Supervisor Test Video',
        durationSeconds: 15,
        tool: 'runwayml',
        scriptOrNarration: 'Cruise-first motion.',
        visualDirectionNotes: 'Open deck moment.',
        avatarRequired: false,
        backgroundDescription: 'Open water and ship rail.',
        musicMood: 'warm travel pulse',
        ...overrides,
    };
}

function makeBrief(): CampaignAestheticBrief {
    return {
        slug: 'brief-supervisor-test',
        themeName: 'Brief Supervisor Test',
        visual: {
            aestheticLabel: 'Warm Atlantic Morning',
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
            imageryMood: 'quiet ship-life warmth',
            lightingStyle: 'golden hour',
            compositionNotes: 'Ship-first framing.',
            avoidList: ['tripods'],
            referenceMoodboard: ['deck rail', 'coffee at dawn'],
            plausibilityFramework: {
                governingPrinciple: 'Keep the niche inside normal cruise life.',
                cruiseNativeMoments: ['deck walk'],
                nicheEnhancedMoments: ['small exchange'],
                implausibleLiteralizations: ['full workshop'],
                allowedProps: ['postcard'],
                discouragedProps: ['tripod'],
            },
            humanRepresentation: {
                castingGoal: 'Believable cruise guests.',
                ageRangeGuidance: 'Late 20s to 60s+',
                diversityIntent: 'Visible diversity without tokenism.',
                pairingGuidance: 'Mix groups naturally.',
                stylingGuidance: 'Cruise-casual.',
                antiStereotypeRules: ['No caricature.'],
            },
        },
        messaging: {
            heroSlogan: 'Cruise first, linger later.',
            subSlogan: 'Keep it light and ship-native.',
            ctaVariants: {
                waitlist: 'Join the list',
                bookNow: 'Reserve your cabin',
                merch: 'Shop the tee',
                share: 'Invite a friend',
            },
            elevatorPitch: 'A ship-first social concept.',
            toneKeywords: ['cruise-first'],
            voicePersona: 'Calm travel friend',
            starterConversation: [],
        },
        communityExpression: {
            corePromise: 'Low-pressure belonging.',
            participationStyle: 'Optional.',
            socialGravity: 'Warm and easy.',
            optionalGatherings: ['Window-side hello.'],
            belongingSignals: ['postcard'],
            solitudeAntiPatterns: ['exclusive energy'],
            visualTogethernessNotes: 'Small groups only.',
            copyFramingRule: 'Optional language only.',
            activityInvitations: [],
        },
        socialConcepts: {} as CampaignAestheticBrief['socialConcepts'],
        videoConcepts: {
            heroExplainer: makeVideoConcept({ title: 'Hero Explainer', durationSeconds: 60 }),
            tiktokSeed: makeVideoConcept({ title: 'TikTok Seed' }),
            thresholdAnnouncement: makeVideoConcept({ title: 'Threshold' }),
            merchReveal: makeVideoConcept({ title: 'Merch Reveal' }),
            countdownSeries: [makeVideoConcept({ title: 'Countdown', durationSeconds: 10 })],
        },
        merch: {
            conceptStatement: 'Ship-first tee.',
            coreItem: {
                productType: 'T-Shirt',
                designDescription: 'Wave icon.',
                colorway: 'navy',
                dallePrompt: 'print-ready cruise tee graphic',
                printfulProductId: 'bella-canvas-3001',
            },
            practicalItem: {
                productType: 'Pocket tee',
                designDescription: 'Pocket stamp.',
                colorway: 'cream',
                dallePrompt: 'print-ready pocket tee graphic',
                printfulProductId: 'gildan-64000',
            },
            nicheSpecificItems: [],
            logoConceptDescription: 'Wave stamp mark.',
            tagline: 'Sea-day simple.',
            printStyle: 'two-color vector',
        },
        audio: {
            ambientNarrationScript: 'Morning over the water.',
            hypeClipScript: 'A breeze, a rail, a smile.',
            voiceProfile: 'calm and warm',
            musicMood: 'lo-fi bossa travel',
        },
        productionBible: {
            sceneLibrary: [],
            storyboards: [],
            globalDirectionNotes: 'Keep moments cruise-first.',
            avoidDirectives: ['No staged programming.'],
        },
        landingStillBible: {
            stillLibrary: [],
            globalDirectionNotes: 'Cruise-first moments only.',
            avoidDirectives: ['No staged programming.'],
        },
        generatedAt: '2026-03-20T00:00:00.000Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
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

console.log('\nBrief Engine Supervisor Regression\n');

test('supervisor builds auditable issue ledger and remediation plan', () => {
    const issues: ValidationIssue[] = [
        {
            code: 'optionality_language_missing',
            message: 'communityExpression does not clearly signal optional, low-pressure participation.',
            severity: 'blocker',
            autoFixable: true,
        },
        {
            code: 'production_artifacts_missing',
            message: 'Both productionBible and landingStillBible are required.',
            severity: 'blocker',
            autoFixable: false,
        },
        {
            code: 'avoid_directives_too_weak',
            message: 'productionBible avoidDirectives do not reflect the brief avoidList.',
            severity: 'warning',
            autoFixable: false,
        },
    ];

    const issueLedger = buildSupervisorIssueLedger(issues, '2026-03-20T12:00:00.000Z');
    const remediationPlan = buildSupervisorRemediationPlan(issues, '2026-03-20T12:00:00.000Z');

    assert.equal(issueLedger.length, 3);
    assert.ok(issueLedger.some((issue) => issue.targetPaths.includes('communityExpression')));
    assert.ok(issueLedger.some((issue) => issue.targetPaths.includes('productionBible')));
    assert.ok(remediationPlan);
    assert.deepEqual(remediationPlan?.deterministicIssueIds, ['optionality_language_missing:blocker']);
    assert.deepEqual(remediationPlan?.llmPatchIssueIds, ['avoid_directives_too_weak:warning']);
    assert.deepEqual(remediationPlan?.regenerationSteps, ['productionBible', 'landingStillBible']);
});

test('supervisor clears remediation state when approval is clean', () => {
    const approved = applySupervisorState(makeBrief(), {
        issues: [],
        reviewStatus: 'approved',
        origin: 'approval',
        revisionCycleCount: 2,
    });

    assert.equal(approved.humanReviewStatus, 'approved');
    assert.equal(approved.revisionCycleCount, 2);
    assert.deepEqual(approved.issueLedger, []);
    assert.equal(approved.activeRemediationPlan, undefined);
    assert.match(approved.revisionNotes ?? '', /no open validation issues/i);
});

test('supervisor rejects approved state when blockers remain', () => {
    assert.throws(() => applySupervisorState(makeBrief(), {
        issues: [
            {
                code: 'workshop_language_survives',
                message: 'Workshop language remains in the brief.',
                severity: 'blocker',
                autoFixable: true,
            },
        ],
        reviewStatus: 'approved',
        origin: 'approval',
    }));
});

test('supervisor allows approved state when launch window is warning-only', () => {
    const approved = applySupervisorState(makeBrief(), {
        issues: [
            {
                code: 'launch_window_violation',
                message: 'Sailing is too close to launch.',
                severity: 'warning',
                autoFixable: false,
            },
        ],
        reviewStatus: 'approved',
        origin: 'approval',
    });

    assert.equal(approved.humanReviewStatus, 'approved');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}