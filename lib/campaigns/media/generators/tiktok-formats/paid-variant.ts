import type { CampaignAestheticBrief } from '../../../schema';

// ────────────────────────────────────────────────────────────────────────────
// Paid TikTok Variant Format
//
// Separate from organic seed. Designed for lead-gen and paid promotion:
// shorter, punchier, CTA-forward, with a visual hook in the first 1-2s
// that earns the skip cost. Optimised for 15–30s duration.
//
// Shot structure:
//   Shot 1 — HOOK       (~5s)  Immediate value proposition; 1-second identity read
//   Shot 2 — PROOF      (~8s)  Campaign niche shown credibly in shipboard context
//   Shot 3 — CTA_CLOSE  (~7s)  Lead-gen frame; CTA text overlay safe; benefit clear
//
// Paid distribution tag: 'paid' — used by lint gate and distribution adapters
// to route to the paid lead-gen publishing path instead of organic.
// ────────────────────────────────────────────────────────────────────────────

export interface PaidVariantShotTemplate {
    shotRole: 'hook' | 'proof' | 'cta_close';
    defaultDurationSeconds: number;
    motionEnergy: string;
    cameraDirective: string;
}

export const PAID_VARIANT_SHOTS: readonly PaidVariantShotTemplate[] = [
    {
        shotRole: 'hook',
        defaultDurationSeconds: 5,
        motionEnergy: 'Immediate, decisive — the viewer decides to stop in 1s with one readable frame and one short text cue',
        cameraDirective: 'Tight still frame — ship, sea, and one clear campaign identity marker in the same frame; no ambiguity about what this cruise is',
    },
    {
        shotRole: 'proof',
        defaultDurationSeconds: 8,
        motionEnergy: 'Credible, lived-in — this is a real vacation, not a performance, with the niche cue readable at a glance',
        cameraDirective: 'Medium still shot of the campaign niche moment as a natural part of cruise life; ship architecture or open water visible; no staged demonstration energy',
    },
    {
        shotRole: 'cta_close',
        defaultDurationSeconds: 7,
        motionEnergy: 'Forward and inviting — momentum toward the action through text, layout, and a calm finish',
        cameraDirective: 'Clean composed finish; text overlay safe; ship-first framing; premium but approachable; no camera move required',
    },
];

export const PAID_VARIANT_TARGET_DURATION_SECONDS = PAID_VARIANT_SHOTS.reduce((sum, shot) => sum + shot.defaultDurationSeconds, 0);

export function buildPaidVariantShotPrompts(brief: CampaignAestheticBrief): string[] {
    const headline = brief.messaging.heroSlogan.trim();
    const cta = brief.socialConcepts.tiktokOrganic.callToAction.trim() || 'Sign up — link in bio';
    const { imageryMood, lightingStyle, colorPalette } = brief.visual;
    const { cruiseNativeMoments } = brief.visual.plausibilityFramework;

    return [
        // Shot 1 — HOOK
        [
            `${PAID_VARIANT_SHOTS[0].cameraDirective}`,
            `${PAID_VARIANT_SHOTS[0].motionEnergy}`,
            `Value proposition: ${headline}`,
            `Color: ${colorPalette.primary}; ${lightingStyle}`,
            `Niche marker (one clear cue): ${cruiseNativeMoments[0] ?? 'campaign niche visible but not dominant'}`,
            'No talking heads, no whiteboard, no product demo — pure visual story with text support',
        ].join('. '),

        // Shot 2 — PROOF
        [
            `${PAID_VARIANT_SHOTS[1].cameraDirective}`,
            `${PAID_VARIANT_SHOTS[1].motionEnergy}`,
            `Mood: ${imageryMood}`,
            `Warm ${colorPalette.secondary} with ${colorPalette.accent} accents`,
            'Campaign niche shown as a relaxed guest activity — secondary to the ship and sea',
            'Avoid staged props, workshop layout, demonstration energy, signage, or camera moves',
        ].join('. '),

        // Shot 3 — CTA CLOSE
        [
            `${PAID_VARIANT_SHOTS[2].cameraDirective}`,
            `${PAID_VARIANT_SHOTS[2].motionEnergy}`,
            `CTA: ${cta}`,
            `${lightingStyle}, open horizon, ${colorPalette.primary} anchor`,
            'Leave clear headroom and side margin for text overlay',
            'Avoid clutter, avoid dark frame, avoid motion that competes with overlay text or camera movement',
        ].join('. '),
    ];
}
