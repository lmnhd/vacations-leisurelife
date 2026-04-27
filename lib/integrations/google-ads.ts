import { randomUUID } from 'crypto';
import { loadProviderToken, upsertProviderToken } from '@/lib/integrations/provider-token-store';

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const GOOGLE_STATE_COOKIE = 'google_oauth_state';
const TOKEN_EXPIRY_BUFFER_MS = 300_000;

export interface GoogleAdsConfig {
    clientId: string;
    clientSecret: string;
    developerToken: string;
    customerId: string;
    managerId: string | null;
    redirectUri: string;
}

export interface GoogleAdsProviderStatus {
    ready: boolean;
    reason?: string;
    detail?: string;
    expiredAt?: string;
    canRefresh?: boolean;
    accountLabel?: string;
    accessTokenExpiresAt?: string | null;
    scope?: string | null;
    hasAdWordsScope?: boolean;
}

export function getGoogleAdsConfig(): GoogleAdsConfig | null {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.trim()?.replace(/-/g, '');
    const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI?.trim();
    const managerId = process.env.GOOGLE_ADS_MANAGER_ID?.trim()?.replace(/-/g, '') || null;

    if (!clientId || !clientSecret || !developerToken || !customerId || !redirectUri) return null;

    return { clientId, clientSecret, developerToken, customerId, managerId, redirectUri };
}

export function getGoogleStateCookieName(): string {
    return GOOGLE_STATE_COOKIE;
}

export function createGoogleAuthState(): string {
    return randomUUID();
}

export function buildGoogleAuthorizeUrl(state: string, config: GoogleAdsConfig): string {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: GOOGLE_ADS_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
    });
    return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface GoogleTokenSuccessResponse {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
}

interface GoogleTokenErrorResponse {
    error: string;
    error_description?: string;
}

export interface GoogleTokenExchangeResult {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    scope: string;
}

export async function exchangeGoogleAuthCode(code: string, config: GoogleAdsConfig): Promise<GoogleTokenExchangeResult> {
    const body = new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    const payload = await response.json() as GoogleTokenSuccessResponse | GoogleTokenErrorResponse;

    if (!response.ok || 'error' in payload) {
        const err = payload as GoogleTokenErrorResponse;
        throw new Error(`Google token exchange failed: ${err.error} — ${err.error_description ?? 'no description'}`);
    }

    const token = payload as GoogleTokenSuccessResponse;
    if (!token.refresh_token) {
        throw new Error('Google did not return a refresh_token. Ensure access_type=offline and prompt=consent are set.');
    }

    return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scope: token.scope,
    };
}

export async function persistGoogleToken(result: GoogleTokenExchangeResult): Promise<void> {
    await upsertProviderToken('google', 'business', {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        openId: 'google',
        scope: result.scope,
        accessTokenExpiresAt: new Date(result.accessTokenExpiresAt),
        refreshTokenExpiresAt: null,
        lastRefreshedAt: null,
    });
}

export async function refreshGoogleToken(): Promise<GoogleTokenExchangeResult> {
    const config = getGoogleAdsConfig();
    if (!config) throw new Error('Google Ads config missing. Check GOOGLE_ADS_* env vars.');

    const tokenRecord = await loadProviderToken('google', 'business');
    if (!tokenRecord?.refreshToken) throw new Error('No stored Google refresh token to refresh with.');

    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokenRecord.refreshToken,
        grant_type: 'refresh_token',
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    const payload = await response.json() as GoogleTokenSuccessResponse | GoogleTokenErrorResponse;
    if (!response.ok || 'error' in payload) {
        const err = payload as GoogleTokenErrorResponse;
        throw new Error(`Google token refresh failed: ${err.error} — ${err.error_description ?? 'no description'}`);
    }

    const token = payload as GoogleTokenSuccessResponse;
    const result: GoogleTokenExchangeResult = {
        accessToken: token.access_token,
        refreshToken: tokenRecord.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scope: token.scope,
    };

    await persistGoogleToken(result);
    return result;
}

export async function getGoogleProviderStatus(): Promise<GoogleAdsProviderStatus> {
    const config = getGoogleAdsConfig();

    if (!config) {
        const missing = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_REDIRECT_URI']
            .filter((v) => !process.env[v]?.trim());
        return { ready: false, reason: 'misconfigured', detail: `Missing env vars: ${missing.join(', ')}` };
    }

    const tokenRecord = await loadProviderToken('google', 'business');
    if (!tokenRecord) {
        return { ready: false, reason: 'not_connected', detail: 'No token stored. Visit /api/integrations/google/connect to authorize.' };
    }

    const now = Date.now();
    const accessExpiresAt = tokenRecord.accessTokenExpiresAt;
    const isAccessExpired = accessExpiresAt ? accessExpiresAt.getTime() - now < TOKEN_EXPIRY_BUFFER_MS : false;

    return {
        ready: true,
        accountLabel: tokenRecord.accountLabel,
        accessTokenExpiresAt: accessExpiresAt?.toISOString() ?? null,
        canRefresh: !isAccessExpired,
        scope: tokenRecord.scope,
        hasAdWordsScope: tokenRecord.scope?.includes('adwords') ?? false,
    };
}
