import { NextResponse } from 'next/server';
import { dispatchPost } from '@/lib/campaigns/distribution/dispatcher';
import { getDistributionSchedule } from '@/lib/campaigns/distribution-store';

/**
 * Expected Payload:
 * {
 *   "slug": "salsa-2025",
 *   "event": "ON_THRESHOLD" | "ON_MANIFEST_SUBMIT" | "ON_EXPIRY"
 * }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { slug, event } = body;

        if (!slug || !event) {
            return NextResponse.json({ success: false, error: 'Missing slug or event' }, { status: 400 });
        }

        console.log(`[DISTRIBUTION-EVENT] Received event ${event} for campaign: ${slug}`);

        const schedule = await getDistributionSchedule(slug);
        if (!schedule) {
            return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
        }

        // Find all scheduled items matching this specific event string
        const pendingPosts = schedule.posts.filter(p => 
            p.status === 'scheduled' && p.scheduledAt === event
        );

        console.log(`[DISTRIBUTION-EVENT] Found ${pendingPosts.length} posts mapped to event ${event}.`);

        const results = await Promise.allSettled(
            pendingPosts.map(post => dispatchPost(slug, post.postId))
        );

        const summary = results.map((result, index) => ({
            postId: pendingPosts[index].postId,
            status: result.status,
            ...((result as any).value || { error: (result as any).reason })
        }));

        return NextResponse.json({ success: true, processed: pendingPosts.length, summary });

    } catch (error: any) {
        console.error('[DISTRIBUTION-EVENT] Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
