import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { dispatchDiscordPost } from '@/lib/campaigns/distribution-discord';
import { dispatchMarketingPost, type MarketingProviderMode } from '@/lib/campaigns/distribution-marketing';
import { buildDistributionSchedule } from '@/lib/campaigns/distribution-planner';
import {
    getDistributionSchedule,
    saveDistributionExecution,
    saveDistributionSchedule,
    updateDistributionExecution,
    updateCampaignDistributionStatus,
    updateScheduledPostStatus,
} from '@/lib/campaigns/distribution-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import type { Campaign } from '@/lib/campaigns/types';
import {
    DistributionCallerEnum,
    DistributionPlatformEnum,
    type CampaignMediaManifest,
    type DistributionExecutionRecord,
    type DistributionSchedule,
    type ScheduledPost,
} from '@/lib/campaigns/schema';

function filterSchedule(
    schedule: DistributionSchedule,
    platforms?: string[],
    stages?: string[],
): DistributionSchedule {
    return {
        ...schedule,
        posts: schedule.posts.filter((post) => {
            const platformAllowed = !platforms || platforms.includes(post.platform);
            const stageAllowed = !stages || stages.includes(post.campaignStage);
            return platformAllowed && stageAllowed;
        }),
    };
}

function canDispatchPost(campaign: Campaign, post: ScheduledPost): boolean {
    if (post.status !== 'scheduled') {
        return false;
    }

    if (post.scheduledAt === 'ON_THRESHOLD') {
        return campaign.status === 'THRESHOLD_MET';
    }

    if (post.scheduledAt === 'ON_EXPIRY') {
        return campaign.status === 'EXPIRED';
    }

    if (post.scheduledAt === 'ON_MANIFEST_SUBMIT') {
        return false;
    }

    return new Date(post.scheduledAt).getTime() <= Date.now();
}

async function dispatchSupportedPlatforms(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    schedule: DistributionSchedule,
    providerMode: MarketingProviderMode,
    persistStatusUpdates: boolean,
    forceDispatch: boolean,
): Promise<{ dispatchedPosts: number; skippedPosts: number; warnings: string[]; previews: Array<{ postId: string; platform: string; payload: Record<string, unknown> }> }> {
    let dispatchedPosts = 0;
    let skippedPosts = 0;
    const warnings: string[] = [];
    const previews: Array<{ postId: string; platform: string; payload: Record<string, unknown> }> = [];

    for (const post of schedule.posts) {
        if (!forceDispatch && !canDispatchPost(campaign, post)) {
            skippedPosts += 1;
            continue;
        }

        if (
            post.platform === 'tiktok'
            || post.platform === 'tiktok_paid'
            || post.platform === 'instagram_feed'
            || post.platform === 'instagram_reels'
            || post.platform === 'instagram_story'
            || post.platform === 'facebook_ad'
            || post.platform === 'google_display'
        ) {
            const result = await dispatchMarketingPost(campaign, manifest, post, providerMode);
            previews.push({
                postId: post.postId,
                platform: post.platform,
                payload: result.preview,
            });

            if (result.warning) {
                warnings.push(result.warning);
            }

            if (result.status !== 'failed') {
                if (persistStatusUpdates) {
                    await updateScheduledPostStatus(campaign.id, post.postId, result.status, result.externalPostId, result.externalReviewUrl, result.metadataNotes);
                }
                dispatchedPosts += 1;
            } else {
                if (persistStatusUpdates) {
                    await updateScheduledPostStatus(campaign.id, post.postId, 'failed', result.externalPostId, result.externalReviewUrl, result.metadataNotes);
                }
                skippedPosts += 1;
            }

            continue;
        }

        if (post.platform === 'discord') {
            const result = await dispatchDiscordPost(campaign, manifest, post);
            if (persistStatusUpdates) {
                await updateScheduledPostStatus(campaign.id, post.postId, 'posted', result.externalPostId);
            }
            dispatchedPosts += 1;
            continue;
        }

        skippedPosts += 1;
        warnings.push(`Platform adapter not implemented yet for ${post.platform}. Post ${post.postId} remained scheduled.`);
    }

    return { dispatchedPosts, skippedPosts, warnings, previews };
}

const DistributionRequestSchema = z.object({
    caller: DistributionCallerEnum.optional(),
    mode: z.enum(['plan', 'dispatch']).optional(),
    dryRun: z.boolean().optional(),
    platforms: z.array(DistributionPlatformEnum).optional(),
    stages: z.array(z.string().min(1)).optional(),
    timezone: z.string().min(1).optional(),
    executionId: z.string().min(1).optional(),
    providerMode: z.enum(['simulate', 'live']).optional(),
    forceDispatch: z.boolean().optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    let rawBody: unknown = {};
    try {
        rawBody = await request.json();
    } catch {
        rawBody = {};
    }

    const parsed = DistributionRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request body', issues: parsed.error.issues },
            { status: 400 },
        );
    }

    const caller = parsed.data.caller ?? 'agent';
    const mode = parsed.data.mode ?? 'plan';
    const dryRun = parsed.data.dryRun ?? (mode !== 'dispatch');
    const executionId = parsed.data.executionId ?? `dist_exec_${randomUUID().slice(0, 12)}`;
    const providerMode: MarketingProviderMode = parsed.data.providerMode ?? 'simulate';
    const forceDispatch = parsed.data.forceDispatch ?? false;

    try {
        const [campaign, manifest] = await Promise.all([
            getCampaignBlueprint(slug),
            getMediaManifest(slug),
        ]);

        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }

        if (!manifest) {
            return NextResponse.json({ error: `Media manifest not found for campaign ${slug}` }, { status: 404 });
        }

        const existingSchedule = dryRun ? null : await getDistributionSchedule(slug);
        const shouldRegenerateSchedule = mode === 'plan';
        const baseSchedule = shouldRegenerateSchedule || !existingSchedule ? buildDistributionSchedule(campaign, manifest, {
            caller,
            platforms: parsed.data.platforms,
            stages: parsed.data.stages,
            timezone: parsed.data.timezone,
        }) : existingSchedule;
        const schedule = filterSchedule(baseSchedule, parsed.data.platforms, parsed.data.stages);

        const record: DistributionExecutionRecord = {
            executionId,
            campaignSlug: slug,
            caller,
            mode,
            requestedPlatforms: parsed.data.platforms ?? [],
            requestedStages: parsed.data.stages ?? [],
            dryRun,
            status: 'planned',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            summary: {
                plannedPosts: schedule.posts.length,
                persistedPosts: dryRun ? 0 : schedule.posts.length,
                dispatchedPosts: 0,
                skippedPosts: 0,
            },
        };

        const warnings: string[] = [];
        const previews: Array<{ postId: string; platform: string; payload: Record<string, unknown> }> = [];

        if (!dryRun) {
            if (shouldRegenerateSchedule || !existingSchedule) {
                await saveDistributionSchedule(baseSchedule);
            }
            await updateCampaignDistributionStatus(slug, 'scheduled');
        }

        await saveDistributionExecution(record);

        if (mode === 'dispatch') {
            const dispatchResult = await dispatchSupportedPlatforms(campaign, manifest, schedule, providerMode, !dryRun, forceDispatch);
            record.status = 'completed';
            record.summary.dispatchedPosts = dispatchResult.dispatchedPosts;
            record.summary.skippedPosts = dispatchResult.skippedPosts;
            warnings.push(...dispatchResult.warnings);
            previews.push(...dispatchResult.previews);
            if (!dryRun && dispatchResult.dispatchedPosts > 0) {
                await updateCampaignDistributionStatus(slug, 'active');
            }
            await updateDistributionExecution(record);
        }

        const responseSchedule = !dryRun && mode === 'dispatch'
            ? (await getDistributionSchedule(slug)) ?? schedule
            : schedule;

        return NextResponse.json({
            message: dryRun
                ? mode === 'dispatch'
                    ? `Simulated dispatch preview generated for ${slug}. No live provider APIs were called.`
                    : `Distribution plan generated for ${slug}`
                : mode === 'dispatch'
                    ? providerMode === 'simulate'
                        ? `Simulated distribution dispatch saved for ${slug}. No live provider APIs were called.`
                        : `Live distribution dispatch processed for ${slug}`
                    : `Distribution schedule persisted for ${slug}`,
            executionId,
            mode,
            dryRun,
            providerMode,
            forceDispatch,
            caller,
            schedule: responseSchedule,
            summary: record.summary,
            warnings,
            previews,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Distribution planning failed';

        const failedRecord: DistributionExecutionRecord = {
            executionId,
            campaignSlug: slug,
            caller,
            mode,
            requestedPlatforms: parsed.data.platforms ?? [],
            requestedStages: parsed.data.stages ?? [],
            dryRun,
            status: 'failed',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: message,
            summary: {
                plannedPosts: 0,
                persistedPosts: 0,
                dispatchedPosts: 0,
                skippedPosts: 0,
            },
        };

        await saveDistributionExecution(failedRecord);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}