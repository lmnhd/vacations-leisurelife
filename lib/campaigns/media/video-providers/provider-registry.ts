import { getActiveVideoProvider } from '@/lib/campaigns/media/media-pipeline-config';
import { BaseVideoProvider } from './base-provider';
import { FalVideoProvider } from './fal-provider';
import { RunwayVideoProvider } from './runway-provider';

const VIDEO_PROVIDERS: Record<string, BaseVideoProvider> = {
    runway: new RunwayVideoProvider(),
    fal: new FalVideoProvider(),
};

export function getVideoProvider(providerId?: string): BaseVideoProvider {
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
