import assert from 'node:assert/strict';
import { buildKlaviyoProfile } from '../klaviyo-profile-builder';
import { buildKlaviyoEvent } from '../klaviyo-event-builder';
import type { Campaign, CampaignWaitlistEntry } from '@/lib/campaigns/types';

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

console.log('\nKlaviyo Payload Builders (Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5)\n');

const baseCampaign: Pick<
    Campaign,
    | 'id'
    | 'name'
    | 'status'
    | 'description'
    | 'matchedShipName'
    | 'matchedSailDate'
    | 'matchedDeparturePort'
    | 'cbagenttoolsBookingLink'
    | 'odysseusRetailBookingLink'
    | 'communityChannelUrl'
    | 'merchandiseStoreUrl'
> = {
    id: 'retro-future-2026',
    name: 'Retro-Future Cruise 2026',
    status: 'GATHERING_INTEREST',
    description: 'A Y2K-flavoured group sailing.',
    matchedShipName: 'Carnival Celebration',
    matchedSailDate: '2026-09-12',
    matchedDeparturePort: 'PCV',
    cbagenttoolsBookingLink: 'https://bookings.cbagenttools.com/group/abc',
    odysseusRetailBookingLink: 'https://odysseus.example/retail/abc',
    communityChannelUrl: 'https://discord.gg/example',
    merchandiseStoreUrl: 'https://leisurelife.printful/store/abc',
};

const baseLead: Pick<
    CampaignWaitlistEntry,
    'email' | 'firstName' | 'lastName' | 'phoneNumber' | 'bookingMode' | 'passengerCount' | 'preferredCabinType' | 'createdAt'
> = {
    email: 'lead@example.com',
    firstName: 'Avery',
    lastName: 'Quinn',
    phoneNumber: '+15555550100',
    bookingMode: 'GROUP_WAIT',
    passengerCount: 2,
    preferredCabinType: 'Balcony',
    createdAt: '2026-05-01T12:00:00.000Z',
};

test('buildKlaviyoProfile copies identity, lead, and CTA fields with stable snake_case keys', () => {
    const profile = buildKlaviyoProfile({
        campaign: baseCampaign,
        lead: baseLead,
        landing: { heroImage: { url: 'https://cdn.example/hero.png', alt: 'Hero' }, stateLabel: 'Now Forming' },
    });

    assert.equal(profile.email, 'lead@example.com');
    assert.equal(profile.firstName, 'Avery');
    assert.equal(profile.campaign_slug, 'retro-future-2026');
    assert.equal(profile.campaign_name, 'Retro-Future Cruise 2026');
    assert.equal(profile.campaign_status, 'GATHERING_INTEREST');
    assert.equal(profile.campaign_stage_label, 'Now Forming');
    assert.equal(profile.first_name, 'Avery');
    assert.equal(profile.booking_mode, 'GROUP_WAIT');
    assert.equal(profile.passenger_count, 2);
    assert.equal(profile.preferred_cabin_type, 'Balcony');
    assert.equal(profile.hero_image_url, 'https://cdn.example/hero.png');
    assert.equal(profile.booking_link_url, 'https://bookings.cbagenttools.com/group/abc');
    assert.equal(profile.community_channel_url, 'https://discord.gg/example');
    assert.equal(profile.merchandise_store_url, 'https://leisurelife.printful/store/abc');
    assert.equal(profile.ship_name, 'Carnival Celebration');
    assert.equal(profile.sail_date, '2026-09-12');
    assert.equal(profile.departure_port, 'PCV');
    assert.match(String(profile.landing_page_url), /\/groups\/retro-future-2026$/);
});

test('buildKlaviyoProfile omits undefined fields rather than sending nulls', () => {
    const profile = buildKlaviyoProfile({
        campaign: { ...baseCampaign, matchedShipName: undefined, matchedSailDate: undefined, matchedDeparturePort: undefined, communityChannelUrl: undefined, merchandiseStoreUrl: undefined },
        lead: baseLead,
        landing: null,
    });

    assert.equal(profile.ship_name, undefined);
    assert.equal(profile.sail_date, undefined);
    assert.equal(profile.departure_port, undefined);
    assert.equal(profile.community_channel_url, undefined);
    assert.equal(profile.merchandise_store_url, undefined);
    // Should fall back to status label map when landing model not provided.
    assert.equal(profile.campaign_stage_label, 'Now Forming');
});

test('buildKlaviyoProfile falls back to Odysseus retail link when CB link is missing', () => {
    const profile = buildKlaviyoProfile({
        campaign: { ...baseCampaign, cbagenttoolsBookingLink: undefined },
        lead: baseLead,
        landing: null,
    });
    assert.equal(profile.booking_link_url, 'https://odysseus.example/retail/abc');
});

test('buildKlaviyoEvent selects the correct metric name + visual mode per stage', () => {
    const summary = { totalEntries: 5, totalPassengers: 10, convertedEntries: 0 };
    const args = {
        campaign: baseCampaign,
        lead: baseLead,
        summary,
        requiredCabins: 8,
        percentOfThreshold: 63,
    } as const;

    const wc = buildKlaviyoEvent({ stage: 'waitlist_confirmation', ...args });
    assert.equal(wc.metricName, 'LLL Waitlist Confirmation');
    assert.equal(wc.properties.visual_mode, 'cinematic_invite');

    const d3 = buildKlaviyoEvent({ stage: 'nurture_day3', ...args });
    assert.equal(d3.metricName, 'LLL Nurture Day 3');
    assert.equal(d3.properties.visual_mode, 'field_note');

    const d7 = buildKlaviyoEvent({ stage: 'nurture_day7', ...args });
    assert.equal(d7.metricName, 'LLL Nurture Day 7');
    assert.equal(d7.properties.visual_mode, 'status_briefing');
});

test('buildKlaviyoEvent includes threshold snapshot for Day 7 momentum copy', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'nurture_day7',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 5, totalPassengers: 10, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 63,
    });

    assert.equal(properties.threshold_required_cabins, 8);
    assert.equal(properties.threshold_joined_entries, 5);
    assert.equal(properties.threshold_remaining_cabins, 3);
    assert.equal(properties.threshold_percent, 63);
});

test('buildKlaviyoEvent clamps remaining cabins to 0 when already over threshold', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'waitlist_confirmation',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 12, totalPassengers: 24, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });
    assert.equal(properties.threshold_remaining_cabins, 0);
});

// ─── Phase 2 stages ────────────────────────────────────────────────────────

test('threshold_met emits the safe-claim copy phrase and the celebration visual mode', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'threshold_met',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 8, totalPassengers: 16, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });

    assert.equal(metricName, 'LLL Threshold Met');
    assert.equal(properties.visual_mode, 'celebration');
    assert.equal(
        properties.threshold_met_claim,
        'The internal demand threshold has been reached for this campaign.',
    );
});

test('manifest_requested includes deadline + manifest_url + manifest_status', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'manifest_requested',
        campaign: baseCampaign,
        lead: { ...baseLead, manifestStatus: 'PENDING' },
        summary: { totalEntries: 8, totalPassengers: 16, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase2: {
            manifestDeadline: '2026-06-15',
            manifestUrl: 'https://www.example.com/groups/retro-future-2026/manifest',
        },
    });

    assert.equal(metricName, 'LLL Manifest Requested');
    assert.equal(properties.manifest_deadline, '2026-06-15');
    assert.equal(properties.manifest_url, 'https://www.example.com/groups/retro-future-2026/manifest');
    assert.equal(properties.manifest_status, 'PENDING');
});

test('manifest_reminder still emits manifest_status even when SUBMITTED (template branches on it)', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'manifest_reminder',
        campaign: baseCampaign,
        lead: { ...baseLead, manifestStatus: 'SUBMITTED' },
        summary: { totalEntries: 8, totalPassengers: 16, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase2: { manifestDeadline: '2026-06-15' },
    });

    assert.equal(properties.manifest_status, 'SUBMITTED');
    assert.equal(properties.manifest_deadline, '2026-06-15');
});

test('booking_link_ready surfaces the campaign booking link (CB preferred)', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'booking_link_ready',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 8, totalPassengers: 16, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });

    assert.equal(metricName, 'LLL Booking Link Ready');
    assert.equal(properties.booking_link_url, 'https://bookings.cbagenttools.com/group/abc');
    assert.equal(properties.visual_mode, 'status_briefing');
});

test('campaign_expired includes adjacent_campaigns_url and operator_note when supplied', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'campaign_expired',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 3, totalPassengers: 6, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 38,
        phase2: {
            adjacentCampaignsUrl: 'https://www.example.com/groups',
            operatorNote: 'Closing due to deposit-deadline pressure; similar trips below.',
        },
    });

    assert.equal(metricName, 'LLL Campaign Expired');
    assert.equal(properties.adjacent_campaigns_url, 'https://www.example.com/groups');
    assert.equal(properties.operator_note, 'Closing due to deposit-deadline pressure; similar trips below.');
});

test('phase2 keys are NOT emitted on stages that do not need them', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'waitlist_confirmation',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 1, totalPassengers: 2, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 13,
        phase2: { manifestDeadline: '2026-06-15', adjacentCampaignsUrl: 'https://x.example' },
    });

    // Phase 1 stage should not leak phase 2 properties into the event payload.
    assert.equal(properties.manifest_deadline, undefined);
    assert.equal(properties.adjacent_campaigns_url, undefined);
    assert.equal(properties.threshold_met_claim, undefined);
});

// ─── Phase 3 stages ────────────────────────────────────────────────────────

test('booking_confirmed surfaces booking_reference + booking_confirmed_at on the event', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'booking_confirmed',
        campaign: baseCampaign,
        lead: {
            ...baseLead,
            bookingReference: 'CB-AT-987654',
            bookingConfirmedAt: '2026-05-15T12:00:00.000Z',
        },
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 1 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });

    assert.equal(metricName, 'LLL Booking Confirmed');
    assert.equal(properties.visual_mode, 'cinematic_invite');
    assert.equal(properties.booking_reference, 'CB-AT-987654');
    assert.equal(properties.booking_confirmed_at, '2026-05-15T12:00:00.000Z');
});

test('travel_prep carries days_to_sail + scheduled_offset for the scheduler', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'travel_prep',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 1 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase3: { daysToSail: 60, scheduledOffset: 60 },
    });

    assert.equal(metricName, 'LLL Travel Prep');
    assert.equal(properties.days_to_sail, 60);
    assert.equal(properties.scheduled_offset, 60);
});

test('final_countdown surfaces the optional packing_list_url when set', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'final_countdown',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 1 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase3: { daysToSail: 14, scheduledOffset: 14, packingListUrl: 'https://example.com/pack' },
    });

    assert.equal(properties.scheduled_offset, 14);
    assert.equal(properties.packing_list_url, 'https://example.com/pack');
});

test('final_itinerary_published pulls final_itinerary_url from the campaign record', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'final_itinerary_published',
        campaign: { ...baseCampaign, finalItineraryUrl: 'https://example.com/itinerary.pdf' },
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 1 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });

    assert.equal(metricName, 'LLL Final Itinerary Published');
    assert.equal(properties.visual_mode, 'celebration');
    assert.equal(properties.final_itinerary_url, 'https://example.com/itinerary.pdf');
});

test('tour_conductor_announced surfaces TC name + bio', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'tour_conductor_announced',
        campaign: { ...baseCampaign, tourConductorName: 'Maya Reyes', tourConductorBio: '10-year cruise host.' },
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 1 },
        requiredCabins: 8,
        percentOfThreshold: 100,
    });

    assert.equal(metricName, 'LLL Tour Conductor Announced');
    assert.equal(properties.tour_conductor_name, 'Maya Reyes');
    assert.equal(properties.tour_conductor_bio, '10-year cruise host.');
});

test('phase3 keys are NOT emitted on stages that do not need them', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'waitlist_confirmation',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 1, totalPassengers: 2, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 13,
        phase3: { daysToSail: 30, scheduledOffset: 30, packingListUrl: 'https://example.com/pack' },
    });

    assert.equal(properties.days_to_sail, undefined);
    assert.equal(properties.scheduled_offset, undefined);
    assert.equal(properties.packing_list_url, undefined);
    assert.equal(properties.tour_conductor_name, undefined);
});

// ─── Phase 4 — booking_change ───────────────────────────────────────────────

test('booking_change emits the canonical metric + status_briefing visual mode', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'booking_change',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 2 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase4: {
            changeId: 'change-abc',
            severity: 'high',
            changeType: 'date_change',
            previousValue: 'Sept 12',
            newValue: 'Oct 3',
            summary: 'Sail moved by 3 weeks.',
            actionRequired: false,
        },
    });

    assert.equal(metricName, 'LLL Booking Change');
    assert.equal(properties.visual_mode, 'status_briefing');
    assert.equal(properties.change_id, 'change-abc');
    assert.equal(properties.severity, 'high');
    assert.equal(properties.change_type, 'date_change');
    assert.equal(properties.previous_value, 'Sept 12');
    assert.equal(properties.new_value, 'Oct 3');
    assert.equal(properties.change_summary, 'Sail moved by 3 weeks.');
    assert.equal(properties.action_required, false);
});

test('booking_change suppresses support_contact for non-critical severity', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'booking_change',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 2 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase4: {
            severity: 'medium',
            changeType: 'price_change',
            previousValue: '$2,300',
            newValue: '$2,450',
            summary: 'Price adjusted.',
            actionRequired: false,
            supportContact: 'support@example.com', // should be DROPPED for medium severity
        },
    });

    assert.equal(properties.severity, 'medium');
    assert.equal(properties.support_contact, undefined);
});

test('booking_change includes support_contact only for critical severity', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'booking_change',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 2 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase4: {
            severity: 'critical',
            changeType: 'cancellation',
            previousValue: 'Active sailing',
            newValue: 'Cancelled by cruise line',
            summary: 'The sailing has been cancelled.',
            actionRequired: true,
            actionDeadline: '2026-08-01',
            supportContact: 'support@leisurelifeinteractive.com',
        },
    });

    assert.equal(properties.severity, 'critical');
    assert.equal(properties.support_contact, 'support@leisurelifeinteractive.com');
    assert.equal(properties.action_required, true);
    assert.equal(properties.action_deadline, '2026-08-01');
});

test('phase4 keys are NOT emitted on stages other than booking_change', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'waitlist_confirmation',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 1, totalPassengers: 2, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 13,
        phase4: {
            severity: 'critical',
            changeType: 'cancellation',
            previousValue: 'x',
            newValue: 'y',
            summary: 'z',
            actionRequired: true,
            supportContact: 'support@example.com',
        },
    });

    assert.equal(properties.severity, undefined);
    assert.equal(properties.change_type, undefined);
    assert.equal(properties.previous_value, undefined);
    assert.equal(properties.new_value, undefined);
    assert.equal(properties.support_contact, undefined);
});

// ─── Phase 5 — post-cruise + alumni ────────────────────────────────────────

test('post_cruise_welcome_home emits days_since_disembark + photo_share_url + afterglow visual', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'post_cruise_welcome_home',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 9 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase5: {
            daysSinceDisembark: 1,
            scheduledOffset: 1,
            photoShareUrl: 'https://example.com/share-photos',
        },
    });

    assert.equal(metricName, 'LLL Post Cruise Welcome Home');
    assert.equal(properties.visual_mode, 'afterglow');
    assert.equal(properties.days_since_disembark, 1);
    assert.equal(properties.scheduled_offset, 1);
    assert.equal(properties.photo_share_url, 'https://example.com/share-photos');
});

test('post_cruise_survey emits survey_url + scheduled_offset', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'post_cruise_survey',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 9 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase5: {
            daysSinceDisembark: 3,
            scheduledOffset: 3,
            surveyUrl: 'https://example.com/survey',
        },
    });

    assert.equal(metricName, 'LLL Post Cruise Survey');
    assert.equal(properties.survey_url, 'https://example.com/survey');
    assert.equal(properties.scheduled_offset, 3);
});

test('alumni_rebooking_invite carries target_* properties', () => {
    const { metricName, properties } = buildKlaviyoEvent({
        stage: 'alumni_rebooking_invite',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 9, totalPassengers: 18, convertedEntries: 9 },
        requiredCabins: 8,
        percentOfThreshold: 100,
        phase5: {
            targetCampaignSlug: 'cat-lovers-2027',
            targetCampaignName: 'Cat Lovers Cruise 2027',
            targetLandingUrl: 'https://example.com/groups/cat-lovers-2027',
            targetSailDate: '2027-04-15',
            targetPitch: 'Same crowd, new theme.',
            alumniWindow: 'Alumni-only for the first 48 hours.',
        },
    });

    assert.equal(metricName, 'LLL Alumni Rebooking Invite');
    assert.equal(properties.visual_mode, 'cinematic_invite');
    assert.equal(properties.target_campaign_slug, 'cat-lovers-2027');
    assert.equal(properties.target_campaign_name, 'Cat Lovers Cruise 2027');
    assert.equal(properties.target_landing_url, 'https://example.com/groups/cat-lovers-2027');
    assert.equal(properties.target_sail_date, '2027-04-15');
    assert.equal(properties.target_pitch, 'Same crowd, new theme.');
    assert.equal(properties.alumni_window, 'Alumni-only for the first 48 hours.');
});

test('phase5 keys are NOT emitted on stages other than Phase 5', () => {
    const { properties } = buildKlaviyoEvent({
        stage: 'waitlist_confirmation',
        campaign: baseCampaign,
        lead: baseLead,
        summary: { totalEntries: 1, totalPassengers: 2, convertedEntries: 0 },
        requiredCabins: 8,
        percentOfThreshold: 13,
        phase5: {
            daysSinceDisembark: 5,
            scheduledOffset: 3,
            surveyUrl: 'https://example.com/survey',
            targetCampaignSlug: 'something-else',
        },
    });

    assert.equal(properties.days_since_disembark, undefined);
    assert.equal(properties.survey_url, undefined);
    assert.equal(properties.target_campaign_slug, undefined);
});

if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed.\n`);
    process.exit(1);
} else {
    console.log(`\n${passed} passed.\n`);
}
