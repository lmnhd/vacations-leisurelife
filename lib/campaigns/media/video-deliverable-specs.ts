// ────────────────────────────────────────────────────────────────────────────
// Video Deliverable Specifications — single source of truth
//
// Used by:
//   - aesthetic-engine.ts (Pass 3 Production Bible prompt)
//   - credit-check-service.ts (cost estimation)
// ────────────────────────────────────────────────────────────────────────────

export interface VideoDeliverableSpec {
    id: string;
    title: string;
    durationSeconds: number;
    shotCount: number;
}

export const VIDEO_DELIVERABLE_SPECS: readonly VideoDeliverableSpec[] = [
    { id: 'tiktok_seed',            title: 'TikTok Seed Video',          durationSeconds: 35, shotCount: 6 },
    { id: 'hero_explainer',         title: 'Hero Explainer Video',        durationSeconds: 60, shotCount: 6 },
    { id: 'threshold_announcement', title: 'Threshold Announcement',      durationSeconds: 30, shotCount: 4 },
    { id: 'countdown_1',            title: 'Planning Window Video 1',     durationSeconds: 15, shotCount: 3 },
] as const;
