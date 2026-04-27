import { NextResponse } from 'next/server';
import { getGoogleProviderStatus, refreshGoogleToken } from '@/lib/integrations/google-ads';

export async function POST() {
    try {
        const refreshed = await refreshGoogleToken();
        const status = await getGoogleProviderStatus();

        return NextResponse.json({
            ok: true,
            message: 'Google Ads token refreshed successfully.',
            refreshed: {
                accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
                scope: refreshed.scope,
            },
            status,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Google token refresh failed',
        }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
}
