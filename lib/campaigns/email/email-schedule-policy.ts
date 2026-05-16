/**
 * Email Schedule Policy
 *
 * Declares which lifecycle stages are time-triggered and at what cadence,
 * relative to one of two reference points:
 *
 *   - `pre_sail`        — offsets are days BEFORE `matchedSailDate`.
 *                         Used by `travel_prep` (90/60/30) and
 *                         `final_countdown` (14/7/3/1).
 *   - `post_disembark`  — offsets are days AFTER disembarkation,
 *                         computed as `matchedSailDate + matchedNights`.
 *                         Used by Phase 5 `post_cruise_welcome_home` (1)
 *                         and `post_cruise_survey` (3).
 *
 * Conventions (apply to both reference modes):
 *  - `offsetDays` is always a non-negative integer.
 *  - `graceDays` lets the daily cron miss one day without losing the send.
 *  - Offsets within a stage are listed earliest-fire → latest-fire so the
 *    scheduler picks the first window it crosses on a given sweep.
 *
 * Window math (handled by `pickOffsetForSweep`):
 *  - `pre_sail`:        fire when `daysToSail   ∈ [offset - grace, offset]`.
 *  - `post_disembark`:  fire when `daysSinceDisembark ∈ [offset, offset + grace]`.
 *
 * The asymmetry (grace BELOW for pre-sail, grace ABOVE for post-disembark)
 * is intentional: in both modes we want to allow the cron to miss the
 * *exact* day, and recover on the next run by sending slightly later than
 * the canonical offset — never earlier.
 */

import type { EmailEventStage } from './email-event-types';

export type ScheduleReference = 'pre_sail' | 'post_disembark';

export interface ScheduledStagePolicy {
    stage: EmailEventStage;
    reference: ScheduleReference;
    offsetsDays: number[];
    graceDays: number;
    /** Human-readable description for the operator preview surface. */
    description: string;
}

export const SCHEDULED_STAGE_POLICIES: ScheduledStagePolicy[] = [
    {
        stage: 'travel_prep',
        reference: 'pre_sail',
        offsetsDays: [90, 60, 30],
        graceDays: 1,
        description: 'Travel prep cadence — flights, hotels, passports.',
    },
    {
        stage: 'final_countdown',
        reference: 'pre_sail',
        offsetsDays: [14, 7, 3, 1],
        graceDays: 1,
        description: 'Final countdown — packing, boarding, last-call merch.',
    },
    {
        stage: 'post_cruise_welcome_home',
        reference: 'post_disembark',
        offsetsDays: [1],
        graceDays: 1,
        description: 'Warm close + photo/community CTA, 1 day after disembarkation.',
    },
    {
        stage: 'post_cruise_survey',
        reference: 'post_disembark',
        offsetsDays: [3],
        graceDays: 2,
        description: 'Feedback/testimonial collection, 3 days after disembarkation.',
    },
];

export const SCHEDULED_STAGES = SCHEDULED_STAGE_POLICIES.map((p) => p.stage);

/** Returns the policy for a stage, or null if the stage is not scheduled. */
export function getSchedulePolicy(stage: EmailEventStage): ScheduledStagePolicy | null {
    return SCHEDULED_STAGE_POLICIES.find((p) => p.stage === stage) ?? null;
}

/**
 * Given a `pre_sail` policy and a `daysToSail` value, return the offset
 * that should fire on this sweep (if any). Returns null when no offset is
 * in window — either because we are too far out (no offset crossed) or
 * past the grace window of the smallest offset.
 *
 * Callers MUST still check the ledger to confirm the chosen offset has
 * not already been sent.
 */
export function pickOffsetForDaysToSail(
    policy: ScheduledStagePolicy,
    daysToSail: number,
): number | null {
    if (policy.reference !== 'pre_sail') return null;
    for (const offset of policy.offsetsDays) {
        const lower = offset - policy.graceDays;
        if (daysToSail >= lower && daysToSail <= offset) {
            return offset;
        }
    }
    return null;
}

/**
 * Given a `post_disembark` policy and a `daysSinceDisembark` value, return
 * the offset that should fire on this sweep (if any). Mirror of
 * `pickOffsetForDaysToSail` for the post-cruise reference frame: the cron
 * may miss the exact day, so we accept `[offset, offset + grace]`.
 */
export function pickOffsetForDaysSinceDisembark(
    policy: ScheduledStagePolicy,
    daysSinceDisembark: number,
): number | null {
    if (policy.reference !== 'post_disembark') return null;
    for (const offset of policy.offsetsDays) {
        const upper = offset + policy.graceDays;
        if (daysSinceDisembark >= offset && daysSinceDisembark <= upper) {
            return offset;
        }
    }
    return null;
}

/**
 * Unified entry point — returns the offset to fire for either reference,
 * based on the policy's own `reference` field. Pass the appropriate value
 * for the policy's reference frame; the other can be `null`.
 */
export function pickOffsetForSweep(
    policy: ScheduledStagePolicy,
    days: { daysToSail: number | null; daysSinceDisembark: number | null },
): number | null {
    if (policy.reference === 'pre_sail') {
        if (days.daysToSail === null) return null;
        return pickOffsetForDaysToSail(policy, days.daysToSail);
    }
    if (days.daysSinceDisembark === null) return null;
    return pickOffsetForDaysSinceDisembark(policy, days.daysSinceDisembark);
}
