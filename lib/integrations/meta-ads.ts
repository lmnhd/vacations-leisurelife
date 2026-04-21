interface MetaGraphErrorPayload {
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
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
    adSetId: string;
    pageId: string;
    instagramActorId?: string;
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
    if (graphError.message) {
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

export function getMetaAdsConfig(): MetaAdsConfig | null {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
    const adSetId = process.env.META_AD_SET_ID?.trim();
    const pageId = process.env.META_PAGE_ID?.trim();
    const instagramActorId = process.env.META_INSTAGRAM_ACTOR_ID?.trim();

    if (!accessToken || !adAccountId || !adSetId || !pageId) {
        return null;
    }

    return {
        accessToken,
        adAccountId,
        adSetId,
        pageId,
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

export async function getMetaProviderStatus(): Promise<MetaProviderStatus> {
    const config = getMetaAdsConfig();
    const lastValidatedAt = new Date().toISOString();

    if (!config) {
        const missingVars = [
            'META_ACCESS_TOKEN',
            'META_AD_ACCOUNT_ID',
            'META_AD_SET_ID',
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