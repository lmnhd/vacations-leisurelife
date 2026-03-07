import { BaseVideoProvider } from './base-provider';

export class FalVideoProvider extends BaseVideoProvider {
    public readonly providerId = 'fal';
    public readonly generatorService = 'runwayml' as const;

    public async generateImageToVideo(
        sourceImageUrl: string,
        motionPrompt: string,
        durationSeconds: number,
    ): Promise<{ videoUrl: string; durationSeconds: number; taskId?: string }> {
        void sourceImageUrl;
        void motionPrompt;
        void durationSeconds;
        throw new Error('fal video provider not implemented yet');
    }
}
