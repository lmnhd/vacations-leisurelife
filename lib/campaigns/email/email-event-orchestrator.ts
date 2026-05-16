/**
 * Email event orchestrator — Phase 1
 *
 * Single entry point the app calls to send (or preview) any Phase 1 Klaviyo
 * email. Responsibilities:
 *
 *  1. Resolve campaign + lead + waitlist summary + (optional) landing model.
 *  2. Build typed profile + event payloads via the dedicated builders.
 *  3. In live mode: upsert profile and track event via Klaviyo; append
 *     truthful ledger entries on success/failure.
 *  4. In dryRun mode: skip provider calls but still record `nurture_queued`.
 *  5. In preview mode: return the exact payloads with NO provider calls and
 *     NO ledger writes — for the operator preview surface only.
 *
 * Phase 1 deliberately preserves the existing `nurture-orchestrator.ts`
 * public surface; that file now delegates here. Later phases will add new
 * stages (threshold met, manifest, booking link, etc.) by extending
 * `EmailEventStage` in `email-event-types.ts`.
 */

import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import {
    getCampaignWaitlistEntry,
    getCampaignWaitlistSummary,
    listCampaignWaitlistEntries,
} from '@/lib/campaigns/waitlist-store';
import { appendLeadEvent, listCampaignLeadEvents } from '@/lib/campaigns/conversion-store';
import { trackKlaviyoEvent, upsertKlaviyoProfile } from '@/lib/integrations/klaviyo';
import { getPublicGroupCabinTarget, getPublicThresholdPercent } from '@/lib/campaigns/threshold-policy';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import type { CampaignWaitlistEntry, LeadAttribution } from '@/lib/campaigns/types';
import type { KlaviyoEventProperties, KlaviyoProfileProperties } from '@/lib/integrations/klaviyo';
import {
    KLAVIYO_METRIC_NAMES,
    STAGE_LEDGER_SUCCESS_TYPE,
    type EmailEventStage,
} from './email-event-types';
import { buildKlaviyoProfile, getCampaignLandingUrl } from './klaviyo-profile-builder';
import { buildKlaviyoEvent } from './klaviyo-event-builder';

export interface EmailEventOptions {
    /**
     * When true, records `nurture_queued` but does not call Klaviyo. Use for
     * end-to-end wire tests where the operator still wants ledger evidence
     * but no live send.
     */
    dryRun?: boolean;
    /**
     * Phase 2 stage-specific extension data. Pass only when the firing stage
     * needs it (manifest_*, campaign_expired). Ignored for Phase 1 stages.
     */
    phase2?: {
        manifestDeadline?: string;
        manifestUrl?: string;
        adjacentCampaignsUrl?: string;
        operatorNote?: string;
    };
    /**
     * Phase 3 stage-specific extension data. Populated by the scheduler for
     * `travel_prep` and `final_countdown`, or by operator triggers for the
     * other Phase 3 stages.
     */
    phase3?: {
        daysToSail?: number;
        scheduledOffset?: number;
        packingListUrl?: string;
        operatorNote?: string;
    };
    /**
     * Phase 4 stage-specific extension data. Populated only when the firing
     * stage is `booking_change`. The orchestrator stamps every key onto the
     * resulting `booking_change` ledger row so the follow-up dashboard can
     * read the change details without re-querying state elsewhere.
     */
    phase4?: {
        changeId?: string;
        severity?: 'critical' | 'high' | 'medium' | 'low' | 'positive';
        changeType?: string;
        previousValue?: string;
        newValue?: string;
        summary?: string;
        actionRequired?: boolean;
        actionDeadline?: string;
        supportContact?: string;
        operatorNote?: string;
    };
    /**
     * Phase 5 stage-specific extension data. Populated by the scheduler for
     * `post_cruise_welcome_home` and `post_cruise_survey`, or by the alumni
     * invite operator path for `alumni_rebooking_invite`.
     */
    phase5?: {
        daysSinceDisembark?: number;
        scheduledOffset?: number;
        photoShareUrl?: string;
        surveyUrl?: string;
        targetCampaignSlug?: string;
        targetCampaignName?: string;
        targetLandingUrl?: string;
        targetSailDate?: string;
        targetPitch?: string;
        alumniWindow?: string;
        operatorNote?: string;
    };
}

export interface BroadcastFilter {
    /**
     * Filter applied to each lead before dispatch. Return false to skip.
     * Lets the manifest_reminder stage target only PENDING leads, etc.
     */
    shouldSend?: (lead: CampaignWaitlistEntry) => boolean;
}

export interface BroadcastResult {
    stage: EmailEventStage;
    campaignSlug: string;
    totalLeads: number;
    attempted: number;
    skippedByFilter: number;
    succeeded: number;
    failed: number;
    failures: Array<{ email: string; error: string }>;
}

export interface EmailEventPreview {
    stage: EmailEventStage;
    campaignSlug: string;
    email: string;
    metricName: string;
    profile: KlaviyoProfileProperties;
    event: KlaviyoEventProperties;
    /** When true, hero image / sail date / booking link came back undefined or null. */
    warnings: string[];
}

function buildAttribution(campaignSlug: string): LeadAttribution {
    return {
        sourceChannel: 'internal',
        provider: 'email-event-orchestrator',
        providerCampaignId: campaignSlug,
    };
}

async function resolveContext(campaignSlug: string, email: string, includeLanding: boolean) {
    const [campaign, lead, summary] = await Promise.all([
        getCampaignBlueprint(campaignSlug),
        getCampaignWaitlistEntry(campaignSlug, email),
        getCampaignWaitlistSummary(campaignSlug),
    ]);

    if (!campaign) {
        throw new Error(`[EmailOrchestrator] Campaign not found: ${campaignSlug}`);
    }
    if (!lead) {
        throw new Error(`[EmailOrchestrator] Lead not found: ${email} in ${campaignSlug}`);
    }

    let landing: CampaignLandingViewModel | null = null;
    if (includeLanding) {
        try {
            const result = await getCampaignLandingBySlug(campaignSlug, { includeDraftPreview: true });
            landing = result?.landing ?? null;
        } catch (err) {
            // Landing model is best-effort enrichment. We log and proceed with
            // a degraded payload (no hero_image_url, stateLabel fallback) so
            // a misconfigured landing model never blocks an email send.
            console.warn(`[EmailOrchestrator] Failed to load landing model for ${campaignSlug}:`, err);
        }
    }

    return { campaign, lead, summary, landing };
}

/** Default manifest collection URL is `${landing}/manifest`. */
function defaultManifestUrl(campaignSlug: string): string {
    return `${getCampaignLandingUrl(campaignSlug)}/manifest`;
}

/**
 * Build the exact payload that would be sent for a given stage, without
 * touching Klaviyo or writing to the event ledger. Safe to call from a
 * preview surface.
 */
export async function buildEmailEventPreview(
    campaignSlug: string,
    email: string,
    stage: EmailEventStage,
    opts: {
        phase2?: EmailEventOptions['phase2'];
        phase3?: EmailEventOptions['phase3'];
        phase4?: EmailEventOptions['phase4'];
        phase5?: EmailEventOptions['phase5'];
    } = {},
): Promise<EmailEventPreview> {
    const { campaign, lead, summary, landing } = await resolveContext(campaignSlug, email, true);

    const requiredCabins = getPublicGroupCabinTarget(campaign);
    const percentOfThreshold = getPublicThresholdPercent(requiredCabins, summary.totalEntries);

    const phase2 = {
        ...opts.phase2,
        // Default manifest URL to {landing}/manifest if the operator didn't supply one.
        manifestUrl:
            opts.phase2?.manifestUrl ??
            (stage === 'manifest_requested' || stage === 'manifest_reminder'
                ? defaultManifestUrl(campaignSlug)
                : undefined),
    };
    const phase3 = opts.phase3 ?? {};
    const phase4 = opts.phase4 ?? {};
    const phase5 = opts.phase5 ?? {};

    const profile = buildKlaviyoProfile({ campaign, lead, landing });
    const { metricName, properties } = buildKlaviyoEvent({
        stage,
        campaign,
        lead,
        summary,
        requiredCabins,
        percentOfThreshold,
        phase2,
        phase3,
        phase4,
        phase5,
    });

    const warnings: string[] = [];
    if (!profile.hero_image_url) warnings.push('No hero_image_url — landing view model has no hero image yet.');
    if (!profile.sail_date) warnings.push('No sail_date — campaign is not CB-matched yet.');
    if (!profile.booking_link_url) warnings.push('No booking_link_url — neither CB nor Odysseus link is set.');
    if (!profile.community_channel_url) warnings.push('No community_channel_url — populated at THRESHOLD_MET.');

    // Phase 2 stage-specific warnings.
    if (stage === 'manifest_requested' || stage === 'manifest_reminder') {
        if (!phase2.manifestDeadline) warnings.push('No manifest_deadline — operator did not supply a deadline.');
    }
    if (stage === 'manifest_reminder' && lead.manifestStatus === 'SUBMITTED') {
        warnings.push('Lead already submitted manifest — reminder should typically be skipped via broadcast filter.');
    }
    if (stage === 'booking_link_ready' && !profile.booking_link_url) {
        warnings.push('booking_link_ready fired with no booking link populated on the campaign.');
    }
    if (stage === 'campaign_expired' && !phase2.adjacentCampaignsUrl) {
        warnings.push('No adjacent_campaigns_url — campaign_expired CTA will be missing.');
    }

    // Phase 3 stage-specific warnings.
    if (stage === 'booking_confirmed' && !lead.bookingReference) {
        warnings.push('booking_confirmed fired with no booking_reference — lead may not be reconciled.');
    }
    if ((stage === 'travel_prep' || stage === 'final_countdown') && phase3.scheduledOffset === undefined) {
        warnings.push(`${stage} fired without a scheduled_offset — scheduler dedupe will not work for this send.`);
    }
    if (stage === 'final_itinerary_published' && !campaign.finalItineraryUrl) {
        warnings.push('final_itinerary_published fired with no final_itinerary_url set on the campaign.');
    }
    if (stage === 'tour_conductor_announced' && !campaign.tourConductorName) {
        warnings.push('tour_conductor_announced fired with no tour_conductor_name set on the campaign.');
    }

    return {
        stage,
        campaignSlug,
        email,
        metricName,
        profile,
        event: properties,
        warnings,
    };
}

/**
 * Dispatch an email event for real (or in dryRun mode). Appends truthful
 * `nurture_queued` / `nurture_sent` / `lead_error` ledger entries.
 */
export async function dispatchEmailEvent(
    campaignSlug: string,
    email: string,
    stage: EmailEventStage,
    opts: EmailEventOptions = {},
): Promise<void> {
    const { campaign, lead, summary, landing } = await resolveContext(campaignSlug, email, true);
    const attribution = buildAttribution(campaignSlug);

    // Build a stable metadata bag used by every ledger write for this send.
    // `scheduledOffset` is the scheduler's idempotency key; it MUST appear on
    // both the queued and the sent rows so the scheduler dedupe scan works
    // regardless of which row it reads. Phase 3 stages supply it via
    // `phase3.scheduledOffset` (pre-sail); Phase 5 post-cruise stages supply
    // it via `phase5.scheduledOffset` (post-disembark). Either path lands in
    // the same ledger metadata key.
    const scheduledOffset = opts.phase3?.scheduledOffset ?? opts.phase5?.scheduledOffset;
    const baseMetadata: Record<string, string> = { stage, provider: 'klaviyo' };
    if (scheduledOffset !== undefined) {
        baseMetadata.scheduledOffset = String(scheduledOffset);
    }
    // Phase 4 — stamp every booking_change ledger row with the changeId and
    // severity so the follow-up dashboard can group by change and filter on
    // severity without re-querying state.
    if (stage === 'booking_change' && opts.phase4) {
        if (opts.phase4.changeId) baseMetadata.changeId = opts.phase4.changeId;
        if (opts.phase4.severity) baseMetadata.severity = opts.phase4.severity;
        if (opts.phase4.changeType) baseMetadata.changeType = opts.phase4.changeType;
        if (opts.phase4.actionRequired !== undefined) {
            baseMetadata.actionRequired = opts.phase4.actionRequired ? 'true' : 'false';
        }
        if (opts.phase4.previousValue) baseMetadata.previousValue = opts.phase4.previousValue;
        if (opts.phase4.newValue) baseMetadata.newValue = opts.phase4.newValue;
        if (opts.phase4.summary) baseMetadata.changeSummary = opts.phase4.summary;
    }

    if (opts.dryRun) {
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'nurture_queued',
            attribution,
            notes: `[dryRun] stage=${stage}${scheduledOffset !== undefined ? ` offset=${scheduledOffset}` : ''}`,
            metadata: { ...baseMetadata, dryRun: 'true' },
        });
        return;
    }

    await appendLeadEvent({
        campaignSlug,
        email,
        eventType: 'nurture_queued',
        attribution,
        notes: `stage=${stage}${scheduledOffset !== undefined ? ` offset=${scheduledOffset}` : ''}`,
        metadata: baseMetadata,
    });

    const requiredCabins = getPublicGroupCabinTarget(campaign);
    const percentOfThreshold = getPublicThresholdPercent(requiredCabins, summary.totalEntries);

    const phase2 = {
        ...opts.phase2,
        manifestUrl:
            opts.phase2?.manifestUrl ??
            (stage === 'manifest_requested' || stage === 'manifest_reminder'
                ? defaultManifestUrl(campaignSlug)
                : undefined),
    };
    const phase3 = opts.phase3 ?? {};
    const phase4 = opts.phase4 ?? {};
    const phase5 = opts.phase5 ?? {};

    const profile = buildKlaviyoProfile({ campaign, lead, landing });
    const { metricName, properties } = buildKlaviyoEvent({
        stage,
        campaign,
        lead,
        summary,
        requiredCabins,
        percentOfThreshold,
        phase2,
        phase3,
        phase4,
        phase5,
    });

    try {
        await upsertKlaviyoProfile(profile);
        await trackKlaviyoEvent({
            email,
            eventName: metricName,
            properties,
        });

        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: STAGE_LEDGER_SUCCESS_TYPE[stage],
            attribution,
            notes: `stage=${stage} provider=klaviyo event="${metricName}"${scheduledOffset !== undefined ? ` offset=${scheduledOffset}` : ''}`,
            metadata: { ...baseMetadata, klaviyoEvent: metricName },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'lead_error',
            attribution,
            notes: `Email send failed: stage=${stage} error=${message}`,
            metadata: { ...baseMetadata, error: message },
        });
        throw err;
    }
}

/**
 * Send a stage event to every lead on a campaign. Errors per-lead are caught
 * and aggregated so one failure does not block the rest of the broadcast.
 *
 * Use `filter.shouldSend` to scope the send (e.g. only PENDING manifests for
 * `manifest_reminder`).
 */
export async function dispatchEmailBroadcast(
    campaignSlug: string,
    stage: EmailEventStage,
    opts: EmailEventOptions = {},
    filter: BroadcastFilter = {},
): Promise<BroadcastResult> {
    const leads = await listCampaignWaitlistEntries(campaignSlug);

    const result: BroadcastResult = {
        stage,
        campaignSlug,
        totalLeads: leads.length,
        attempted: 0,
        skippedByFilter: 0,
        succeeded: 0,
        failed: 0,
        failures: [],
    };

    for (const lead of leads) {
        if (filter.shouldSend && !filter.shouldSend(lead)) {
            result.skippedByFilter += 1;
            continue;
        }
        result.attempted += 1;
        try {
            await dispatchEmailEvent(campaignSlug, lead.email, stage, opts);
            result.succeeded += 1;
        } catch (err) {
            result.failed += 1;
            result.failures.push({
                email: lead.email,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return result;
}

// ─── Phase 4 — Booking Change Notifications ──────────────────────────────────

import { randomUUID } from 'crypto';
import { sendSms } from '@/lib/integrations/twilio';
import type { BookingChangeSeverity } from './email-event-types';

export interface RecordBookingChangeInput {
    campaignSlug: string;
    severity: BookingChangeSeverity;
    changeType: string;
    previousValue: string;
    newValue: string;
    summary: string;
    actionRequired: boolean;
    actionDeadline?: string;
    supportContact?: string;
    operatorNote?: string;
    /** Override the generated UUID — used by tests + retry flows. */
    changeId?: string;
    /** When true, write ledger rows but skip Klaviyo + SMS. */
    dryRun?: boolean;
    /** When true, scope the send to converted leads only (default for booking changes). */
    convertedOnly?: boolean;
}

export interface RecordBookingChangeResult {
    changeId: string;
    campaignSlug: string;
    severity: BookingChangeSeverity;
    totalLeads: number;
    targetedLeads: number;
    emailDispatched: number;
    emailFailed: number;
    smsDispatched: number;
    smsSkipped: number;
    smsFailed: number;
    failures: Array<{ email: string; channel: 'email' | 'sms'; error: string }>;
}

const CRITICAL_SMS_TEMPLATES: Partial<Record<string, (campaignName: string, summary: string, support?: string) => string>> = {
    default: (campaignName, summary, support) =>
        `[Leisure Life] URGENT update on ${campaignName}: ${summary}` +
        (support ? ` — Contact: ${support}` : ''),
};

/**
 * Record a booking change against a campaign and notify every (converted)
 * lead via email. For `critical` severity, also fires a Twilio SMS for any
 * lead with a phone number on file.
 *
 * Idempotency: callers can pass their own `changeId` to retry safely. Each
 * lead's ledger row carries the same `changeId` so the follow-up dashboard
 * can group by change and detect duplicates.
 */
export async function recordBookingChange(
    input: RecordBookingChangeInput,
): Promise<RecordBookingChangeResult> {
    const changeId = input.changeId ?? randomUUID();
    const { campaignSlug, severity, dryRun } = input;
    const convertedOnly = input.convertedOnly ?? true;

    const leads = await listCampaignWaitlistEntries(campaignSlug);
    const targeted = convertedOnly ? leads.filter((l) => l.converted === true) : leads;

    const result: RecordBookingChangeResult = {
        changeId,
        campaignSlug,
        severity,
        totalLeads: leads.length,
        targetedLeads: targeted.length,
        emailDispatched: 0,
        emailFailed: 0,
        smsDispatched: 0,
        smsSkipped: 0,
        smsFailed: 0,
        failures: [],
    };

    // Resolve campaign name once for SMS body.
    const campaign = await getCampaignBlueprint(campaignSlug);
    const campaignName = campaign?.name ?? campaignSlug;

    for (const lead of targeted) {
        // Email side — uses the existing dispatch path, which stamps the
        // phase4 metadata on the `booking_change` ledger row.
        try {
            await dispatchEmailEvent(campaignSlug, lead.email, 'booking_change', {
                dryRun,
                phase4: {
                    changeId,
                    severity,
                    changeType: input.changeType,
                    previousValue: input.previousValue,
                    newValue: input.newValue,
                    summary: input.summary,
                    actionRequired: input.actionRequired,
                    actionDeadline: input.actionDeadline,
                    supportContact: input.supportContact,
                    operatorNote: input.operatorNote,
                },
            });
            result.emailDispatched += 1;
        } catch (err) {
            result.emailFailed += 1;
            result.failures.push({
                email: lead.email,
                channel: 'email',
                error: err instanceof Error ? err.message : String(err),
            });
        }

        // SMS fallback — critical only, only for leads with a phone number.
        // Plan §8: critical changes get an SMS in parallel with the email.
        if (severity === 'critical' && !dryRun) {
            if (!lead.phoneNumber) {
                result.smsSkipped += 1;
                continue;
            }
            try {
                const body = CRITICAL_SMS_TEMPLATES.default!(
                    campaignName,
                    input.summary,
                    input.supportContact,
                );
                const smsResult = await sendSms({ to: lead.phoneNumber, body });
                if (smsResult.sent) {
                    result.smsDispatched += 1;
                } else {
                    result.smsSkipped += 1;
                }
            } catch (err) {
                result.smsFailed += 1;
                result.failures.push({
                    email: lead.email,
                    channel: 'sms',
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    return result;
}

/**
 * Read every `booking_change` ledger row across all campaigns and group
 * them by `changeId`. Used by the operator follow-up dashboard to surface
 * critical changes that still have unacknowledged recipients.
 *
 * The result aggregates recipients per change so the dashboard can render
 * a row per change with its acknowledgment progress (acked / total) —
 * matching the plan §8 requirement to "manually follow up" on critical
 * changes that have not been acknowledged.
 */
export interface PendingBookingChangeRecipient {
    email: string;
    acknowledged: boolean;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
}

export interface PendingBookingChange {
    changeId: string;
    campaignSlug: string;
    severity: BookingChangeSeverity;
    changeType: string;
    previousValue: string | null;
    newValue: string | null;
    summary: string | null;
    actionRequired: boolean;
    occurredAt: string;
    recipients: PendingBookingChangeRecipient[];
    /** Convenience: count of recipients still needing acknowledgment. */
    pendingAckCount: number;
}

export async function listBookingChangesForCampaign(
    campaignSlug: string,
): Promise<PendingBookingChange[]> {
    const events = await listCampaignLeadEvents(campaignSlug);

    const byChangeId = new Map<string, {
        change: Partial<PendingBookingChange>;
        recipients: Map<string, PendingBookingChangeRecipient>;
    }>();

    for (const e of events) {
        const changeId = e.metadata?.changeId;
        if (!changeId) continue;
        if (e.eventType !== 'booking_change' && e.eventType !== 'booking_change_acknowledged') continue;

        let bucket = byChangeId.get(changeId);
        if (!bucket) {
            bucket = {
                change: { changeId, campaignSlug, recipients: [] },
                recipients: new Map(),
            };
            byChangeId.set(changeId, bucket);
        }

        if (e.eventType === 'booking_change') {
            // Seed change metadata from the first matching row (all rows for the
            // same changeId carry identical metadata).
            const c = bucket.change;
            if (!c.severity) c.severity = (e.metadata?.severity as BookingChangeSeverity) ?? 'medium';
            if (!c.changeType) c.changeType = e.metadata?.changeType ?? 'unknown';
            if (c.previousValue === undefined) c.previousValue = e.metadata?.previousValue ?? null;
            if (c.newValue === undefined) c.newValue = e.metadata?.newValue ?? null;
            if (c.summary === undefined) c.summary = e.metadata?.changeSummary ?? null;
            if (c.actionRequired === undefined) c.actionRequired = e.metadata?.actionRequired === 'true';
            if (!c.occurredAt) c.occurredAt = e.occurredAt;

            const existing = bucket.recipients.get(e.email);
            if (!existing) {
                bucket.recipients.set(e.email, {
                    email: e.email,
                    acknowledged: false,
                    acknowledgedAt: null,
                    acknowledgedBy: null,
                });
            }
        } else {
            // booking_change_acknowledged
            const existing = bucket.recipients.get(e.email);
            if (existing) {
                existing.acknowledged = true;
                existing.acknowledgedAt = e.occurredAt;
                existing.acknowledgedBy = e.metadata?.acknowledgedBy ?? null;
            } else {
                bucket.recipients.set(e.email, {
                    email: e.email,
                    acknowledged: true,
                    acknowledgedAt: e.occurredAt,
                    acknowledgedBy: e.metadata?.acknowledgedBy ?? null,
                });
            }
        }
    }

    const out: PendingBookingChange[] = [];
    for (const { change, recipients } of byChangeId.values()) {
        const recipientList = Array.from(recipients.values());
        const pendingAckCount = recipientList.filter((r) => !r.acknowledged).length;
        out.push({
            changeId: change.changeId ?? '',
            campaignSlug: change.campaignSlug ?? campaignSlug,
            severity: (change.severity as BookingChangeSeverity) ?? 'medium',
            changeType: change.changeType ?? 'unknown',
            previousValue: change.previousValue ?? null,
            newValue: change.newValue ?? null,
            summary: change.summary ?? null,
            actionRequired: change.actionRequired ?? false,
            occurredAt: change.occurredAt ?? '',
            recipients: recipientList,
            pendingAckCount,
        });
    }

    return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Acknowledge a booking change for a specific lead. Appends a
 * `booking_change_acknowledged` ledger row with the same `changeId`.
 * Idempotent — a duplicate ack writes a duplicate row but the dashboard's
 * `acknowledged` flag stays true either way.
 */
export async function acknowledgeBookingChange(input: {
    campaignSlug: string;
    email: string;
    changeId: string;
    acknowledgedBy?: string;
    note?: string;
}): Promise<void> {
    await appendLeadEvent({
        campaignSlug: input.campaignSlug,
        email: input.email,
        eventType: 'booking_change_acknowledged',
        attribution: buildAttribution(input.campaignSlug),
        notes: `Operator acknowledged change ${input.changeId}` + (input.note ? ` — ${input.note}` : ''),
        metadata: {
            changeId: input.changeId,
            acknowledgedBy: input.acknowledgedBy ?? 'unknown',
        },
    });
}

// ─── Phase 5 — Alumni Rebooking Invite ────────────────────────────────────

export interface AlumniInviteSource {
    /** Slug of a past campaign to draw alumni from. */
    slug: string;
    /** When true, only send to leads that are `converted=true` on the source campaign. Default true. */
    convertedOnly?: boolean;
}

export interface SendAlumniInviteInput {
    /** Slug of the NEW campaign being offered. The orchestrator pulls landing + sail info from this. */
    targetCampaignSlug: string;
    /** One or more past campaigns whose converted guests should receive the invite. */
    sources: AlumniInviteSource[];
    /** Operator-supplied pitch (one sentence). Optional. */
    pitch?: string;
    /** Alumni access window copy (e.g. "First 48 hours"). Optional. */
    alumniWindow?: string;
    /** Free-form operator note (max 500 chars). */
    operatorNote?: string;
    /** When true, write ledger rows but skip Klaviyo. */
    dryRun?: boolean;
}

export interface AlumniInviteResult {
    targetCampaignSlug: string;
    sources: AlumniInviteSource[];
    /** Union of unique recipient emails actually targeted. */
    uniqueRecipients: number;
    dispatched: number;
    skippedDuplicateRecipient: number;
    failed: number;
    failures: Array<{ email: string; sourceSlug: string; error: string }>;
}

/**
 * Send `LLL Alumni Rebooking Invite` from the named source campaign(s) to
 * the target campaign. The invite carries the TARGET campaign's identity
 * but is ledger-stamped against the SOURCE campaign (so each guest's
 * conversion history stays scoped to where they originally sailed).
 *
 * De-duplicates recipients across source campaigns: a guest who sailed on
 * two past campaigns gets one invite, not two.
 */
export async function sendAlumniInvite(
    input: SendAlumniInviteInput,
): Promise<AlumniInviteResult> {
    const target = await getCampaignBlueprint(input.targetCampaignSlug);
    if (!target) {
        throw new Error(`[AlumniInvite] target campaign not found: ${input.targetCampaignSlug}`);
    }

    const targetLandingUrl = getCampaignLandingUrl(input.targetCampaignSlug);

    const result: AlumniInviteResult = {
        targetCampaignSlug: input.targetCampaignSlug,
        sources: input.sources,
        uniqueRecipients: 0,
        dispatched: 0,
        skippedDuplicateRecipient: 0,
        failed: 0,
        failures: [],
    };

    const seenEmails = new Set<string>();

    for (const source of input.sources) {
        const convertedOnly = source.convertedOnly ?? true;
        const sourceLeads = await listCampaignWaitlistEntries(source.slug);
        const eligible = convertedOnly ? sourceLeads.filter((l) => l.converted === true) : sourceLeads;

        for (const lead of eligible) {
            if (seenEmails.has(lead.email)) {
                result.skippedDuplicateRecipient += 1;
                continue;
            }
            seenEmails.add(lead.email);
            result.uniqueRecipients += 1;

            try {
                await dispatchEmailEvent(source.slug, lead.email, 'alumni_rebooking_invite', {
                    dryRun: input.dryRun,
                    phase5: {
                        targetCampaignSlug: target.id,
                        targetCampaignName: target.name,
                        targetLandingUrl,
                        targetSailDate: target.matchedSailDate,
                        targetPitch: input.pitch,
                        alumniWindow: input.alumniWindow,
                        operatorNote: input.operatorNote,
                    },
                });
                result.dispatched += 1;
            } catch (err) {
                result.failed += 1;
                result.failures.push({
                    email: lead.email,
                    sourceSlug: source.slug,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    return result;
}

export { KLAVIYO_METRIC_NAMES };
