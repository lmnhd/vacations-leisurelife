import type { TikTokPaidLeadGenContract } from '../../schema';
import { getTikTokAdvertiserStatus } from '@/lib/integrations/tiktok-auth';

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

function buildMarketingApiHeaders(appId: string, appSecret: string): HeadersInit {
    return {
        'Access-Token': appSecret,
        'Content-Type': 'application/json',
    };
}

async function postMarketingApi<TData>(
    appId: string,
    appSecret: string,
    path: string,
    body: Record<string, unknown>,
): Promise<TData> {
    const url = `${TIKTOK_MARKETING_API_BASE}${path}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: buildMarketingApiHeaders(appId, appSecret),
        body: JSON.stringify(body),
    });

    const payload = await response.json() as TikTokMarketingApiResponse<TData>;
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
): Promise<TikTokPaidLeadGenContract> {
    const advertiserStatus = getTikTokAdvertiserStatus();
    if (!advertiserStatus.ready) {
        throw new Error(
            'TikTok advertiser credentials are not configured. ' +
            `Missing env vars: ${advertiserStatus.requiredVars.join(', ')}. ` +
            'Set TIKTOK_ADVERTISER_ID, TIKTOK_MARKETING_API_APP_ID, and TIKTOK_MARKETING_API_SECRET to proceed.',
        );
    }

    const { advertiserAccountId, appId } = advertiserStatus;
    const appSecret = process.env.TIKTOK_MARKETING_API_SECRET!.trim();
    const now = new Date().toISOString();

    console.log(`[TikTok-Paid] Creating lead-gen draft for campaign ${contract.campaignSlug}`);

    // 1. Create paused Lead Generation campaign
    const campaignData = await postMarketingApi<TikTokCampaignCreateData>(
        appId,
        appSecret,
        '/campaign/create/',
        {
            advertiser_id: advertiserAccountId,
            campaign_name: `LLI-${contract.campaignSlug}-lead-gen`,
            objective_type: 'LEAD_GENERATION',
            budget_mode: 'BUDGET_MODE_INFINITE',
            operation_status: 'DISABLE',
        },
    );

    console.log(`[TikTok-Paid] Campaign created: ${campaignData.campaign_id}`);

    // 2. Create paused ad group targeting the campaign audience
    const adGroupBody: Record<string, unknown> = {
        advertiser_id: advertiserAccountId,
        campaign_id: campaignData.campaign_id,
        adgroup_name: `LLI-${contract.campaignSlug}-adgroup`,
        placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
        budget_mode: 'BUDGET_MODE_DAY',
        budget: contract.dailyBudget ?? 20,
        schedule_type: 'SCHEDULE_FROM_NOW',
        optimization_goal: 'LEAD',
        operation_status: 'DISABLE',
        billing_event: 'OCPM',
    };

    if (contract.startAt) {
        adGroupBody.schedule_start_time = contract.startAt;
    }
    if (contract.endAt) {
        adGroupBody.schedule_end_time = contract.endAt;
    }

    const adGroupData = await postMarketingApi<TikTokAdGroupCreateData>(
        appId,
        appSecret,
        '/adgroup/create/',
        adGroupBody,
    );

    console.log(`[TikTok-Paid] Ad group created: ${adGroupData.adgroup_id}`);

    // 3. Create paused ad referencing the creative asset and lead form
    const adBody: Record<string, unknown> = {
        advertiser_id: advertiserAccountId,
        adgroup_id: adGroupData.adgroup_id,
        ad_name: `LLI-${contract.campaignSlug}-ad`,
        ad_format: 'SINGLE_VIDEO',
        operation_status: 'DISABLE',
    };

    if (contract.leadFormTemplateId) {
        adBody.lead_form_id = contract.leadFormTemplateId;
    }

    const adData = await postMarketingApi<TikTokAdCreateData>(
        appId,
        appSecret,
        '/ad/create/',
        adBody,
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
): Promise<string> {
    const advertiserStatus = getTikTokAdvertiserStatus();
    if (!advertiserStatus.ready) {
        throw new Error(
            'TikTok advertiser credentials are not configured. ' +
            `Missing env vars: ${advertiserStatus.requiredVars.join(', ')}.`,
        );
    }

    const { advertiserAccountId, appId } = advertiserStatus;
    const appSecret = process.env.TIKTOK_MARKETING_API_SECRET!.trim();

    const formData = await postMarketingApi<TikTokLeadFormCreateData>(
        appId,
        appSecret,
        '/lead/form/create/',
        {
            advertiser_id: advertiserAccountId,
            name: `LLI-${campaignSlug}-lead-form`,
            questions: [
                { type: 'FULL_NAME' },
                { type: 'EMAIL' },
                { type: 'PHONE_NUMBER', required: false },
            ],
            privacy_policy_url: campaignLandingUrl,
            thank_you_page: {
                type: 'URL',
                url: campaignLandingUrl,
            },
        },
    );

    console.log(`[TikTok-Paid] Lead form created: ${formData.form_id}`);
    return formData.form_id;
}
