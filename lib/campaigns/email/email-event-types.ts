/**
 * Email event types
 *
 * Canonical names for every campaign lifecycle email. Phases 1–2 cover all
 * pre-booking events. Phases 3–5 (post-booking, change notifications,
 * post-cruise/alumni) will extend this union; see
 * `.github/DOCS/Implementation/GROUP_STRATEGY/POST_BOOKING_FLOW/KLAVIYO_EMAIL_FLOW_PLAN.md`.
 */

import type { LeadEventType } from '@/lib/campaigns/types';

export type EmailEventStage =
    // Phase 1 — pre-booking nurture
    | 'waitlist_confirmation'
    | 'nurture_day3'
    | 'nurture_day7'
    // Phase 2 — pre-booking state transitions
    | 'threshold_met'
    | 'manifest_requested'
    | 'manifest_reminder'
    | 'booking_link_ready'
    | 'campaign_expired'
    // Phase 3 — post-booking core
    | 'booking_confirmed'
    | 'travel_prep'
    | 'final_countdown'
    | 'final_itinerary_published'
    | 'tour_conductor_announced'
    // Phase 4 — change notifications
    | 'booking_change'
    // Phase 5 — post-cruise + alumni
    | 'post_cruise_welcome_home'
    | 'post_cruise_survey'
    | 'alumni_rebooking_invite';

/**
 * Severity branches for `booking_change` events. The app fires identical
 * Klaviyo metrics regardless of severity; the Klaviyo flow branches on the
 * `severity` event property. Severity also drives app-side side effects
 * (SMS fallback on critical, follow-up dashboard surfacing).
 */
export type BookingChangeSeverity =
    | 'critical'
    | 'high'
    | 'medium'
    | 'low'
    | 'positive';

export const BOOKING_CHANGE_SEVERITIES: readonly BookingChangeSeverity[] = [
    'critical',
    'high',
    'medium',
    'low',
    'positive',
] as const;

/** Phase 1 stages — the three nurture emails. */
export const PHASE_1_STAGES: readonly EmailEventStage[] = [
    'waitlist_confirmation',
    'nurture_day3',
    'nurture_day7',
] as const;

/** Phase 2 stages — pre-booking lifecycle state-transition emails. */
export const PHASE_2_STAGES: readonly EmailEventStage[] = [
    'threshold_met',
    'manifest_requested',
    'manifest_reminder',
    'booking_link_ready',
    'campaign_expired',
] as const;

/** Phase 3 stages — post-booking core. */
export const PHASE_3_STAGES: readonly EmailEventStage[] = [
    'booking_confirmed',
    'travel_prep',
    'final_countdown',
    'final_itinerary_published',
    'tour_conductor_announced',
] as const;

/** Phase 4 stages — change notifications. */
export const PHASE_4_STAGES: readonly EmailEventStage[] = [
    'booking_change',
] as const;

/** Phase 5 stages — post-cruise + alumni. */
export const PHASE_5_STAGES: readonly EmailEventStage[] = [
    'post_cruise_welcome_home',
    'post_cruise_survey',
    'alumni_rebooking_invite',
] as const;

/** All stages currently implemented (Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5). */
export const ALL_IMPLEMENTED_STAGES: readonly EmailEventStage[] = [
    ...PHASE_1_STAGES,
    ...PHASE_2_STAGES,
    ...PHASE_3_STAGES,
    ...PHASE_4_STAGES,
    ...PHASE_5_STAGES,
] as const;

/** Stable Klaviyo metric names. Editing these breaks the linked Klaviyo flows. */
export const KLAVIYO_METRIC_NAMES: Record<EmailEventStage, string> = {
    waitlist_confirmation: 'LLL Waitlist Confirmation',
    nurture_day3: 'LLL Nurture Day 3',
    nurture_day7: 'LLL Nurture Day 7',
    threshold_met: 'LLL Threshold Met',
    manifest_requested: 'LLL Manifest Requested',
    manifest_reminder: 'LLL Manifest Reminder',
    booking_link_ready: 'LLL Booking Link Ready',
    campaign_expired: 'LLL Campaign Expired',
    booking_confirmed: 'LLL Booking Confirmed',
    travel_prep: 'LLL Travel Prep',
    final_countdown: 'LLL Final Countdown',
    final_itinerary_published: 'LLL Final Itinerary Published',
    tour_conductor_announced: 'LLL Tour Conductor Announced',
    booking_change: 'LLL Booking Change',
    post_cruise_welcome_home: 'LLL Post Cruise Welcome Home',
    post_cruise_survey: 'LLL Post Cruise Survey',
    alumni_rebooking_invite: 'LLL Alumni Rebooking Invite',
};

/** Visual mode hint sent to Klaviyo so templates can branch on layout. */
export const STAGE_VISUAL_MODES: Record<EmailEventStage, string> = {
    waitlist_confirmation: 'cinematic_invite',
    nurture_day3: 'field_note',
    nurture_day7: 'status_briefing',
    threshold_met: 'celebration',
    manifest_requested: 'status_briefing',
    manifest_reminder: 'status_briefing',
    booking_link_ready: 'status_briefing',
    campaign_expired: 'field_note',
    booking_confirmed: 'cinematic_invite',
    travel_prep: 'field_note',
    final_countdown: 'field_note',
    final_itinerary_published: 'celebration',
    tour_conductor_announced: 'celebration',
    booking_change: 'status_briefing',
    post_cruise_welcome_home: 'afterglow',
    post_cruise_survey: 'afterglow',
    alumni_rebooking_invite: 'cinematic_invite',
};

/**
 * Map a stage to the canonical lead-event ledger type written on a successful
 * send. Stages that have a dedicated lifecycle event in the ledger use it so
 * downstream readers (e.g. conversion dashboards) can filter cleanly without
 * grepping notes/metadata. All other stages fall back to `nurture_sent`.
 */
export const STAGE_LEDGER_SUCCESS_TYPE: Record<EmailEventStage, LeadEventType> = {
    waitlist_confirmation: 'nurture_sent',
    nurture_day3: 'nurture_sent',
    nurture_day7: 'nurture_sent',
    threshold_met: 'threshold_met_notified',
    manifest_requested: 'nurture_sent',
    manifest_reminder: 'nurture_sent',
    booking_link_ready: 'booking_link_sent',
    campaign_expired: 'expired',
    booking_confirmed: 'nurture_sent',
    travel_prep: 'nurture_sent',
    final_countdown: 'nurture_sent',
    final_itinerary_published: 'nurture_sent',
    tour_conductor_announced: 'nurture_sent',
    // `booking_change` writes a dedicated `booking_change` ledger row so the
    // critical-follow-up dashboard can scan by event type rather than scraping
    // metadata for stage names.
    booking_change: 'booking_change',
    post_cruise_welcome_home: 'nurture_sent',
    post_cruise_survey: 'nurture_sent',
    alumni_rebooking_invite: 'nurture_sent',
};
