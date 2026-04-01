import { randomUUID } from 'crypto';

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// Number of seconds before expiry at which we consider the token "near expiry"
const TOKEN_EXPIRY_BUFFER_SECONDS = 300;
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

// ---------------------------------------------------------------------------
// Persisted token contract
// ---------------------------------------------------------------------------

/**
 * Normalized shape for TikTok credentials loaded from environment variables.
 * Set TIKTOK_ACCOUNT_LABEL=business (default: personal_test) to indicate the
 * token set belongs to the Leisure Life Interactive business account.
 */
export interface TikTokCredentials {
    clientKey: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    openId: string;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    scope: string | null;
    /** 'personal_test' until the LLI business account completes its own OAuth flow */
    accountLabel: 'personal_test' | 'business';
}

/**
 * Reads TikTok credentials from environment variables.
 * Throws if any required credential is missing.
 */
export function loadTikTokCredentials(): TikTokCredentials {
    const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN?.trim();
    const refreshToken = process.env.TIKTOK_REFRESH_TOKEN?.trim();
    const openId = process.env.TIKTOK_OPEN_ID?.trim();

    if (!clientKey || !clientSecret) {
        throw new Error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET');
    }
    if (!accessToken || !refreshToken || !openId) {
        throw new Error('Missing TIKTOK_ACCESS_TOKEN, TIKTOK_REFRESH_TOKEN, or TIKTOK_OPEN_ID — run /api/integrations/tiktok/connect to authorize');
    }

    const rawLabel = process.env.TIKTOK_ACCOUNT_LABEL?.trim().toLowerCase();
    const accountLabel: TikTokCredentials['accountLabel'] = rawLabel === 'business' ? 'business' : 'personal_test';

    return {
        clientKey,
        clientSecret,
        accessToken,
        refreshToken,
        openId,
        accessTokenExpiresAt: process.env.TIKTOK_ACCESS_TOKEN_EXPIRES_AT?.trim() ?? null,
        refreshTokenExpiresAt: process.env.TIKTOK_REFRESH_TOKEN_EXPIRES_AT?.trim() ?? null,
        scope: process.env.TIKTOK_SCOPE?.trim() ?? null,
        accountLabel,
    };
}

/**
 * Returns true when the token is expired or will expire within the buffer window.
 * Returns false when expiresAt is null (expiry unknown — treat as still valid).
 */
export function isTokenNearExpiry(expiresAt: string | null): boolean {
    if (!expiresAt) {
        return false;
    }
    const expiryMs = new Date(expiresAt).getTime();
    return Date.now() >= expiryMs - TOKEN_EXPIRY_BUFFER_SECONDS * 1000;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Exchanges a refresh token for a new access + refresh token pair.
 * Persist the returned accessToken, accessTokenExpiresAt, refreshToken,
 * and refreshTokenExpiresAt back to your env / secret store.
 */
export async function refreshTikTokAccessToken(refreshToken: string): Promise<TikTokTokenExchangeResult> {
    const { clientKey, clientSecret } = getTikTokAuthConfig();
    const form = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
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
                : `TikTok token refresh failed with HTTP ${response.status}`;
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

// ---------------------------------------------------------------------------
// Provider status
// ---------------------------------------------------------------------------

export type TikTokProviderStatus =
    | { ready: false; reason: 'missing_credentials'; detail: string }
    | { ready: false; reason: 'token_expired'; expiredAt: string; canRefresh: boolean }
    | {
        ready: true;
        openId: string;
        accountLabel: TikTokCredentials['accountLabel'];
        isPersonalTestAccount: boolean;
        accessTokenExpiresAt: string | null;
        scope: string | null;
      };

/**
 * Returns a structured readiness report for the TikTok provider.
 * Call this before attempting a live TikTok publish action.
 */
export function getTikTokProviderStatus(): TikTokProviderStatus {
    let credentials: TikTokCredentials;
    try {
        credentials = loadTikTokCredentials();
    } catch (error) {
        return {
            ready: false,
            reason: 'missing_credentials',
            detail: error instanceof Error ? error.message : 'Unknown credential error',
        };
    }

    if (isTokenNearExpiry(credentials.accessTokenExpiresAt)) {
        return {
            ready: false,
            reason: 'token_expired',
            expiredAt: credentials.accessTokenExpiresAt ?? 'unknown',
            canRefresh: Boolean(credentials.refreshToken) && !isTokenNearExpiry(credentials.refreshTokenExpiresAt),
        };
    }

    return {
        ready: true,
        openId: credentials.openId,
        accountLabel: credentials.accountLabel,
        isPersonalTestAccount: credentials.accountLabel === 'personal_test',
        accessTokenExpiresAt: credentials.accessTokenExpiresAt,
        scope: credentials.scope,
    };
}