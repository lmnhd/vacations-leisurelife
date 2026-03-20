import assert from 'node:assert/strict';
import { assertLaunchWindowCompliance, getLaunchWindowViolations } from '../launch-window';

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

console.log('\nLaunch Window Regression\n');

const now = new Date('2026-03-19T00:00:00.000Z');

test('reports candidate-level violations before any discovery save path runs', () => {
    const violations = getLaunchWindowViolations([
        {
            id: 'valid-campaign',
            name: 'Valid Campaign',
            targetDates: '2026-10-01',
        },
        {
            id: 'too-close-campaign',
            name: 'Too Close Campaign',
            targetDates: '2026-09-01',
        },
    ], now);

    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.candidate.id, 'too-close-campaign');
    assert.match(violations[0]?.message ?? '', /166 days until sail/);
});

test('throws the launch-window error for ineligible discovery blueprints', () => {
    assert.throws(() => {
        assertLaunchWindowCompliance([
            {
                id: 'too-close-campaign',
                name: 'Too Close Campaign',
                targetDates: '2026-09-01',
            },
        ], now);
    }, /166 days until sail/);
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exitCode = 1;
}