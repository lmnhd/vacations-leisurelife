import { NextResponse } from 'next/server';
import { getMetaProviderStatus } from '@/lib/integrations/meta-ads';

export async function GET() {
    const status = await getMetaProviderStatus();
    const httpStatus = status.status === 'connected' ? 200 : status.status === 'unverified' ? 207 : 503;

    return NextResponse.json(status, {
        status: httpStatus,
        headers: { 'Cache-Control': 'no-store' },
    });
}