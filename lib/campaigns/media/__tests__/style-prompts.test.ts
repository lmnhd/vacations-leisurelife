/**
 * Media style resolver tests.
 * Run with: npx tsx --env-file=.env.local lib/campaigns/media/__tests__/style-prompts.test.ts
 */

import assert from 'node:assert/strict';
import { FILM_GRADES, resolveMediaStyle } from '../style-prompts';

async function main() {
    let passedCount = 0;
    let failedCount = 0;

    async function test(label: string, fn: () => Promise<void> | void): Promise<void> {
        try {
            await fn();
            console.log(`PASS ${label}`);
            passedCount++;
        } catch (err) {
            console.error(`FAIL ${label}`);
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);
            failedCount++;
        }
    }

    await test('concept assets always resolve to sketched', () => {
        const resolved = resolveMediaStyle({
            assetKind: 'concept',
            hasPeople: false,
            seed: 'concept-01',
        });

        assert.equal(resolved.style, 'sketched');
        assert.equal(resolved.allowPhotographicReinforcers, false);
        assert.match(resolved.promptBlock, /watercolor-and-ink/i);
        assert.match(resolved.promptBlock, /Do not literalize the campaign theme/i);
        assert.match(resolved.promptBlock, /Avoid visible stages/i);
        assert.match(resolved.promptBlock, /structurally accurate and perspective-consistent/i);
    });

    await test('merch assets always resolve to sketched', () => {
        const resolved = resolveMediaStyle({
            assetKind: 'merch',
            hasPeople: false,
            seed: 'merch-01',
        });

        assert.equal(resolved.style, 'sketched');
    });

    await test('ship-led scene assets resolve to realistic', () => {
        const resolved = resolveMediaStyle({
            assetKind: 'scene',
            hasPeople: true,
            seed: 'scene-01',
            themeAnchorProps: ['field notebook'],
        });

        assert.equal(resolved.style, 'realistic');
        assert.equal(resolved.allowPhotographicReinforcers, true);
        assert.match(resolved.promptBlock, /Documentary-grade cruise photography/i);
        assert.match(resolved.promptBlock, /field notebook/i);
    });

    await test('probe assets resolve to realistic even when people are visible', () => {
        const resolved = resolveMediaStyle({
            assetKind: 'probe',
            hasPeople: true,
            seed: 'probe-01',
        });

        assert.equal(resolved.style, 'realistic');
        assert.equal(resolved.allowPhotographicReinforcers, true);
        assert.match(resolved.promptBlock, /Documentary-grade cruise photography/i);
    });

    await test('film grade selection is deterministic by seed', () => {
        const first = resolveMediaStyle({
            assetKind: 'scene',
            hasPeople: false,
            seed: 'stable-seed',
        });
        const second = resolveMediaStyle({
            assetKind: 'scene',
            hasPeople: false,
            seed: 'stable-seed',
        });

        assert.equal(first.promptBlock, second.promptBlock);
        assert.ok(FILM_GRADES.some((grade) => first.promptBlock.includes(grade)));
    });

    if (failedCount > 0) {
        throw new Error(`${failedCount} style resolver test(s) failed`);
    }

    console.log(`\n${passedCount} style resolver tests passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
