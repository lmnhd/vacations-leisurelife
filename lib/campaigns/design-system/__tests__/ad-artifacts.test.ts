import assert from 'node:assert/strict';
import { extractNicheTokens } from '../niche-tokens';
import { buildDocumentaryDetailSpecs } from '../documentary-prompts';
import { buildDesignedAdRenderSpecs, renderDesignedAdArtifact } from '../ad-templates';
import type { CampaignAestheticBrief } from '../../schema';
import type { Campaign } from '../../types';

const brief = {
    themeName: 'Vinyl at Sea',
    visual: {
        aestheticLabel: 'Analog editorial cruise',
        colorPalette: {
            primary: '#111111',
            secondary: '#f4ead8',
            accent: '#ff5a3d',
            background: '#08090d',
            textOnDark: '#f7f1e6',
            textOnLight: '#111111',
        },
        typographyDirection: { headlineStyle: 'bold editorial', bodyStyle: 'clean sans', suggestedFonts: [] },
        imageryMood: 'warm analog restraint',
        lightingStyle: 'golden hour',
        compositionNotes: 'modular',
        avoidList: [],
        referenceMoodboard: [],
        plausibilityFramework: {
            governingPrinciple: 'Cruise first, niche as ambient flavor.',
            cruiseNativeMoments: [],
            nicheEnhancedMoments: [],
            implausibleLiteralizations: [],
            allowedProps: ['record sleeve', 'cabin key', 'folded itinerary'],
            discouragedProps: ['stage', 'PA speaker'],
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
        ctaVariants: { waitlist: 'Join the list', bookNow: 'Reserve a cabin', merch: 'Shop merch', share: 'Share' },
        elevatorPitch: 'A cruise for analog listeners.',
        toneKeywords: ['analog', 'editorial', 'warm'],
        voicePersona: 'Resident DJ',
    },
    socialConcepts: {
        instagramFeed: { caption: 'Bring one sleeve.', carouselSlides: [], singlePostConcept: 'Type card' },
        facebookAd: { headline: 'Bring one sleeve.', primaryText: 'The playlist changes every two hours and somehow always belongs.', description: 'Analog cruise' },
    },
    merch: {
        coreItem: { productType: 'enamel pin' },
        tagline: 'Side A forever',
    },
} as unknown as CampaignAestheticBrief;

const campaign = {
    id: 'vinyl-at-sea',
    name: 'Vinyl at Sea',
    targetDates: '14 May 2026',
    targetDestination: 'Lisbon to Reykjavik',
    shipTarget: 'M.S. Cote du Son',
} as Campaign;

const vintageRockBrief = {
    ...brief,
    themeName: "Vintage Rock 'n' Roll Cruise",
    visual: {
        ...brief.visual,
        aestheticLabel: '',
        imageryMood: 'golden-hour stage glow, open-air energy, nostalgia-infused cruise deck ambiance',
        compositionNotes: 'wide sky, crowd in motion, distant stage with sea horizon backdrop, vintage rock elements subtly integrated',
        plausibilityFramework: {
            ...brief.visual.plausibilityFramework,
            allowedProps: [],
            nicheEnhancedMoments: [],
        },
    },
    messaging: {
        ...brief.messaging,
        heroSlogan: 'Rock the Waves, Feel the Beat',
        subSlogan: 'Live music, sea breeze, pure vibe',
        toneKeywords: ['aspirational', 'specific', 'welcoming'],
        voicePersona: 'Energetic, inviting, and effortlessly cool',
    },
    socialConcepts: {
        instagramFeed: { caption: '', carouselSlides: [], singlePostConcept: '' },
        facebookAd: { headline: '', primaryText: '', description: '' },
    },
    merch: {
        coreItem: { productType: 'T-Shirt' },
        tagline: "Vintage Rock 'n' Roll Cruise Club",
    },
} as unknown as CampaignAestheticBrief;

const vintageRockCampaign = {
    id: 'vintage-rock-n-roll',
    name: "Vintage Rock 'n' Roll Cruise",
    description: "A nostalgic journey through the golden era of rock 'n' roll.",
    aesthetic: 'retro, musical, vibrant, classic',
    targetDates: '2026-11-07',
    targetDestination: 'Eastern Caribbean',
    shipTarget: 'Brilliance of the Seas',
    highlightEvents: [
        "Rock 'n' Roll Costume Gala",
        'Live Tribute Band Performances',
        'Vintage Vinyl Listening Lounge',
        'Retro Dance Parties',
        'Interactive Rock Art Workshops',
    ],
    targetingKeywords: ['rock music', 'vintage', 'live music', 'nostalgia'],
    cruiseNativeMoments: ['Sipping cocktails to live music at sunset', 'Participating in a vinyl swap on deck'],
    allowedThemeSignals: ['Live performances', 'Rock-themed decor', 'Music trivia nights'],
    optionalGatheringMoments: ['Drop-in jam sessions', 'Casual vinyl listening hours', 'Open mic nights'],
} as Campaign;

async function main() {
    const tokens = extractNicheTokens(brief, campaign);
    assert.equal(tokens.accentHex, '#ff5a3d');
    assert.equal(tokens.vesselName, 'M.S. Cote du Son');
    assert.ok(tokens.energyProfile === 'warm' || tokens.energyProfile === 'premium');
    assert.ok(tokens.propSignals.includes('record sleeve'));

    const specs = buildDocumentaryDetailSpecs(brief, campaign, tokens, 5);
    assert.equal(specs.length, 5);
    assert.match(specs[0].prompt, /No text, no readable labels, no logos/i);
    assert.match(specs[0].prompt, /No staged events/i);

    const vintageTokens = extractNicheTokens(vintageRockBrief, vintageRockCampaign);
    assert.equal(vintageTokens.energyProfile, 'energetic');
    assert.equal(vintageTokens.italicWord, 'Beat');
    assert.ok(!vintageTokens.sectionLabels.some((label) => /shirt/i.test(label)));
    assert.ok(vintageTokens.sectionLabels.some((label) => /sailaway|vinyl|after hours|dance/i.test(label)));
    assert.ok(vintageTokens.propSignals.some((signal) => /record sleeve|guitar pick|leather jacket/i.test(signal)));

    const vintageSpecs = buildDocumentaryDetailSpecs(vintageRockBrief, vintageRockCampaign, vintageTokens, 1);
    assert.match(vintageSpecs[0].prompt, /analog, social, and in motion/i);
    assert.match(vintageSpecs[0].prompt, /Avoid mood mismatch/i);
    assert.doesNotMatch(vintageSpecs[0].prompt, /A quiet real cruise ship deck/i);

    const renderSpecs = buildDesignedAdRenderSpecs([]);
    assert.equal(renderSpecs.length, 6);

    const buffer = await renderDesignedAdArtifact(renderSpecs[1], tokens);
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');

    console.log('ad artifact design-system smoke test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
