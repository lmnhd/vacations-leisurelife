import { NextResponse } from 'next/server';
import { handleDeleteVideoArtifactRequest } from './core-logic';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json();
    const { status, data } = await handleDeleteVideoArtifactRequest(slug, body);
    return NextResponse.json(data, { status });
}
