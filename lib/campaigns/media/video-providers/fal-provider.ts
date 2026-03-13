import { FAL_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';
import { getPreferredVideoDurationSeconds, getVideoModelPreset } from '@/lib/campaigns/media/video-models';
import { BaseVideoProvider, VideoGenerationOptions } from './base-provider';

interface FalQueueStatus {
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
    request_id: string;
    status_url?: string;
    response_url?: string;
    error?: string;
    error_type?: string;
}

interface FalResultResponse {
    video?: {
        url?: string;
    };
}

export class FalVideoProvider extends BaseVideoProvider {
    public readonly providerId = 'fal';
    public readonly generatorService = 'kling' as const;

    private getApiKey(): string {
        const key = process.env.FAL_KEY;
        if (!key) {
            throw new Error('FAL_KEY not set in environment');
        }
        return key;
    }

    private getHeaders(): HeadersInit {
        return {
            Authorization: `Key ${this.getApiKey()}`,
            'Content-Type': 'application/json',
        };
    }

    private withLogsQuery(url: string): string {
        const parsed = new URL(url);
        parsed.searchParams.set('logs', '1');
        return parsed.toString();
    }

    public async generateImageToVideo(
        sourceImageUrl: string,
        motionPrompt: string,
        durationSeconds: number,
        options?: VideoGenerationOptions,
    ): Promise<{ videoUrl: string; durationSeconds: number; taskId?: string }> {
        const preset = getVideoModelPreset(options?.presetId);
        const endpoint = preset.falEndpoint;
        if (!endpoint) {
            throw new Error(`Fal preset ${preset.id} is missing a fal endpoint`);
        }

        const requestedDurationSeconds = Math.max(3, Math.min(15, Math.round(durationSeconds || FAL_CONFIG.defaultDurationSeconds)));
        const boundedDurationSeconds = getPreferredVideoDurationSeconds(preset.id, requestedDurationSeconds);
        const submitResponse = await fetch(`${FAL_CONFIG.apiBase}/${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                prompt: motionPrompt,
                image_url: sourceImageUrl,
                duration: preset.id === 'fal_veo31_fast'
                    ? `${boundedDurationSeconds}s`
                    : String(boundedDurationSeconds),
                generate_audio: false,
                ...(preset.id === 'fal_veo31_fast'
                    ? { aspect_ratio: '16:9', resolution: '720p' }
                    : {}),
            }),
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Fal create error ${submitResponse.status}: ${errorText}`);
        }

        const submitData = await submitResponse.json() as FalQueueStatus;
        const requestId = submitData.request_id;
        if (!requestId) {
            throw new Error('Fal create error: missing request_id in submit response');
        }

        const statusUrl = submitData.status_url
            ? this.withLogsQuery(submitData.status_url)
            : `${FAL_CONFIG.apiBase}/${endpoint}/requests/${requestId}/status?logs=1`;
        const responseUrl = submitData.response_url
            ?? `${FAL_CONFIG.apiBase}/${endpoint}/requests/${requestId}/response`;

        for (let attempt = 0; attempt < FAL_CONFIG.maxPollAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, FAL_CONFIG.pollIntervalMs));

            const statusResponse = await fetch(statusUrl, { headers: this.getHeaders() });

            if (!statusResponse.ok) {
                const errorText = await statusResponse.text();
                throw new Error(`Fal status error ${statusResponse.status}: ${errorText}`);
            }

            const statusData = await statusResponse.json() as FalQueueStatus;
            if (statusData.status === 'COMPLETED') {
                if (statusData.error) {
                    throw new Error(`Fal task ${requestId} failed: ${statusData.error_type ?? 'unknown_error'}${statusData.error ? `: ${statusData.error}` : ''}`);
                }

                const resultResponse = await fetch(responseUrl, { headers: this.getHeaders() });

                if (!resultResponse.ok) {
                    const errorText = await resultResponse.text();
                    throw new Error(`Fal result error ${resultResponse.status}: ${errorText}`);
                }

                const resultData = await resultResponse.json() as FalResultResponse;
                const videoUrl = resultData.video?.url;
                if (!videoUrl) {
                    throw new Error(`Fal result for ${requestId} did not include a video URL`);
                }

                return {
                    videoUrl,
                    durationSeconds: boundedDurationSeconds,
                    taskId: requestId,
                };
            }
        }

        throw new Error(`Fal task ${requestId} timed out after ${FAL_CONFIG.maxPollAttempts} polls`);
    }
}
