import type { Campaign } from './types';
import type { CampaignMediaManifest, ScheduledPost } from './schema';

interface DiscordDispatchResult {
    postId: string;
    externalPostId?: string;
}

function resolveAssetUrl(manifest: CampaignMediaManifest, assetId: string): string | null {
    const allAssets = [
        ...manifest.images.shipReferences,
        ...manifest.images.hero,
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...(manifest.images.documentaryDetails ?? []),
        ...(manifest.images.designedAdArtifacts ?? []),
        ...Object.values(manifest.images.platformCrops).flat(),
        ...(manifest.videos.tiktokSeed ? [manifest.videos.tiktokSeed] : []),
        ...(manifest.videos.heroExplainer ? [manifest.videos.heroExplainer] : []),
        ...(manifest.videos.thresholdAnnouncement ? [manifest.videos.thresholdAnnouncement] : []),
        ...manifest.videos.countdown,
        ...manifest.videos.broll,
        ...(manifest.audio.ambientNarration ? [manifest.audio.ambientNarration] : []),
        ...(manifest.audio.hypeClip ? [manifest.audio.hypeClip] : []),
        ...(manifest.audio.themeMusic ? [manifest.audio.themeMusic] : []),
        ...manifest.merch.designs,
        ...manifest.merch.mockups,
    ];

    return allAssets.find((asset) => asset.assetId === assetId)?.url ?? null;
}

function buildDiscordContent(campaign: Campaign, manifest: CampaignMediaManifest, post: ScheduledPost): Record<string, unknown> {
    const assetUrl = resolveAssetUrl(manifest, post.assetId);
    const description = manifest.copy?.captions.discord?.trim() || campaign.description;
    const fields = [
        campaign.targetDates ? { name: 'Sailing', value: campaign.targetDates, inline: true } : null,
        campaign.shipTarget ? { name: 'Ship', value: campaign.shipTarget, inline: true } : null,
        campaign.startingPrice ? { name: 'Starting From', value: `$${campaign.startingPrice}/pp`, inline: true } : null,
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);

    const embed: Record<string, unknown> = {
        title: campaign.name,
        description,
        fields,
        footer: { text: `Campaign stage: ${post.campaignStage}` },
    };

    if (assetUrl) {
        embed.image = { url: assetUrl };
    }

    return {
        content: description,
        embeds: [embed],
        allowed_mentions: { parse: [] },
    };
}

export async function dispatchDiscordPost(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    post: ScheduledPost,
): Promise<DiscordDispatchResult> {
    const webhookUrl = campaign.communityChannelUrl?.trim();
    if (!webhookUrl) {
        throw new Error(`Campaign ${campaign.id} is missing communityChannelUrl for Discord dispatch`);
    }

    const targetUrl = webhookUrl.includes('?') ? `${webhookUrl}&wait=true` : `${webhookUrl}?wait=true`;
    const payload = buildDiscordContent(campaign, manifest, post);

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Discord webhook failed (${response.status}): ${responseText}`);
    }

    const body = await response.json() as { id?: string };

    return {
        postId: post.postId,
        externalPostId: body.id,
    };
}
