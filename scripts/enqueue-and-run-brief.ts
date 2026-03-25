import { loadEnvConfig } from '@next/env';
import { submitAgentJob } from '@/lib/agent-api/runner';

loadEnvConfig(process.cwd());

const slug = process.argv[2];
if (!slug) {
    console.error('Usage: npx tsx scripts/enqueue-and-run-brief.ts <campaign-slug>');
    process.exit(1);
}

async function main(): Promise<void> {
    console.log(`Enqueuing and running brief generation for ${slug}...`);
    const job = await submitAgentJob(
        {
            workflowId: 'campaign_brief_generate',
            campaignSlug: slug,
            stopBeforeMedia: true,
        },
        'manual-cli',
        { runNow: true },
    );
    console.log(`\nResult: jobId=${job.jobId} status=${job.status}`);
    console.log(`Steps:`);
    for (const step of job.steps) {
        console.log(`  ${step.stepId}: ${step.status}${step.message ? ` — ${step.message}` : ''}`);
    }
    if (job.error) {
        console.log(`Error: ${job.error}`);
    }
    if (job.failureDiagnostics) {
        console.log(`Diagnostics: ${JSON.stringify(job.failureDiagnostics, null, 2)}`);
    }
    if (job.summary) {
        console.log(`Summary: ${JSON.stringify(job.summary, null, 2)}`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
