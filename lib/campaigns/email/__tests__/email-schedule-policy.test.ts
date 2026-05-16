import assert from 'node:assert/strict';
import {
    SCHEDULED_STAGE_POLICIES,
    getSchedulePolicy,
    pickOffsetForDaysToSail,
    pickOffsetForDaysSinceDisembark,
    pickOffsetForSweep,
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

test('declares all scheduled stages from the plan (Phase 3 + Phase 5)', () => {
    const stages = SCHEDULED_STAGE_POLICIES.map((p) => p.stage).sort();
    assert.deepEqual(stages, [
        'final_countdown',
        'post_cruise_survey',
        'post_cruise_welcome_home',
        'travel_prep',
    ]);
});

test('pre_sail policies have reference="pre_sail"', () => {
    const travelPrep = getSchedulePolicy('travel_prep');
    const finalCountdown = getSchedulePolicy('final_countdown');
    assert.equal(travelPrep?.reference, 'pre_sail');
    assert.equal(finalCountdown?.reference, 'pre_sail');
});

test('post_disembark policies have reference="post_disembark"', () => {
    const welcome = getSchedulePolicy('post_cruise_welcome_home');
    const survey = getSchedulePolicy('post_cruise_survey');
    assert.equal(welcome?.reference, 'post_disembark');
    assert.equal(survey?.reference, 'post_disembark');
});

test('post_cruise_welcome_home is day 1 post-disembark with 1-day grace', () => {
    const policy = getSchedulePolicy('post_cruise_welcome_home');
    assert.ok(policy);
    assert.deepEqual(policy!.offsetsDays, [1]);
    assert.equal(policy!.graceDays, 1);
});

test('post_cruise_survey is day 3 post-disembark with 2-day grace', () => {
    const policy = getSchedulePolicy('post_cruise_survey');
    assert.ok(policy);
    assert.deepEqual(policy!.offsetsDays, [3]);
    assert.equal(policy!.graceDays, 2);
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

test('pickOffsetForDaysSinceDisembark fires within [offset, offset + grace]', () => {
    const welcome = getSchedulePolicy('post_cruise_welcome_home')!;
    assert.equal(pickOffsetForDaysSinceDisembark(welcome, 0), null); // disembark day — too early
    assert.equal(pickOffsetForDaysSinceDisembark(welcome, 1), 1);     // canonical day-1 send
    assert.equal(pickOffsetForDaysSinceDisembark(welcome, 2), 1);     // grace day, still fires
    assert.equal(pickOffsetForDaysSinceDisembark(welcome, 3), null);  // past grace window

    const survey = getSchedulePolicy('post_cruise_survey')!;
    assert.equal(pickOffsetForDaysSinceDisembark(survey, 2), null);
    assert.equal(pickOffsetForDaysSinceDisembark(survey, 3), 3);
    assert.equal(pickOffsetForDaysSinceDisembark(survey, 4), 3);
    assert.equal(pickOffsetForDaysSinceDisembark(survey, 5), 3);      // 2-day grace
    assert.equal(pickOffsetForDaysSinceDisembark(survey, 6), null);
});

test('pickOffsetForSweep routes per policy.reference', () => {
    const travelPrep = getSchedulePolicy('travel_prep')!;
    const welcome = getSchedulePolicy('post_cruise_welcome_home')!;

    // pre_sail policy reads daysToSail
    assert.equal(
        pickOffsetForSweep(travelPrep, { daysToSail: 30, daysSinceDisembark: null }),
        30,
    );
    // pre_sail policy ignores daysSinceDisembark
    assert.equal(
        pickOffsetForSweep(travelPrep, { daysToSail: null, daysSinceDisembark: 1 }),
        null,
    );
    // post_disembark policy reads daysSinceDisembark
    assert.equal(
        pickOffsetForSweep(welcome, { daysToSail: null, daysSinceDisembark: 1 }),
        1,
    );
    // post_disembark policy ignores daysToSail
    assert.equal(
        pickOffsetForSweep(welcome, { daysToSail: 30, daysSinceDisembark: null }),
        null,
    );
});

test('pickOffsetForDaysToSail rejects post_disembark policies', () => {
    const welcome = getSchedulePolicy('post_cruise_welcome_home')!;
    assert.equal(pickOffsetForDaysToSail(welcome, 1), null);
});

test('pickOffsetForDaysSinceDisembark rejects pre_sail policies', () => {
    const travelPrep = getSchedulePolicy('travel_prep')!;
    assert.equal(pickOffsetForDaysSinceDisembark(travelPrep, 1), null);
});

if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed.\n`);
    process.exit(1);
} else {
    console.log(`\n${passed} passed.\n`);
}
