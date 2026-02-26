/**
 * Pipeline Logger — Structured server-side logging for the chat pipeline.
 *
 * Emits JSON-structured log lines to stdout so they appear in the Next.js
 * dev server console and are easily parseable in production log aggregators.
 *
 * Usage:
 *   pipelineLog.stage('context-resolver', sessionId, { activeContextPath })
 *   pipelineLog.tool('perplexity_cruise_research', sessionId, 'dispatched', { query })
 *   pipelineLog.warn('memory-extractor', sessionId, 'LLM returned empty facts')
 *   pipelineLog.error('tool-dispatcher', sessionId, error)
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type PipelineLogEntry = {
    ts: string;
    level: LogLevel;
    stage: string;
    sessionId: string;
    event: string;
    data?: Record<string, unknown>;
};

function emit(entry: PipelineLogEntry): void {
    const prefix = entry.level === 'ERROR' ? '🔴' : entry.level === 'WARN' ? '🟡' : '🟢';
    console.log(`${prefix} [PIPELINE] ${JSON.stringify(entry)}`);
}

function now(): string {
    return new Date().toISOString();
}

export const pipelineLog = {
    stage(stageName: string, sessionId: string, data?: Record<string, unknown>): void {
        emit({ ts: now(), level: 'INFO', stage: stageName, sessionId, event: 'stage_complete', data });
    },

    tool: (
        toolId: string,
        sessionId: string,
        status: 'dispatched' | 'completed' | 'skipped_no_directive' | 'not_allowed' | 'cache_hit',
        data?: Record<string, unknown>
    ) => {
        emit({ ts: now(), level: 'INFO', stage: 'tool-dispatcher', sessionId, event: `tool:${status}:${toolId}`, data });
    },

    llm(sessionId: string, event: 'call_start' | 'call_complete' | 'tool_directive_found' | 'no_tool_directives', data?: Record<string, unknown>): void {
        emit({ ts: now(), level: 'INFO', stage: 'llm-call', sessionId, event: `llm:${event}`, data });
    },

    memory(sessionId: string, event: 'extracted' | 'empty' | 'merged', data?: Record<string, unknown>): void {
        emit({ ts: now(), level: 'INFO', stage: 'memory-extractor', sessionId, event: `memory:${event}`, data });
    },

    warn(stageName: string, sessionId: string, message: string, data?: Record<string, unknown>): void {
        emit({ ts: now(), level: 'WARN', stage: stageName, sessionId, event: message, data });
    },

    error(stageName: string, sessionId: string, error: unknown, data?: Record<string, unknown>): void {
        const message = error instanceof Error ? error.message : String(error);
        emit({ ts: now(), level: 'ERROR', stage: stageName, sessionId, event: message, data });
    },
};
