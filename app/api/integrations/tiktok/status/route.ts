import { NextResponse } from 'next/server';
import { getTikTokProviderStatus } from '@/lib/integrations/tiktok-auth';

export async function GET() {
    const status = getTikTokProviderStatus();
    return NextResponse.json(status, {
        status: status.ready ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
    });
}
