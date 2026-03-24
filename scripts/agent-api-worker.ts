import { loadEnvConfig } from '@next/env';
import { claimNextQueuedAgentJob, drainQueuedAgentJobs, runAgentJob } from '@/lib/agent-api';

loadEnvConfig(process.cwd());

type WorkerCliOptions = {
    workerId: string;
    batchSize: number;
    maxJobs?: number;
    pollMs: number;
    once: boolean;
};

function getForwardedArgs(): string[] {
    const rawArgs = process.env.AGENT_API_SCRIPT_ARGS;
    if (!rawArgs) {
        return process.argv.slice(2);
    }

    try {
        const parsed = JSON.parse(rawArgs) as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : process.argv.slice(2);
    } catch {
        return process.argv.slice(2);
    }
}

function parseInteger(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): WorkerCliOptions {
    let workerId = 'local_agent_worker';
    let batchSize = 10;
    let maxJobs: number | undefined;
    let pollMs = 5000;
    let once = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--') {
            continue;
        }
        if (arg === '--worker-id') {
            workerId = argv[index + 1] ?? workerId;
            index += 1;
            continue;
        }
        if (arg === '--batch-size') {
            batchSize = parseInteger(argv[index + 1], batchSize);
            index += 1;
            continue;
        }
        if (arg === '--max-jobs') {
            maxJobs = parseInteger(argv[index + 1], 1);
            index += 1;
            continue;
        }
        if (arg === '--poll-ms') {
            pollMs = parseInteger(argv[index + 1], pollMs);
            index += 1;
            continue;
        }
        if (arg === '--once') {
            once = true;
        }
    }

    return { workerId, batchSize, maxJobs, pollMs, once };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function runOnce(options: WorkerCliOptions): Promise<number> {
    if (options.maxJobs === 1) {
        const claimed = await claimNextQueuedAgentJob(options.workerId, options.batchSize);
        if (!claimed) {
            console.log('No queued agent jobs found.');
            return 0;
        }

        const result = await runAgentJob(claimed);
        console.log(`${result.jobId} ${result.workflowId} ${result.status} ${result.campaignSlug}`);
        return 1;
    }

    const results = await drainQueuedAgentJobs(options.workerId, {
        batchSize: options.batchSize,
        maxJobs: options.maxJobs,
    });

    if (results.length === 0) {
        console.log('No queued agent jobs found.');
        return 0;
    }

    for (const result of results) {
        console.log(`${result.jobId} ${result.workflowId} ${result.status} ${result.campaignSlug}`);
    }

    return results.length;
}

async function run(): Promise<void> {
    const options = parseArgs(getForwardedArgs());
    console.log(`Agent worker ${options.workerId} ready.`);

    if (options.once) {
        await runOnce(options);
        return;
    }

    while (true) {
        const processed = await runOnce(options);
        if (processed === 0) {
            console.log(`Idle. Sleeping ${options.pollMs}ms.`);
        }
        await sleep(options.pollMs);
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});