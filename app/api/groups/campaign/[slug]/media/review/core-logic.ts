import { z } from 'zod';
import { ReviewStatusEnum } from '@/lib/campaigns/schema';
import { updateAssetReview } from '@/lib/campaigns/media/media-store';

const MediaAssetReviewRequestSchema = z.object({
    assetId: z.string().min(1),
    reviewStatus: ReviewStatusEnum,
    reviewNotes: z.string().trim().max(2000).optional(),
});

export async function handleMediaAssetReviewRequest(slug: string, body: unknown): Promise<{ status: number; data: unknown; }> {
    const parsedBody = MediaAssetReviewRequestSchema.safeParse(body);
    if (!parsedBody.success) {
        return {
            status: 400,
            data: { error: 'Invalid request body', issues: parsedBody.error.issues },
        };
    }

    try {
        const updatedAsset = await updateAssetReview(
            slug,
            parsedBody.data.assetId,
            parsedBody.data.reviewStatus,
            parsedBody.data.reviewNotes && parsedBody.data.reviewNotes.length > 0 ? parsedBody.data.reviewNotes : undefined,
        );

        return {
            status: 200,
            data: { asset: updatedAsset },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update media review';
        const status = message.includes('not found') ? 404 : 500;
        return {
            status,
            data: { error: message },
        };
    }
}
