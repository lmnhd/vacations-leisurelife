import { NextResponse } from 'next/server';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getDistributionSchedule, listDistributionExecutions } from '@/lib/campaigns/distribution-store';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    try {
        const [campaign, schedule, executions] = await Promise.all([
            getCampaignBlueprint(slug),
            getDistributionSchedule(slug),
            listDistributionExecutions(slug),
        ]);

        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }

        if (!schedule) {
            return NextResponse.json({ error: `Distribution schedule not found for ${slug}` }, { status: 404 });
        }

        const perPlatform = schedule.posts.reduce<Record<string, { total: number; posted: number; draftCreated: number; scheduled: number; failed: number }>>((accumulator, post) => {
            const current = accumulator[post.platform] ?? { total: 0, posted: 0, draftCreated: 0, scheduled: 0, failed: 0 };
            current.total += 1;
            if (post.status === 'posted') current.posted += 1;
            if (post.status === 'draft_created') current.draftCreated += 1;
            if (post.status === 'scheduled') current.scheduled += 1;
            if (post.status === 'failed') current.failed += 1;
            accumulator[post.platform] = current;
            return accumulator;
        }, {});

        return NextResponse.json({
            campaign: {
                slug: campaign.id,
                status: campaign.status,
                distributionStatus: 'distributionStatus' in campaign ? campaign.distributionStatus : undefined,
            },
            schedule,
            executions,
            summary: {
                totalPosts: schedule.posts.length,
                perPlatform,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load distribution status';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}