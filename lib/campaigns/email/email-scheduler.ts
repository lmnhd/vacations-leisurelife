/**
 * Email Scheduler — Phase 3
 *
 * Daily sweep that fires `travel_prep` and `final_countdown` emails for
 * converted leads at the offsets declared in `email-schedule-policy.ts`.
 *
 * Design:
 *  - Stateless and idempotent. State lives in the per-lead event ledger;
 *    every send is keyed by `(stage, scheduledOffset)` metadata.
 *  - Two entrypoints:
 *      `runEmailScheduler()` — sweep every CONVERTED campaign.
 *      `runCampaignEmailSchedule(slug)` — sweep one campaign (operator UI).
 *  - Both return a structured plan so callers can render dry-run preview.
 *  - Never throws on per-lead failure. Failures aggregate into the result.
 *
 * Eligibility:
 *  - Campaign must have `matchedSailDate` (otherwise no offset math possible).
 *  - Campaign status must be `CONVERTED` or `THRESHOLD_MET` (we are
 *    sending to confirmed-booked leads; expired/draft campaigns are skipped).
 *  - Lead must be `converted === true`.
 *
 * Dedupe:
 *  - For each (lead, stage, offset), scan the lead's event ledger for an
 *    entry whose metadata has the same `stage` and `scheduledOffset`. If
 *    found, skip. Otherwise dispatch.
 *  - We check both `nurture_sent` and `nurture_queued` rows so a previous
 *    dryRun queue entry does NOT prevent a live send. The orchestrator
 *    writes `dryRun=true` into metadata on dry-run queues; we filter on
 *    that.
 */

import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { listCampaignLeadEvents } from '@/lib/campaigns/conversion-store';
import { listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import type { Campaign, CampaignLeadEvent, CampaignWaitlistEntry } from '@/lib/campaigns/types';
import { dispatchEmailEvent } from './email-event-orchestrator';
import {
    SCHEDULED_STAGE_POLICIES,
    pickOffsetForDaysToSail,
    type ScheduledStagePolicy,
} from './email-schedule-policy';

export interface SchedulerOptions {
    /** When true, write `nurture_queued` ledger rows but skip Klaviyo calls. */
    dryRun?: boolean;
    /**
     * Override "today" for testing. Accepts YYYY-MM-DD. Defaults to the
     * UTC date at call time.
     */
    todayOverride?: string;
    /**
     * If set, skip all campaigns whose slug does not match. Used by the
     * per-campaign manual trigger.
     */
    onlyCampaignSlug?: string;
}

export interface ScheduledSendPlan {
    campaignSlug: string;
    email: string;
    stage: 'travel_prep' | 'final_countdown';
    scheduledOffset: number;
    daysToSail: number;
}

export interface CampaignSweepResult {
    campaignSlug: string;
    campaignName: string;
    daysToSail: number | null;
    eligibleLeads: number;
    plans: ScheduledSendPlan[];
    /** Plans actually dispatched (live or dryRun queued). */
    dispatched: ScheduledSendPlan[];
    /** Plans skipped because the dedupe scan found an existing send. */
    skippedAlreadySent: ScheduledSendPlan[];
    /** Plans skipped because the campaign has no matched sail date / wrong status. */
    skippedReason?: string;
    failures: Array<{ email: string; stage: string; scheduledOffset: number; error: string }>;
}

export interface SchedulerRunResult {
    runAt: string;
    today: string;
    dryRun: boolean;
    campaignsScanned: number;
    perCampaign: CampaignSweepResult[];
    totals: {
        dispatched: number;
        skippedAlreadySent: number;
        failed: number;
    };
}

function todayUtc(override?: string): string {
    if (override) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
            throw new Error(`Invalid todayOverride: "${override}". Use YYYY-MM-DD.`);
        }
        return override;
    }
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Inclusive day-difference in UTC: sailDate - today. */
function computeDaysToSail(sailDateIso: string, todayYmd: string): number | null {
    // sailDate may be ISO or YYYY-MM-DD — normalize to UTC midnight.
    const sail = sailDateIso.length === 10
        ? new Date(`${sailDateIso}T00:00:00.000Z`)
        : new Date(sailDateIso);
    if (Number.isNaN(sail.getTime())) return null;
    const today = new Date(`${todayYmd}T00:00:00.000Z`);
    const ms = sail.getTime() - today.getTime();
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function hasAlreadyBeenSent(
    events: CampaignLeadEvent[],
    email: string,
    stage: string,
    scheduledOffset: number,
): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    return events.some((e) => {
        if (e.email !== normalizedEmail) return false;
        if (e.metadata?.stage !== stage) return false;
        if (e.metadata?.scheduledOffset !== String(scheduledOffset)) return false;
        // A live `nurture_sent` (or stage-specific success) row OR a non-dryRun
        // `nurture_queued` row blocks resends. A dryRun queue does not.
        if (e.metadata?.dryRun === 'true') return false;
        return e.eventType === 'nurture_sent'
            || e.eventType === 'nurture_queued'
            || e.eventType === 'threshold_met_notified'
            || e.eventType === 'booking_link_sent'
            || e.eventType === 'expired';
    });
}

function buildPlansForLead(
    campaign: Campaign,
    lead: CampaignWaitlistEntry,
    daysToSail: number,
    policies: ScheduledStagePolicy[],
): ScheduledSendPlan[] {
    const plans: ScheduledSendPlan[] = [];
    for (const policy of policies) {
        const offset = pickOffsetForDaysToSail(policy, daysToSail);
        if (offset === null) continue;
        plans.push({
            campaignSlug: campaign.id,
            email: lead.email,
            stage: policy.stage as 'travel_prep' | 'final_countdown',
            scheduledOffset: offset,
            daysToSail,
        });
    }
    return plans;
}

async function sweepCampaign(
    campaign: Campaign,
    today: string,
    dryRun: boolean,
): Promise<CampaignSweepResult> {
    const baseResult: CampaignSweepResult = {
        campaignSlug: campaign.id,
        campaignName: campaign.name,
        daysToSail: null,
        eligibleLeads: 0,
        plans: [],
        dispatched: [],
        skippedAlreadySent: [],
        failures: [],
    };

    // Eligibility: must be converted/threshold-met phase and have a sail date.
    if (campaign.status !== 'CONVERTED' && campaign.status !== 'THRESHOLD_MET') {
        return { ...baseResult, skippedReason: `status=${campaign.status} (need CONVERTED or THRESHOLD_MET)` };
    }
    if (!campaign.matchedSailDate) {
        return { ...baseResult, skippedReason: 'no matchedSailDate set' };
    }

    const daysToSail = computeDaysToSail(campaign.matchedSailDate, today);
    if (daysToSail === null) {
        return { ...baseResult, skippedReason: `unparseable matchedSailDate "${campaign.matchedSailDate}"` };
    }
    if (daysToSail < 0) {
        return { ...baseResult, daysToSail, skippedReason: 'sail date in the past' };
    }

    const [leads, events] = await Promise.all([
        listCampaignWaitlistEntries(campaign.id),
        listCampaignLeadEvents(campaign.id),
    ]);

    const convertedLeads = leads.filter((l) => l.converted === true);

    const allPlans: ScheduledSendPlan[] = [];
    for (const lead of convertedLeads) {
        const plans = buildPlansForLead(campaign, lead, daysToSail, SCHEDULED_STAGE_POLICIES);
        allPlans.push(...plans);
    }

    const result: CampaignSweepResult = {
        ...baseResult,
        daysToSail,
        eligibleLeads: convertedLeads.length,
        plans: allPlans,
    };

    for (const plan of allPlans) {
        if (hasAlreadyBeenSent(events, plan.email, plan.stage, plan.scheduledOffset)) {
            result.skippedAlreadySent.push(plan);
            continue;
        }
        try {
            await dispatchEmailEvent(campaign.id, plan.email, plan.stage, {
                dryRun,
                phase3: { daysToSail: plan.daysToSail, scheduledOffset: plan.scheduledOffset },
            });
            result.dispatched.push(plan);
        } catch (err) {
            result.failures.push({
                email: plan.email,
                stage: plan.stage,
                scheduledOffset: plan.scheduledOffset,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return result;
}

/** Sweep every eligible campaign. */
export async function runEmailScheduler(
    opts: SchedulerOptions = {},
): Promise<SchedulerRunResult> {
    const runAt = new Date().toISOString();
    const today = todayUtc(opts.todayOverride);
    const dryRun = opts.dryRun === true;

    let campaigns: Campaign[] = [];
    try {
        campaigns = await scanAllCampaigns();
    } catch (err) {
        console.error('[EmailScheduler] scanAllCampaigns failed:', err);
        throw err;
    }

    if (opts.onlyCampaignSlug) {
        campaigns = campaigns.filter((c) => c.id === opts.onlyCampaignSlug);
    }

    const perCampaign: CampaignSweepResult[] = [];
    for (const campaign of campaigns) {
        try {
            perCampaign.push(await sweepCampaign(campaign, today, dryRun));
        } catch (err) {
            console.error(`[EmailScheduler] sweep failed for ${campaign.id}:`, err);
            perCampaign.push({
                campaignSlug: campaign.id,
                campaignName: campaign.name,
                daysToSail: null,
                eligibleLeads: 0,
                plans: [],
                dispatched: [],
                skippedAlreadySent: [],
                failures: [{
                    email: 'n/a',
                    stage: 'n/a',
                    scheduledOffset: -1,
                    error: err instanceof Error ? err.message : String(err),
                }],
            });
        }
    }

    const totals = perCampaign.reduce(
        (acc, c) => ({
            dispatched: acc.dispatched + c.dispatched.length,
            skippedAlreadySent: acc.skippedAlreadySent + c.skippedAlreadySent.length,
            failed: acc.failed + c.failures.length,
        }),
        { dispatched: 0, skippedAlreadySent: 0, failed: 0 },
    );

    return {
        runAt,
        today,
        dryRun,
        campaignsScanned: perCampaign.length,
        perCampaign,
        totals,
    };
}

/** Convenience wrapper for a single campaign. */
export async function runCampaignEmailSchedule(
    slug: string,
    opts: Omit<SchedulerOptions, 'onlyCampaignSlug'> = {},
): Promise<SchedulerRunResult> {
    return runEmailScheduler({ ...opts, onlyCampaignSlug: slug });
}
