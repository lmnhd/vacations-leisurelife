/**
 * Alumni Rebooking Invite — Phase 5
 *
 * POST /api/groups/campaign/[slug]/alumni-invite
 *   body: {
 *     sources: Array<{ slug: string; convertedOnly?: boolean }>,
 *     pitch?: string,
 *     alumniWindow?: string,
 *     operatorNote?: string,
 *     dryRun?: boolean
 *   }
 *
 * The route's `[slug]` is the **target** campaign (the new sailing being
 * offered). The body's `sources` are the past campaigns whose converted
 * guests will be invited.
 *
 * The orchestrator de-duplicates recipients across source campaigns, so a
 * guest who sailed twice with us gets one invite, not two.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { sendAlumniInvite } from '@/lib/campaigns/email/email-event-orchestrator';

export const dynamic = 'force-dynamic';

const SourceSchema = z.object({
    slug: z.string().trim().min(1).max(120),
    convertedOnly: z.boolean().optional().default(true),
});

const BodySchema = z.object({
    sources: z.array(SourceSchema).min(1).max(20),
    pitch: z.string().trim().max(240).optional(),
    alumniWindow: z.string().trim().max(120).optional(),
    operatorNote: z.string().trim().max(500).optional(),
    dryRun: z.boolean().optional().default(false),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Target campaign slug is required.' }, { status: 400 });
    }

    const target = await getCampaignBlueprint(slug);
    if (!target) {
        return NextResponse.json(
            { success: false, error: `No target campaign found with slug: "${slug}".` },
            { status: 404 },
        );
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid alumni-invite body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    if (parsed.data.sources.some((s) => s.slug === slug)) {
        return NextResponse.json(
            { success: false, error: 'A campaign cannot invite alumni from itself.' },
            { status: 400 },
        );
    }

    try {
        const result = await sendAlumniInvite({
            targetCampaignSlug: slug,
            sources: parsed.data.sources,
            pitch: parsed.data.pitch,
            alumniWindow: parsed.data.alumniWindow,
            operatorNote: parsed.data.operatorNote,
            dryRun: parsed.data.dryRun,
        });
        return NextResponse.json({ success: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[AlumniInvite] failed target=${slug}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
