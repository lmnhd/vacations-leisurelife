import assert from 'node:assert/strict';
import {
    SCHEDULED_STAGE_POLICIES,
    getSchedulePolicy,
    pickOffsetForDaysToSail,
} from '../email-schedule-policy';

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

console.log('\nEmail Schedule Policy\n');

test('declares the two scheduled stages from the plan', () => {
    const stages = SCHEDULED_STAGE_POLICIES.map((p) => p.stage).sort();
    assert.deepEqual(stages, ['final_countdown', 'travel_prep']);
});

test('travel_prep offsets are 90/60/30 in descending order', () => {
    const policy = getSchedulePolicy('travel_prep');
    assert.ok(policy);
    assert.deepEqual(policy!.offsetsDays, [90, 60, 30]);
});

test('final_countdown offsets are 14/7/3/1 in descending order', () => {
    const policy = getSchedulePolicy('final_countdown');
    assert.ok(policy);
    assert.deepEqual(policy!.offsetsDays, [14, 7, 3, 1]);
});

test('pickOffset picks the largest matching offset within its grace window', () => {
    const policy = getSchedulePolicy('travel_prep')!;
    // Exactly on the 90 mark.
    assert.equal(pickOffsetForDaysToSail(policy, 90), 90);
    // Grace day for 90 (grace=1).
    assert.equal(pickOffsetForDaysToSail(policy, 89), 90);
    // Past the 90 grace, before the 60 window.
    assert.equal(pickOffsetForDaysToSail(policy, 88), null);
    // On 60 mark.
    assert.equal(pickOffsetForDaysToSail(policy, 60), 60);
    // On 30 mark.
    assert.equal(pickOffsetForDaysToSail(policy, 30), 30);
    // Past the 30 grace.
    assert.equal(pickOffsetForDaysToSail(policy, 28), null);
});

test('pickOffset returns null when daysToSail is larger than the largest offset', () => {
    const policy = getSchedulePolicy('travel_prep')!;
    assert.equal(pickOffsetForDaysToSail(policy, 120), null);
});

test('final_countdown picks the next offset crossed in tight cadence', () => {
    const policy = getSchedulePolicy('final_countdown')!;
    assert.equal(pickOffsetForDaysToSail(policy, 14), 14);
    assert.equal(pickOffsetForDaysToSail(policy, 13), 14); // grace for 14
    assert.equal(pickOffsetForDaysToSail(policy, 12), null); // between offsets
    assert.equal(pickOffsetForDaysToSail(policy, 7), 7);
    assert.equal(pickOffsetForDaysToSail(policy, 6), 7);
    assert.equal(pickOffsetForDaysToSail(policy, 3), 3);
    assert.equal(pickOffsetForDaysToSail(policy, 2), 3);
    assert.equal(pickOffsetForDaysToSail(policy, 1), 1);
    assert.equal(pickOffsetForDaysToSail(policy, 0), 1); // grace for 1
});

if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed.\n`);
    process.exit(1);
} else {
    console.log(`\n${passed} passed.\n`);
}
