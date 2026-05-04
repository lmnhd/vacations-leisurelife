import { NextRequest, NextResponse } from 'next/server';
import { handleChatRequest } from '@/app/api/chat/core-logic';
import { getCampaignLandingBySlug, type CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { chatStorageService } from '@/lib/chat/chat-storage';

export const dynamic = 'force-dynamic';

type RouteContext = {
    params: Promise<{ slug: string }>;
};

type PublicChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    displayName: string;
    content: string;
    createdAt: string;
    isStarterMessage?: boolean;
};

function starterMessages(slug: string, landing: CampaignLandingViewModel): PublicChatMessage[] {
    return [
        {
            id: `${slug}-starter-user`,
            role: 'user',
            displayName: 'Ghost Guest',
            content: landing.designSystem.chat.starterQuestion,
            createdAt: new Date(0).toISOString(),
            isStarterMessage: true,
        },
        {
            id: `${slug}-starter-assistant`,
            role: 'assistant',
            displayName: landing.designSystem.chat.title,
            content: landing.designSystem.chat.starterAnswer,
            createdAt: new Date(0).toISOString(),
            isStarterMessage: true,
        },
    ];
}

function mapConversationTurn(turn: Record<string, unknown>): PublicChatMessage | null {
    const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : null;
    const content = typeof turn.content === 'string' ? turn.content : '';
    const createdAt = typeof turn.createdAt === 'string' ? turn.createdAt : new Date().toISOString();
    const id = typeof turn.turnId === 'string' ? turn.turnId : `${role}-${createdAt}`;

    if (!role || !content) {
        return null;
    }

    return {
        id,
        role,
        displayName: role === 'assistant' ? 'Tour Conductor' : 'Guest',
        content,
        createdAt,
    };
}

async function loadMessages(slug: string, landing: CampaignLandingViewModel): Promise<PublicChatMessage[]> {
    try {
        const turns = await chatStorageService.getConversationTurnsBySession({
            sessionId: landing.designSystem.chat.sessionId,
            limit: 80,
        });
        const persisted = turns
            .map(mapConversationTurn)
            .filter((message): message is PublicChatMessage => Boolean(message));

        return [...starterMessages(slug, landing), ...persisted];
    } catch {
        return starterMessages(slug, landing);
    }
}

function buildCampaignContext(landing: CampaignLandingViewModel): string {
    const facts = landing.facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n');
    const expectations = landing.story.whatToExpect.map((item) => `- ${item}`).join('\n');
    const trust = landing.trustBullets.map((item) => `- ${item}`).join('\n');

    return [
        `Campaign slug: ${landing.slug}`,
        `Campaign title: ${landing.title}`,
        `Campaign status: ${landing.stateLabel} (${landing.state})`,
        `Visual system: ${landing.designSystem.system}`,
        `Visual flavor: ${landing.designSystem.visualFlavor}`,
        `Energy mode: ${landing.designSystem.energyMode}`,
        `Headline: ${landing.heroSlogan}`,
        `Subhead: ${landing.subSlogan}`,
        `Elevator pitch: ${landing.elevatorPitch}`,
        `Pricing: ${landing.pricing.startingPriceLabel} (${landing.pricing.sourceLabel})`,
        `Pricing detail: ${landing.pricing.detail}`,
        `Threshold: ${landing.threshold.joinedEntries} entries / ${landing.threshold.joinedPassengers} passengers toward ${landing.threshold.requiredCabins} cabins (${landing.threshold.percentOfThreshold}%)`,
        `Threshold message: ${landing.threshold.headline} ${landing.threshold.detail}`,
        'Facts:',
        facts,
        'What guests can expect:',
        expectations,
        'Trust and signup rules:',
        trust,
        `Primary CTA: ${landing.ctas.primary.label}`,
        `Secondary CTA: ${landing.ctas.secondary.label}`,
    ].filter(Boolean).join('\n');
}

export async function GET(_request: NextRequest, context: RouteContext) {
    const { slug } = await context.params;
    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });

    if (!result) {
        return NextResponse.json({ success: false, error: `No landing page found for "${slug}".` }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        sessionId: result.landing.designSystem.chat.sessionId,
        messages: await loadMessages(slug, result.landing),
    });
}

export async function POST(request: NextRequest, context: RouteContext) {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({})) as { message?: string; signedUp?: boolean };

    if (body.signedUp !== true) {
        return NextResponse.json({
            success: false,
            error: 'Join updates before sending a message to the Tour Conductor.',
        }, { status: 403 });
    }

    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });
    if (!result) {
        return NextResponse.json({ success: false, error: `No landing page found for "${slug}".` }, { status: 404 });
    }

    const chatResult = await handleChatRequest({
        message: body.message,
        sessionId: result.landing.designSystem.chat.sessionId,
        userId: `campaign-chat:${slug}`,
        channel: 'text',
        startingContext: 'campaign_landing_chat',
        contextBlock: buildCampaignContext(result.landing),
    });

    if (chatResult.status >= 400) {
        return NextResponse.json({ success: false, ...chatResult.data }, { status: chatResult.status });
    }

    return NextResponse.json({
        success: true,
        reply: chatResult.data.reply,
        sessionId: result.landing.designSystem.chat.sessionId,
        messages: await loadMessages(slug, result.landing),
    });
}
