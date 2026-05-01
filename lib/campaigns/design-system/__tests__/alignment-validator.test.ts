import assert from 'node:assert/strict';
import type { CampaignAestheticBrief } from '../../schema';
import type { Campaign } from '../../types';
import { buildCampaignIdentityBlueprint } from '../identity-blueprint';
import { detectCampaignAlignmentDrift } from '../alignment-validator';

const campaign = {
    PK: 'CAMPAIGN#alignment-test',
    SK: 'METADATA',
    id: 'alignment-test',
    name: "Vintage Rock 'n' Roll Cruise",
    description: 'A nostalgic rock cruise with social energy.',
    targetDates: '2026-11-07',
    targetDestination: 'Eastern Caribbean',
    shipTarget: 'Brilliance of the Seas',
    highlightEvents: ['Live tribute band performances', 'Retro dance parties'],
    targetingKeywords: ['rock music', 'live music', 'vintage'],
    minCabinsRequired: 8,
    status: 'GATHERING_INTEREST',
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
} as Campaign;

function makeBrief(): CampaignAestheticBrief {
    return {
        slug: 'alignment-test',
        themeName: "Vintage Rock 'n' Roll Cruise",
        visual: {
            aestheticLabel: 'Retro deck energy',
            colorPalette: {
                primary: '#111111',
                secondary: '#eeeeee',
                accent: '#ff5a3d',
                background: '#08090d',
                textOnDark: '#f8f8f8',
                textOnLight: '#111111',
            },
            typographyDirection: { headlineStyle: 'bold', bodyStyle: 'sans', suggestedFonts: [] },
            imageryMood: 'quiet serene premium balcony atmosphere',
            lightingStyle: 'soft amber sunset',
            compositionNotes: 'calm balcony still life with reflective ocean mood',
            avoidList: [],
            referenceMoodboard: [],
            plausibilityFramework: {
                governingPrinciple: 'Cruise first.',
                cruiseNativeMoments: ['rail pause'],
                nicheEnhancedMoments: ['passing along a recommendation'],
                implausibleLiteralizations: ['stage show'],
                allowedProps: ['folded paper'],
                discouragedProps: ['stage rig'],
            },
            humanRepresentation: {
                castingGoal: '',
                ageRangeGuidance: '',
                diversityIntent: '',
                pairingGuidance: '',
                stylingGuidance: '',
                antiStereotypeRules: [],
            },
        },
        messaging: {
            heroSlogan: 'Rock the Waves, Feel the Beat',
            subSlogan: 'Live music, sea breeze, pure vibe.',
            ctaVariants: { waitlist: 'Join', bookNow: 'Book', merch: 'Shop', share: 'Share' },
            elevatorPitch: 'A nostalgic music cruise at sea.',
            toneKeywords: ['specific', 'welcoming'],
            voicePersona: 'Energetic and inviting.',
        },
        communityExpression: {
            corePromise: 'Find your people naturally.',
            participationStyle: 'Optional and low-pressure.',
            socialGravity: 'Shared taste opens conversation.',
            optionalGatherings: ['Casual listening hour'],
            belongingSignals: ['recognizable sleeves'],
            solitudeAntiPatterns: ['forced programming'],
            visualTogethernessNotes: 'Pairs and small groups.',
            copyFramingRule: 'Cruise first.',
        },
        socialConcepts: {
            tiktokOrganic: { hook: '', narrative: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' }, caption: '', hashtags: [], callToAction: '' },
            instagramReels: { visualConcept: '', audioTrackType: '', caption: '', hashtags: [] },
            instagramFeed: { carouselSlides: [], singlePostConcept: '', caption: '' },
            facebookAd: { headline: '', primaryText: '', description: '', cta: '', visualDescription: 'serene balcony moment with a drink' },
            youtubeShort: { title: '', visualConcept: '', description: '', hashtags: [] },
            pinterest: { pinTitle: '', pinDescription: '', visualConcept: '' },
            emailHeader: { subjectLine: '', preheader: '', bodyDirection: '', visualDirection: '' },
            discordBanner: { serverBannerDescription: '', welcomeMessageDirection: '' },
        },
        videoConcepts: {
            heroExplainer: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' },
            tiktokSeed: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' },
            thresholdAnnouncement: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' },
            merchReveal: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' },
            countdownSeries: [],
        },
        merch: {
            conceptStatement: '',
            coreItem: { productType: 'T-Shirt', designDescription: '', colorway: '', dallePrompt: '', printfulProductId: '' },
            practicalItem: { productType: 'Tote', designDescription: '', colorway: '', dallePrompt: '', printfulProductId: '' },
            nicheSpecificItems: [],
            logoConceptDescription: '',
            tagline: 'Side A forever',
            printStyle: '',
        },
        audio: { ambientNarrationScript: '', hypeClipScript: '', voiceProfile: '', musicMood: 'warm analog loop' },
        generatedAt: '2026-04-30T00:00:00.000Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
    };
}

function main() {
    const missingBlueprintIssues = detectCampaignAlignmentDrift(makeBrief(), campaign);
    assert.ok(missingBlueprintIssues.some((issue) => issue.code === 'identity_blueprint_missing'));

    const withBlueprint = makeBrief();
    withBlueprint.identityBlueprint = buildCampaignIdentityBlueprint(withBlueprint, campaign);
    const driftIssues = detectCampaignAlignmentDrift(withBlueprint, campaign);

    assert.ok(driftIssues.some((issue) => issue.code === 'energy_mode_visual_mismatch'));
    assert.ok(driftIssues.some((issue) => issue.code === 'forbidden_default_drift'));

    console.log('alignment validator tests passed');
}

main();
