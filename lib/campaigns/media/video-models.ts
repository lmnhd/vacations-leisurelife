import type { GeneratorService } from '@/lib/campaigns/schema';

export type VideoProviderId = 'runway' | 'fal';

export type VideoModelPresetId =
    | 'runway_gen3_turbo'
    | 'runway_gen45'
    | 'fal_kling_o3'
    | 'fal_veo31_fast';

export interface VideoModelPreset {
    id: VideoModelPresetId;
    label: string;
    shortLabel: string;
    providerId: VideoProviderId;
    generatorService: GeneratorService;
    description: string;
    compareSummary: string;
    supportedDurationsSeconds: readonly number[];
    defaultDurationSeconds: number;
    estimatedUsdPerSecond: number;
    estimatedCreditsPerSecond: number | null;
    runwayModel?: string;
    falEndpoint?: string;
    resolutionLabel: string;
}

export interface VideoModelPresetOption extends VideoModelPreset {
    available: boolean;
    availabilityReason: string | null;
}

export const VIDEO_MODEL_PREFERENCE_COOKIE = 'lli_video_model_preset';

export const VIDEO_MODEL_PRESETS: readonly VideoModelPreset[] = [
    {
        id: 'runway_gen3_turbo',
        label: 'Runway Gen-3 Turbo',
        shortLabel: 'Gen-3 Turbo',
        providerId: 'runway',
        generatorService: 'runwayml',
        description: 'Current baseline image-to-video path in the app. Cheapest Runway option, but weakest for anatomy and complex motion.',
        compareSummary: 'Baseline for cost and backward compatibility.',
        supportedDurationsSeconds: [5, 10],
        defaultDurationSeconds: 5,
        estimatedUsdPerSecond: 0.05,
        estimatedCreditsPerSecond: 5,
        runwayModel: 'gen3a_turbo',
        resolutionLabel: '1280x768',
    },
    {
        id: 'runway_gen45',
        label: 'Runway Gen-4.5',
        shortLabel: 'Gen-4.5',
        providerId: 'runway',
        generatorService: 'runwayml',
        description: 'Higher-fidelity Runway model with better realism and motion coherence than Gen-3, while staying in the same provider stack.',
        compareSummary: 'Lowest-friction Runway upgrade path.',
        supportedDurationsSeconds: [5, 10],
        defaultDurationSeconds: 5,
        estimatedUsdPerSecond: 0.12,
        estimatedCreditsPerSecond: 12,
        runwayModel: 'gen4.5',
        resolutionLabel: '1280x720+',
    },
    {
        id: 'fal_kling_o3',
        label: 'Fal / Kling O3',
        shortLabel: 'Kling O3',
        providerId: 'fal',
        generatorService: 'kling',
        description: 'Strong image-to-video candidate for cinematic motion and first-frame guidance through Fal.',
        compareSummary: 'Best near-term Fal option for controlled image-to-video tests.',
        supportedDurationsSeconds: [3, 4, 5, 6, 7, 8, 9, 10],
        defaultDurationSeconds: 5,
        estimatedUsdPerSecond: 0.084,
        estimatedCreditsPerSecond: null,
        falEndpoint: 'fal-ai/kling-video/o3/standard/image-to-video',
        resolutionLabel: 'model default',
    },
    {
        id: 'fal_veo31_fast',
        label: 'Fal / Veo 3.1 Fast',
        shortLabel: 'Veo 3.1 Fast',
        providerId: 'fal',
        generatorService: 'kling',
        description: 'Fast Veo image-to-video path with strong realism and physics, exposed through Fal.',
        compareSummary: 'Best current realism-oriented short-clip contender.',
        supportedDurationsSeconds: [4, 6, 8],
        defaultDurationSeconds: 4,
        estimatedUsdPerSecond: 0.10,
        estimatedCreditsPerSecond: null,
        falEndpoint: 'fal-ai/veo3.1/fast/image-to-video',
        resolutionLabel: '720p/1080p',
    },
] as const;

export function normalizeVideoModelPresetId(value?: string | null): VideoModelPresetId | undefined {
    if (!value) return undefined;
    const normalized = value.trim();
    return VIDEO_MODEL_PRESETS.find((preset) => preset.id === normalized)?.id;
}

export function getVideoModelPreset(id?: string | null): VideoModelPreset {
    const normalized = normalizeVideoModelPresetId(id);
    if (normalized) {
        return VIDEO_MODEL_PRESETS.find((preset) => preset.id === normalized) ?? VIDEO_MODEL_PRESETS[0];
    }

    return getDefaultVideoModelPreset();
}

export function getDefaultVideoModelPresetId(): VideoModelPresetId {
    const explicitPreset = normalizeVideoModelPresetId(process.env.MEDIA_VIDEO_MODEL_PRESET);
    if (explicitPreset) {
        return explicitPreset;
    }

    if (process.env.MEDIA_VIDEO_PROVIDER === 'runway') {
        return 'runway_gen3_turbo';
    }

    if (process.env.MEDIA_VIDEO_PROVIDER === 'fal' && process.env.FAL_KEY) {
        return 'fal_kling_o3';
    }

    if (process.env.FAL_KEY) {
        return 'fal_kling_o3';
    }

    return 'runway_gen3_turbo';
}

export function getDefaultVideoModelPreset(): VideoModelPreset {
    return getVideoModelPreset(getDefaultVideoModelPresetId());
}

export function getActiveVideoProvider(presetId?: string | null): VideoProviderId {
    return getVideoModelPreset(presetId).providerId;
}

export function getActiveVideoGeneratorService(presetId?: string | null): GeneratorService {
    return getVideoModelPreset(presetId).generatorService;
}

export function getActiveVideoProviderLabel(presetId?: string | null): string {
    return getVideoModelPreset(presetId).label;
}

export function getPreferredVideoDurationSeconds(presetId?: string | null, requestedDurationSeconds?: number): number {
    const preset = getVideoModelPreset(presetId);
    if (!requestedDurationSeconds) {
        return preset.defaultDurationSeconds;
    }

    if (preset.supportedDurationsSeconds.includes(requestedDurationSeconds)) {
        return requestedDurationSeconds;
    }

    return preset.supportedDurationsSeconds.reduce((closest, candidate) => {
        return Math.abs(candidate - requestedDurationSeconds) < Math.abs(closest - requestedDurationSeconds)
            ? candidate
            : closest;
    }, preset.supportedDurationsSeconds[0]);
}

export function getPreferredTestDurationSeconds(presetId?: string | null, requestedDurationSeconds?: number): number {
    return getPreferredVideoDurationSeconds(presetId, requestedDurationSeconds);
}

function getAvailability(preset: VideoModelPreset): { available: boolean; reason: string | null } {
    if (preset.providerId === 'runway') {
        return process.env.RUNWAYML_API_KEY
            ? { available: true, reason: null }
            : { available: false, reason: 'RUNWAYML_API_KEY not set' };
    }

    return process.env.FAL_KEY
        ? { available: true, reason: null }
        : { available: false, reason: 'FAL_KEY not set' };
}

export function listVideoModelPresetOptions(): VideoModelPresetOption[] {
    return VIDEO_MODEL_PRESETS.map((preset) => {
        const availability = getAvailability(preset);
        return {
            ...preset,
            available: availability.available,
            availabilityReason: availability.reason,
        };
    });
}
