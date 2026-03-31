import { NextResponse } from 'next/server';
import {
    buildTikTokAuthorizeUrl,
    createTikTokAuthState,
    getTikTokStateCookieName,
} from '@/lib/integrations/tiktok-auth';

export async function GET() {
    try {
        const state = createTikTokAuthState();
        const authorizeUrl = buildTikTokAuthorizeUrl(state);
        const response = NextResponse.redirect(authorizeUrl);

        response.cookies.set(getTikTokStateCookieName(), state, {
            httpOnly: true,
            sameSite: 'lax',
            secure: true,
            path: '/api/integrations/tiktok/callback',
            maxAge: 60 * 10,
        });

        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start TikTok OAuth flow';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}