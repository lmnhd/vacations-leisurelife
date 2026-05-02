import type { Storyboard } from '../../schema';

// ────────────────────────────────────────────────────────────────────────────
// TikTok Video Quality Lint
//
// Scores a generated TikTok video against known quality criteria.
// Called immediately after generation; result stored in the AssetRecord
// so the media review UI can surface issues without re-running video generation.
//
// Scoring:
//   pass   ≥ 70   — publishable
//   warn   40–69  — needs review before publish
//   fail   < 40   — must be regenerated
// ────────────────────────────────────────────────────────────────────────────

export interface VideoLintResult {
    lintScore: number;
    lintStatus: 'pass' | 'warn' | 'fail';
    issues: string[];
}

export type TikTokVariant = 'organic' | 'paid';

interface ScoredAsset {
    tags: string[];
    durationSeconds?: number;
}

function deriveLintStatus(score: number): VideoLintResult['lintStatus'] {
    if (score >= 70) return 'pass';
    if (score >= 40) return 'warn';
    return 'fail';
}

export function scoreTikTokVideoReadiness(
    asset: ScoredAsset,
    storyboard: Storyboard,
    sceneImageMap: ReadonlyMap<string, string>,
    variant: TikTokVariant = 'organic',
): VideoLintResult {
    const issues: string[] = [];
    let score = 100;

    // Duration check — TikTok requires at least 10s; paid variants target 15–30s
    const minDuration = variant === 'paid' ? 15 : 10;
    const maxDuration = variant === 'paid' ? 60 : 60;
    if (!asset.durationSeconds || asset.durationSeconds < minDuration) {
        issues.push(`Video is too short for TikTok ${variant} format (${asset.durationSeconds ?? 0}s, minimum ${minDuration}s)`);
        score -= 30;
    } else if (asset.durationSeconds > maxDuration) {
        issues.push(`Video exceeds maximum TikTok ${variant} duration (${asset.durationSeconds}s, maximum ${maxDuration}s)`);
        score -= 15;
    }

    // Every storyboard shot must have a generated scene image
    const missingScenes = storyboard.shotSequence.filter((shot) => !sceneImageMap.has(shot.sceneId));
    if (missingScenes.length > 0) {
        const missingIds = missingScenes.map((s) => s.sceneId).join(', ');
        issues.push(`${missingScenes.length} shot(s) used a fallback frame — missing scene images: ${missingIds}`);
        score -= missingScenes.length * 15;
    }

    // TikTok may be text-first instead of narrated when the production instructions
    // intentionally keep the asset silent and rely on overlays/hard cuts.
    if (!asset.tags.includes('narrated') && !asset.tags.includes('text_first')) {
        issues.push('Video has no narration or text-first tag — ElevenLabs generation may have failed or been skipped');
        score -= 25;
    }

    // Storyboard duration alignment
    const shotDurationSum = storyboard.shotSequence.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    if (Math.abs(shotDurationSum - storyboard.totalDurationSeconds) > 2) {
        issues.push(`Storyboard shot durations (${shotDurationSum}s) diverge from totalDurationSeconds (${storyboard.totalDurationSeconds}s) by more than 2s`);
        score -= 10;
    }

    // Paid variants need lead-form CTA tag
    if (variant === 'paid' && !asset.tags.includes('paid')) {
        issues.push('Paid TikTok variant is missing the "paid" distribution tag');
        score -= 10;
    }

    const lintScore = Math.max(0, score);
    return {
        lintScore,
        lintStatus: deriveLintStatus(lintScore),
        issues,
    };
}

export function scoreLegacyTikTokSeed(
    asset: ScoredAsset,
    targetDurationSeconds: number,
): VideoLintResult {
    const issues: string[] = [];
    let score = 100;

    if (!asset.durationSeconds || asset.durationSeconds < 10) {
        issues.push(`Legacy TikTok seed is too short (${asset.durationSeconds ?? 0}s, minimum 10s)`);
        score -= 30;
    }

    if (!asset.tags.includes('narrated')) {
        issues.push('Legacy TikTok seed has no narration tag');
        score -= 25;
    }

    if (targetDurationSeconds > 0 && asset.durationSeconds) {
        const delta = Math.abs(asset.durationSeconds - targetDurationSeconds);
        if (delta > 5) {
            issues.push(`Legacy seed actual duration (${asset.durationSeconds}s) diverges from brief target (${targetDurationSeconds}s) by ${delta}s`);
            score -= 10;
        }
    }

    const lintScore = Math.max(0, score);
    return {
        lintScore,
        lintStatus: deriveLintStatus(lintScore),
        issues,
    };
}
