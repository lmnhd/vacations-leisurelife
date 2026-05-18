import type { TikTokPaidLeadGenContract } from '../../schema';
import { getTikTokAdvertiserStatus } from '@/lib/integrations/tiktok-auth';
import { getActiveAssetRecord } from '@/lib/campaigns/media/media-store';

const TIKTOK_MARKETING_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokMarketingApiResponse<TData> {
    code: number;
    message: string;
    request_id: string;
    data: TData;
}

interface TikTokCampaignCreateData {
    campaign_id: string;
}

interface TikTokAdGroupCreateData {
    adgroup_id: string;
}

interface TikTokAdCreateData {
    ad_id: string;
}

interface TikTokLeadFormCreateData {
    form_id: string;
}

interface TikTokVideoUploadData {
    video_id: string;
    width: number;
    height: number;
    duration: number;
    material_id: string;
}

interface TikTokPaidLeadGenDeps {
    fetchImpl?: typeof fetch;
    getAdvertiserStatus?: typeof getTikTokAdvertiserStatus;
    getAssetRecord?: typeof getActiveAssetRecord;
    now?: () => Date;
}

function buildMarketingApiHeaders(accessToken: string): HeadersInit {
    return {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
    };
}

function buildRunSuffix(nowIso: string): string {
    const digits = nowIso.replace(/\D/g, '');
    return digits.slice(-8) || Date.now().toString(36);
}

function resolveConversionBidPrice(dailyBudget: number | undefined): number {
    const budget = dailyBudget ?? 20;
    const target = Number((budget * 0.8).toFixed(2));
    if (target > 0 && target < budget) {
        return target;
    }

    return Number(Math.max(0.5, budget - 0.01).toFixed(2));
}

async function postMarketingApi<TData>(
    accessToken: string,
    path: string,
    body: Record<string, unknown>,
    fetchImpl: typeof fetch = fetch,
): Promise<TData> {
    const url = `${TIKTOK_MARKETING_API_BASE}${path}`;
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: buildMarketingApiHeaders(accessToken),
        body: JSON.stringify(body),
    });

    const text = await response.text();
    let payload: TikTokMarketingApiResponse<TData>;
    try {
        payload = JSON.parse(text) as TikTokMarketingApiResponse<TData>;
    } catch {
        throw new Error(`Non-JSON response from ${url} [Status ${response.status}]: ${text}`);
    }
    if (!response.ok || payload.code !== 0) {
        throw new Error(
            `TikTok Marketing API error [${path}]: code=${payload.code} message=${payload.message}`,
        );
    }

    return payload.data;
}

/**
 * Creates a paused TikTok Lead Gen campaign, ad group, and ad draft in the
 * advertiser account. Returns the contract with native IDs populated.
 *
 * Throws an actionable error if advertiser credentials are missing.
 * All created entities are set to DISABLE (paused) status — operator must activate explicitly.
 */
export async function createTikTokPaidLeadGenDraft(
    contract: Omit<TikTokPaidLeadGenContract, 'nativeCampaignId' | 'nativeAdGroupId' | 'nativeAdId' | 'nativeFormId' | 'activationState' | 'createdAt' | 'updatedAt'>,
    deps: TikTokPaidLeadGenDeps = {},
): Promise<TikTokPaidLeadGenContract> {
    const advertiserStatus = deps.getAdvertiserStatus?.() ?? getTikTokAdvertiserStatus();
    if (!advertiserStatus.ready) {
        throw new Error(
            'TikTok advertiser credentials are not configured. ' +
            `Missing env vars: ${advertiserStatus.requiredVars.join(', ')}. ` +
            'Set TIKTOK_ADVERTISER_ID, TIKTOK_MARKETING_API_APP_ID, and TIKTOK_MARKETING_API_SECRET to proceed.',
        );
    }

    const { advertiserAccountId } = advertiserStatus;
    const accessToken = (process.env.TIKTOK_MARKETING_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN)?.trim();
    if (!accessToken) throw new Error("Missing TIKTOK_MARKETING_ACCESS_TOKEN or TIKTOK_ACCESS_TOKEN");
    const now = (deps.now ?? (() => new Date()))().toISOString();
    const fetchImpl = deps.fetchImpl ?? fetch;
    const getAssetRecord = deps.getAssetRecord ?? getActiveAssetRecord;
    const assetRecord = await getAssetRecord(contract.campaignSlug, contract.adAssetId);
    if (!assetRecord) {
        throw new Error(`[TikTok-Paid] Asset not found in media store: ${contract.adAssetId}`);
    }
    if (!assetRecord.mimeType.startsWith('video/')) {
        throw new Error(
            `[TikTok-Paid] Asset must be a video asset before TikTok upload: ${contract.adAssetId} (${assetRecord.assetType}, ${assetRecord.mimeType})`,
        );
    }

    console.log(`[TikTok-Paid] Creating lead-gen draft for campaign ${contract.campaignSlug}`);
    const runSuffix = buildRunSuffix(now);

    // 1. Create paused Lead Generation campaign
    const campaignData = await postMarketingApi<TikTokCampaignCreateData>(
        accessToken,
        '/campaign/create/',
        {
            advertiser_id: advertiserAccountId,
            campaign_name: `LLI-${contract.campaignSlug}-lead-gen-${runSuffix}`,
            objective_type: 'LEAD_GENERATION',
            budget_mode: 'BUDGET_MODE_INFINITE',
            operation_status: 'DISABLE',
        },
        fetchImpl,
    );

    console.log(`[TikTok-Paid] Campaign created: ${campaignData.campaign_id}`);

    // 2. Create paused ad group targeting the campaign audience
    const adGroupBody: Record<string, unknown> = {
        advertiser_id: advertiserAccountId,
        campaign_id: campaignData.campaign_id,
        adgroup_name: `LLI-${contract.campaignSlug}-adgroup-${runSuffix}`,
        placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
        budget_mode: 'BUDGET_MODE_DAY',
        budget: contract.dailyBudget ?? 20,
        schedule_type: 'SCHEDULE_FROM_NOW',
        schedule_start_time: contract.startAt ?? now,
        promotion_type: 'LEAD_GENERATION',
        promotion_target_type: 'INSTANT_PAGE',
        optimization_goal: 'LEADS',
        bid_type: 'BID_TYPE_CUSTOM',
        conversion_bid_price: resolveConversionBidPrice(contract.dailyBudget),
        location_ids: ['6252001'],
        age_groups: ['AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100'],
        operation_status: 'DISABLE',
        billing_event: 'OCPM',
    };

    if (contract.endAt) {
        adGroupBody.schedule_end_time = contract.endAt;
    }

    const adGroupData = await postMarketingApi<TikTokAdGroupCreateData>(
        accessToken,
        '/adgroup/create/',
        adGroupBody,
        fetchImpl,
    );

    console.log(`[TikTok-Paid] Ad group created: ${adGroupData.adgroup_id}`);

    // 3a. Upload the validated video asset to TikTok Creative Center
    const videoUploadData = await postMarketingApi<TikTokVideoUploadData>(
        accessToken,
        '/file/video/ad/upload/',
        {
            advertiser_id: advertiserAccountId,
            video_url: assetRecord.url,
            display_name: `LLI-${contract.campaignSlug}-creative`,
            allow_download: false,
            is_shareable: false,
        },
        fetchImpl,
    );

    console.log(`[TikTok-Paid] Video uploaded: ${videoUploadData.video_id}`);

    // 3b. Create paused ad referencing the uploaded video and lead form
    const adBody: Record<string, unknown> = {
        advertiser_id: advertiserAccountId,
        adgroup_id: adGroupData.adgroup_id,
        ad_name: `LLI-${contract.campaignSlug}-ad-${runSuffix}`,
        ad_format: 'SINGLE_VIDEO',
        video_id: videoUploadData.video_id,
        operation_status: 'DISABLE',
    };

    if (contract.leadFormTemplateId) {
        adBody.lead_form_id = contract.leadFormTemplateId;
    }

    const adData = await postMarketingApi<TikTokAdCreateData>(
        accessToken,
        '/ad/create/',
        adBody,
        fetchImpl,
    );

    console.log(`[TikTok-Paid] Ad created: ${adData.ad_id}`);

    return {
        ...contract,
        nativeCampaignId: campaignData.campaign_id,
        nativeAdGroupId: adGroupData.adgroup_id,
        nativeAdId: adData.ad_id,
        nativeFormId: contract.leadFormTemplateId ?? undefined,
        activationState: 'paused',
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Creates a reusable TikTok lead form for the given advertiser account.
 * Returns the native form ID to be stored in the contract.
 * Throws if advertiser credentials are missing.
 */
export async function createTikTokLeadForm(
    campaignSlug: string,
    campaignLandingUrl: string,
    deps: TikTokPaidLeadGenDeps = {},
): Promise<string> {
    const advertiserStatus = deps.getAdvertiserStatus?.() ?? getTikTokAdvertiserStatus();
    if (!advertiserStatus.ready) {
        throw new Error(
            'TikTok advertiser credentials are not configured. ' +
            `Missing env vars: ${advertiserStatus.requiredVars.join(', ')}.`,
        );
    }

    const { advertiserAccountId } = advertiserStatus;
    const accessToken = (process.env.TIKTOK_MARKETING_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN)?.trim();
    if (!accessToken) throw new Error("Missing TIKTOK_MARKETING_ACCESS_TOKEN or TIKTOK_ACCESS_TOKEN");

    const formData = await postMarketingApi<TikTokLeadFormCreateData>(
        accessToken,
        '/leadgen/form/create/',
        {
            advertiser_id: advertiserAccountId,
            form_name: `LLI-${campaignSlug}-lead-form-${buildRunSuffix(new Date().toISOString())}`,
            form_type: 'INSTANT_FORM',
            locale: 'en_US',
            thank_you_page: {
                type: 'WEBSITE',
                website_url: campaignLandingUrl,
            },
            questions: [
                { question_type: 'CUSTOM', title: 'First Name', is_required: true },
                { question_type: 'CUSTOM', title: 'Email', is_required: true },
                { question_type: 'CUSTOM', title: 'Phone Number', is_required: true },
            ],
        },
        deps.fetchImpl ?? fetch,
    );

    console.log(`[TikTok-Paid] Lead form created: ${formData.form_id}`);
    return formData.form_id;
}
