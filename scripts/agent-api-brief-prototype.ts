import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { createAgentJob, runAgentJob } from '@/lib/agent-api';

loadEnvConfig(process.cwd());

type CliOptions = {
    requestedBy: string;
    approveClean: boolean;
    instructions?: string;
    slugs: string[];
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

function parseArgs(argv: string[]): CliOptions {
    const slugs: string[] = [];
    let requestedBy = 'local_worker';
    let approveClean = false;
    let instructions: string | undefined;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--') {
            continue;
        }
        if (arg === '--approve-clean') {
            approveClean = true;
            continue;
        }
        if (arg === '--requested-by') {
            requestedBy = argv[index + 1] ?? requestedBy;
            index += 1;
            continue;
        }
        if (arg === '--instructions') {
            instructions = argv[index + 1];
            index += 1;
            continue;
        }
        slugs.push(arg);
    }

    if (slugs.length === 0) {
        throw new Error('Provide at least one campaign slug.');
    }

    return { requestedBy, approveClean, instructions, slugs };
}

async function run(): Promise<void> {
    const options = parseArgs(getForwardedArgs());

    console.log('AGENT API BRIEF PROTOTYPE');
    console.log('Running direct worker jobs for campaign brief generation.');

    for (const slug of options.slugs) {
        console.log(`\n=== ${slug} ===`);

        const generateJob = await createAgentJob({
            workflowId: 'campaign_brief_generate',
            campaignSlug: slug,
            instructions: options.instructions,
            stopBeforeMedia: true,
        }, options.requestedBy);

        const generated = await runAgentJob(generateJob);
        console.log(`Generate job: ${generated.jobId}`);
        console.log(`Status: ${generated.status}`);
        console.log(`Summary: ${generated.summary?.message ?? 'No summary'}`);
        console.log(`Readiness: ${generated.summary?.readiness ?? 'unknown'}`);
        console.log(`Persisted: ${generated.summary?.persisted === true ? 'yes' : 'no'}`);
        console.log(`Blockers: ${generated.summary?.blockerCount ?? 'unknown'}`);

        const storedBrief = await getAestheticBrief(slug);
        console.log(`Stored brief: ${storedBrief ? 'yes' : 'no'}`);

        const canApprove = options.approveClean
            && generated.summary?.persisted === true
            && (generated.summary?.blockerCount ?? 1) === 0
            && generated.summary?.readiness === 'needs_review';

        if (!canApprove) {
            console.log('Approval: skipped');
            continue;
        }

        const approveJob = await createAgentJob({
            workflowId: 'campaign_brief_approve',
            campaignSlug: slug,
        }, options.requestedBy);

        const approved = await runAgentJob(approveJob);
        console.log(`Approve job: ${approved.jobId}`);
        console.log(`Approval status: ${approved.status}`);
        console.log(`Final readiness: ${approved.summary?.readiness ?? 'unknown'}`);
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});