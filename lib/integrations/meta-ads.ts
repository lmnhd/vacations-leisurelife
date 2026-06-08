interface MetaGraphErrorPayload {
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
    };
}

interface MetaAdAccountResponse {
    id: string;
    name?: string;
    account_status?: number;
}

interface MetaPageResponse {
    id: string;
    name?: string;
}

export interface MetaAdsConfig {
    accessToken: string;
    adAccountId: string;
    adSetId?: string;
    pageId: string;
    instagramActorId?: string;
}

export interface MetaInterestSearchResult {
    id: string;
    name: string;
    audience_size_lower_bound?: number;
    audience_size_upper_bound?: number;
    path?: string[];
}

interface MetaInterestSearchResponse {
    data?: MetaInterestSearchResult[];
}

export interface MetaCampaignCreateInput {
    name: string;
    status?: 'PAUSED' | 'ACTIVE';
    objective?: string;
}

export interface MetaAdSetCreateInput {
    name: string;
    campaignId: string;
    targeting: Record<string, unknown>;
    dailyBudgetCents: number;
    startTime?: string;
    endTime?: string;
    status?: 'PAUSED' | 'ACTIVE';
}

interface MetaCreateResponse {
    id: string;
}

export interface MetaProviderStatus {
    provider: 'meta';
    status: 'connected' | 'misconfigured' | 'unauthorized' | 'unverified';
    accountLabel?: string;
    accountId?: string;
    pageId?: string;
    instagramActorId?: string;
    lastValidatedAt: string;
    warnings: string[];
}

function buildMetaGraphUrl(path: string, accessToken: string, fields: string): string {
    const params = new URLSearchParams({
        access_token: accessToken,
        fields,
    });

    return `https://graph.facebook.com/v22.0/${path}?${params.toString()}`;
}

function buildMetaGraphSearchUrl(accessToken: string, query: string, limit: number): string {
    const params = new URLSearchParams({
        access_token: accessToken,
        type: 'adinterest',
        q: query,
        limit: String(limit),
    });

    return `https://graph.facebook.com/v22.0/search?${params.toString()}`;
}

function graphErrorMessage(payload: unknown): string {
    const errorPayload = payload as MetaGraphErrorPayload;
    const graphError = errorPayload.error;
    if (!graphError) {
        return 'Unknown Graph API error';
    }

    const pieces = [graphError.type ?? 'GraphError'];
    if (graphError.code !== undefined) {
        pieces.push(`code=${graphError.code}`);
    }
    if (graphError.error_subcode !== undefined) {
        pieces.push(`subcode=${graphError.error_subcode}`);
    }
    if (graphError.error_user_msg) {
        pieces.push(graphError.error_user_msg);
    } else if (graphError.message) {
        pieces.push(graphError.message);
    }

    return pieces.join(' ');
}

async function readMetaNode<TResponse>(path: string, accessToken: string, fields: string): Promise<TResponse> {
    const response = await fetch(buildMetaGraphUrl(path, accessToken, fields), {
        method: 'GET',
        headers: { 'Cache-Control': 'no-store' },
    });

    const payload = await response.json() as unknown;
    if (!response.ok) {
        throw new Error(graphErrorMessage(payload));
    }

    return payload as TResponse;
}

async function postMetaGraphForm<TResponse>(
    path: string,
    accessToken: string,
    form: Record<string, string>,
): Promise<TResponse> {
    const formData = new URLSearchParams({ access_token: accessToken });
    for (const [key, value] of Object.entries(form)) {
        formData.append(key, value);
    }

    const response = await fetch(`https://graph.facebook.com/v22.0/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
    });

    const payload = await response.json() as unknown;
    if (!response.ok) {
        throw new Error(graphErrorMessage(payload));
    }

    return payload as TResponse;
}

export function getMetaAdsConfig(): MetaAdsConfig | null {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
    const adSetId = process.env.META_AD_SET_ID?.trim();
    const pageId = process.env.META_PAGE_ID?.trim();
    const instagramActorId = process.env.META_INSTAGRAM_ACTOR_ID?.trim();

    if (!accessToken || !adAccountId || !pageId) {
        return null;
    }

    return {
        accessToken,
        adAccountId,
        pageId,
        ...(adSetId ? { adSetId } : {}),
        ...(instagramActorId ? { instagramActorId } : {}),
    };
}

export function buildMetaAdsReviewUrl(adAccountId: string, adId: string): string {
    const normalizedAccountId = adAccountId.startsWith('act_') ? adAccountId.slice(4) : adAccountId;
    const params = new URLSearchParams({
        act: normalizedAccountId,
        selected_ad_ids: adId,
    });

    return `https://adsmanager.facebook.com/adsmanager/manage/ads?${params.toString()}`;
}

export interface FacebookPagePostInput {
    /** Caption / message body for the post. */
    message: string;
    /** Optional public image URL. When present the post is created via /photos. */
    imageUrl?: string;
    /** Optional outbound link (e.g. the campaign landing URL) for /feed posts. */
    link?: string;
    /**
     * When false, the post is created unpublished (draft) so an operator can
     * review it on the Page before it goes live. Defaults to false to match the
     * repo's paused-ad / draft-for-approval safety pattern.
     */
    published?: boolean;
}

/**
 * Publish (or stage) an organic post to the configured Facebook Page.
 *
 * - With an image: POST /{page-id}/photos { url, caption, published }.
 *   Returns the photo's parent post id when available, else the photo id.
 * - Without an image: POST /{page-id}/feed { message, link?, published }.
 *
 * This is organic Page posting — distinct from the paid ad path in
 * distribution-marketing.ts which only ever creates paused Ads Manager drafts.
 */
export async function publishFacebookPagePost(
    config: MetaAdsConfig,
    input: FacebookPagePostInput,
): Promise<{ postId: string; published: boolean }> {
    const published = input.published ?? false;

    if (input.imageUrl) {
        const response = await postMetaGraphForm<{ id: string; post_id?: string }>(
            `${config.pageId}/photos`,
            config.accessToken,
            {
                url: input.imageUrl,
                caption: input.message,
                published: String(published),
            },
        );
        const postId = response.post_id ?? response.id;
        if (!postId) {
            throw new Error('Facebook Page /photos did not return a post id');
        }
        return { postId, published };
    }

    const response = await postMetaGraphForm<{ id: string }>(
        `${config.pageId}/feed`,
        config.accessToken,
        {
            message: input.message,
            published: String(published),
            ...(input.link ? { link: input.link } : {}),
        },
    );
    if (!response.id) {
        throw new Error('Facebook Page /feed did not return a post id');
    }
    return { postId: response.id, published };
}

export async function getMetaProviderStatus(): Promise<MetaProviderStatus> {
    const config = getMetaAdsConfig();
    const lastValidatedAt = new Date().toISOString();

    if (!config) {
        const missingVars = [
            'META_ACCESS_TOKEN',
            'META_AD_ACCOUNT_ID',
            'META_PAGE_ID',
        ].filter((name) => !process.env[name]?.trim());

        return {
            provider: 'meta',
            status: 'misconfigured',
            lastValidatedAt,
            warnings: [`Missing env vars: ${missingVars.join(', ')}`],
        };
    }

    const warnings: string[] = [];

    try {
        const [adAccount, page] = await Promise.all([
            readMetaNode<MetaAdAccountResponse>(`act_${config.adAccountId}`, config.accessToken, 'id,name,account_status'),
            readMetaNode<MetaPageResponse>(config.pageId, config.accessToken, 'id,name'),
        ]);

        if (config.instagramActorId) {
            try {
                await readMetaNode<MetaPageResponse>(config.instagramActorId, config.accessToken, 'id,username');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown Instagram actor validation error';
                warnings.push(`instagram_actor_unverified=${message}`);
            }
        } else {
            warnings.push('META_INSTAGRAM_ACTOR_ID not configured; Instagram placement validation skipped.');
        }

        if (!config.adSetId) {
            warnings.push('META_AD_SET_ID not configured; dynamic per-campaign ad set creation will be used.');
        }

        if (adAccount.account_status !== undefined && adAccount.account_status !== 1) {
            warnings.push(`Meta ad account status is ${adAccount.account_status}; Ads Manager may still block draft creation.`);
        }

        return {
            provider: 'meta',
            status: warnings.some((warning) => warning.startsWith('instagram_actor_unverified=')) ? 'unverified' : 'connected',
            accountLabel: adAccount.name ?? page.name,
            accountId: adAccount.id,
            pageId: page.id,
            instagramActorId: config.instagramActorId,
            lastValidatedAt,
            warnings,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown Meta validation error';
        return {
            provider: 'meta',
            status: 'unauthorized',
            accountId: config.adAccountId,
            pageId: config.pageId,
            instagramActorId: config.instagramActorId,
            lastValidatedAt,
            warnings: [message],
        };
    }
}

export async function searchMetaAdInterests(
    accessToken: string,
    query: string,
    limit = 6,
): Promise<MetaInterestSearchResult[]> {
    const response = await fetch(buildMetaGraphSearchUrl(accessToken, query, limit), {
        method: 'GET',
        headers: { 'Cache-Control': 'no-store' },
    });

    const payload = await response.json() as unknown;
    if (!response.ok) {
        throw new Error(graphErrorMessage(payload));
    }

    const parsed = payload as MetaInterestSearchResponse;
    return (parsed.data ?? []).filter((interest) => interest.id && interest.name);
}

export async function createMetaCampaign(
    config: MetaAdsConfig,
    input: MetaCampaignCreateInput,
): Promise<string> {
    // special_ad_categories must be a JSON array — form encoding cannot represent
    // arrays correctly, so this call uses a JSON body instead of form encoding.
    const body = JSON.stringify({
        name: input.name,
        objective: input.objective ?? 'OUTCOME_TRAFFIC',
        status: input.status ?? 'PAUSED',
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
        access_token: config.accessToken,
    });

    const response = await fetch(
        `https://graph.facebook.com/v22.0/act_${config.adAccountId}/campaigns`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        },
    );

    const payload = await response.json() as unknown;
    if (!response.ok) {
        throw new Error(graphErrorMessage(payload));
    }

    return (payload as MetaCreateResponse).id;
}

export async function createMetaAdSet(
    config: MetaAdsConfig,
    input: MetaAdSetCreateInput,
): Promise<string> {
    const response = await postMetaGraphForm<MetaCreateResponse>(
        `act_${config.adAccountId}/adsets`,
        config.accessToken,
        {
            name: input.name,
            campaign_id: input.campaignId,
            daily_budget: String(input.dailyBudgetCents),
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'LANDING_PAGE_VIEWS',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            destination_type: 'WEBSITE',
            targeting: JSON.stringify(input.targeting),
            status: input.status ?? 'PAUSED',
            ...(input.startTime ? { start_time: input.startTime } : {}),
            ...(input.endTime ? { end_time: input.endTime } : {}),
        },
    );

    return response.id;
}
