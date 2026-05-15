/**
 * Campaign Email Preview API
 *
 * GET  /api/groups/campaign/[slug]/email-preview?email=...&stage=...
 *     Returns the exact Klaviyo profile + event payloads that would be sent
 *     for the given (lead, stage) pair. Does NOT call Klaviyo and does NOT
 *     write to the lead event ledger. Safe to call from the operator
 *     /tests/klaviyo-emails surface.
 *
 * GET  /api/groups/campaign/[slug]/email-preview?list=leads
 *     Returns a lightweight list of waitlist entries (email + first name)
 *     so the operator UI can populate its lead picker.
 *
 * POST /api/groups/campaign/[slug]/email-preview
 *     body: { email, stage, dryRun? }
 *     Dispatches the event for real (or in dryRun mode). Wraps
 *     `dispatchEmailEvent` so the operator can trigger a live test send from
 *     the preview page after reviewing the payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    buildEmailEventPreview,
    dispatchEmailEvent,
} from '@/lib/campaigns/email/email-event-orchestrator';
import { ALL_IMPLEMENTED_STAGES, type EmailEventStage } from '@/lib/campaigns/email/email-event-types';
import { listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';

export const dynamic = 'force-dynamic';

const StageSchema = z.enum([
    'waitlist_confirmation',
    'nurture_day3',
    'nurture_day7',
    'threshold_met',
    'manifest_requested',
    'manifest_reminder',
    'booking_link_ready',
    'campaign_expired',
]);

const Phase2Schema = z.object({
    manifestDeadline: z.string().trim().min(1).optional(),
    manifestUrl: z.string().url().optional(),
    adjacentCampaignsUrl: z.string().url().optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const Phase3Schema = z.object({
    daysToSail: z.number().int().optional(),
    scheduledOffset: z.number().int().optional(),
    packingListUrl: z.string().url().optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const Phase4Schema = z.object({
    changeId: z.string().trim().min(1).max(120).optional(),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'positive']).optional(),
    changeType: z.string().trim().min(1).max(80).optional(),
    previousValue: z.string().trim().min(1).max(500).optional(),
    newValue: z.string().trim().min(1).max(500).optional(),
    summary: z.string().trim().min(1).max(240).optional(),
    actionRequired: z.boolean().optional(),
    actionDeadline: z.string().trim().min(1).max(120).optional(),
    supportContact: z.string().trim().min(1).max(160).optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const PostBodySchema = z.object({
    email: z.string().email(),
    stage: StageSchema,
    dryRun: z.boolean().optional().default(false),
    phase2: Phase2Schema,
    phase3: Phase3Schema,
    phase4: Phase4Schema,
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json(
            { success: false, error: `No campaign found with slug: "${slug}".` },
            { status: 404 },
        );
    }

    const list = request.nextUrl.searchParams.get('list');
    if (list === 'leads') {
        const entries = await listCampaignWaitlistEntries(slug);
        return NextResponse.json({
            success: true,
            campaignSlug: slug,
            campaignName: campaign.name,
            leads: entries.map((e) => ({
                email: e.email,
                firstName: e.firstName,
                lastName: e.lastName,
                bookingMode: e.bookingMode ?? null,
                createdAt: e.createdAt,
            })),
        });
    }

    const email = request.nextUrl.searchParams.get('email');
    const rawStage = request.nextUrl.searchParams.get('stage');
    if (!email || !rawStage) {
        return NextResponse.json(
            {
                success: false,
                error: 'Both ?email and ?stage are required.',
                supportedStages: ALL_IMPLEMENTED_STAGES,
            },
            { status: 400 },
        );
    }

    const stageParse = StageSchema.safeParse(rawStage);
    if (!stageParse.success) {
        return NextResponse.json(
            { success: false, error: `Invalid stage "${rawStage}".`, supportedStages: ALL_IMPLEMENTED_STAGES },
            { status: 400 },
        );
    }

    // Phase 2 + Phase 3 overrides accepted as query params so the preview UI
    // can round-trip without a POST body. Unknown keys are ignored.
    const phase2 = {
        manifestDeadline: request.nextUrl.searchParams.get('manifestDeadline') || undefined,
        manifestUrl: request.nextUrl.searchParams.get('manifestUrl') || undefined,
        adjacentCampaignsUrl: request.nextUrl.searchParams.get('adjacentCampaignsUrl') || undefined,
        operatorNote: request.nextUrl.searchParams.get('operatorNote') || undefined,
    };
    const rawOffset = request.nextUrl.searchParams.get('scheduledOffset');
    const scheduledOffset = rawOffset && !Number.isNaN(Number(rawOffset)) ? Number(rawOffset) : undefined;
    const phase3 = {
        scheduledOffset,
        packingListUrl: request.nextUrl.searchParams.get('packingListUrl') || undefined,
        operatorNote: request.nextUrl.searchParams.get('operatorNote') || undefined,
    };
    const rawSeverity = request.nextUrl.searchParams.get('severity');
    const phase4 = {
        severity:
            rawSeverity && ['critical', 'high', 'medium', 'low', 'positive'].includes(rawSeverity)
                ? (rawSeverity as 'critical' | 'high' | 'medium' | 'low' | 'positive')
                : undefined,
        changeType: request.nextUrl.searchParams.get('changeType') || undefined,
        previousValue: request.nextUrl.searchParams.get('previousValue') || undefined,
        newValue: request.nextUrl.searchParams.get('newValue') || undefined,
        summary: request.nextUrl.searchParams.get('changeSummary') || undefined,
        actionRequired: request.nextUrl.searchParams.get('actionRequired') === '1' || undefined,
        actionDeadline: request.nextUrl.searchParams.get('actionDeadline') || undefined,
        supportContact: request.nextUrl.searchParams.get('supportContact') || undefined,
        operatorNote: request.nextUrl.searchParams.get('operatorNote') || undefined,
    };

    try {
        const preview = await buildEmailEventPreview(
            slug,
            email,
            stageParse.data as EmailEventStage,
            { phase2, phase3, phase4 },
        );
        return NextResponse.json({ success: true, preview });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = PostBodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid request body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    try {
        await dispatchEmailEvent(slug, parsed.data.email, parsed.data.stage, {
            dryRun: parsed.data.dryRun,
            phase2: parsed.data.phase2,
            phase3: parsed.data.phase3,
            phase4: parsed.data.phase4,
        });
        return NextResponse.json({
            success: true,
            campaignSlug: slug,
            email: parsed.data.email,
            stage: parsed.data.stage,
            dryRun: parsed.data.dryRun,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(
            `[EmailPreview] dispatch failed campaign=${slug} email=${parsed.data.email} stage=${parsed.data.stage}:`,
            err,
        );
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
