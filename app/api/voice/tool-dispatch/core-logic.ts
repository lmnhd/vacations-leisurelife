/**
 * Voice Tool Dispatch — Core Logic
 *
 * Receives a tool call from the Realtime data channel (via the browser)
 * and routes it through the same handlers used by the text chat pipeline.
 * Returns the raw tool result as JSON for Realtime to include in its response.
 */

import { z } from 'zod';
import { getToolCache, setToolCache } from '@/lib/chat/tool-cache';
import { runPerplexityCruiseResearch } from '@/lib/chat/tools/perplexity-research';
import { runCruiseBrothersKnowledgeLookup } from '@/lib/chat/tools/cruise-brothers-knowledge';
import { runExcursionFinder } from '@/lib/chat/tools/excursion-finder';
import { runCruiseBrothersScraper } from '@/lib/chat/tools/cruise-brothers-scraper';
import { runSocialMediaInsights, runCruiseTrendAnalysis } from '@/lib/chat/tools/social-media-insights';
import type { TravelerPerspective, TrendCategory } from '@/lib/chat/tools/social-media-insights';

// ─── Request / Response types ─────────────────────────────────────────────────

const VoiceToolDispatchRequestSchema = z.object({
    toolId: z.string().min(1),
    payload: z.record(z.unknown()),
});

export type VoiceToolDispatchRequest = z.infer<typeof VoiceToolDispatchRequestSchema>;

// ─── Per-tool payload schemas (mirrors tool-dispatcher.ts) ───────────────────

const PerplexityPayloadSchema = z.object({
    query: z.string().min(1),
    destination: z.string().nullable().optional(),
    departure_month: z.string().nullable().optional(),
});

const CruiseBrothersKnowledgePayloadSchema = z.object({
    query: z.string().min(1),
});

const ExcursionFinderPayloadSchema = z.object({
    port: z.string().min(1),
    interests: z.string().nullable().optional(),
    cruise_line: z.string().nullable().optional(),
});

const CruiseBrothersScraperPayloadSchema = z.object({
    query: z.string().min(1),
    cruise_line: z.string().nullable().optional(),
    destination: z.string().nullable().optional(),
});

const SocialMediaInsightsPayloadSchema = z.object({
    cruise_line: z.string(),
    ship_name: z.string().nullable().optional(),
    destination: z.string().nullable().optional(),
});

const CruiseTrendAnalysisPayloadSchema = z.object({
    perspective: z.enum(['gen_z', 'millennial', 'gen_x', 'boomer', 'family', 'solo', 'luxury', 'budget']).nullable().optional(),
    category: z.enum(['overall_industry', 'dining_and_food', 'onboard_entertainment', 'shore_excursions', 'value_and_pricing', 'sustainability', 'technology_and_connectivity', 'health_and_wellness']),
    cruise_line: z.string().nullable().optional(),
    timeframe: z.string().nullable().optional(),
});

// ─── Logger ──────────────────────────────────────────────────────────────────

function voiceLog(event: string, data?: Record<string, unknown>): void {
    const time = new Date().toISOString().replace('T', ' ').slice(11, 23);
    const header = `🎤 [voice:tool]          │ ${event}`;
    if (data && Object.keys(data).length > 0) {
        const lines = Object.entries(data)
            .map(([k, v]) => `    ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join('\n');
        console.log(`${header}  (${time})\n${lines}`);
    } else {
        console.log(`${header}  (${time})`);
    }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function handleVoiceToolDispatch(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    const parsed = VoiceToolDispatchRequestSchema.safeParse(body);
    if (!parsed.success) {
        return { status: 400, data: { error: 'Invalid request body', details: parsed.error.flatten() } };
    }

    const { toolId, payload } = parsed.data;
    const startMs = Date.now();

    voiceLog('tool:call_start', { toolId, payload });

    try {
        const cachedResult = await getToolCache<Record<string, unknown>>(toolId, payload);
        if (cachedResult) {
            voiceLog('tool:cache_hit', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: cachedResult };
        }

        if (toolId === 'perplexity_cruise_research') {
            const p = PerplexityPayloadSchema.parse(payload);
            const result = await runPerplexityCruiseResearch({
                query: p.query,
                destination: p.destination ?? null,
                departureMonth: p.departure_month ?? null,
            });
            await setToolCache(toolId, payload, result, 86400);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        if (toolId === 'cruise_brothers_knowledge') {
            const p = CruiseBrothersKnowledgePayloadSchema.parse(payload);
            const result = await runCruiseBrothersKnowledgeLookup({ query: p.query });
            await setToolCache(toolId, payload, result, 86400 * 7);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        if (toolId === 'excursion_finder') {
            const p = ExcursionFinderPayloadSchema.parse(payload);
            const result = await runExcursionFinder({
                port: p.port,
                interests: p.interests ?? null,
                cruiseLine: p.cruise_line ?? null,
            });
            await setToolCache(toolId, payload, result, 86400 * 7);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        if (toolId === 'cruise_brothers_scraper') {
            const p = CruiseBrothersScraperPayloadSchema.parse(payload);
            const result = await runCruiseBrothersScraper({
                query: p.query,
                cruiseLine: p.cruise_line ?? null,
                destination: p.destination ?? null,
            });
            await setToolCache(toolId, payload, result, 3600 * 6);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        if (toolId === 'social_media_insights') {
            const p = SocialMediaInsightsPayloadSchema.parse(payload);
            const result = await runSocialMediaInsights({
                cruiseLine: p.cruise_line,
                shipName: p.ship_name ?? null,
                destination: p.destination ?? null,
            });
            await setToolCache(toolId, payload, result, 86400 * 30);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        if (toolId === 'cruise_trend_analysis') {
            const p = CruiseTrendAnalysisPayloadSchema.parse(payload);
            const result = await runCruiseTrendAnalysis({
                perspective: (p.perspective ?? null) as TravelerPerspective | null,
                category: p.category as TrendCategory,
                cruiseLine: p.cruise_line ?? null,
                timeframe: p.timeframe ?? null,
            });
            await setToolCache(toolId, payload, result, 86400 * 7);
            voiceLog('tool:complete', { toolId, durationMs: Date.now() - startMs });
            return { status: 200, data: result as unknown as Record<string, unknown> };
        }

        voiceLog('tool:unknown', { toolId });
        return { status: 400, data: { error: `Unknown or unsupported voice tool: ${toolId}` } };

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        voiceLog('tool:error', { toolId, error: message, durationMs: Date.now() - startMs });
        return { status: 500, data: { error: `Tool execution failed: ${message}` } };
    }
}
