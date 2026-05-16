/**
 * Klaviyo event payload builder
 *
 * Builds the full set of event properties Phase 1 templates need beyond the
 * profile-level properties already pushed by `klaviyo-profile-builder.ts`.
 *
 * Event properties differ from profile properties because they snapshot
 * campaign state at the moment the event fires (e.g. threshold progress,
 * waitlist count) and are available to the template via Klaviyo's `event.*`
 * accessor. Use event properties for anything that changes per-send;
 * use profile properties for identity, contact, and stable campaign refs.
 */

import type { Campaign, CampaignWaitlistEntry } from '@/lib/campaigns/types';
import type { CampaignWaitlistSummary } from '@/lib/campaigns/waitlist-store';
import type { KlaviyoEventProperties } from '@/lib/integrations/klaviyo';
import {
    KLAVIYO_METRIC_NAMES,
    STAGE_VISUAL_MODES,
    type EmailEventStage,
} from './email-event-types';
import { getCampaignLandingUrl } from './klaviyo-profile-builder';

export interface BuildKlaviyoEventInput {
    stage: EmailEventStage;
    campaign: Pick<
        Campaign,
        | 'id'
        | 'name'
        | 'status'
        | 'description'
        | 'cbagenttoolsBookingLink'
        | 'odysseusRetailBookingLink'
        | 'matchedShipName'
        | 'matchedSailDate'
        | 'matchedDeparturePort'
        | 'finalItineraryUrl'
        | 'tourConductorName'
        | 'tourConductorBio'
    >;
    lead: Pick<
        CampaignWaitlistEntry,
        | 'email'
        | 'firstName'
        | 'bookingMode'
        | 'passengerCount'
        | 'preferredCabinType'
        | 'manifestStatus'
        | 'bookingReference'
        | 'bookingConfirmedAt'
        | 'verificationToken'
        | 'createdAt'
    >;
    summary: Pick<
        CampaignWaitlistSummary,
        'totalEntries' | 'totalPassengers' | 'convertedEntries'
    >;
    /** Public threshold target in cabins (typically 8). */
    requiredCabins: number;
    /** Threshold progress 0–100. */
    percentOfThreshold: number;
    /**
     * Phase 2 extensions — populated only when the firing stage actually
     * needs them. None of these are required.
     */
    phase2?: {
        /** Operator-supplied deadline string for manifest_requested / manifest_reminder (ISO date or human). */
        manifestDeadline?: string;
        /** URL to the manifest collection form. Defaults to `${landing}/manifest` in the orchestrator. */
        manifestUrl?: string;
        /** URL to a list of adjacent / similar campaigns. Used by campaign_expired. */
        adjacentCampaignsUrl?: string;
        /** Free-form operator message appended to the body (e.g. why a campaign expired). */
        operatorNote?: string;
    };
    /**
     * Phase 3 extensions — scheduled / post-booking inputs. Populated only by
     * the scheduler or the manual operator triggers for the relevant stages.
     */
    phase3?: {
        /** Days remaining until sail. Computed by the scheduler; powers countdown templates. */
        daysToSail?: number;
        /**
         * Identifies *which* countdown cadence offset this firing represents
         * (90/60/30 for `travel_prep`, 14/7/3/1 for `final_countdown`).
         * Stored on the ledger so the scheduler can dedupe repeat sends.
         */
        scheduledOffset?: number;
        /** Optional packing-list URL appended to `final_countdown`. */
        packingListUrl?: string;
        /** Optional operator note (e.g. itinerary-publish announcement). */
        operatorNote?: string;
    };
    /**
     * Phase 4 extensions — change-notification metadata. Populated only when
     * the firing stage is `booking_change`. Severity is the canonical knob
     * the Klaviyo flow branches on.
     */
    phase4?: {
        /** UUID identifying this specific change. Same value is written to every recipient's ledger so acks can match back. */
        changeId?: string;
        /** Severity branch. Mirrors `BookingChangeSeverity`. */
        severity?: 'critical' | 'high' | 'medium' | 'low' | 'positive';
        /** Short kind label (`ship_change`, `date_change`, `price_change`, `cancellation`, `positive_update`, etc.). */
        changeType?: string;
        /** What the field was before the change. Free-text — rendered verbatim. */
        previousValue?: string;
        /** What the field is now. Same treatment as `previousValue`. */
        newValue?: string;
        /** Operator-facing summary headline (one sentence, max 240 chars). */
        summary?: string;
        /** Whether the lead must take any action. */
        actionRequired?: boolean;
        /** Deadline for any required action. Free-text or ISO date. */
        actionDeadline?: string;
        /** Support email/phone surfaced on critical changes. */
        supportContact?: string;
        /** Free-form operator note (max 500 chars). */
        operatorNote?: string;
    };
    /**
     * Phase 5 extensions — post-cruise + alumni invite properties. Populated
     * only when the firing stage is a Phase 5 stage.
     */
    phase5?: {
        // Post-cruise (welcome_home / survey) — supplied by the scheduler.
        /** Days elapsed since disembarkation. Powers the welcome / survey copy. */
        daysSinceDisembark?: number;
        /** Scheduler dedupe key, same as `phase3.scheduledOffset`. */
        scheduledOffset?: number;
        /** Optional photo-upload URL for the welcome-home email's primary CTA. */
        photoShareUrl?: string;
        /** Optional URL to the post-cruise survey form. */
        surveyUrl?: string;

        // Alumni rebooking invite — operator-supplied.
        /** Slug of the NEW campaign being offered to past guests. */
        targetCampaignSlug?: string;
        /** Display name of the target campaign. */
        targetCampaignName?: string;
        /** Public landing URL for the target campaign. */
        targetLandingUrl?: string;
        /** Sail date of the target campaign (free-text or ISO). */
        targetSailDate?: string;
        /** Optional one-line pitch the operator wants to lead with. */
        targetPitch?: string;
        /** Optional alumni-only access window (e.g. "First 48 hours"). */
        alumniWindow?: string;

        /** Free-form operator note (max 500 chars). */
        operatorNote?: string;
    };
}

export interface KlaviyoEventBuildResult {
    metricName: string;
    properties: KlaviyoEventProperties;
}

function compact(props: Record<string, string | number | boolean | undefined>): KlaviyoEventProperties {
    const out: KlaviyoEventProperties = {};
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        out[key] = value;
    }
    return out;
}

/** Lightweight one-line invite — used as a fallback when the campaign team hasn't authored bespoke copy. */
function buildShareInvite(campaignName: string): string {
    return `I just added myself to the waitlist for ${campaignName}. If they hit threshold the group sailing actually happens — take a look.`;
}

/**
 * Plan §6 copy rule for `threshold_met`: do NOT imply cruise-line space is
 * permanently secured until the booking path is live. We surface a single
 * canonical phrase so templates don't drift.
 */
const THRESHOLD_MET_CLAIM = 'The internal demand threshold has been reached for this campaign.';

export function buildKlaviyoEvent(input: BuildKlaviyoEventInput): KlaviyoEventBuildResult {
    const { stage, campaign, lead, summary, requiredCabins, percentOfThreshold, phase2, phase3, phase4, phase5 } = input;

    const metricName = KLAVIYO_METRIC_NAMES[stage];
    const remainingCabins = Math.max(0, requiredCabins - summary.totalEntries);

    const stagePhase2: Record<string, string | number | boolean | undefined> = {};
    if (stage === 'waitlist_confirmation' && lead.verificationToken) {
        const verifyUrl = `${getCampaignLandingUrl(campaign.id).replace(/\/groups\/.*/, '')}/api/groups/campaign/${campaign.id}/verify?email=${encodeURIComponent(lead.email)}&token=${lead.verificationToken}`;
        stagePhase2.verification_url = verifyUrl;
    }
    if (stage === 'threshold_met') {
        stagePhase2.threshold_met_claim = THRESHOLD_MET_CLAIM;
    }
    if (stage === 'manifest_requested' || stage === 'manifest_reminder') {
        stagePhase2.manifest_status = lead.manifestStatus ?? 'PENDING';
        stagePhase2.manifest_deadline = phase2?.manifestDeadline;
        stagePhase2.manifest_url = phase2?.manifestUrl;
    }
    if (stage === 'campaign_expired') {
        stagePhase2.adjacent_campaigns_url = phase2?.adjacentCampaignsUrl;
    }
    if (phase2?.operatorNote) {
        stagePhase2.operator_note = phase2.operatorNote;
    }

    const stagePhase3: Record<string, string | number | boolean | undefined> = {};
    if (stage === 'booking_confirmed') {
        stagePhase3.booking_reference = lead.bookingReference;
        stagePhase3.booking_confirmed_at = lead.bookingConfirmedAt;
    }
    if (stage === 'travel_prep' || stage === 'final_countdown') {
        stagePhase3.days_to_sail = phase3?.daysToSail;
        stagePhase3.scheduled_offset = phase3?.scheduledOffset;
    }
    if (stage === 'final_countdown') {
        stagePhase3.packing_list_url = phase3?.packingListUrl;
    }
    if (stage === 'final_itinerary_published') {
        stagePhase3.final_itinerary_url = campaign.finalItineraryUrl;
    }
    if (stage === 'tour_conductor_announced') {
        stagePhase3.tour_conductor_name = campaign.tourConductorName;
        stagePhase3.tour_conductor_bio = campaign.tourConductorBio;
    }
    if (phase3?.operatorNote) {
        stagePhase3.operator_note = phase3.operatorNote;
    }

    const stagePhase4: Record<string, string | number | boolean | undefined> = {};
    if (stage === 'booking_change') {
        stagePhase4.change_id = phase4?.changeId;
        stagePhase4.severity = phase4?.severity;
        stagePhase4.change_type = phase4?.changeType;
        stagePhase4.previous_value = phase4?.previousValue;
        stagePhase4.new_value = phase4?.newValue;
        stagePhase4.change_summary = phase4?.summary;
        stagePhase4.action_required = phase4?.actionRequired;
        stagePhase4.action_deadline = phase4?.actionDeadline;
        // Support contact only surfaces on critical sends. Suppressing it on
        // lower severities prevents templates from defaulting to a support
        // CTA where it would feel alarmist.
        if (phase4?.severity === 'critical') {
            stagePhase4.support_contact = phase4?.supportContact;
        }
    }
    if (phase4?.operatorNote) {
        stagePhase4.operator_note = phase4.operatorNote;
    }

    const stagePhase5: Record<string, string | number | boolean | undefined> = {};
    if (stage === 'post_cruise_welcome_home' || stage === 'post_cruise_survey') {
        stagePhase5.days_since_disembark = phase5?.daysSinceDisembark;
        stagePhase5.scheduled_offset = phase5?.scheduledOffset;
    }
    if (stage === 'post_cruise_welcome_home') {
        stagePhase5.photo_share_url = phase5?.photoShareUrl;
    }
    if (stage === 'post_cruise_survey') {
        stagePhase5.survey_url = phase5?.surveyUrl;
    }
    if (stage === 'alumni_rebooking_invite') {
        stagePhase5.target_campaign_slug = phase5?.targetCampaignSlug;
        stagePhase5.target_campaign_name = phase5?.targetCampaignName;
        stagePhase5.target_landing_url = phase5?.targetLandingUrl;
        stagePhase5.target_sail_date = phase5?.targetSailDate;
        stagePhase5.target_pitch = phase5?.targetPitch;
        stagePhase5.alumni_window = phase5?.alumniWindow;
    }
    if (phase5?.operatorNote) {
        stagePhase5.operator_note = phase5.operatorNote;
    }

    const properties = compact({
        // Stage routing
        stage,
        visual_mode: STAGE_VISUAL_MODES[stage],

        // Campaign snapshot
        campaign_slug: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        campaign_description: campaign.description,

        // Lead snapshot (also on profile but kept here for template convenience)
        first_name: lead.firstName,
        booking_mode: lead.bookingMode ?? 'GROUP_WAIT',
        passenger_count: lead.passengerCount,
        preferred_cabin_type: lead.preferredCabinType,
        waitlist_joined_at: lead.createdAt,

        // Threshold snapshot — drives Day 7 momentum copy
        threshold_required_cabins: requiredCabins,
        threshold_joined_entries: summary.totalEntries,
        threshold_joined_passengers: summary.totalPassengers,
        threshold_converted_entries: summary.convertedEntries,
        threshold_percent: percentOfThreshold,
        threshold_remaining_cabins: remainingCabins,

        // CTAs (also on profile, surfaced again for stage-specific overrides)
        landing_page_url: getCampaignLandingUrl(campaign.id),
        booking_link_url:
            campaign.cbagenttoolsBookingLink ?? campaign.odysseusRetailBookingLink,

        // Travel details (when matched)
        ship_name: campaign.matchedShipName,
        sail_date: campaign.matchedSailDate,
        departure_port: campaign.matchedDeparturePort,

        // Suggested social share copy (used by Day 7 invite-a-friend module)
        share_invite_copy: buildShareInvite(campaign.name),

        // Phase 2 stage-specific properties (only the keys relevant to `stage`
        // will be non-undefined; `compact` drops the rest).
        ...stagePhase2,
        // Phase 3 stage-specific properties (same compaction rules).
        ...stagePhase3,
        // Phase 4 stage-specific properties (booking_change only).
        ...stagePhase4,
        // Phase 5 stage-specific properties (post-cruise + alumni).
        ...stagePhase5,
    });

    return { metricName, properties };
}
