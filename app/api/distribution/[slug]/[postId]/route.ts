import { NextRequest, NextResponse } from 'next/server';
import { dispatchPost } from '@/lib/campaigns/distribution/dispatcher';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string; postId: string }> }
) {
    try {
        const resolvedParams = await params;
        const { slug, postId } = resolvedParams;
        
        // Optional body overrides (e.g. force trigger)
        let force = false;
        try {
            const body = await request.json();
            if (body.force === true) force = true;
        } catch {
            // Ignore JSON parse errors for empty body
        }

        console.log(`[DISTRIBUTION-MANUAL] Manual trigger for campaign ${slug}, post ${postId}. Force: ${force}`);

        const result = await dispatchPost(slug, postId, { force });

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({ 
            success: true, 
            externalPostId: result.externalPostId 
        });

    } catch (error: any) {
        console.error('[DISTRIBUTION-MANUAL] Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
