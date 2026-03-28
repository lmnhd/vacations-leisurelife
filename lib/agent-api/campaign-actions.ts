import { randomUUID } from 'crypto';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { dispatchDiscordPost } from '@/lib/campaigns/distribution-discord';
import { dispatchMarketingPost, type MarketingProviderMode } from '@/lib/campaigns/distribution-marketing';
import { buildDistributionSchedule } from '@/lib/campaigns/distribution-planner';
import {
    getDistributionSchedule,
    saveDistributionExecution,
    saveDistributionSchedule,
    updateCampaignDistributionStatus,
    updateDistributionExecution,
    updateScheduledPostStatus,
} from '@/lib/campaigns/distribution-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import type { Campaign } from '@/lib/campaigns/types';
import type {
    CampaignMediaManifest,
    DistributionCaller,
    DistributionExecutionRecord,
    DistributionPlatform,
    DistributionSchedule,
    ScheduledPost,
} from '@/lib/campaigns/schema';

type CampaignStatus = Campaign['status'];

export interface CampaignStatusUpdateResult {
    previousStatus: CampaignStatus;
    nextStatus: CampaignStatus;
    message: string;
}

export interface CampaignDistributionResult {
    message: string;
    executionId: string;
    mode: 'plan' | 'dispatch';
    dryRun: boolean;
    providerMode: MarketingProviderMode;
    forceDispatch: boolean;
    caller: DistributionCaller;
    schedule: DistributionSchedule;
    summary: DistributionExecutionRecord['summary'];
    warnings: string[];
    previews: Array<{ postId: string; platform: string; payload: Record<string, unknown> }>;
}

function filterSchedule(
    schedule: DistributionSchedule,
    platforms?: DistributionPlatform[],
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
            || post.platform === 'instagram_feed'
            || post.platform === 'instagram_reels'
            || post.platform === 'instagram_story'
            || post.platform === 'facebook_ad'
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

            if (result.status === 'posted') {
                if (persistStatusUpdates) {
                    await updateScheduledPostStatus(campaign.id, post.postId, 'posted', result.externalPostId);
                }
                dispatchedPosts += 1;
            } else {
                if (persistStatusUpdates) {
                    await updateScheduledPostStatus(campaign.id, post.postId, 'failed');
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

export async function updateCampaignStatusForAgent(
    slug: string,
    nextStatus: CampaignStatus,
): Promise<CampaignStatusUpdateResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error(`Campaign not found: ${slug}`);
    }

    if (campaign.status === nextStatus) {
        return {
            previousStatus: campaign.status,
            nextStatus,
            message: `Campaign already in status ${campaign.status}.`,
        };
    }

    const updatedCampaign: Campaign = {
        ...campaign,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
    };

    await saveCampaignBlueprint(updatedCampaign);

    return {
        previousStatus: campaign.status,
        nextStatus,
        message: `Campaign status updated from ${campaign.status} to ${nextStatus}.`,
    };
}

export async function runCampaignDistributionForAgent(options: {
    slug: string;
    mode: 'plan' | 'dispatch';
    dryRun: boolean;
    caller: DistributionCaller;
    platforms?: DistributionPlatform[];
    stages?: string[];
    timezone?: string;
    providerMode?: MarketingProviderMode;
    forceDispatch?: boolean;
}): Promise<CampaignDistributionResult> {
    const executionId = `dist_exec_${randomUUID().slice(0, 12)}`;
    const providerMode = options.providerMode ?? 'simulate';
    const forceDispatch = options.forceDispatch ?? false;
    const [campaign, manifest] = await Promise.all([
        getCampaignBlueprint(options.slug),
        getMediaManifest(options.slug),
    ]);

    if (!campaign) {
        throw new Error(`Campaign not found: ${options.slug}`);
    }

    if (!manifest) {
        throw new Error(`Media manifest not found for campaign ${options.slug}`);
    }

    const existingSchedule = options.dryRun ? null : await getDistributionSchedule(options.slug);
    const baseSchedule = existingSchedule ?? buildDistributionSchedule(campaign, manifest, {
        caller: options.caller,
        platforms: options.platforms,
        stages: options.stages,
        timezone: options.timezone,
    });
    const schedule = filterSchedule(baseSchedule, options.platforms, options.stages);

    const record: DistributionExecutionRecord = {
        executionId,
        campaignSlug: options.slug,
        caller: options.caller,
        mode: options.mode,
        requestedPlatforms: options.platforms ?? [],
        requestedStages: options.stages ?? [],
        dryRun: options.dryRun,
        status: 'planned',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        summary: {
            plannedPosts: schedule.posts.length,
            persistedPosts: options.dryRun ? 0 : schedule.posts.length,
            dispatchedPosts: 0,
            skippedPosts: 0,
        },
    };

    const warnings: string[] = [];
    const previews: Array<{ postId: string; platform: string; payload: Record<string, unknown> }> = [];

    if (!options.dryRun) {
        if (!existingSchedule) {
            await saveDistributionSchedule(baseSchedule);
        }
        await updateCampaignDistributionStatus(options.slug, 'scheduled');
    }

    await saveDistributionExecution(record);

    if (options.mode === 'dispatch') {
        const dispatchResult = await dispatchSupportedPlatforms(
            campaign,
            manifest,
            schedule,
            providerMode,
            !options.dryRun,
            forceDispatch,
        );
        record.status = 'completed';
        record.summary.dispatchedPosts = dispatchResult.dispatchedPosts;
        record.summary.skippedPosts = dispatchResult.skippedPosts;
        warnings.push(...dispatchResult.warnings);
        previews.push(...dispatchResult.previews);
        if (!options.dryRun && dispatchResult.dispatchedPosts > 0) {
            await updateCampaignDistributionStatus(options.slug, 'active');
        }
        await updateDistributionExecution(record);
    }

    return {
        message: options.dryRun
            ? `Distribution plan generated for ${options.slug}`
            : options.mode === 'dispatch'
                ? `Distribution dispatch processed for ${options.slug}`
                : `Distribution schedule persisted for ${options.slug}`,
        executionId,
        mode: options.mode,
        dryRun: options.dryRun,
        providerMode,
        forceDispatch,
        caller: options.caller,
        schedule,
        summary: record.summary,
        warnings,
        previews,
    };
}