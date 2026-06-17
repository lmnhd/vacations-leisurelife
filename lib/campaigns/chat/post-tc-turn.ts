/**
 * post-tc-turn — the single writer for non-reactive Tour Conductor messages.
 *
 * Both the operator dashboard (Curtis posting live as the TC) and the
 * autonomous TC Pulse engine write through here. Every guest-reply turn is
 * produced inside `handleChatRequest`; this is the *only* path that writes an
 * assistant turn WITHOUT an LLM call.
 *
 * Turns are written directly into the campaign's shared chat session via
 * `chatStorageService.appendConversationTurn`. The public GET
 * `/api/groups/campaign/[slug]/chat` route reads them back by `sessionId`
 * (sessionId-index), so an operator/pulse post surfaces in the live guest
 * room on the next poll (~15s) with no extra real-time plumbing.
 *
 * Provenance + dedup:
 *  - `source` distinguishes manual operator posts from autonomous pulse posts.
 *  - `dedupeKey` (pulse only, e.g. "milestone:6") is stamped into the turn's
 *    extractedFacts so the Pulse engine can scan the session log and never
 *    double-post the same milestone. Operator posts carry no dedupe key.
 */

import { randomUUID } from 'node:crypto';
import { chatStorageService } from '@/lib/chat/chat-storage';

/** What kind of non-reactive TC turn this is. */
export type TcTurnSource = 'operator' | 'pulse';

/** Chat channels mirror the public Group Chat Hall channel rail. */
export type TcTurnChannel = 'main' | 'ideas' | 'logistics' | 'meetups';

/**
 * Metadata stamped onto the turn's `extractedFacts` so consumers (Pulse
 * dedup, UI badging) can recover provenance from the persisted turn.
 */
export interface TcTurnFacts extends Record<string, unknown> {
    tcTurn: {
        source: TcTurnSource;
        /** Pulse dedupe key, e.g. "milestone:6" | "loneliness" | "encouragement". */
        dedupeKey?: string;
        /** Operator email / pulse-rule id for the audit trail. */
        author?: string;
        postedAt: string;
    };
}

export interface PostTcTurnInput {
    /** Shared chat session id for the campaign (landing.designSystem.chat.sessionId). */
    sessionId: string;
    /** The message body, posted verbatim as the Host / Tour Conductor. */
    content: string;
    /** Target channel. Defaults to 'main'. */
    channel?: TcTurnChannel;
    /** Where this turn came from. */
    source: TcTurnSource;
    /** Pulse dedupe key. Required for pulse posts; omit for operator posts. */
    dedupeKey?: string;
    /** Operator email or pulse-rule id, for the audit trail. */
    author?: string;
    /**
     * Synthetic userId used as the DynamoDB partition key for this turn.
     * Reads go through the sessionId GSI so the value only matters for write
     * grouping. Defaults to a stable per-source id so operator + pulse turns
     * stay queryable by author without colliding with guest partitions.
     */
    userId?: string;
}

/** Build the stable synthetic partition key for a non-reactive turn. */
function defaultUserId(source: TcTurnSource, sessionId: string): string {
    return `tc-${source}:${sessionId}`;
}

/**
 * Append a Tour Conductor message to a campaign's shared chat session.
 *
 * Returns the generated `turnId` so callers can correlate / log the write.
 * Throws on a storage failure — callers decide whether that is fatal (the
 * operator route surfaces it; the Pulse sweep catches + aggregates it).
 */
export async function postTcTurn(input: PostTcTurnInput): Promise<{ turnId: string; postedAt: string }> {
    const content = input.content.trim();
    if (!content) {
        throw new Error('postTcTurn: refusing to post an empty Tour Conductor message.');
    }
    if (input.source === 'pulse' && !input.dedupeKey) {
        throw new Error('postTcTurn: pulse posts must carry a dedupeKey for idempotency.');
    }

    const channel: TcTurnChannel = input.channel ?? 'main';
    const postedAt = new Date().toISOString();
    const turnId = `tc-${input.source}-${randomUUID()}`;
    const userId = input.userId ?? defaultUserId(input.source, input.sessionId);

    const facts: TcTurnFacts = {
        tcTurn: {
            source: input.source,
            dedupeKey: input.dedupeKey,
            author: input.author,
            postedAt,
        },
    };

    await chatStorageService.appendConversationTurn({
        userId,
        turnId,
        sessionId: input.sessionId,
        role: 'assistant',
        content,
        // Matches the displayName the GET route already maps assistant turns to,
        // so operator/pulse posts render identically to live TC replies.
        displayName: 'Tour Conductor',
        threadChannel: channel,
        resolvedContext: 'campaign_landing_chat',
        extractedFacts: facts,
        toolCallsLog: [],
        timestampIso: postedAt,
    });

    return { turnId, postedAt };
}

/**
 * Read the dedupe keys already posted by the Pulse engine into a session.
 * The Pulse engine uses this to skip a rule it has already fired (e.g. the
 * `milestone:6` post). Operator turns are ignored — they never dedupe.
 */
export async function getPostedPulseDedupeKeys(input: {
    sessionId: string;
    limit?: number;
}): Promise<Set<string>> {
    const turns = await chatStorageService.getConversationTurnsBySession({
        sessionId: input.sessionId,
        limit: input.limit ?? 200,
    });

    const keys = new Set<string>();
    for (const turn of turns) {
        const facts = turn.extractedFacts as TcTurnFacts | undefined;
        const tc = facts?.tcTurn;
        if (tc?.source === 'pulse' && typeof tc.dedupeKey === 'string') {
            keys.add(tc.dedupeKey);
        }
    }
    return keys;
}
