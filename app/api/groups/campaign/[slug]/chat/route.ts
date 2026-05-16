import { NextRequest, NextResponse, after } from 'next/server';
import { handleChatRequest } from '@/app/api/chat/core-logic';
import { getCampaignLandingBySlug, type CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { buildCampaignResearchDossierContext } from '@/lib/campaigns/research-context';
import { getCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';
import { chatStorageService } from '@/lib/chat/chat-storage';
import { extractAndSaveIdea } from '@/lib/campaigns/guest-ideas';

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
    channel?: 'main' | 'ideas' | 'logistics' | 'meetups';
    isStarterMessage?: boolean;
};

function starterMessages(slug: string, landing: CampaignLandingViewModel): PublicChatMessage[] {
    return landing.designSystem.chat.starterConversation.map((turn, i) => ({
        id: `${slug}-starter-${i}`,
        role: turn.role,
        displayName: turn.role === 'assistant' ? landing.designSystem.chat.title : 'guest_123',
        content: turn.content,
        createdAt: new Date(0).toISOString(),
        channel: turn.channel ?? 'main',
        isStarterMessage: true,
    }));
}

function mapConversationTurn(turn: Record<string, unknown>): PublicChatMessage | null {
    const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : null;
    const content = typeof turn.content === 'string' ? turn.content : '';
    const createdAt = typeof turn.createdAt === 'string' ? turn.createdAt : new Date().toISOString();
    const id = typeof turn.turnId === 'string' ? turn.turnId : `${role}-${createdAt}`;

    if (!role || !content) {
        return null;
    }

    // Use displayName stored on the turn if present; otherwise fall back to role defaults.
    const storedName = typeof turn.displayName === 'string' ? turn.displayName.trim() : '';
    const displayName = role === 'assistant'
        ? 'Tour Conductor'
        : (storedName || 'Guest');
    const threadChannelRaw = typeof turn.threadChannel === 'string' ? turn.threadChannel : '';
    const channel = (
        threadChannelRaw === 'main' ||
        threadChannelRaw === 'ideas' ||
        threadChannelRaw === 'logistics' ||
        threadChannelRaw === 'meetups'
    ) ? threadChannelRaw : 'main';

    return {
        id,
        role,
        displayName,
        content,
        createdAt,
        channel,
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

function buildChannelGuidance(
    threadChannel: 'main' | 'ideas' | 'logistics' | 'meetups',
): string {
    switch (threadChannel) {
        case 'ideas':
            return [
                'Channel guidance:',
                '- This is the ideas room. Guests drop ideas; you capture them.',
                '- Acknowledge the idea in one sentence, confirm it is noted, then stop.',
                '- HARD LIMIT: 1-2 sentences max. No lists. No questions.',
                '- HARD LIMIT: Do not ask follow-up questions. Do not invite the guest to elaborate or keep talking.',
                '- HARD LIMIT: Never invent excursion names, prices, durations, or port details not provided to you.',
                '- If an idea is too vague to capture, name what you did capture and close. Do not probe for more.',
            ].join('\n');
        case 'logistics':
            return [
                'Channel guidance:',
                '- This is the logistics room.',
                '- Answer the question directly using only confirmed campaign data. Then stop.',
                '- HARD LIMIT: 1-3 sentences. No lists unless the guest asks for them.',
                '- HARD LIMIT: Do not ask follow-up questions. Do not invite more conversation.',
                '- If the answer is unknown, say so in one sentence and close.',
            ].join('\n');
        case 'meetups':
            return [
                'Channel guidance:',
                '- This is the meetups room. Guests post meetup intentions; you log them.',
                '- Acknowledge in one sentence and close. Do not build on the idea or ask questions.',
                '- HARD LIMIT: 1-2 sentences. No questions. No elaboration.',
                '- HARD LIMIT: Do not invite the guest to keep talking.',
                '- Keep expectations soft and optional, never mandatory.',
            ].join('\n');
        case 'main':
        default:
            return [
                'Channel guidance:',
                '- This is the main room.',
                '- Give the best short general answer, then gently point people toward ideas, logistics, or meetups when helpful.',
            ].join('\n');
    }
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

/**
 * Decode a guest token issued by the waitlist API.
 * Token format: base64url(slug:email). Returns null for invalid/mismatched tokens.
 */
function decodeGuestToken(slug: string, token: string): { email: string } | null {
    try {
        const decoded = Buffer.from(token, 'base64url').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx === -1) return null;
        const tokenSlug = decoded.slice(0, colonIdx);
        const email = decoded.slice(colonIdx + 1);
        // Ensure the token was issued for this campaign, not another one.
        if (tokenSlug !== slug || !email.includes('@')) return null;
        return { email };
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest, context: RouteContext) {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({})) as {
        message?: string;
        guestToken?: string;
        displayName?: string;
        channel?: string;
        /** @deprecated Use guestToken. Kept for backward compat with old clients. */
        signedUp?: boolean;
    };

    // Chat access is now gated by a verified waitlist entry. The legacy
    // signedUp flag is kept only so older clients fail closed instead of
    // accidentally bypassing the check.
    const decodedToken = typeof body.guestToken === 'string' ? decodeGuestToken(slug, body.guestToken) : null;
    const hasValidToken = !!decodedToken;
    const hasLegacyFlag = body.signedUp === true;

    if (!hasValidToken && !hasLegacyFlag) {
        return NextResponse.json({
            success: false,
            error: 'Save your spot on this voyage to talk to the Tour Conductor.',
        }, { status: 403 });
    }

    if (!hasValidToken) {
        return NextResponse.json({
            success: false,
            error: 'Verify your email before talking to the Tour Conductor.',
        }, { status: 403 });
    }

    const waitlistEntry = decodedToken
        ? await getCampaignWaitlistEntry(slug, decodedToken.email)
        : null;

    if (!waitlistEntry?.emailVerified) {
        return NextResponse.json({
            success: false,
            error: 'Verify your email before talking to the Tour Conductor.',
        }, { status: 403 });
    }

    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });
    if (!result) {
        return NextResponse.json({ success: false, error: `No landing page found for "${slug}".` }, { status: 404 });
    }

    // Use the display name from the token payload if provided; fall back to "Guest".
    const displayName = (typeof body.displayName === 'string' && body.displayName.trim())
        ? body.displayName.trim()
        : 'Guest';
    const threadChannel = body.channel === 'ideas' || body.channel === 'logistics' || body.channel === 'meetups'
        ? body.channel
        : 'main';

    const campaignContext = buildCampaignContext(result.landing);
    const researchContext = buildCampaignResearchDossierContext(result.campaign.researchDossier);
    const guestLine = displayName !== 'Guest' ? `\nGuest name: ${displayName}` : '';
    const channelLine = `\nActive room channel: ${threadChannel}`;
    const channelGuidance = `\n${buildChannelGuidance(threadChannel)}`;
    const contextSections = [campaignContext, researchContext].filter(Boolean).join('\n\n');

    const chatResult = await handleChatRequest({
        message: body.message,
        sessionId: result.landing.designSystem.chat.sessionId,
        userId: body.guestToken ? `guest:${body.guestToken}` : `campaign-chat:${slug}`,
        channel: 'text',
        threadChannel,
        displayName,
        startingContext: 'campaign_landing_chat',
        contextBlock: `${contextSections}${guestLine}${channelLine}${channelGuidance}`,
    });

    if (chatResult.status >= 400) {
        return NextResponse.json({ success: false, ...chatResult.data }, { status: chatResult.status });
    }

    // Schedule extraction to run after the response is sent so the serverless
    // function stays alive long enough to complete the LLM call + DynamoDB write.
    if (threadChannel === 'ideas' && typeof body.message === 'string' && body.message.trim()) {
        const msgToExtract = body.message.trim();
        after(async () => {
            await extractAndSaveIdea(slug, msgToExtract, displayName).catch(() => {});
        });
    }

    return NextResponse.json({
        success: true,
        reply: chatResult.data.reply,
        sessionId: result.landing.designSystem.chat.sessionId,
        messages: await loadMessages(slug, result.landing),
    });
}
