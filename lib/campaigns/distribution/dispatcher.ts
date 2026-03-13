import {
    DistributionSchedule,
    ScheduledPost,
} from '../schema';
import { updateScheduledPostStatus } from '../distribution-store';
import { executeTikTokPost } from './platforms/tiktok';
import { executeMetaGraphPost } from './platforms/meta-graph';
import { executeMetaAdsUpdate } from './platforms/meta-ads';

/**
 * Dispatcher handles routing a scheduled post to the appropriate platform connector.
 * It is idempotent: it will verify the status is still 'scheduled' unless forces are applied.
 */
export async function dispatchPost(
    campaignSlug: string,
    postId: string,
    options?: { force?: boolean }
): Promise<{ success: boolean; externalPostId?: string; error?: string }> {
    try {
        const { getDistributionSchedule } = await import('../distribution-store');
        const schedule = await getDistributionSchedule(campaignSlug);
        
        if (!schedule) {
            throw new Error(`Schedule not found for campaign: ${campaignSlug}`);
        }

        const post = schedule.posts.find((p) => p.postId === postId);
        if (!post) {
            throw new Error(`Post ${postId} not found in schedule for campaign: ${campaignSlug}`);
        }

        if (post.status !== 'scheduled' && !options?.force) {
            return { success: true, error: `Post ${postId} is already in state: ${post.status}. Skipping.` };
        }

        console.log(`[DISPATCHER] Executing post ${postId} on platform ${post.platform} for campaign ${campaignSlug}`);
        
        let externalPostId: string | undefined;

        switch (post.platform) {
            case 'tiktok':
                externalPostId = await executeTikTokPost(campaignSlug, post);
                break;
            case 'instagram_feed':
            case 'instagram_reels':
            case 'instagram_story':
                externalPostId = await executeMetaGraphPost(campaignSlug, post);
                break;
            case 'facebook_ad':
                externalPostId = await executeMetaAdsUpdate(campaignSlug, post);
                break;
            // Additional platforms e.g., email, discord, sms would go here
            default:
                throw new Error(`Platform ${post.platform} connector not yet implemented in dispatcher.`);
        }

        await updateScheduledPostStatus(campaignSlug, postId, 'posted', externalPostId);

        return { success: true, externalPostId };
    } catch (error: any) {
        console.error(`[DISPATCHER] Failed to dispatch post ${postId}:`, error);
        
        try {
            await updateScheduledPostStatus(campaignSlug, postId, 'failed');
        } catch (updateError) {
            console.error(`[DISPATCHER] Failed to update post status to failed:`, updateError);
        }

        return { success: false, error: error.message || 'Unknown error' };
    }
}
