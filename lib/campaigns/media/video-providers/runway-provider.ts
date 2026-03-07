import { RUNWAYML_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';
import { BaseVideoProvider } from './base-provider';

class RunwayCreateResponse {
    public id = '';
}

class RunwayStatusResponse {
    public status = '';
    public output?: string[];
    public error?: string;
}

export class RunwayVideoProvider extends BaseVideoProvider {
    public readonly providerId = 'runway';
    public readonly generatorService = 'runwayml' as const;

    private getApiKey(): string {
        const key = process.env.RUNWAYML_API_KEY;
        if (!key) {
            throw new Error('RUNWAYML_API_KEY not set in environment');
        }
        return key;
    }

    public async generateImageToVideo(
        sourceImageUrl: string,
        motionPrompt: string,
        durationSeconds: number,
    ): Promise<{ videoUrl: string; durationSeconds: number; taskId?: string }> {
        const response = await fetch(`${RUNWAYML_CONFIG.apiBase}/image_to_video`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.getApiKey()}`,
                'Content-Type': 'application/json',
                'X-Runway-Version': RUNWAYML_CONFIG.apiVersion,
            },
            body: JSON.stringify({
                model: RUNWAYML_CONFIG.model,
                promptImage: sourceImageUrl,
                promptText: motionPrompt.slice(0, RUNWAYML_CONFIG.motionPromptMaxChars),
                duration: durationSeconds,
                ratio: RUNWAYML_CONFIG.outputRatio,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`RunwayML create error ${response.status}: ${errorText}`);
        }

        const createData = Object.assign(new RunwayCreateResponse(), await response.json() as object);
        const taskId = createData.id;

        for (let attempt = 0; attempt < RUNWAYML_CONFIG.maxPollAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, RUNWAYML_CONFIG.pollIntervalMs));

            const statusResponse = await fetch(`${RUNWAYML_CONFIG.apiBase}/tasks/${taskId}`, {
                headers: {
                    Authorization: `Bearer ${this.getApiKey()}`,
                    'X-Runway-Version': RUNWAYML_CONFIG.apiVersion,
                },
            });

            if (!statusResponse.ok) {
                continue;
            }

            const statusData = Object.assign(new RunwayStatusResponse(), await statusResponse.json() as object);

            if (statusData.status === 'SUCCEEDED' && statusData.output?.[0]) {
                return {
                    videoUrl: statusData.output[0],
                    durationSeconds,
                    taskId,
                };
            }

            if (statusData.status === 'FAILED') {
                throw new Error(`RunwayML task ${taskId} failed: ${statusData.error ?? 'unknown'}`);
            }
        }

        throw new Error(`RunwayML task ${taskId} timed out after ${RUNWAYML_CONFIG.maxPollAttempts} polls`);
    }
}
