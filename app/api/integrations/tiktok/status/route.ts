import { NextResponse } from 'next/server';
import { getTikTokProviderStatus } from '@/lib/integrations/tiktok-auth';

export async function GET() {
    const status = await getTikTokProviderStatus();
    return NextResponse.json(status, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
    });
}
