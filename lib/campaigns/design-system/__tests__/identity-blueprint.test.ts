import assert from 'node:assert/strict';
import type { CampaignAestheticBrief } from '../../schema';
import type { Campaign } from '../../types';
import { buildCampaignIdentityBlueprint } from '../identity-blueprint';

const baseBrief = {
    slug: 'fixture',
    themeName: 'Fixture',
    visual: {
        aestheticLabel: 'Fixture aesthetic',
        colorPalette: {
            primary: '#111111',
            secondary: '#eeeeee',
            accent: '#ff5a3d',
            background: '#08090d',
            textOnDark: '#f8f8f8',
            textOnLight: '#111111',
        },
        typographyDirection: { headlineStyle: 'bold', bodyStyle: 'sans', suggestedFonts: [] },
        imageryMood: 'warm analog cruise atmosphere',
        lightingStyle: 'late afternoon deck light',
        compositionNotes: 'ship-first framing with visible social cues',
        avoidList: [],
        referenceMoodboard: [],
        plausibilityFramework: {
            governingPrinciple: 'Cruise first.',
            cruiseNativeMoments: ['rail pause'],
            nicheEnhancedMoments: ['passing along a recommendation'],
            implausibleLiteralizations: ['stage show'],
            allowedProps: ['folded paper'],
            discouragedProps: ['giant stage rig'],
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
        heroSlogan: 'The Sea, in 33 1/3',
        subSlogan: 'Eleven nights, six listening rooms, one analog cruise.',
        ctaVariants: { waitlist: 'Join', bookNow: 'Book', merch: 'Shop', share: 'Share' },
        elevatorPitch: 'A campaign world for analog listeners at sea.',
        toneKeywords: ['warm', 'specific', 'welcoming'],
        voicePersona: 'Inviting and music-literate.',
        starterConversation: [],
    },
    communityExpression: {
        corePromise: 'Find your people naturally.',
        participationStyle: 'Optional and low-pressure.',
        socialGravity: 'Shared taste opens conversation.',
        optionalGatherings: ['Casual listening hour'],
        belongingSignals: ['recognizable sleeves', 'shared references'],
        solitudeAntiPatterns: ['forced programming'],
        visualTogethernessNotes: 'Pairs and small groups.',
        copyFramingRule: 'Cruise first.',
        activityInvitations: [],
    },
    socialConcepts: {
        tiktokOrganic: { hook: '', narrative: { title: '', durationSeconds: 0, tool: 'runwayml', scriptOrNarration: '', visualDirectionNotes: '', avatarRequired: false, backgroundDescription: '', musicMood: '' }, caption: '', hashtags: [], callToAction: '' },
        instagramReels: { visualConcept: '', audioTrackType: '', caption: '', hashtags: [] },
        instagramFeed: { carouselSlides: [], singlePostConcept: '', caption: '' },
        facebookAd: { headline: '', primaryText: '', description: '', cta: '', visualDescription: '' },
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
    audio: {
        ambientNarrationScript: '',
        hypeClipScript: '',
        voiceProfile: '',
        musicMood: 'warm analog loop',
    },
    generatedAt: '2026-04-30T00:00:00.000Z',
    generatedBy: 'agent',
    humanReviewStatus: 'pending',
    revisionCycleCount: 0,
} as CampaignAestheticBrief;

const vintageRockCampaign = {
    PK: 'CAMPAIGN#vintage-rock',
    SK: 'METADATA',
    id: 'vintage-rock',
    name: "Vintage Rock 'n' Roll Cruise",
    description: 'A nostalgic rock cruise with live energy.',
    aesthetic: 'retro, musical, vibrant',
    targetDates: '2026-11-07',
    targetDestination: 'Eastern Caribbean',
    shipTarget: 'Brilliance of the Seas',
    highlightEvents: ['Live tribute band performances', 'Retro dance parties'],
    targetingKeywords: ['rock music', 'vintage', 'live music', 'nostalgia'],
    allowedThemeSignals: ['music trivia nights', 'retro color accents'],
    optionalGatheringMoments: ['Drop-in jam sessions', 'Casual vinyl listening hours'],
    minCabinsRequired: 8,
    status: 'GATHERING_INTEREST',
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
} as Campaign;

const quietLuxuryCampaign = {
    ...vintageRockCampaign,
    id: 'quiet-luxury',
    name: 'Quiet Luxury at Sea',
    description: 'A boutique-feeling premium cruise.',
    aesthetic: 'refined, editorial, premium',
    highlightEvents: ['Private gallery preview'],
    targetingKeywords: ['luxury', 'editorial', 'refined'],
    allowedThemeSignals: ['considered stationery', 'gallery-like print detail'],
    optionalGatheringMoments: ['Quiet aperitif conversation'],
} as Campaign;

const tabletopCampaign = {
    ...vintageRockCampaign,
    id: 'board-games-at-sea',
    name: 'Board Games at Sea',
    description: 'Playful tabletop nights with optional social drop-ins.',
    aesthetic: 'playful, welcoming, social',
    highlightEvents: ['Board game socials', 'Trivia evenings'],
    targetingKeywords: ['board game', 'tabletop', 'dice', 'strategy'],
    allowedThemeSignals: ['game tables', 'dice trays', 'friendly rounds'],
    optionalGatheringMoments: ['Drop-in game tables', 'Cruise club lounge meetup'],
} as Campaign;

function main() {
    const rockBlueprint = buildCampaignIdentityBlueprint({
        ...baseBrief,
        themeName: "Vintage Rock 'n' Roll Cruise",
        visual: {
            ...baseBrief.visual,
            imageryMood: 'open-air energy, nostalgia-infused cruise deck ambiance',
            compositionNotes: 'wide sky, crowd in motion, visible music adjacency',
        },
        messaging: {
            ...baseBrief.messaging,
            heroSlogan: 'Rock the Waves, Feel the Beat',
            subSlogan: 'Live music, sea breeze, pure vibe.',
        },
    }, vintageRockCampaign);

    assert.equal(rockBlueprint.energyMode, 'after_hours_electric');
    assert.ok(rockBlueprint.propFamilies.some((item) => /record sleeve|guitar pick/i.test(item)));
    assert.ok(rockBlueprint.forbiddenDefaults.some((item) => /balcony|serenity/i.test(item)));
    assert.ok(rockBlueprint.adFormatBias.includes('type_hook_card'));

    const premiumBlueprint = buildCampaignIdentityBlueprint({
        ...baseBrief,
        themeName: 'Quiet Luxury at Sea',
        visual: {
            ...baseBrief.visual,
            imageryMood: 'restrained editorial calm with gallery-like light',
            compositionNotes: 'negative space, precise ship architecture, quiet social cues',
        },
        messaging: {
            ...baseBrief.messaging,
            heroSlogan: 'Quiet lines, open water.',
            subSlogan: 'A premium voyage with design-forward restraint.',
            toneKeywords: ['premium', 'editorial', 'quiet'],
        },
    }, quietLuxuryCampaign);

    assert.equal(premiumBlueprint.energyMode, 'refined_premium');
    assert.equal(premiumBlueprint.socialScale, 'solo_pair');
    assert.ok(premiumBlueprint.forbiddenDefaults.some((item) => /festival|crowd/i.test(item)));

    const tabletopBlueprint = buildCampaignIdentityBlueprint({
        ...baseBrief,
        themeName: 'Board Games at Sea',
        visual: {
            ...baseBrief.visual,
            imageryMood: 'playful social warmth with tabletop moments',
            compositionNotes: 'small groups, friendly table energy, game pieces in motion',
        },
        messaging: {
            ...baseBrief.messaging,
            heroSlogan: 'Game night meets open water.',
            subSlogan: 'Roll, laugh, drift, repeat.',
        },
        merch: {
            ...baseBrief.merch,
            tagline: 'Board Games at Sea cruise club',
        },
    }, tabletopCampaign);

    assert.equal(tabletopBlueprint.energyMode, 'playful_collective');
    assert.ok(tabletopBlueprint.forbiddenDefaults.some((item) => /sterile editorial distance/i.test(item)));

    console.log('identity blueprint tests passed');
}

main();
