import { NextRequest, NextResponse } from 'next/server';
import { getDistributionSchedule, updateScheduledPostStatus } from '@/lib/campaigns/distribution-store';
import { resolveTikTokPublishStatus } from '@/lib/campaigns/distribution/platforms/tiktok';

type SyncStatus = 'draft_created' | 'posted' | 'failed';

function mapTikTokStatus(status: string): SyncStatus {
    if (status === 'PUBLISH_COMPLETE') {
        return 'posted';
    }

    if (status === 'FAILED') {
        return 'failed';
    }

    return 'draft_created';
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    let platform = 'tiktok';
    try {
        const body = await request.json();
        if (body?.platform && typeof body.platform === 'string') {
            platform = body.platform;
        }
    } catch {
        platform = 'tiktok';
    }

    if (platform !== 'tiktok') {
        return NextResponse.json({ error: `Unsupported sync platform: ${platform}` }, { status: 400 });
    }

    const schedule = await getDistributionSchedule(slug);
    if (!schedule) {
        return NextResponse.json({ error: `Distribution schedule not found for ${slug}` }, { status: 404 });
    }

    const tikTokPosts = schedule.posts.filter((post) => post.platform === 'tiktok' && post.externalPostId);
    if (tikTokPosts.length === 0) {
        return NextResponse.json({
            message: `No organic TikTok upload drafts found for ${slug}. Paid TikTok lead-gen drafts do not use this sync route.`,
            summary: {
                checked: 0,
                posted: 0,
                draftCreated: 0,
                failed: 0,
            },
            warnings: [],
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    const warnings: string[] = [];
    let posted = 0;
    let draftCreated = 0;
    let failed = 0;

    for (const post of tikTokPosts) {
        try {
            const publishStatus = await resolveTikTokPublishStatus(post.externalPostId!);
            const nextStatus = mapTikTokStatus(publishStatus.status);
            const metadataNotes = [
                `tiktok_publish_status=${publishStatus.status}`,
                `last_status_sync_at=${new Date().toISOString()}`,
            ];

            if (publishStatus.failReason) {
                metadataNotes.push(`tiktok_fail_reason=${publishStatus.failReason}`);
            }

            if (publishStatus.publiclyAvailablePostId) {
                metadataNotes.push(`tiktok_public_post_id=${publishStatus.publiclyAvailablePostId}`);
            }

            await updateScheduledPostStatus(slug, post.postId, nextStatus, post.externalPostId, metadataNotes);

            if (nextStatus === 'posted') {
                posted += 1;
            } else if (nextStatus === 'failed') {
                failed += 1;
            } else {
                draftCreated += 1;
            }
        } catch (error) {
            warnings.push(error instanceof Error ? `${post.postId}: ${error.message}` : `${post.postId}: sync failed`);
        }
    }

    return NextResponse.json({
        message: `TikTok status sync complete for ${slug}`,
        summary: {
            checked: tikTokPosts.length,
            posted,
            draftCreated,
            failed,
        },
        warnings,
    }, {
        headers: { 'Cache-Control': 'no-store' },
    });
}