import { randomUUID } from 'crypto';

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_STATE_COOKIE = 'tiktok_oauth_state';
const TIKTOK_DEFAULT_SCOPES = ['user.info.basic', 'video.upload'] as const;

interface TikTokTokenSuccessResponse {
    access_token: string;
    expires_in: number;
    open_id: string;
    refresh_expires_in: number;
    refresh_token: string;
    scope: string;
    token_type: string;
}

interface TikTokTokenErrorResponse {
    error: string;
    error_description?: string;
    log_id?: string;
}

export interface TikTokTokenExchangeResult {
    accessToken: string;
    accessTokenExpiresAt: string;
    openId: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    scope: string;
    tokenType: string;
}

export interface TikTokAuthConfig {
    clientKey: string;
    clientSecret: string;
    redirectUri: string;
}

function normalizeBaseUrl(rawValue: string): string {
    const trimmed = rawValue.trim();
    const protocolFixed = trimmed.match(/^https?:[^/]/)
        ? trimmed.replace(/^https?:/, (protocol) => `${protocol}//`)
        : trimmed;
    if (protocolFixed.startsWith('http://') || protocolFixed.startsWith('https://')) {
        return protocolFixed.replace(/\/$/, '');
    }

    return `https://${protocolFixed}`.replace(/\/$/, '');
}

export function getTikTokAuthConfig(): TikTokAuthConfig {
    const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    const explicitRedirectUri = process.env.TIKTOK_REDIRECT_URI?.trim();
    const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();

    if (!clientKey || !clientSecret) {
        throw new Error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET');
    }

    const redirectUri = explicitRedirectUri
        ? explicitRedirectUri
        : configuredBaseUrl
            ? `${normalizeBaseUrl(configuredBaseUrl)}/api/integrations/tiktok/callback`
            : '';

    if (!redirectUri) {
        throw new Error('Missing TIKTOK_REDIRECT_URI and NEXT_PUBLIC_APP_URL/VERCEL_URL fallback');
    }

    return {
        clientKey,
        clientSecret,
        redirectUri,
    };
}

export function getTikTokStateCookieName(): string {
    return TIKTOK_STATE_COOKIE;
}

export function createTikTokAuthState(): string {
    return randomUUID();
}

export function buildTikTokAuthorizeUrl(state: string): string {
    const { clientKey, redirectUri } = getTikTokAuthConfig();
    const params = new URLSearchParams({
        client_key: clientKey,
        scope: TIKTOK_DEFAULT_SCOPES.join(','),
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
    });

    return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeTikTokAuthCode(code: string): Promise<TikTokTokenExchangeResult> {
    const { clientKey, clientSecret, redirectUri } = getTikTokAuthConfig();
    const form = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache',
        },
        body: form.toString(),
    });

    const payload = await response.json() as TikTokTokenSuccessResponse | TikTokTokenErrorResponse;
    if (!response.ok || 'error' in payload) {
        const message = 'error_description' in payload && payload.error_description
            ? `${payload.error}: ${payload.error_description}`
            : 'error' in payload
                ? payload.error
                : `TikTok token exchange failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    return {
        accessToken: payload.access_token,
        accessTokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
        openId: payload.open_id,
        refreshToken: payload.refresh_token,
        refreshTokenExpiresAt: new Date(Date.now() + payload.refresh_expires_in * 1000).toISOString(),
        scope: payload.scope,
        tokenType: payload.token_type,
    };
}