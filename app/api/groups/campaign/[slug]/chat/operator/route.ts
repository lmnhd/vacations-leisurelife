import { NextRequest, NextResponse } from 'next/server';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { postTcTurn, type TcTurnChannel } from '@/lib/campaigns/chat/post-tc-turn';
import { chatStorageService } from '@/lib/chat/chat-storage';

export const dynamic = 'force-dynamic';

type RouteContext = {
    params: Promise<{ slug: string }>;
};

const VALID_CHANNELS: TcTurnChannel[] = ['main', 'ideas', 'logistics', 'meetups'];

function normalizeChannel(value: unknown): TcTurnChannel {
    return VALID_CHANNELS.includes(value as TcTurnChannel) ? (value as TcTurnChannel) : 'main';
}

/**
 * Operator-as-Tour-Conductor post.
 *
 * Unlike the public POST `/chat` route (which runs a guest message through the
 * LLM and replies), this writes the operator's text VERBATIM as the Host /
 * Tour Conductor turn — no LLM call. Curtis IS the Tour Conductor here.
 *
 * Auth: this lives under the operator-only `/dashboard` surface and follows
 * the same trust model as the sibling `reset` route (no per-request guest
 * token). If/when these dashboard routes gain a shared operator guard, wire it
 * here too — see the implementation doc.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const { slug } = await context.params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as {
        message?: string;
        channel?: string;
        author?: string;
    };

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
        return NextResponse.json({ success: false, error: 'Message is required.' }, { status: 400 });
    }

    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });
    if (!result) {
        return NextResponse.json({ success: false, error: `No landing page found for "${slug}".` }, { status: 404 });
    }

    const channel = normalizeChannel(body.channel);
    const sessionId = result.landing.designSystem.chat.sessionId;

    try {
        const { turnId, postedAt } = await postTcTurn({
            sessionId,
            content: message,
            channel,
            source: 'operator',
            author: typeof body.author === 'string' ? body.author.trim() || undefined : undefined,
        });

        return NextResponse.json({ success: true, turnId, postedAt, sessionId, channel });
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'Failed to post Tour Conductor message.';
        return NextResponse.json({ success: false, error: detail }, { status: 500 });
    }
}

/**
 * Delete one chat turn by `turnId`.
 *
 * Turns don't carry their own PK/SK as lookup keys (only `turnId`), so this
 * re-reads the session via the sessionId GSI to recover the real Dynamo key
 * before deleting. Starter messages (`isStarterMessage`, synthetic ids like
 * "<slug>-starter-0") aren't persisted rows and can't be deleted this way.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const { slug } = await context.params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as { turnId?: string };
    const turnId = typeof body.turnId === 'string' ? body.turnId.trim() : '';
    if (!turnId) {
        return NextResponse.json({ success: false, error: 'turnId is required.' }, { status: 400 });
    }

    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });
    if (!result) {
        return NextResponse.json({ success: false, error: `No landing page found for "${slug}".` }, { status: 404 });
    }

    const sessionId = result.landing.designSystem.chat.sessionId;
    const turns = await chatStorageService.getConversationTurnsBySession({ sessionId, limit: 200 });
    const turn = turns.find((t) => t.turnId === turnId);

    if (!turn || typeof turn.PK !== 'string' || typeof turn.SK !== 'string') {
        return NextResponse.json({ success: false, error: `No persisted message found with turnId "${turnId}".` }, { status: 404 });
    }

    await chatStorageService.deleteConversationTurn({ PK: turn.PK, SK: turn.SK });

    return NextResponse.json({ success: true, turnId });
}
