import type { GeneratorService } from '@/lib/campaigns/schema';
import type { VideoModelPresetId } from '@/lib/campaigns/media/video-models';

export interface VideoGenerationOptions {
    presetId?: VideoModelPresetId;
}

export abstract class BaseVideoProvider {
    public abstract readonly providerId: string;
    public abstract readonly generatorService: GeneratorService;

    public abstract generateImageToVideo(
        sourceImageUrl: string,
        motionPrompt: string,
        durationSeconds: number,
        options?: VideoGenerationOptions,
    ): Promise<{ videoUrl: string; durationSeconds: number; taskId?: string }>;
}
