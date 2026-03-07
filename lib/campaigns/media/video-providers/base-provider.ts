import type { GeneratorService } from '@/lib/campaigns/schema';

export abstract class BaseVideoProvider {
    public abstract readonly providerId: string;
    public abstract readonly generatorService: GeneratorService;

    public abstract generateImageToVideo(
        sourceImageUrl: string,
        motionPrompt: string,
        durationSeconds: number,
    ): Promise<{ videoUrl: string; durationSeconds: number; taskId?: string }>;
}
