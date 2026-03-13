import { ELEVENLABS_CONFIG, RUNWAYML_CONFIG } from './media-pipeline-config';
import {
    getActiveVideoProvider,
    getActiveVideoProviderLabel,
    getVideoModelPreset,
    type VideoModelPresetId,
} from './video-models';
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
    /** Active video provider id */
    videoProviderId: string;
    /** Active video provider label */
    videoProviderLabel: string;
    /** Active video provider credits needed, when queryable */
    videoProviderCreditsRequired: number | null;
    /** Active video provider USD estimate */
    videoProviderUsd: number;
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
    /** Estimated ElevenLabs credits/characters required */
    elevenlabsCreditsRequired: number;
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
    videoProviderCredits: number | null;
    usd: number;
}

export interface CreditCheckResult {
    /** true = safe to proceed */
    canProceed: boolean;
    videoProviderId: string;
    videoProviderLabel: string;
    estimate: CreditEstimate;
    balances: ServiceBalance[];
    /** Human-readable summary for agents and UI */
    summary: string;
    /** Specific blocking reasons if canProceed is false */
    blockers: string[];
}

export interface ElevenLabsCreditInputs {
    ambientNarrationScript?: string;
    hypeClipScript?: string;
    storyboardNarrationScripts?: readonly string[];
}

function resolveDeliverableSpecs(storyboardDeliverableIds?: readonly string[]): readonly VideoDeliverableSpec[] {
    if (!storyboardDeliverableIds || storyboardDeliverableIds.length === 0) {
        return VIDEO_DELIVERABLE_SPECS;
    }

    const requestedIds = new Set(storyboardDeliverableIds);
    return VIDEO_DELIVERABLE_SPECS.filter((deliverable) => requestedIds.has(deliverable.id));
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

function getFalBalanceStatus(): ServiceBalance {
    const hasKey = !!process.env.FAL_KEY;
    return {
        service: 'Fal',
        available: null,
        unit: 'USD quota',
        fetchError: hasKey ? null : 'FAL_KEY not set',
        unverifiable: true,
    };
}

async function fetchElevenLabsBalance(): Promise<ServiceBalance> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        return {
            service: 'ElevenLabs',
            available: null,
            unit: 'credits',
            fetchError: 'ELEVENLABS_API_KEY not set',
            unverifiable: false,
        };
    }

    try {
        const res = await fetch(`${ELEVENLABS_CONFIG.apiBase}/user/subscription`, {
            headers: {
                'xi-api-key': apiKey,
            },
        });

        if (!res.ok) {
            const text = await res.text();
            return {
                service: 'ElevenLabs',
                available: null,
                unit: 'credits',
                fetchError: `HTTP ${res.status}: ${text.slice(0, 200)}`,
                unverifiable: false,
            };
        }

        const data = await res.json() as { character_limit?: number; character_count?: number };
        const limit = typeof data.character_limit === 'number' ? data.character_limit : null;
        const used = typeof data.character_count === 'number' ? data.character_count : null;

        return {
            service: 'ElevenLabs',
            available: limit !== null && used !== null ? Math.max(0, limit - used) : null,
            unit: 'credits',
            fetchError: limit !== null && used !== null ? null : 'Subscription response missing character counters',
            unverifiable: false,
        };
    } catch (err) {
        return {
            service: 'ElevenLabs',
            available: null,
            unit: 'credits',
            fetchError: err instanceof Error ? err.message : String(err),
            unverifiable: false,
        };
    }
}

export function calculateElevenLabsCreditsRequired(inputs: ElevenLabsCreditInputs): number {
    const storyboardScripts = inputs.storyboardNarrationScripts ?? [];

    const totalCharacters = [
        inputs.ambientNarrationScript?.slice(0, ELEVENLABS_CONFIG.narrationMaxChars).length ?? 0,
        inputs.hypeClipScript?.slice(0, ELEVENLABS_CONFIG.hypeMaxChars).length ?? 0,
        ...storyboardScripts.map((script) => script.slice(0, ELEVENLABS_CONFIG.narrationMaxChars).length),
    ].reduce((sum, value) => sum + value, 0);

    return totalCharacters;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost estimator — uses VIDEO_DELIVERABLE_SPECS as single source of truth
// ────────────────────────────────────────────────────────────────────────────

export function estimateCampaignCost(
    sceneCount: number = 10,
    storyboardDeliverableIds?: readonly string[],
    elevenlabsCreditsRequired?: number,
    videoModelPresetId?: VideoModelPresetId,
): CreditEstimate {
    const preset = getVideoModelPreset(videoModelPresetId);
    const activeVideoProvider = getActiveVideoProvider(videoModelPresetId);
    const activeVideoProviderLabel = getActiveVideoProviderLabel(videoModelPresetId);
    const clipDuration = RUNWAYML_CONFIG.clipDurationSeconds;
    const scopedDeliverables = resolveDeliverableSpecs(storyboardDeliverableIds);

    const deliverables: DeliverableEstimate[] = scopedDeliverables.map(d => {
        const runwayCredits = d.shotCount * clipDuration * CREDIT_COSTS.runway.creditsPerSecond;
        const providerUsd = d.shotCount * clipDuration * preset.estimatedUsdPerSecond;
        return {
            id: d.id,
            title: d.title,
            shotCount: d.shotCount,
            clipDurationSeconds: clipDuration,
            runwayCredits,
            videoProviderCredits: activeVideoProvider === 'runway' ? runwayCredits : null,
            usd: activeVideoProvider === 'runway'
                ? runwayCredits * CREDIT_COSTS.runway.usdPerCredit
                : providerUsd,
        };
    });

    const runwayClipCount = deliverables.reduce((sum, d) => sum + d.shotCount, 0);
    const runwayTotalSeconds = runwayClipCount * clipDuration;
    const runwayCreditsRequired = runwayClipCount * clipDuration * CREDIT_COSTS.runway.creditsPerSecond;
    const runwayUsd = runwayCreditsRequired * CREDIT_COSTS.runway.usdPerCredit;
    const nonRunwayUsd = runwayTotalSeconds * preset.estimatedUsdPerSecond;
    const videoProviderCreditsRequired = activeVideoProvider === 'runway' ? runwayCreditsRequired : null;
    const videoProviderUsd = activeVideoProvider === 'runway' ? runwayUsd : nonRunwayUsd;

    const geminiUsd =
        sceneCount * CREDIT_COSTS.gemini.usdPerSceneImage +
        5 * CREDIT_COSTS.gemini.usdPerHeroImage;

    const derivedElevenLabsCredits = elevenlabsCreditsRequired
        ?? scopedDeliverables.length * CREDIT_COSTS.elevenlabs.avgCharsPerTrack;
    const elevenlabsUsd =
        (derivedElevenLabsCredits / 1000) *
        CREDIT_COSTS.elevenlabs.usdPer1kChars;

    const totalUsd = videoProviderUsd + geminiUsd + elevenlabsUsd;

    return {
        videoProviderId: activeVideoProvider,
        videoProviderLabel: activeVideoProviderLabel,
        videoProviderCreditsRequired,
        videoProviderUsd,
        runwayCreditsRequired,
        runwayClipCount,
        runwayTotalSeconds,
        runwayUsd,
        geminiUsd,
        elevenlabsUsd,
        elevenlabsCreditsRequired: derivedElevenLabsCredits,
        totalUsd,
        deliverables,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Main pre-check — call this before starting video generation
// ────────────────────────────────────────────────────────────────────────────

export async function checkMediaCredits(
    sceneCount: number = 10,
    storyboardDeliverableIds?: readonly string[],
    elevenlabsCreditsRequired?: number,
    videoModelPresetId?: VideoModelPresetId,
): Promise<CreditCheckResult> {
    const activeVideoProvider = getActiveVideoProvider(videoModelPresetId);
    const activeVideoProviderLabel = getActiveVideoProviderLabel(videoModelPresetId);
    const estimate = estimateCampaignCost(sceneCount, storyboardDeliverableIds, elevenlabsCreditsRequired, videoModelPresetId);

    const [videoProviderBalance, geminiBalance, elevenlabsBalance] = await Promise.all([
        activeVideoProvider === 'runway' ? fetchRunwayBalance() : Promise.resolve(getFalBalanceStatus()),
        Promise.resolve(getGeminiBalanceStatus()),
        fetchElevenLabsBalance(),
    ]);

    const balances: ServiceBalance[] = [videoProviderBalance, geminiBalance, elevenlabsBalance];
    const blockers: string[] = [];

    if (activeVideoProvider === 'runway') {
        if (videoProviderBalance.fetchError && !videoProviderBalance.unverifiable) {
            blockers.push(`RunwayML balance check failed: ${videoProviderBalance.fetchError}`);
        } else if (videoProviderBalance.available !== null) {
            const deficit = estimate.runwayCreditsRequired - videoProviderBalance.available;
            if (deficit > 0) {
                blockers.push(
                    `Insufficient RunwayML credits. ` +
                    `Required: ${estimate.runwayCreditsRequired.toLocaleString()} credits ($${estimate.runwayUsd.toFixed(2)}). ` +
                    `Available: ${videoProviderBalance.available.toLocaleString()} credits. ` +
                    `Shortfall: ${deficit.toLocaleString()} credits ($${(deficit * CREDIT_COSTS.runway.usdPerCredit).toFixed(2)}).`
                );
            }
        }

        if (videoProviderBalance.fetchError && videoProviderBalance.fetchError.includes('not set')) {
            blockers.push('RUNWAYML_API_KEY environment variable is not configured.');
        }
    } else if (videoProviderBalance.fetchError && videoProviderBalance.fetchError.includes('not set')) {
        blockers.push('FAL_KEY environment variable is not configured.');
    }

    // ── ElevenLabs hard-block check ───────────────────────────────────────
    if (elevenlabsBalance.fetchError && !elevenlabsBalance.unverifiable) {
        blockers.push(`ElevenLabs balance check failed: ${elevenlabsBalance.fetchError}`);
    } else if (elevenlabsBalance.available !== null) {
        const deficit = estimate.elevenlabsCreditsRequired - elevenlabsBalance.available;
        if (deficit > 0) {
            blockers.push(
                `Insufficient ElevenLabs credits. ` +
                `Required: ${estimate.elevenlabsCreditsRequired.toLocaleString()} credits. ` +
                `Available: ${elevenlabsBalance.available.toLocaleString()} credits. ` +
                `Shortfall: ${deficit.toLocaleString()} credits.`
            );
        }
    }

    if (elevenlabsBalance.fetchError && elevenlabsBalance.fetchError.includes('not set')) {
        blockers.push('ELEVENLABS_API_KEY environment variable is not configured.');
    }

    const canProceed = blockers.length === 0;

    const summary = buildSummary(estimate, balances, canProceed, blockers);

    return {
        canProceed,
        videoProviderId: activeVideoProvider,
        videoProviderLabel: activeVideoProviderLabel,
        estimate,
        balances,
        summary,
        blockers,
    };
}

function buildSummary(
    estimate: CreditEstimate,
    balances: ServiceBalance[],
    canProceed: boolean,
    blockers: string[]
): string {
    const videoProviderLine = estimate.videoProviderId === 'runway'
        ? (() => {
            const runway = balances.find(b => b.service === 'RunwayML');
            return runway?.available != null
                ? `RunwayML: ${runway.available.toLocaleString()} credits available`
                : `RunwayML: balance unavailable (${runway?.fetchError ?? 'unknown error'})`;
        })()
        : (() => {
            const fal = balances.find(b => b.service === 'Fal');
            return fal?.fetchError
                ? `Fal: balance unavailable (${fal.fetchError})`
                : `Fal: balance not queryable via API; using estimated cost only`;
        })();
    const elevenlabs = balances.find(b => b.service === 'ElevenLabs');
    const elevenlabsLine = elevenlabs?.available != null
        ? `ElevenLabs: ${elevenlabs.available.toLocaleString()} credits available`
        : `ElevenLabs: balance unavailable (${elevenlabs?.fetchError ?? 'unknown error'})`;

    const lines = [
        `=== Campaign Media Cost Estimate ===`,
        ``,
        `${estimate.videoProviderLabel} video generation:`,
        ...estimate.deliverables.map(d =>
            estimate.videoProviderCreditsRequired !== null
                ? `  ${d.title}: ${d.shotCount} shots × ${d.clipDurationSeconds}s = ${(d.videoProviderCredits ?? 0).toLocaleString()} credits ($${d.usd.toFixed(2)})`
                : `  ${d.title}: ${d.shotCount} shots × ${d.clipDurationSeconds}s = $${d.usd.toFixed(2)}`
        ),
        estimate.videoProviderCreditsRequired !== null
            ? `  TOTAL: ${estimate.videoProviderCreditsRequired.toLocaleString()} credits ($${estimate.videoProviderUsd.toFixed(2)})`
            : `  TOTAL: $${estimate.videoProviderUsd.toFixed(2)}`,
        ``,
        `Gemini image generation (est.): $${estimate.geminiUsd.toFixed(2)}`,
        `ElevenLabs narration (est.): ${estimate.elevenlabsCreditsRequired.toLocaleString()} credits ($${estimate.elevenlabsUsd.toFixed(2)})`,
        ``,
        `TOTAL ESTIMATED COST: ~$${estimate.totalUsd.toFixed(2)}`,
        ``,
        `=== Balance Check ===`,
        videoProviderLine,
        elevenlabsLine,
        `Gemini: quota not queryable via API — estimated cost $${estimate.geminiUsd.toFixed(2)}`,
        ``,
        canProceed
            ? `✓ READY TO PROCEED`
            : `✗ BLOCKED — ${blockers.length} issue(s):\n` + blockers.map(b => `  - ${b}`).join('\n'),
    ];

    return lines.join('\n');
}
