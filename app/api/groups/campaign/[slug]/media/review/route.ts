import { NextResponse } from 'next/server';
import { handleMediaAssetReviewRequest } from './core-logic';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json();
    const { status, data } = await handleMediaAssetReviewRequest(slug, body);
    return NextResponse.json(data, { status });
}
