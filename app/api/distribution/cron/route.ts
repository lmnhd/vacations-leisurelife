import { NextResponse } from 'next/server';
import { dispatchPost } from '@/lib/campaigns/distribution/dispatcher';
// import { getActiveCampaignSchedules } from '@/lib/campaigns/distribution-store';

export async function GET(request: Request) {
    /**
     * NOTE: Vercel Cron uses a shared secret in Authorization headers
     * for security: request.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
     */

    try {
        // Step 1: In a real implementation with DynamoDB, we'd query a GSI
        // or fetch metadata for active campaigns to find their schedules.
        // For now, we simulate finding pending jobs.
        const pendingJobs: Array<{ campaignSlug: string; postId: string }> = [
            // Example data
            // { campaignSlug: 'salsa-2025', postId: 'post-123' }
        ];

        console.log(`[DISTRIBUTION-CRON] Found ${pendingJobs.length} pending scheduled posts.`);

        const results = await Promise.allSettled(
            pendingJobs.map(job => dispatchPost(job.campaignSlug, job.postId))
        );

        const summary = results.map((result, index) => ({
            job: pendingJobs[index],
            status: result.status,
            ...((result as any).value || { error: (result as any).reason })
        }));

        return NextResponse.json({ success: true, processed: pendingJobs.length, summary });

    } catch (error: any) {
        console.error('[DISTRIBUTION-CRON] Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
