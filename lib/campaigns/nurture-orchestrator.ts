/**
 * Nurture Orchestrator
 *
 * Campaign-owned module that decides which nurture message fires, calls the
 * provider helper, and appends truthful lifecycle events to the event ledger.
 *
 * Rules:
 * - Only write `nurture_sent` / `threshold_met_notified` when a provider call succeeds.
 * - Write `nurture_queued` when dryRun mode is explicitly enabled.
 * - Write `lead_error` when required data is missing for a requested send or when the provider rejects.
 * - Never fabricate success states.
 */

import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';
import { appendLeadEvent } from '@/lib/campaigns/conversion-store';
import { trackKlaviyoEvent, upsertKlaviyoProfile } from '@/lib/integrations/klaviyo';
import { sendSms } from '@/lib/integrations/twilio';
import type { LeadAttribution } from '@/lib/campaigns/types';

// ─── Stage names ──────────────────────────────────────────────────────────────

export type NurtureStage =
    | 'waitlist_confirmation'
    | 'nurture_day3'
    | 'nurture_day7'
    | 'threshold_sms';

/** Klaviyo event names that trigger flows in the Klaviyo dashboard. */
const KLAVIYO_EVENT_NAMES: Record<Exclude<NurtureStage, 'threshold_sms'>, string> = {
    waitlist_confirmation: 'LLL Waitlist Confirmation',
    nurture_day3: 'LLL Nurture Day 3',
    nurture_day7: 'LLL Nurture Day 7',
};

// ─── Shared options ───────────────────────────────────────────────────────────

export interface NurtureOptions {
    /**
     * When true, records `nurture_queued` but does not call the provider.
     * Use for testing without live sends.
     */
    dryRun?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildAttribution(campaignSlug: string): LeadAttribution {
    return { sourceChannel: 'internal', provider: 'nurture-orchestrator', providerCampaignId: campaignSlug };
}

async function resolveLeadContext(campaignSlug: string, email: string) {
    const [campaign, lead] = await Promise.all([
        getCampaignBlueprint(campaignSlug),
        getCampaignWaitlistEntry(campaignSlug, email),
    ]);

    if (!campaign) throw new Error(`[NurtureOrchestrator] Campaign not found: ${campaignSlug}`);
    if (!lead) throw new Error(`[NurtureOrchestrator] Lead not found: ${email} in ${campaignSlug}`);

    return { campaign, lead };
}

// ─── Email nurture (Klaviyo) ──────────────────────────────────────────────────

async function sendKlaviyoNurture(
    campaignSlug: string,
    email: string,
    stage: Exclude<NurtureStage, 'threshold_sms'>,
    opts: NurtureOptions = {},
): Promise<void> {
    const { campaign, lead } = await resolveLeadContext(campaignSlug, email);
    const attribution = buildAttribution(campaignSlug);

    if (opts.dryRun) {
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'nurture_queued',
            attribution,
            notes: `[dryRun] stage=${stage}`,
            metadata: { stage, dryRun: 'true', provider: 'klaviyo' },
        });
        return;
    }

    await appendLeadEvent({
        campaignSlug,
        email,
        eventType: 'nurture_queued',
        attribution,
        notes: `stage=${stage}`,
        metadata: { stage, provider: 'klaviyo' },
    });

    try {
        await upsertKlaviyoProfile({
            email,
            firstName: lead.firstName,
            lastName: lead.lastName,
            phoneNumber: lead.phoneNumber,
            campaign_slug: campaignSlug,
            campaign_name: campaign.name,
            booking_mode: lead.bookingMode ?? 'GROUP_WAIT',
            passenger_count: lead.passengerCount,
        });

        const eventName = KLAVIYO_EVENT_NAMES[stage];
        await trackKlaviyoEvent({
            email,
            eventName,
            properties: {
                campaign_slug: campaignSlug,
                campaign_name: campaign.name,
                stage,
                booking_mode: lead.bookingMode ?? 'GROUP_WAIT',
                passenger_count: lead.passengerCount,
                preferred_cabin_type: lead.preferredCabinType,
            },
        });

        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'nurture_sent',
            attribution,
            notes: `stage=${stage} provider=klaviyo event="${eventName}"`,
            metadata: { stage, provider: 'klaviyo', klaviyoEvent: eventName },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'lead_error',
            attribution,
            notes: `Nurture send failed: stage=${stage} error=${message}`,
            metadata: { stage, provider: 'klaviyo', error: message },
        });
        throw err;
    }
}

// ─── SMS nurture (Twilio) ─────────────────────────────────────────────────────

async function sendTwilioThresholdSms(
    campaignSlug: string,
    email: string,
    opts: NurtureOptions = {},
): Promise<void> {
    const { campaign, lead } = await resolveLeadContext(campaignSlug, email);
    const attribution = buildAttribution(campaignSlug);

    if (!lead.phoneNumber) {
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'lead_error',
            attribution,
            notes: 'threshold_sms skipped: no phone number on record',
            metadata: { stage: 'threshold_sms', provider: 'twilio', error: 'missing_phone' },
        });
        return;
    }

    if (opts.dryRun) {
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'nurture_queued',
            attribution,
            notes: `[dryRun] stage=threshold_sms phone=${lead.phoneNumber}`,
            metadata: { stage: 'threshold_sms', dryRun: 'true', provider: 'twilio' },
        });
        return;
    }

    const smsBody = `Great news! The ${campaign.name} group cruise has hit its booking threshold — your spot is secured. Reply for booking details or visit leisurelifeinteractive.com.`;

    try {
        const result = await sendSms({ to: lead.phoneNumber, body: smsBody });

        if (!result.sent) {
            await appendLeadEvent({
                campaignSlug,
                email,
                eventType: 'lead_error',
                attribution,
                notes: `threshold_sms skipped by Twilio helper: reason=${result.reason}`,
                metadata: { stage: 'threshold_sms', provider: 'twilio', error: result.reason },
            });
            return;
        }

        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'threshold_met_notified',
            attribution,
            notes: `threshold_sms sent via Twilio messageSid=${result.messageSid}`,
            metadata: { stage: 'threshold_sms', provider: 'twilio', messageSid: result.messageSid },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await appendLeadEvent({
            campaignSlug,
            email,
            eventType: 'lead_error',
            attribution,
            notes: `threshold_sms Twilio error: ${message}`,
            metadata: { stage: 'threshold_sms', provider: 'twilio', error: message },
        });
        throw err;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendWaitlistConfirmation(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return sendKlaviyoNurture(campaignSlug, email, 'waitlist_confirmation', opts);
}

export async function sendDay3Nurture(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return sendKlaviyoNurture(campaignSlug, email, 'nurture_day3', opts);
}

export async function sendDay7Nurture(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return sendKlaviyoNurture(campaignSlug, email, 'nurture_day7', opts);
}

export async function sendThresholdSms(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return sendTwilioThresholdSms(campaignSlug, email, opts);
}

/**
 * Dispatch a nurture stage by name. Useful for operator-triggered or API-driven sends.
 */
export async function dispatchNurtureStage(
    campaignSlug: string,
    email: string,
    stage: NurtureStage,
    opts?: NurtureOptions,
): Promise<void> {
    switch (stage) {
        case 'waitlist_confirmation':
            return sendWaitlistConfirmation(campaignSlug, email, opts);
        case 'nurture_day3':
            return sendDay3Nurture(campaignSlug, email, opts);
        case 'nurture_day7':
            return sendDay7Nurture(campaignSlug, email, opts);
        case 'threshold_sms':
            return sendThresholdSms(campaignSlug, email, opts);
    }
}
