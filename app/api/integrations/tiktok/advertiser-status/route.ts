import { NextResponse } from 'next/server';
import { getTikTokAdvertiserStatus } from '@/lib/integrations/tiktok-auth';

export async function GET() {
    const status = getTikTokAdvertiserStatus();
    const httpStatus = status.ready ? 200 : 503;
    return NextResponse.json(status, {
        status: httpStatus,
        headers: { 'Cache-Control': 'no-store' },
    });
}
