import { NextResponse } from 'next/server';
import { getGoogleProviderStatus } from '@/lib/integrations/google-ads';

export async function GET() {
    const status = await getGoogleProviderStatus();
    return NextResponse.json(status, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
    });
}
