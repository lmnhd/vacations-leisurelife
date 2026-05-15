/**
 * Nurture Orchestrator
 *
 * Thin facade preserved for back-compat. Phase 1 of the Klaviyo email plan
 * moves all email-event logic into `lib/campaigns/email/email-event-orchestrator.ts`;
 * this file now delegates the three Phase 1 email stages there.
 *
 * The Twilio threshold-SMS path stays here — it is a separate channel and
 * does not benefit from sharing the email payload builders.
 *
 * Public API (`sendWaitlistConfirmation`, `sendDay3Nurture`, `sendDay7Nurture`,
 * `sendThresholdSms`, `dispatchNurtureStage`) and the `NurtureStage` union
 * are unchanged so existing callers don't need edits.
 */

import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';
import { appendLeadEvent } from '@/lib/campaigns/conversion-store';
import { sendSms } from '@/lib/integrations/twilio';
import { dispatchEmailEvent } from '@/lib/campaigns/email/email-event-orchestrator';
import type { LeadAttribution } from '@/lib/campaigns/types';

// ─── Stage names ──────────────────────────────────────────────────────────────

export type NurtureStage =
    | 'waitlist_confirmation'
    | 'nurture_day3'
    | 'nurture_day7'
    | 'threshold_sms';

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

// ─── SMS nurture (Twilio) ─────────────────────────────────────────────────────

async function sendTwilioThresholdSms(
    campaignSlug: string,
    email: string,
    opts: NurtureOptions = {},
): Promise<void> {
    const [campaign, lead] = await Promise.all([
        getCampaignBlueprint(campaignSlug),
        getCampaignWaitlistEntry(campaignSlug, email),
    ]);

    if (!campaign) throw new Error(`[NurtureOrchestrator] Campaign not found: ${campaignSlug}`);
    if (!lead) throw new Error(`[NurtureOrchestrator] Lead not found: ${email} in ${campaignSlug}`);

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
    return dispatchEmailEvent(campaignSlug, email, 'waitlist_confirmation', opts);
}

export async function sendDay3Nurture(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return dispatchEmailEvent(campaignSlug, email, 'nurture_day3', opts);
}

export async function sendDay7Nurture(
    campaignSlug: string,
    email: string,
    opts?: NurtureOptions,
): Promise<void> {
    return dispatchEmailEvent(campaignSlug, email, 'nurture_day7', opts);
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
        case 'nurture_day3':
        case 'nurture_day7':
            return dispatchEmailEvent(campaignSlug, email, stage, opts);
        case 'threshold_sms':
            return sendThresholdSms(campaignSlug, email, opts);
    }
}
