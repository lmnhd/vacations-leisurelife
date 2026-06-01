import assert from 'node:assert/strict';
import { deterministicPromptComposition } from '../../../../app/api/groups/campaign/[slug]/media/regenerate-with-revision/core-logic';

async function main() {
    let passed = 0;
    let failed = 0;

    function test(label: string, fn: () => void): void {
        try {
            fn();
            console.log(`PASS  ${label}`);
            passed++;
        } catch (err) {
            console.error(`FAIL  ${label}`);
            console.error(`      ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    test('deterministic composer rewrites image prompts without raw revision labels', () => {
        const composed = deterministicPromptComposition(
            'A bright cruise-deck hero with two guests at the rail.',
            'Make the scene dusk-lit, add a visible deck chair, and remove the impression that people are floating on water.',
            'image_prompt',
        );

        assert.match(composed, /Original direction:/);
        assert.match(composed, /Required revision:/);
        assert.doesNotMatch(composed, /REVISION:/);
        assert.doesNotMatch(composed, /append_note/i);
    });

    test('deterministic composer rewrites audio scripts as a single clean block', () => {
        const composed = deterministicPromptComposition(
            'Intro narration. Calm sea. Soft music.',
            'Make the narration shorter and more reflective.',
            'audio_script',
        );

        assert.match(composed, /Original script:/);
        assert.match(composed, /Required revision:/);
        assert.doesNotMatch(composed, /REVISION:/);
    });

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
