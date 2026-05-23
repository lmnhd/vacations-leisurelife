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

// Derive from ALL_IMPLEMENTED_STAGES so this gate cannot drift behind the
// orchestrator when new phases ship. zod needs a non-empty tuple of literals.
const StageSchema = z.enum(
    ALL_IMPLEMENTED_STAGES as unknown as [EmailEventStage, ...EmailEventStage[]],
);

const Phase2Schema = z.object({
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

const Phase5Schema = z.object({
    daysSinceDisembark: z.number().int().optional(),
    scheduledOffset: z.number().int().optional(),
    photoShareUrl: z.string().url().optional(),
    surveyUrl: z.string().url().optional(),
    targetCampaignSlug: z.string().trim().min(1).max(120).optional(),
    targetCampaignName: z.string().trim().min(1).max(160).optional(),
    targetLandingUrl: z.string().url().optional(),
    targetSailDate: z.string().trim().min(1).max(120).optional(),
    targetPitch: z.string().trim().min(1).max(240).optional(),
    alumniWindow: z.string().trim().min(1).max(120).optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const PostBodySchema = z.object({
    email: z.string().email(),
    stage: StageSchema,
    dryRun: z.boolean().optional().default(false),
    // Operator-only escape hatch for the nurture_day3 / nurture_day7 progress
    // gate. Surfaced in the test page as a checkbox. Production paths must not
    // set this.
    bypassNurtureGate: z.boolean().optional().default(false),
    phase2: Phase2Schema,
    phase3: Phase3Schema,
    phase4: Phase4Schema,
    phase5: Phase5Schema,
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
    const rawDaysSinceDisembark = request.nextUrl.searchParams.get('daysSinceDisembark');
    const daysSinceDisembark = rawDaysSinceDisembark && !Number.isNaN(Number(rawDaysSinceDisembark))
        ? Number(rawDaysSinceDisembark)
        : undefined;
    const rawPhase5Offset = request.nextUrl.searchParams.get('phase5ScheduledOffset');
    const phase5ScheduledOffset = rawPhase5Offset && !Number.isNaN(Number(rawPhase5Offset))
        ? Number(rawPhase5Offset)
        : undefined;
    const phase5 = {
        daysSinceDisembark,
        scheduledOffset: phase5ScheduledOffset,
        photoShareUrl: request.nextUrl.searchParams.get('photoShareUrl') || undefined,
        surveyUrl: request.nextUrl.searchParams.get('surveyUrl') || undefined,
        targetCampaignSlug: request.nextUrl.searchParams.get('targetCampaignSlug') || undefined,
        targetCampaignName: request.nextUrl.searchParams.get('targetCampaignName') || undefined,
        targetLandingUrl: request.nextUrl.searchParams.get('targetLandingUrl') || undefined,
        targetSailDate: request.nextUrl.searchParams.get('targetSailDate') || undefined,
        targetPitch: request.nextUrl.searchParams.get('targetPitch') || undefined,
        alumniWindow: request.nextUrl.searchParams.get('alumniWindow') || undefined,
        operatorNote: request.nextUrl.searchParams.get('operatorNote') || undefined,
    };

    try {
        const preview = await buildEmailEventPreview(
            slug,
            email,
            stageParse.data as EmailEventStage,
            { phase2, phase3, phase4, phase5 },
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
            bypassNurtureGate: parsed.data.bypassNurtureGate,
            phase2: parsed.data.phase2,
            phase3: parsed.data.phase3,
            phase4: parsed.data.phase4,
            phase5: parsed.data.phase5,
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
