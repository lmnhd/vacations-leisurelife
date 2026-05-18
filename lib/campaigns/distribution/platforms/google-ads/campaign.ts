import { GoogleAdsApi, enums } from 'google-ads-api';
import type { CampaignMediaManifest, ScheduledPost } from '../../../schema';
import { loadProviderToken } from '@/lib/integrations/provider-token-store';
import type { GoogleTargetingPackage } from './targeting';

export interface GoogleDisplayTargetingVerification {
    campaignStatus: string;
    adGroupExists: boolean;
    requestedKeywords: number;
    appliedKeywords: number;
    appliedKeywordTexts: string[];
    requestedPlacements: number;
    appliedPlacements: number;
    appliedPlacementUrls: string[];
    requestedNegatives: number;
    appliedNegatives: number;
    appliedNegativeTexts: string[];
    matches: boolean;
    discrepancies: string[];
}

export interface GoogleDisplayDraftResult {
    campaignId: string;
    adGroupId: string;
    adId: string;
    targeting: GoogleTargetingPackage;
    verification: GoogleDisplayTargetingVerification;
}

export interface GoogleDisplayCleanupResult {
    campaignId: string;
    campaignResourceName: string;
    removedAdGroupAds: number;
    removedAdGroupCriteria: number;
    removedAdGroups: number;
    removedCampaign: boolean;
    removedCampaignBudget: boolean;
    warnings: string[];
}

function extractId(resourceName: string): string {
    return resourceName.split('/').pop() ?? resourceName;
}

function cap(text: string, max: number): string {
    return text.length > max ? text.slice(0, max).trimEnd() : text;
}

function selectGoogleDisplayImage(manifest: CampaignMediaManifest) {
    const designedDisplayImage = (manifest.images.designedAdArtifacts ?? []).find((asset) =>
        asset.active && !!asset.url && asset.tags.some((tag) => tag.toLowerCase() === 'google_display'),
    );
    if (designedDisplayImage?.url) {
        return designedDisplayImage;
    }

    return manifest.images.hero.find((asset) => asset.active && !!asset.url) ?? manifest.images.hero[0];
}

function selectGoogleDisplaySquareImage(manifest: CampaignMediaManifest) {
    const designedSquareImage = (manifest.images.designedAdArtifacts ?? []).find((asset) =>
        asset.active
        && !!asset.url
        && asset.tags.some((tag) => {
            const lowered = tag.toLowerCase();
            return lowered === 'instagram_square' || lowered === 'square_1x1' || lowered === 'social_square';
        }),
    );
    if (designedSquareImage?.url) {
        return designedSquareImage;
    }

    return manifest.images.platformCrops.square_1x1?.find((asset) => asset.active && !!asset.url)
        ?? manifest.images.platformCrops.square_1x1?.[0]
        ?? null;
}

async function uploadGoogleAdsImageAsset(
    customer: ReturnType<GoogleAdsApi['Customer']>,
    imageUrl: string,
    assetName: string,
) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch Google display image asset ${assetName}: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const assetRes = await customer.assets.create([{
        name: assetName,
        type: enums.AssetType.IMAGE,
        image_asset: { data: buffer },
    }]);

    const resourceName = assetRes.results[0]?.resource_name;
    if (!resourceName) {
        throw new Error(`Image asset creation returned no resource_name for ${assetName}`);
    }

    return resourceName;
}

export async function createGoogleDisplayDraft(
    campaignSlug: string,
    post: ScheduledPost,
    manifest: CampaignMediaManifest,
    _blueprintSummary: string,
    targeting: GoogleTargetingPackage,
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

    const googleDisplayImage = selectGoogleDisplayImage(manifest);
    if (!googleDisplayImage?.url) {
        throw new Error(`No active Google display image in manifest for ${campaignSlug}`);
    }
    const googleDisplaySquareImage = selectGoogleDisplaySquareImage(manifest);
    if (!googleDisplaySquareImage?.url) {
        throw new Error(`No active Google square image in manifest for ${campaignSlug}`);
    }

    const finalUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leisurelifeinteractive.net').replace(/\/$/, '')}/groups/${campaignSlug}`;
    const campaignLabel = `[DRAFT] LeisureLife ${campaignSlug} ${Date.now().toString(36)}`;
    const assetBaseName = `ll-${campaignSlug}-google-display-${Date.now()}`;
    const imageAssetName = await uploadGoogleAdsImageAsset(
        customer,
        googleDisplayImage.url,
        `${assetBaseName}-landscape`,
    );
    const squareImageAssetName = await uploadGoogleAdsImageAsset(
        customer,
        googleDisplaySquareImage.url,
        `${assetBaseName}-square`,
    );

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
        contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
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
                square_marketing_images: [{ asset: squareImageAssetName }],
            },
        },
    }]);
    const adResourceName = adRes.results[0]?.resource_name;
    if (!adResourceName) throw new Error('Ad creation returned no resource_name');
    const adId = extractId(adResourceName);

    // 5. Targeting criteria (ad-group level) — contextual interception, not broad audience targeting
    const criterionOperations = buildAdGroupCriterionOperations(adGroupName, targeting);
    if (criterionOperations.length > 0) {
        await customer.adGroupCriteria.create(criterionOperations as never);
    }

    // 6. Verification readback
    const verification = await verifyGoogleDisplayTargeting(customer, campaignName, adGroupName, targeting);

    console.log(
        `[Google-Ads] PAUSED display draft created for ${campaignSlug}: campaign=${campaignId} adGroup=${adGroupId} ad=${adId} ` +
            `keywords=${verification.appliedKeywords}/${verification.requestedKeywords} ` +
            `placements=${verification.appliedPlacements}/${verification.requestedPlacements} ` +
            `negatives=${verification.appliedNegatives}/${verification.requestedNegatives}`,
    );
    return { campaignId, adGroupId, adId, targeting, verification };
}

export async function removeGoogleDisplayDraft(campaignId: string): Promise<GoogleDisplayCleanupResult> {
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

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const warnings: string[] = [];

    const campaignRows = (await customer.query(
        `SELECT campaign.resource_name, campaign.campaign_budget FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`,
    )) as Array<{ campaign?: { resource_name?: string; campaign_budget?: string } }>;

    if (campaignRows.length === 0) {
        throw new Error(`Google Ads campaign not found for cleanup: ${campaignId}`);
    }

    const campaignBudgetResourceName = campaignRows[0]?.campaign?.campaign_budget ?? undefined;

    const adGroupRows = (await customer.query(
        `SELECT ad_group.resource_name FROM ad_group WHERE ad_group.campaign = '${campaignResourceName}'`,
    )) as Array<{ ad_group?: { resource_name?: string } }>;
    const adGroupResourceNames = adGroupRows
        .map((row) => row.ad_group?.resource_name)
        .filter((value): value is string => Boolean(value));

    const adGroupAdRows = (await customer.query(
        `SELECT ad_group_ad.resource_name FROM ad_group_ad WHERE ad_group.campaign = '${campaignResourceName}'`,
    )) as Array<{ ad_group_ad?: { resource_name?: string } }>;
    const adGroupAdResourceNames = adGroupAdRows
        .map((row) => row.ad_group_ad?.resource_name)
        .filter((value): value is string => Boolean(value));

    const criterionRows = (await customer.query(
        `SELECT ad_group_criterion.resource_name FROM ad_group_criterion WHERE ad_group.campaign = '${campaignResourceName}'`,
    )) as Array<{ ad_group_criterion?: { resource_name?: string } }>;
    const criterionResourceNames = criterionRows
        .map((row) => row.ad_group_criterion?.resource_name)
        .filter((value): value is string => Boolean(value));

    if (adGroupAdResourceNames.length > 0) {
        await customer.adGroupAds.remove(adGroupAdResourceNames);
    }

    if (criterionResourceNames.length > 0) {
        await customer.adGroupCriteria.remove(criterionResourceNames);
    }

    if (adGroupResourceNames.length > 0) {
        await customer.adGroups.remove(adGroupResourceNames);
    }

    let removedCampaignBudget = false;
    try {
        await customer.campaigns.remove([campaignResourceName]);
    } catch (error) {
        throw new Error(`Failed to remove Google Ads campaign ${campaignId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (campaignBudgetResourceName) {
        try {
            await customer.campaignBudgets.remove([campaignBudgetResourceName]);
            removedCampaignBudget = true;
        } catch (error) {
            warnings.push(
                `Campaign budget cleanup warning for ${campaignId}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    return {
        campaignId,
        campaignResourceName,
        removedAdGroupAds: adGroupAdResourceNames.length,
        removedAdGroupCriteria: criterionResourceNames.length,
        removedAdGroups: adGroupResourceNames.length,
        removedCampaign: true,
        removedCampaignBudget,
        warnings,
    };
}

export interface AdGroupCriterionRow {
    ad_group_criterion?: {
        type?: number | string;
        negative?: boolean;
        keyword?: { text?: string; match_type?: number | string };
        placement?: { url?: string };
    };
}

export interface CampaignStatusRow {
    campaign?: { status?: number | string };
}

export interface AdGroupRow {
    ad_group?: { id?: string | number };
}

export interface GoogleAdsQueryRunner {
    query: (gaql: string) => Promise<unknown[]>;
}

async function verifyGoogleDisplayTargeting(
    customer: GoogleAdsQueryRunner,
    campaignResourceName: string,
    adGroupResourceName: string,
    targeting: GoogleTargetingPackage,
): Promise<GoogleDisplayTargetingVerification> {
    const campaignRows = (await customer.query(
        `SELECT campaign.status FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`,
    )) as CampaignStatusRow[];
    const campaignStatusRaw = campaignRows[0]?.campaign?.status;
    const campaignStatus = resolveEnumName(enums.CampaignStatus, campaignStatusRaw);

    const adGroupRows = (await customer.query(
        `SELECT ad_group.id FROM ad_group WHERE ad_group.resource_name = '${adGroupResourceName}'`,
    )) as AdGroupRow[];
    const adGroupExists = adGroupRows.length > 0;

    const criterionRows = (await customer.query(
        `SELECT ad_group_criterion.type, ad_group_criterion.negative, ` +
            `ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ` +
            `ad_group_criterion.placement.url ` +
            `FROM ad_group_criterion WHERE ad_group.resource_name = '${adGroupResourceName}'`,
    )) as AdGroupCriterionRow[];

    return summarizeTargetingVerification(
        campaignStatus,
        adGroupExists,
        criterionRows,
        targeting,
    );
}

export function summarizeTargetingVerification(
    campaignStatus: string,
    adGroupExists: boolean,
    criterionRows: AdGroupCriterionRow[],
    targeting: GoogleTargetingPackage,
): GoogleDisplayTargetingVerification {
    const appliedKeywordTexts: string[] = [];
    const appliedPlacementUrls: string[] = [];
    const appliedNegativeTexts: string[] = [];

    for (const row of criterionRows) {
        const criterion = row.ad_group_criterion;
        if (!criterion) continue;

        if (criterion.negative === true && criterion.keyword?.text) {
            appliedNegativeTexts.push(criterion.keyword.text);
            continue;
        }

        if (criterion.keyword?.text) {
            appliedKeywordTexts.push(criterion.keyword.text);
            continue;
        }

        if (criterion.placement?.url) {
            appliedPlacementUrls.push(criterion.placement.url);
        }
    }

    const discrepancies: string[] = [];

    if (campaignStatus !== 'PAUSED') {
        discrepancies.push(`expected campaign status PAUSED but got ${campaignStatus}`);
    }
    if (!adGroupExists) {
        discrepancies.push('ad group not found by readback');
    }
    if (appliedKeywordTexts.length !== targeting.keywords.length) {
        discrepancies.push(
            `keyword count mismatch: requested ${targeting.keywords.length}, applied ${appliedKeywordTexts.length}`,
        );
    }
    if (appliedPlacementUrls.length !== targeting.placements.length) {
        discrepancies.push(
            `placement count mismatch: requested ${targeting.placements.length}, applied ${appliedPlacementUrls.length}`,
        );
    }
    if (appliedNegativeTexts.length !== targeting.negativeKeywords.length) {
        discrepancies.push(
            `negative keyword count mismatch: requested ${targeting.negativeKeywords.length}, applied ${appliedNegativeTexts.length}`,
        );
    }

    return {
        campaignStatus,
        adGroupExists,
        requestedKeywords: targeting.keywords.length,
        appliedKeywords: appliedKeywordTexts.length,
        appliedKeywordTexts,
        requestedPlacements: targeting.placements.length,
        appliedPlacements: appliedPlacementUrls.length,
        appliedPlacementUrls,
        requestedNegatives: targeting.negativeKeywords.length,
        appliedNegatives: appliedNegativeTexts.length,
        appliedNegativeTexts,
        matches: discrepancies.length === 0,
        discrepancies,
    };
}

export function buildAdGroupCriterionOperations(
    adGroupResourceName: string,
    targeting: GoogleTargetingPackage,
): Array<Record<string, unknown>> {
    const keywordOps = targeting.keywords.map((text) => ({
        ad_group: adGroupResourceName,
        status: enums.AdGroupCriterionStatus.ENABLED,
        negative: false,
        keyword: { text, match_type: enums.KeywordMatchType.BROAD },
    }));
    const placementOps = targeting.placements.map((url) => ({
        ad_group: adGroupResourceName,
        status: enums.AdGroupCriterionStatus.ENABLED,
        negative: false,
        placement: { url },
    }));
    const negativeOps = targeting.negativeKeywords.map((text) => ({
        ad_group: adGroupResourceName,
        negative: true,
        keyword: { text, match_type: enums.KeywordMatchType.BROAD },
    }));
    return [...keywordOps, ...placementOps, ...negativeOps];
}

function resolveEnumName(enumObject: Record<string | number, string | number>, value: unknown): string {
    if (value === undefined || value === null) return 'UNKNOWN';
    if (typeof value === 'string') return value;
    const looked = enumObject[value as number];
    return typeof looked === 'string' ? looked : String(value);
}
