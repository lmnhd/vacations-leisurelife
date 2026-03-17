import { NextResponse } from 'next/server';
import { handleGetAssetCuration, handlePatchAssetCuration } from './core-logic';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const url = new URL(request.url);
    const assetId = url.searchParams.get('assetId');
    if (!assetId) {
        return NextResponse.json({ error: 'assetId query param is required' }, { status: 400 });
    }

    const { status, data } = await handleGetAssetCuration(slug, assetId);
    return NextResponse.json(data, { status });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json();
    const { status, data } = await handlePatchAssetCuration(slug, body);
    return NextResponse.json(data, { status });
}
