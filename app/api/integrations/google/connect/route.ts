import { NextResponse } from 'next/server';
import { buildGoogleAuthorizeUrl, createGoogleAuthState, getGoogleAdsConfig, getGoogleStateCookieName } from '@/lib/integrations/google-ads';

export async function GET() {
    try {
        const config = getGoogleAdsConfig();
        if (!config) {
            return NextResponse.json({ error: 'Google Ads is not configured. Check GOOGLE_ADS_* env vars.' }, { status: 503 });
        }

        const state = createGoogleAuthState();
        const authorizeUrl = buildGoogleAuthorizeUrl(state, config);
        const response = NextResponse.redirect(authorizeUrl);

        response.cookies.set(getGoogleStateCookieName(), state, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/api/integrations/google/callback',
            maxAge: 60 * 10,
        });

        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start Google OAuth flow';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
