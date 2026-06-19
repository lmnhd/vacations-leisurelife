/**
 * TC Pulse — autonomous Tour Conductor posting engine.
 *
 * Mirrors `lib/campaigns/email/email-scheduler.ts`: a stateless, idempotent
 * sweep over campaigns that reads per-campaign engagement and decides whether
 * the Tour Conductor should post a non-reactive message into the shared chat.
 *
 * Operator-run from dev (NOT a production cron). Defaults to dry-run: the sweep
 * returns a structured plan of what it WOULD post per campaign; live posting
 * requires `dryRun: false`. See `scripts/tc-pulse.ts`.
 *
 * Three rules (see `evaluateRules`):
 *  1. MILESTONE      — every 3 verified signups (3, 6, 9…). Social proof.
 *  2. LONELINESS     — low signups AND chat silent ≥ SILENCE_DAYS, with a
 *                      retirement countdown drawn from `expiresAt`.
 *  3. ENCOURAGEMENT  — signups present but idea board / chat quiet; warm
 *                      prompt that leans on the pin/vote mechanic.
 *
 * Idempotency: every pulse post carries a `dedupeKey` (e.g. "milestone:6")
 * stamped into the chat turn. Before posting, the engine reads the keys it has
 * already posted into the session and skips any rule whose key is present, so
 * re-running the sweep N times never double-posts. A per-campaign rate cap
 * (PULSE_RATE_CAP_HOURS) prevents loneliness/encouragement from stacking.
 */

import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import { getPublicGroupCabinTarget, getPublicThresholdPercent } from '@/lib/campaigns/threshold-policy';
import { chatStorageService } from '@/lib/chat/chat-storage';
import { callLLM, ModelName } from '@/lib/ai/llm-gateway';
import type { Campaign } from '@/lib/campaigns/types';
import { getPostedPulseDedupeKeys, postTcTurn, type TcTurnChannel } from './post-tc-turn';

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Milestone cadence: post every Nth verified signup. */
const MILESTONE_EVERY = 3;
/** A room is "lonely" when verified signups are at or below this floor. */
const LONELINESS_SIGNUP_CEILING = 2;
/** Silence (no guest message) of this many days arms loneliness/encouragement. */
const SILENCE_DAYS = 3;
/** Min hours between any two autonomous posts to one campaign. */
const PULSE_RATE_CAP_HOURS = 24;
/** How many session turns to scan for dedupe + last-activity. */
const SESSION_SCAN_LIMIT = 200;

// ─── Engagement state ──────────────────────────────────────────────────────────

export type PulseRuleId = 'milestone' | 'loneliness' | 'encouragement';

export interface CampaignEngagement {
    slug: string;
    name: string;
    sessionId: string;
    status: Campaign['status'];
    /**
     * Total waitlist entries — verified or not. This is the milestone +
     * engagement basis so the Pulse matches the signup number shown in the
     * discovery/conversion dashboard.
     */
    totalSignups: number;
    /** Verified signups only — drives the public threshold %, which gates real launch. */
    verifiedSignups: number;
    thresholdPercent: number;
    requiredCabins: number;
    guestIdeaCount: number;
    /** ISO of the most recent GUEST (role=user) chat message; null if none. */
    lastGuestMessageAt: string | null;
    daysSinceLastGuestMessage: number | null;
    /** ISO of the most recent autonomous pulse post; null if none. */
    lastPulseAt: string | null;
    /** Days until the campaign auto-expires; null when `expiresAt` is unset. */
    daysToExpiry: number | null;
    /** Pulse dedupe keys already posted into this session. */
    postedKeys: Set<string>;
}

export interface PulseDecision {
    rule: PulseRuleId;
    channel: TcTurnChannel;
    dedupeKey: string;
    /** Why this rule fired — printed in the dry-run report. */
    reason: string;
}

export interface PulsePlan extends PulseDecision {
    slug: string;
    name: string;
    sessionId: string;
    /** The generated message body. Null in `plan-only` mode (no LLM call). */
    message: string | null;
    /** True once actually written to the session (live run only). */
    posted: boolean;
    error?: string;
}

export interface CampaignPulseResult {
    slug: string;
    name: string;
    engagement: CampaignEngagement;
    decisions: PulseDecision[];
    plans: PulsePlan[];
    /**
     * Set when a decision was reached but suppressed by the rate cap. The
     * `decisions` array is still populated so the report shows what WOULD have
     * fired; `plans` stays empty (nothing generated/posted).
     */
    rateCappedReason?: string;
    skippedReason?: string;
}

export interface PulseRunResult {
    runAt: string;
    dryRun: boolean;
    campaignsScanned: number;
    perCampaign: CampaignPulseResult[];
    totals: { decided: number; posted: number; failed: number };
}

export interface PulseOptions {
    /** When true (default), generate + plan but never write to a session. */
    dryRun?: boolean;
    /** Restrict the sweep to a single campaign slug. */
    onlyCampaignSlug?: string;
    /**
     * When true, generate the LLM message body even in dry-run so the report
     * shows the exact copy that would post. Default true — the whole point of
     * review-then-send is seeing the words before they go out.
     */
    generateInDryRun?: boolean;
    /** Override "now" for deterministic testing (ISO string). */
    nowOverride?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sessionIdFor(campaign: Campaign): string {
    // Deterministic — mirrors `view-model.ts` (`campaign-chat://${id}`).
    return `campaign-chat://${campaign.id}`;
}

function daysBetween(fromIso: string, now: number): number {
    return Math.floor((now - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24));
}

/** Read engagement signals for one campaign — all cheap reads, no LLM. */
async function readEngagement(campaign: Campaign, now: number): Promise<CampaignEngagement> {
    const sessionId = sessionIdFor(campaign);
    const [entries, turns, postedKeys] = await Promise.all([
        listCampaignWaitlistEntries(campaign.id),
        chatStorageService.getConversationTurnsBySession({ sessionId, limit: SESSION_SCAN_LIMIT }),
        getPostedPulseDedupeKeys({ sessionId, limit: SESSION_SCAN_LIMIT }),
    ]);

    const totalSignups = entries.length;
    const verifiedSignups = entries.filter((e) => e.emailVerified).length;
    const requiredCabins = getPublicGroupCabinTarget(campaign);
    const thresholdPercent = getPublicThresholdPercent(requiredCabins, verifiedSignups);

    let lastGuestMessageAt: string | null = null;
    let lastPulseAt: string | null = null;
    for (const turn of turns) {
        const createdAt = typeof turn.createdAt === 'string' ? turn.createdAt : null;
        if (!createdAt) continue;
        if (turn.role === 'user') {
            if (!lastGuestMessageAt || createdAt > lastGuestMessageAt) lastGuestMessageAt = createdAt;
        }
        const facts = turn.extractedFacts as { tcTurn?: { source?: string } } | undefined;
        if (facts?.tcTurn?.source === 'pulse') {
            if (!lastPulseAt || createdAt > lastPulseAt) lastPulseAt = createdAt;
        }
    }

    const daysToExpiry = campaign.expiresAt
        ? Math.ceil((new Date(campaign.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))
        : null;

    return {
        slug: campaign.id,
        name: campaign.name,
        sessionId,
        status: campaign.status,
        totalSignups,
        verifiedSignups,
        thresholdPercent,
        requiredCabins,
        guestIdeaCount: campaign.guestIdeas?.length ?? 0,
        lastGuestMessageAt,
        daysSinceLastGuestMessage: lastGuestMessageAt ? daysBetween(lastGuestMessageAt, now) : null,
        lastPulseAt,
        daysToExpiry,
        postedKeys,
    };
}

/**
 * Evaluate the three rules against engagement state and return the decisions
 * that should fire. Pure + synchronous so it is trivially unit-testable.
 *
 * Precedence: milestone wins (factual, time-sensitive). Loneliness and
 * encouragement are mutually exclusive by the signup floor. The per-campaign
 * rate cap is applied by the caller, not here.
 */
export function evaluateRules(e: CampaignEngagement): PulseDecision[] {
    const decisions: PulseDecision[] = [];

    // Signup basis for momentum rules = TOTAL entries (verified or not), so the
    // Pulse matches the signup count shown on the dashboard. The threshold % it
    // reports stays verified-only (real launch math).
    const signups = e.totalSignups;

    // Rule 1 — MILESTONE: every Nth signup, deduped by the exact count.
    if (signups >= MILESTONE_EVERY) {
        const milestone = Math.floor(signups / MILESTONE_EVERY) * MILESTONE_EVERY;
        const key = `milestone:${milestone}`;
        if (!e.postedKeys.has(key)) {
            decisions.push({
                rule: 'milestone',
                channel: 'main',
                dedupeKey: key,
                reason: `${signups} signups crossed the ${milestone}-signup mark`
                    + (e.verifiedSignups !== signups ? ` (${e.verifiedSignups} verified).` : '.'),
            });
        }
    }

    const isSilent = e.daysSinceLastGuestMessage === null || e.daysSinceLastGuestMessage >= SILENCE_DAYS;

    // Rule 2 — LONELINESS: empty/near-empty room that has gone quiet.
    if (isSilent && signups <= LONELINESS_SIGNUP_CEILING) {
        // Re-arm per countdown window so the tone can escalate as expiry nears,
        // but never more than once per window.
        const window = e.daysToExpiry === null
            ? 'open'
            : e.daysToExpiry <= 7 ? 'closing'
            : e.daysToExpiry <= 21 ? 'soon'
            : 'far';
        const key = `loneliness:${window}`;
        if (!e.postedKeys.has(key)) {
            decisions.push({
                rule: 'loneliness',
                channel: 'main',
                dedupeKey: key,
                reason: `Quiet room (${signups} signups, ${e.daysSinceLastGuestMessage ?? 'no'} days since a guest spoke)`
                    + (e.daysToExpiry !== null ? `, ${e.daysToExpiry} days to expiry.` : '.'),
            });
        }
    }

    // Rule 3 — ENCOURAGEMENT: guests present but not collaborating.
    if (isSilent && signups > LONELINESS_SIGNUP_CEILING && e.guestIdeaCount <= 2) {
        // Re-arm per signup tier so it nudges again as the room grows but stays silent.
        const tier = Math.floor(signups / MILESTONE_EVERY);
        const key = `encouragement:${tier}`;
        if (!e.postedKeys.has(key)) {
            decisions.push({
                rule: 'encouragement',
                channel: 'main',
                dedupeKey: key,
                reason: `${signups} signups but only ${e.guestIdeaCount} ideas and ${e.daysSinceLastGuestMessage ?? 'no'} days of chat silence.`,
            });
        }
    }

    return decisions;
}

// ─── Message generation ────────────────────────────────────────────────────────

function buildPrompt(rule: PulseRuleId, e: CampaignEngagement): string {
    const shared = [
        `You are the Tour Conductor — the warm, lightly witty host of the shared chat for the group cruise campaign "${e.name}".`,
        `Write ONE short message (1-3 sentences) to post into the #main channel. No greeting headers, no signature, no emoji spam (at most one).`,
        `Context: ${e.totalSignups} guests have joined (${e.thresholdPercent}% toward ${e.requiredCabins} cabins).`,
        e.guestIdeaCount > 0 ? `The idea board has ${e.guestIdeaCount} guest ideas.` : `The idea board is empty so far.`,
    ];

    switch (rule) {
        case 'milestone':
            return [
                ...shared,
                `Celebrate the momentum of crossing a new signup milestone. Welcome newcomers, and gently invite an idea or question. Keep it genuine, not salesy.`,
            ].join('\n');
        case 'loneliness':
            return [
                ...shared,
                e.daysToExpiry !== null
                    ? `The room is quiet and this voyage's window closes in ${e.daysToExpiry} days.`
                    : `The room is quiet.`,
                `Post something softly self-aware about the quiet — a little lonely-host charm, never guilt-tripping — and invite the first real conversation. If a deadline exists, mention it lightly as a reason to speak up now.`,
            ].join('\n');
        case 'encouragement':
            return [
                ...shared,
                `Guests have joined but haven't shared ideas yet. Warmly encourage them to drop the one onboard moment that would make this trip theirs, and mention that strong ideas get pinned and that everyone can vote.`,
            ].join('\n');
    }
}

async function generateMessage(rule: PulseRuleId, e: CampaignEngagement): Promise<string> {
    const response = await callLLM(ModelName.CLAUDE_4_SONNET, buildPrompt(rule, e), {
        temperature: 0.8,
        maxTokens: 160,
    });
    return response.content.trim();
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

/**
 * Whether a campaign is even worth scanning. Mirrors the discovery view's
 * default filter so the report shows real, live campaigns — not the full
 * DynamoDB table (DRAFT concepts, archived, retired blueprints).
 *
 * Returns a reason string when ineligible, or null when the campaign should be
 * swept.
 */
function ineligibleReason(campaign: Campaign): string | null {
    if (campaign.status !== 'GATHERING_INTEREST') {
        return `status=${campaign.status} (pulse only runs on GATHERING_INTEREST)`;
    }
    if (campaign.archived) return 'archived';
    if (campaign.discoveryIteration?.retiredAt) return 'retired';
    return null;
}

// ─── Sweep ──────────────────────────────────────────────────────────────────

async function sweepCampaign(
    campaign: Campaign,
    now: number,
    opts: Required<Pick<PulseOptions, 'dryRun' | 'generateInDryRun'>>,
): Promise<CampaignPulseResult> {
    const engagement = await readEngagement(campaign, now);

    // Single-campaign inspection can reach an ineligible campaign (DRAFT,
    // archived, retired). Report the reason and do no work.
    const skip = ineligibleReason(campaign);
    if (skip) {
        return { slug: campaign.id, name: campaign.name, engagement, decisions: [], plans: [], skippedReason: skip };
    }

    const decisions = evaluateRules(engagement);

    // Rate cap: at most one autonomous post per campaign per window. We still
    // surface the decision so the report shows what WOULD fire once the window
    // clears — it just isn't generated or posted this run.
    if (engagement.lastPulseAt) {
        const hoursSince = (now - new Date(engagement.lastPulseAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < PULSE_RATE_CAP_HOURS) {
            return {
                slug: campaign.id,
                name: campaign.name,
                engagement,
                decisions,
                plans: [],
                rateCappedReason: `last pulse ${hoursSince.toFixed(1)}h ago, cap ${PULSE_RATE_CAP_HOURS}h`,
            };
        }
    }

    // One autonomous post per sweep — take the highest-precedence decision.
    const chosen = decisions[0] ? [decisions[0]] : [];

    const plans: PulsePlan[] = [];
    for (const decision of chosen) {
        const shouldGenerate = !opts.dryRun || opts.generateInDryRun;
        let message: string | null = null;
        let posted = false;
        let error: string | undefined;

        try {
            if (shouldGenerate) message = await generateMessage(decision.rule, engagement);
            if (!opts.dryRun && message) {
                await postTcTurn({
                    sessionId: engagement.sessionId,
                    content: message,
                    channel: decision.channel,
                    source: 'pulse',
                    dedupeKey: decision.dedupeKey,
                    author: `pulse:${decision.rule}`,
                });
                posted = true;
            }
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        }

        plans.push({ ...decision, slug: campaign.id, name: campaign.name, sessionId: engagement.sessionId, message, posted, error });
    }

    return { slug: campaign.id, name: campaign.name, engagement, decisions, plans };
}

/** Sweep every eligible campaign (or one, via `onlyCampaignSlug`). */
export async function runTcPulse(opts: PulseOptions = {}): Promise<PulseRunResult> {
    const dryRun = opts.dryRun !== false; // default true
    const generateInDryRun = opts.generateInDryRun !== false; // default true
    const now = opts.nowOverride ? new Date(opts.nowOverride).getTime() : Date.now();
    const runAt = new Date(now).toISOString();

    let campaigns = await scanAllCampaigns();
    if (opts.onlyCampaignSlug) {
        // Single-campaign mode is an explicit operator choice — honor it even
        // for DRAFT/archived so the operator can inspect any campaign by slug.
        campaigns = campaigns.filter((c) => c.id === opts.onlyCampaignSlug);
    } else {
        // Full sweep: only live, non-archived, non-retired campaigns, matching
        // the discovery view. Keeps the report focused instead of dumping the
        // whole table of DRAFT concepts.
        campaigns = campaigns.filter((c) => ineligibleReason(c) === null);
    }

    const perCampaign: CampaignPulseResult[] = [];
    for (const campaign of campaigns) {
        try {
            perCampaign.push(await sweepCampaign(campaign, now, { dryRun, generateInDryRun }));
        } catch (err) {
            perCampaign.push({
                slug: campaign.id,
                name: campaign.name,
                engagement: {
                    slug: campaign.id, name: campaign.name, sessionId: sessionIdFor(campaign),
                    status: campaign.status, totalSignups: 0, verifiedSignups: 0, thresholdPercent: 0, requiredCabins: 0,
                    guestIdeaCount: 0, lastGuestMessageAt: null, daysSinceLastGuestMessage: null,
                    lastPulseAt: null, daysToExpiry: null, postedKeys: new Set(),
                },
                decisions: [],
                plans: [],
                skippedReason: `sweep failed: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }

    const totals = perCampaign.reduce(
        (acc, c) => ({
            decided: acc.decided + c.decisions.length,
            posted: acc.posted + c.plans.filter((p) => p.posted).length,
            failed: acc.failed + c.plans.filter((p) => p.error).length,
        }),
        { decided: 0, posted: 0, failed: 0 },
    );

    return { runAt, dryRun, campaignsScanned: perCampaign.length, perCampaign, totals };
}
