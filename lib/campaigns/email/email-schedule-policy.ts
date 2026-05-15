/**
 * Email Schedule Policy
 *
 * Declares which lifecycle stages are time-triggered (i.e. fire relative to
 * a campaign's sail date) and at what cadence. The scheduler in
 * `email-scheduler.ts` reads this declaratively so cadence changes don't
 * require touching the sweep logic.
 *
 * Plan reference: KLAVIYO_EMAIL_FLOW_PLAN.md §7 — `travel_prep` is
 * 90/60/30 pre-sail, `final_countdown` is 14/7/3/1 pre-sail.
 *
 * Conventions:
 *  - `offsetDays` is always a positive integer representing days BEFORE sail.
 *  - `graceDays` lets the daily cron miss one day without losing the send;
 *    a stage fires if `daysToSail ∈ [offsetDays - graceDays, offsetDays]`.
 *  - Offsets within a stage are listed largest → smallest. The scheduler
 *    consults this order when selecting which offset to fire on a given
 *    sweep so it never sends "60 days out" after the 30-day mark has passed.
 */

import type { EmailEventStage } from './email-event-types';

export interface ScheduledStagePolicy {
    stage: EmailEventStage;
    offsetsDays: number[];
    graceDays: number;
    /** Human-readable description for the operator preview surface. */
    description: string;
}

export const SCHEDULED_STAGE_POLICIES: ScheduledStagePolicy[] = [
    {
        stage: 'travel_prep',
        offsetsDays: [90, 60, 30],
        graceDays: 1,
        description: 'Travel prep cadence — flights, hotels, passports.',
    },
    {
        stage: 'final_countdown',
        offsetsDays: [14, 7, 3, 1],
        graceDays: 1,
        description: 'Final countdown — packing, boarding, last-call merch.',
    },
];

export const SCHEDULED_STAGES = SCHEDULED_STAGE_POLICIES.map((p) => p.stage);

/** Returns the policy for a stage, or null if the stage is not scheduled. */
export function getSchedulePolicy(stage: EmailEventStage): ScheduledStagePolicy | null {
    return SCHEDULED_STAGE_POLICIES.find((p) => p.stage === stage) ?? null;
}

/**
 * Given a stage policy and a `daysToSail` value, return the offset that
 * should fire on this sweep (if any). Returns null when no offset is in
 * window — either because we are too far out (no offset crossed) or too
 * close-in past the grace window of the smallest offset.
 *
 * Logic: the largest offset whose window `[offset - grace, offset]`
 * contains `daysToSail` wins. Callers MUST still check the ledger to
 * confirm the chosen offset has not already been sent.
 */
export function pickOffsetForDaysToSail(
    policy: ScheduledStagePolicy,
    daysToSail: number,
): number | null {
    for (const offset of policy.offsetsDays) {
        const lower = offset - policy.graceDays;
        if (daysToSail >= lower && daysToSail <= offset) {
            return offset;
        }
    }
    return null;
}
