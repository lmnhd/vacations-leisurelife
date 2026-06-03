import assert from 'node:assert/strict';
import { buildFlyerPrompt, deriveFlyerNicheHint, DEFAULT_FLYER_VARIATION_AXES } from '../generators/flyer-prompt';

function main(): void {
    const hint = deriveFlyerNicheHint({
        themeName: 'Fiber Arts Yarn-Tasting Voyage',
        communityExpression: {
            corePromise: 'Meet people who love the same slow-making rituals.',
            socialGravity: 'Fiber people instantly notice one another.',
        },
        campaignResearchDossier: {
            nicheResearch: {
                nicheTitle: 'Fiber artists and yarn lovers',
            },
        },
    });

    assert.equal(hint, 'Fiber artists and yarn lovers');

    const prompt = buildFlyerPrompt('fiber-arts-yarn-tasting-voyage', {
        anchors: ['Theme: Fiber Arts Yarn-Tasting Voyage.'],
        nicheHint: hint ?? undefined,
        axis: 'Deck-level, human-scale vantage.',
        negations: ['text, logos, captions, watermarks, or UI'],
    });

    assert.match(prompt, /Niche detail: Fiber artists and yarn lovers/);
    assert.match(prompt, /Rendition direction: Deck-level, human-scale vantage\./);
    assert.match(prompt, /Avoid: text, logos, captions, watermarks, or UI\./);
    assert.ok(DEFAULT_FLYER_VARIATION_AXES.includes('Artistic collage of all related themes in the campaign.'));

    console.log('flyer prompt tests passed');
}

main();
