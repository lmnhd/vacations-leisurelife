import assert from 'node:assert/strict';
import { buildLandingDesignSystem } from '../view-model';
import type { CampaignAestheticBrief, VisualFlavor } from '../../schema';
import type { Campaign } from '../../types';

function makeBrief(visualFlavor: VisualFlavor): CampaignAestheticBrief {
    return {
        themeName: 'Board Games at Sea',
        visual: {
            aestheticLabel: 'Tactile tabletop cruise',
            colorPalette: {
                primary: '#111111',
                secondary: '#f4ead8',
                accent: '#ff5a3d',
                background: '#08090d',
                textOnDark: '#f7f1e6',
                textOnLight: '#111111',
            },
            typographyDirection: { headlineStyle: 'bold', bodyStyle: 'clean', suggestedFonts: [] },
            imageryMood: 'warm table culture',
            lightingStyle: 'amber lounge light',
            compositionNotes: 'modular',
            avoidList: [],
            referenceMoodboard: [],
            plausibilityFramework: {
                governingPrinciple: 'Cruise first.',
                cruiseNativeMoments: ['Sea-day table time'],
                nicheEnhancedMoments: ['Casual board game night'],
                implausibleLiteralizations: [],
                allowedProps: ['blank game card', 'dice tray'],
                discouragedProps: [],
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
            heroSlogan: 'Play the Sea Your Way',
            subSlogan: 'A cruise for easygoing tabletop people.',
            ctaVariants: { waitlist: 'Join the group list', bookNow: 'Start booking', merch: 'Shop merch', share: 'Share' },
            elevatorPitch: 'A real cruise with optional tabletop moments.',
            toneKeywords: ['playful', 'warm'],
            voicePersona: 'Tour Conductor',
        },
        socialConcepts: {
            instagramFeed: { caption: 'Bring a favorite game.', carouselSlides: [], singlePostConcept: 'Tabletop card' },
            facebookAd: { headline: 'Bring a favorite game.', primaryText: 'A ship full of easygoing table talk.', description: 'Board games at sea' },
        },
        merch: {
            coreItem: { productType: 'sticker' },
            tagline: 'Shuffleboard, but make it literal',
        },
        identityBlueprint: {
            energyMode: visualFlavor === 'none' ? 'calm_contemplative' : 'playful_collective',
            emotionalPromise: 'A real cruise for tabletop people.',
            socialScale: 'pair_small_group',
            imageBehavior: ['playful but believable'],
            propFamilies: ['blank game card'],
            forbiddenDefaults: ['convention hall'],
            lightBehavior: ['warm lounge light'],
            adFormatBias: ['quote_card'],
            evidenceOfBelonging: ['game night at sea', 'sea-day table talk', 'bring a favorite box'],
            visualFlavor,
            summary: 'Playful collective cruise world.',
        },
        audio: {
            musicMood: 'warm acoustic',
            ambientNarrationScript: '',
            hypeClipScript: '',
            voiceProfile: '',
        },
        generatedAt: new Date().toISOString(),
        generatedBy: 'agent',
        humanReviewStatus: 'approved',
        revisionCycleCount: 0,
    } as unknown as CampaignAestheticBrief;
}

const campaign = {
    id: 'board-games-at-sea',
    name: 'Board Games at Sea',
    description: 'A board-game-flavored cruise.',
    targetDates: 'May 2026',
    targetDestination: 'Caribbean',
    shipTarget: 'Adventure of the Seas',
} as Campaign;

const cases = [
    ['editorial_magazine', 'system_1_editorial'],
    ['travel_nostalgia', 'system_2_nostalgia'],
    ['indie_zine', 'system_3_zine'],
    ['none', 'system_4_modular'],
] as const;

for (const [visualFlavor, system] of cases) {
    const designSystem = buildLandingDesignSystem(campaign, makeBrief(visualFlavor));
    assert.equal(designSystem.visualFlavor, visualFlavor);
    assert.equal(designSystem.system, system);
    assert.equal(designSystem.accentHex, '#ff5a3d');
    assert.equal(designSystem.chat.sessionId, 'campaign-chat://board-games-at-sea');
    assert.ok(designSystem.sectionLabels.length >= 3);
}

const fallback = buildLandingDesignSystem(campaign, null);
assert.equal(fallback.visualFlavor, 'none');
assert.equal(fallback.system, 'system_4_modular');
assert.equal(fallback.chat.endpoint, '/api/groups/campaign/board-games-at-sea/chat');

console.log('landing design-system mapping test passed');
