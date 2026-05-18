import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';

export const dynamic = 'force-dynamic';

const ResumeRequestSchema = z.object({
    email: z.string().email(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = ResumeRequestSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Please enter a valid email address.' },
            { status: 400 },
        );
    }

    const entry = await getCampaignWaitlistEntry(slug, parsed.data.email);
    if (!entry) {
        return NextResponse.json(
            { success: false, error: 'We could not find a signup for that email on this campaign.' },
            { status: 404 },
        );
    }

    if (!entry.emailVerified) {
        return NextResponse.json(
            {
                success: false,
                error: 'That email is on file, but it still needs verification before chat unlocks.',
            },
            { status: 409 },
        );
    }

    const guestToken = Buffer.from(`${slug}:${entry.email}`).toString('base64url');
    const displayName = `${entry.firstName} ${entry.lastName.charAt(0)}.`;

    return NextResponse.json({
        success: true,
        guestToken,
        displayName,
        emailVerified: true,
    });
}
