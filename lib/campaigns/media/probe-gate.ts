/**
 * Probe Gate
 *
 * Optional spend gate for media-orchestrator.ts. Throws ProbeGateError
 * if the latest probe run is blocked or has not been run.
 *
 * The gate defaults to 'ignore' in GenerationOptions so the existing
 * pipeline is completely unaffected unless the caller opts in.
 */

import { getLatestProbeRunRecord } from './media-store';

export const PROBE_GATE_FAILURE_CODE = 'PROBE_GATE_FAILURE' as const;

export class ProbeGateError extends Error {
    readonly code = PROBE_GATE_FAILURE_CODE;
    constructor(message: string) {
        super(message);
        this.name = 'ProbeGateError';
    }
}

/**
 * Asserts that the latest probe run for the given slug is approved or warn.
 * Throws ProbeGateError if:
 *   - no probe run exists, or
 *   - the latest probe run verdict is 'blocked'
 */
export async function assertProbeGateReady(slug: string): Promise<void> {
    const lastRun = await getLatestProbeRunRecord(slug);
    if (!lastRun) {
        throw new ProbeGateError(
            `No probe run found for "${slug}". ` +
            `POST /api/groups/campaign/${slug}/media/probe to validate still directions first.`,
        );
    }
    if (lastRun.verdict === 'blocked') {
        throw new ProbeGateError(
            `Probe run for "${slug}" is blocked (${lastRun.failCount}/${lastRun.totalProbed} failed). ` +
            `Revise still directions and re-run probes before proceeding to full production.`,
        );
    }
}
