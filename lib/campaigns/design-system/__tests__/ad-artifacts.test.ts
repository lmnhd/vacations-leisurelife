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

const grandCostumedBrief = {
    ...brief,
    themeName: 'The Grand Costumed Promenade',
    visual: {
        ...brief.visual,
        aestheticLabel: 'Nostalgic costuming cruise',
        imageryMood: 'warm shipboard elegance',
        plausibilityFramework: {
            ...brief.visual.plausibilityFramework,
            allowedProps: ['Folded ivory gloves', 'Painted parasol', 'Ribboned bonnet', 'Reticule'],
        },
    },
    messaging: {
        ...brief.messaging,
        heroSlogan: 'Promenade in Full Dress',
        subSlogan: 'A Caribbean sailing for guests who love to wear the work beautifully.',
        elevatorPitch: 'Historical costuming at sea without workshops or staged performance.',
        toneKeywords: ['aspirational', 'specific', 'welcoming'],
    },
    identityBlueprint: {
        energyMode: 'warm_social',
        visualFlavor: 'travel_nostalgia',
        summary: 'warm social campaign; favor human-scaled warmth with mixed social scale.',
        evidenceOfBelonging: [
            'A dance-floor edge with abandoned dance cards, half-finished cocktails, and a few couples stepping into a waltz as others watch.',
            'An upper-dining-room tea cluster where gloves, fans, and hat pins share table space with pastries.',
        ],
        propFamilies: ['Folded ivory gloves', 'Painted parasol', 'Ribboned bonnet', 'Reticule'],
        forbiddenDefaults: ['cold showroom mood', 'formal event staging', 'isolated luxury silence'],
        imageBehavior: ['human-scaled warmth', 'open sociability', 'cruise-first recognition cues'],
    },
} as unknown as CampaignAestheticBrief;

const grandCostumedCampaign = {
    id: 'grand-costumed-promenade-explorer',
    name: 'The Grand Costumed Promenade',
    description: 'A historical costuming sailing for makers, wearers, and period-dress devotees.',
    targetDates: '2027-01-03',
    targetDestination: 'Caribbean',
    shipTarget: 'Symphony of the Seas',
    targetingKeywords: ['historical costuming', 'costube', 'regency', 'victorian dress', 'period fashion'],
    allowedThemeSignals: [
        'silk taffeta sheen',
        'ivory gloves folded on a tea saucer',
        'painted parasol leaning on a deck chair',
        'ribboned bonnet tied under the chin',
    ],
    optionalGatheringMoments: [
        'A dance-floor edge with abandoned dance cards, half-finished cocktails, and a few couples stepping into a waltz as others watch.',
        'An informal accessory-swap table in a wood-paneled bar with ribbons, cuffs, and spare gloves laid out beside drinks.',
    ],
    highlightEvents: ['Grand outer-deck promenade in day dress', 'Shipboard waltz and social dance hour'],
} as Campaign;

const boardGameCampaign = {
    id: 'board-games-at-sea',
    name: 'Board Games at Sea',
    description: 'A tabletop cruise for board-game players, score sheets, and shared turns at sea.',
    targetDates: '2026-11-07',
    targetDestination: 'Caribbean',
    shipTarget: 'Odyssey of the Seas',
    targetingKeywords: ['board games', 'tabletop', 'meeples', 'dice'],
    allowedThemeSignals: ['dice tray', 'score sheet', 'game box'],
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

    const costumedTokens = extractNicheTokens(grandCostumedBrief, grandCostumedCampaign);
    const costumedSpecs = buildDocumentaryDetailSpecs(grandCostumedBrief, grandCostumedCampaign, costumedTokens, 1);
    assert.doesNotMatch(costumedSpecs[0].prompt, /Board-game visibility/i);
    assert.doesNotMatch(costumedSpecs[0].prompt, /board-game life aboard the ship/i);
    assert.doesNotMatch(costumedSpecs[0].prompt, /record sleeve|guitar pick|leather jacket/i);
    assert.match(costumedSpecs[0].prompt, /Folded ivory gloves|Painted parasol|Ribboned bonnet/i);

    const boardGameTokens = extractNicheTokens(brief, boardGameCampaign);
    const boardGameSpecs = buildDocumentaryDetailSpecs(brief, boardGameCampaign, boardGameTokens, 1);
    assert.match(boardGameSpecs[0].prompt, /Board-game visibility/i);

    // Default tokens map to system_4_modular (4 templates)
    const renderSpecs = buildDesignedAdRenderSpecs(tokens, [], []);
    assert.equal(renderSpecs.length, 4);

    // Verify system-aware branching works for each visual system
    const sys1Tokens = { ...tokens, system: 'system_1_editorial' as const };
    const sys1Specs = buildDesignedAdRenderSpecs(sys1Tokens, [], []);
    assert.equal(sys1Specs.length, 6);
    assert.ok(sys1Specs.some((s) => s.kind === 'editorial_cover_ad'));

    const sys2Tokens = { ...tokens, system: 'system_2_nostalgia' as const };
    const sys2Specs = buildDesignedAdRenderSpecs(sys2Tokens, [], []);
    assert.equal(sys2Specs.length, 6);
    assert.ok(sys2Specs.some((s) => s.kind === 'postcard_hero'));

    const sys3Tokens = { ...tokens, system: 'system_3_zine' as const };
    const sys3Specs = buildDesignedAdRenderSpecs(sys3Tokens, [], []);
    assert.equal(sys3Specs.length, 6);
    assert.ok(sys3Specs.some((s) => s.kind === 'zine_cover'));

    const sys4Tokens = { ...tokens, system: 'system_4_modular' as const };
    const sys4Specs = buildDesignedAdRenderSpecs(sys4Tokens, [], []);
    assert.equal(sys4Specs.length, 4);
    assert.ok(sys4Specs.some((s) => s.kind === 'type_hook_card'));

    const buffer = await renderDesignedAdArtifact(renderSpecs[1], tokens);
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');

    console.log('ad artifact design-system smoke test passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
