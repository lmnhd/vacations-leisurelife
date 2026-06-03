import assert from 'node:assert/strict';
import { extractNicheTokens } from '../niche-tokens';
import { buildDocumentaryDetailPrompt } from '../documentary-prompts';

function main(): void {
    const campaign = {
        id: 'campaign-001',
        name: 'Fiber Arts Yarn-Tasting Voyage',
        shipTarget: 'Celebrity Edge',
        matchedShipName: 'Norwegian Gem',
        targetDestination: 'Caribbean',
        targetDates: '2026-12-27',
    } as never;

    const brief = {
        themeName: 'Fiber Arts Yarn-Tasting Voyage',
        visual: {
            aestheticLabel: 'Sea-light stitching',
            imageryMood: '',
            lightingStyle: '',
            compositionNotes: '',
            avoidList: [],
            colorPalette: {},
            plausibilityFramework: {
                allowedProps: [],
                discouragedProps: [],
                implausibleLiteralizations: [],
                cruiseNativeMoments: [],
                nicheEnhancedMoments: [],
                governingPrinciple: '',
                allowedPropsReasoning: '',
            },
            humanRepresentation: {
                minimumVisiblePeople: 3,
            },
        },
        messaging: {
            heroSlogan: 'Bring yarn. Meet sea people.',
            subSlogan: 'A Caribbean sailing on Celebrity Edge with ocean views.',
            elevatorPitch: '',
            toneKeywords: [],
            ctaVariants: {},
        },
        socialConcepts: {
            instagramFeed: { caption: '' },
            facebookAd: { headline: '', primaryText: '' },
        },
        merch: { tagline: '' },
        identityBlueprint: null,
    } as never;

    const tokens = extractNicheTokens(brief, campaign);
    assert.equal(tokens.vesselName, 'Norwegian Gem');

    const prompt = buildDocumentaryDetailPrompt('trust_photo', brief, campaign, tokens);
    assert.match(prompt, /Norwegian Gem/);
    assert.doesNotMatch(prompt, /Route\/vessel context: .*Celebrity Edge.*Norwegian Gem/);

    console.log('ship context generation tests passed');
}

main();
