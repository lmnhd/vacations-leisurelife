import { NextResponse } from 'next/server';
import { getTikTokProviderStatus, refreshStoredTikTokCredentials } from '@/lib/integrations/tiktok-auth';

export async function POST() {
    try {
        const refreshed = await refreshStoredTikTokCredentials();
        const status = await getTikTokProviderStatus();

        return NextResponse.json({
            ok: true,
            message: 'TikTok token refreshed successfully.',
            refreshed: {
                openId: refreshed.openId,
                accountLabel: refreshed.accountLabel,
                accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
                refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
                scope: refreshed.scope,
            },
            status,
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'TikTok token refresh failed',
        }, {
            status: 400,
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}