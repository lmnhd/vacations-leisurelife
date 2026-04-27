import { GoogleAdsApi, enums } from 'google-ads-api';
import type { CampaignMediaManifest, ScheduledPost } from '../../../schema';
import { loadProviderToken } from '@/lib/integrations/provider-token-store';

export interface GoogleDisplayDraftResult {
    campaignId: string;
    adGroupId: string;
    adId: string;
}

function extractId(resourceName: string): string {
    return resourceName.split('/').pop() ?? resourceName;
}

function cap(text: string, max: number): string {
    return text.length > max ? text.slice(0, max).trimEnd() : text;
}

export async function createGoogleDisplayDraft(
    campaignSlug: string,
    post: ScheduledPost,
    manifest: CampaignMediaManifest,
    _blueprintSummary: string,
): Promise<GoogleDisplayDraftResult> {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.trim()?.replace(/-/g, '');
    const managerId = process.env.GOOGLE_ADS_MANAGER_ID?.trim()?.replace(/-/g, '');

    if (!clientId || !clientSecret || !developerToken || !customerId) {
        throw new Error('Missing Google Ads env vars: CLIENT_ID, CLIENT_SECRET, DEVELOPER_TOKEN, or CUSTOMER_ID');
    }

    const tokenRecord = await loadProviderToken('google', 'business');
    if (!tokenRecord?.refreshToken) {
        throw new Error('Google Ads refresh token not found. Visit /api/integrations/google/connect to authorize.');
    }

    const googleAds = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken,
    });

    const customer = googleAds.Customer({
        customer_id: customerId,
        refresh_token: tokenRecord.refreshToken,
        ...(managerId ? { login_customer_id: managerId } : {}),
    });

    // Select ad copy variant
    const variantIndex = post.copyVariant === 'B' ? 1 : post.copyVariant === 'C' ? 2 : 0;
    const adCopy = manifest.copy?.adVariants[variantIndex] ?? manifest.copy?.adVariants[0];
    if (!adCopy) throw new Error(`No ad copy variants in manifest for ${campaignSlug}`);

    // Select hero image
    const heroImage = manifest.images.hero.find((a) => a.active && !!a.url) ?? manifest.images.hero[0];
    if (!heroImage?.url) throw new Error(`No active hero image in manifest for ${campaignSlug}`);

    const finalUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leisurelifeinteractive.net').replace(/\/$/, '')}/groups/${campaignSlug}`;
    const campaignLabel = `[DRAFT] LeisureLife ${campaignSlug}`;

    // Upload hero image as a Google Ads image asset
    const imgResponse = await fetch(heroImage.url);
    if (!imgResponse.ok) throw new Error(`Failed to fetch hero image: ${imgResponse.status} ${imgResponse.statusText}`);
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

    const assetRes = await customer.assets.create([{
        name: `ll-${campaignSlug}-hero-${Date.now()}`,
        type: enums.AssetType.IMAGE,
        image_asset: { data: imgBuffer },
    }]);
    const imageAssetName = assetRes.results[0]?.resource_name;
    if (!imageAssetName) throw new Error('Image asset creation returned no resource_name');

    // 1. Campaign Budget
    const budgetRes = await customer.campaignBudgets.create([{
        name: `Budget ${campaignLabel}`,
        amount_micros: 5_000_000,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
        explicitly_shared: false,
    }]);
    const budgetName = budgetRes.results[0]?.resource_name;
    if (!budgetName) throw new Error('Campaign budget creation returned no resource_name');

    // 2. Campaign
    const campaignRes = await customer.campaigns.create([{
        name: campaignLabel,
        status: enums.CampaignStatus.PAUSED,
        advertising_channel_type: enums.AdvertisingChannelType.DISPLAY,
        campaign_budget: budgetName,
        target_spend: {},
    }]);
    const campaignName = campaignRes.results[0]?.resource_name;
    if (!campaignName) throw new Error('Campaign creation returned no resource_name');
    const campaignId = extractId(campaignName);

    // 3. Ad Group
    const adGroupRes = await customer.adGroups.create([{
        name: `${campaignLabel} - Group 1`,
        campaign: campaignName,
        status: enums.AdGroupStatus.PAUSED,
        cpc_bid_micros: 1_000_000,
    }]);
    const adGroupName = adGroupRes.results[0]?.resource_name;
    if (!adGroupName) throw new Error('Ad group creation returned no resource_name');
    const adGroupId = extractId(adGroupName);

    // 4. Responsive Display Ad
    const adRes = await customer.adGroupAds.create([{
        ad_group: adGroupName,
        status: enums.AdGroupAdStatus.PAUSED,
        ad: {
            final_urls: [finalUrl],
            responsive_display_ad: {
                business_name: cap('LeisureLife Interactive', 25),
                headlines: [{ text: cap(adCopy.headline, 30) }],
                long_headline: { text: cap(adCopy.primaryText, 90) },
                descriptions: [{ text: cap(adCopy.description, 90) }],
                marketing_images: [{ asset: imageAssetName }],
            },
        },
    }]);
    const adResourceName = adRes.results[0]?.resource_name;
    if (!adResourceName) throw new Error('Ad creation returned no resource_name');
    const adId = extractId(adResourceName);

    console.log(`[Google-Ads] PAUSED display draft created for ${campaignSlug}: campaign=${campaignId} adGroup=${adGroupId} ad=${adId}`);
    return { campaignId, adGroupId, adId };
}
