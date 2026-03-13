import { getActiveVideoProvider, type VideoModelPresetId, type VideoProviderId } from '@/lib/campaigns/media/video-models';
import { BaseVideoProvider } from './base-provider';
import { FalVideoProvider } from './fal-provider';
import { RunwayVideoProvider } from './runway-provider';

const VIDEO_PROVIDERS: Record<VideoProviderId, BaseVideoProvider> = {
    runway: new RunwayVideoProvider(),
    fal: new FalVideoProvider(),
};

export function getVideoProvider(providerId?: VideoProviderId): BaseVideoProvider {
    const resolvedProviderId = providerId ?? getActiveVideoProvider();
    const provider = VIDEO_PROVIDERS[resolvedProviderId];

    if (!provider) {
        throw new Error(`Unknown video provider: ${resolvedProviderId}`);
    }

    return provider;
}

export function getActiveVideoProviderInstance(): BaseVideoProvider {
    return getVideoProvider();
}

export function getVideoProviderForPreset(presetId?: VideoModelPresetId): BaseVideoProvider {
    return getVideoProvider(getActiveVideoProvider(presetId));
}
