import { RUNWAYML_CONFIG } from './media-pipeline-config';
import { VIDEO_DELIVERABLE_SPECS, VideoDeliverableSpec } from './video-deliverable-specs';

// ────────────────────────────────────────────────────────────────────────────
// Campaign Media Credit Pre-Check Service
//
// Queries live provider balances and compares against estimated campaign cost.
// Used by:
//   - The media orchestrator (blocks generation if insufficient)
//   - The /api/groups/campaign/[slug]/media/credit-check route (agent use)
//   - The /tests/production-bible page (cost estimate display)
//
// RunwayML:  Live balance via GET /v1/organization → creditBalance
// Gemini:    No balance API — flagged as "unverifiable" with fixed cost estimate
// ────────────────────────────────────────────────────────────────────────────

export const CREDIT_COSTS = {
    runway: {
        /** Credits per second of generated video. gen3a_turbo rate. */
        creditsPerSecond: 5,
        /** USD per credit */
        usdPerCredit: 0.01,
    },
    gemini: {
        /** Approximate USD per Gemini Flash image generation (2K output) */
        usdPerSceneImage: 0.04,
        /** Approximate USD per hero/concept image */
        usdPerHeroImage: 0.04,
    },
    elevenlabs: {
        /** Approximate USD per 1,000 characters of TTS */
        usdPer1kChars: 0.18,
        /** Average characters per narration track */
        avgCharsPerTrack: 900,
    },
} as const;

export interface ServiceBalance {
    service: string;
    available: number | null;
    unit: string;
    /** null means balance could not be retrieved */
    fetchError: string | null;
    /** true if the API does not expose a balance endpoint */
    unverifiable: boolean;
}

export interface CreditEstimate {
    /** Total RunwayML credits needed */
    runwayCreditsRequired: number;
    /** Total RunwayML clips that will be generated */
    runwayClipCount: number;
    /** Total seconds of Runway video */
    runwayTotalSeconds: number;
    /** USD equivalent for Runway */
    runwayUsd: number;
    /** Estimated USD for Gemini image generation */
    geminiUsd: number;
    /** Estimated USD for ElevenLabs narration */
    elevenlabsUsd: number;
    /** Total estimated USD across all services */
    totalUsd: number;
    /** Per-deliverable breakdown */
    deliverables: DeliverableEstimate[];
}

export interface DeliverableEstimate {
    id: string;
    title: string;
    shotCount: number;
    clipDurationSeconds: number;
    runwayCredits: number;
    usd: number;
}

export interface CreditCheckResult {
    /** true = safe to proceed */
    canProceed: boolean;
    estimate: CreditEstimate;
    balances: ServiceBalance[];
    /** Human-readable summary for agents and UI */
    summary: string;
    /** Specific blocking reasons if canProceed is false */
    blockers: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// RunwayML balance query
// ────────────────────────────────────────────────────────────────────────────

async function fetchRunwayBalance(): Promise<ServiceBalance> {
    const apiKey = process.env.RUNWAYML_API_KEY;
    if (!apiKey) {
        return {
            service: 'RunwayML',
            available: null,
            unit: 'credits',
            fetchError: 'RUNWAYML_API_KEY not set',
            unverifiable: false,
        };
    }

    try {
        const res = await fetch(`${RUNWAYML_CONFIG.apiBase}/organization`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'X-Runway-Version': RUNWAYML_CONFIG.apiVersion,
            },
        });

        if (!res.ok) {
            const text = await res.text();
            return {
                service: 'RunwayML',
                available: null,
                unit: 'credits',
                fetchError: `HTTP ${res.status}: ${text.slice(0, 200)}`,
                unverifiable: false,
            };
        }

        const data = await res.json() as { creditBalance: number };
        return {
            service: 'RunwayML',
            available: data.creditBalance,
            unit: 'credits',
            fetchError: null,
            unverifiable: false,
        };
    } catch (err) {
        return {
            service: 'RunwayML',
            available: null,
            unit: 'credits',
            fetchError: err instanceof Error ? err.message : String(err),
            unverifiable: false,
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Gemini balance — no public API, return unverifiable flag
// ────────────────────────────────────────────────────────────────────────────

function getGeminiBalanceStatus(): ServiceBalance {
    const hasKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !!process.env.GEMINI_API_KEY;
    return {
        service: 'Gemini (Nano-Banana)',
        available: null,
        unit: 'USD quota',
        fetchError: hasKey ? null : 'GOOGLE_GENERATIVE_AI_API_KEY not set',
        unverifiable: true,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Cost estimator — uses VIDEO_DELIVERABLE_SPECS as single source of truth
// ────────────────────────────────────────────────────────────────────────────

export function estimateCampaignCost(sceneCount: number = 10): CreditEstimate {
    const clipDuration = RUNWAYML_CONFIG.clipDurationSeconds;

    const deliverables: DeliverableEstimate[] = VIDEO_DELIVERABLE_SPECS.map(d => {
        const runwayCredits = d.shotCount * clipDuration * CREDIT_COSTS.runway.creditsPerSecond;
        return {
            id: d.id,
            title: d.title,
            shotCount: d.shotCount,
            clipDurationSeconds: clipDuration,
            runwayCredits,
            usd: runwayCredits * CREDIT_COSTS.runway.usdPerCredit,
        };
    });

    const runwayClipCount = deliverables.reduce((sum, d) => sum + d.shotCount, 0);
    const runwayTotalSeconds = runwayClipCount * clipDuration;
    const runwayCreditsRequired = runwayClipCount * clipDuration * CREDIT_COSTS.runway.creditsPerSecond;
    const runwayUsd = runwayCreditsRequired * CREDIT_COSTS.runway.usdPerCredit;

    const geminiUsd =
        sceneCount * CREDIT_COSTS.gemini.usdPerSceneImage +
        5 * CREDIT_COSTS.gemini.usdPerHeroImage;

    const narrationTracks = VIDEO_DELIVERABLE_SPECS.length;
    const elevenlabsUsd =
        narrationTracks *
        (CREDIT_COSTS.elevenlabs.avgCharsPerTrack / 1000) *
        CREDIT_COSTS.elevenlabs.usdPer1kChars;

    const totalUsd = runwayUsd + geminiUsd + elevenlabsUsd;

    return {
        runwayCreditsRequired,
        runwayClipCount,
        runwayTotalSeconds,
        runwayUsd,
        geminiUsd,
        elevenlabsUsd,
        totalUsd,
        deliverables,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Main pre-check — call this before starting video generation
// ────────────────────────────────────────────────────────────────────────────

export async function checkMediaCredits(sceneCount: number = 10): Promise<CreditCheckResult> {
    const estimate = estimateCampaignCost(sceneCount);

    const [runwayBalance, geminiBalance] = await Promise.all([
        fetchRunwayBalance(),
        Promise.resolve(getGeminiBalanceStatus()),
    ]);

    const balances: ServiceBalance[] = [runwayBalance, geminiBalance];
    const blockers: string[] = [];

    // ── RunwayML hard-block check ──────────────────────────────────────────
    if (runwayBalance.fetchError && !runwayBalance.unverifiable) {
        blockers.push(`RunwayML balance check failed: ${runwayBalance.fetchError}`);
    } else if (runwayBalance.available !== null) {
        const deficit = estimate.runwayCreditsRequired - runwayBalance.available;
        if (deficit > 0) {
            blockers.push(
                `Insufficient RunwayML credits. ` +
                `Required: ${estimate.runwayCreditsRequired.toLocaleString()} credits ($${estimate.runwayUsd.toFixed(2)}). ` +
                `Available: ${runwayBalance.available.toLocaleString()} credits. ` +
                `Shortfall: ${deficit.toLocaleString()} credits ($${(deficit * CREDIT_COSTS.runway.usdPerCredit).toFixed(2)}).`
            );
        }
    }

    // ── Gemini soft-warning (unverifiable) ────────────────────────────────
    if (runwayBalance.fetchError && runwayBalance.fetchError.includes('not set')) {
        blockers.push('RUNWAYML_API_KEY environment variable is not configured.');
    }

    const canProceed = blockers.length === 0;

    const summary = buildSummary(estimate, balances, canProceed, blockers);

    return { canProceed, estimate, balances, summary, blockers };
}

function buildSummary(
    estimate: CreditEstimate,
    balances: ServiceBalance[],
    canProceed: boolean,
    blockers: string[]
): string {
    const runway = balances.find(b => b.service === 'RunwayML');
    const runwayLine = runway?.available != null
        ? `RunwayML: ${runway.available.toLocaleString()} credits available`
        : `RunwayML: balance unavailable (${runway?.fetchError ?? 'unknown error'})`;

    const lines = [
        `=== Campaign Media Cost Estimate ===`,
        ``,
        `RunwayML video generation:`,
        ...estimate.deliverables.map(d =>
            `  ${d.title}: ${d.shotCount} shots × ${d.clipDurationSeconds}s = ${d.runwayCredits} credits ($${d.usd.toFixed(2)})`
        ),
        `  TOTAL: ${estimate.runwayCreditsRequired.toLocaleString()} credits ($${estimate.runwayUsd.toFixed(2)})`,
        ``,
        `Gemini image generation (est.): $${estimate.geminiUsd.toFixed(2)}`,
        `ElevenLabs narration (est.): $${estimate.elevenlabsUsd.toFixed(2)}`,
        ``,
        `TOTAL ESTIMATED COST: ~$${estimate.totalUsd.toFixed(2)}`,
        ``,
        `=== Balance Check ===`,
        runwayLine,
        `Gemini: quota not queryable via API — estimated cost $${estimate.geminiUsd.toFixed(2)}`,
        ``,
        canProceed
            ? `✓ READY TO PROCEED`
            : `✗ BLOCKED — ${blockers.length} issue(s):\n` + blockers.map(b => `  - ${b}`).join('\n'),
    ];

    return lines.join('\n');
}
