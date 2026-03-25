import { loadEnvConfig } from '@next/env';
import { getAgentJob, listAgentJobsForCampaign, listQueuedAgentJobs } from '@/lib/agent-api/store';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
    const slug = process.argv[2];

    if (slug) {
        console.log(`Jobs for campaign: ${slug}`);
        const jobs = await listAgentJobsForCampaign(slug);
        for (const job of jobs) {
            console.log(JSON.stringify({
                jobId: job.jobId,
                status: job.status,
                campaign: job.campaignSlug,
                steps: job.steps.map(s => ({ id: s.stepId, status: s.status, msg: s.message })),
                error: job.error ?? null,
                hasDiagnostics: job.failureDiagnostics != null,
                failureDiagnostics: job.failureDiagnostics ?? null,
                createdAt: job.createdAt,
                completedAt: job.completedAt ?? null,
            }, null, 2));
        }
        if (jobs.length === 0) console.log('No jobs found.');
    }

    console.log('\nAll queued jobs:');
    const queued = await listQueuedAgentJobs(20);
    for (const job of queued) {
        console.log(`  ${job.jobId} ${job.status} ${job.campaignSlug} created=${job.createdAt}`);
    }
    if (queued.length === 0) console.log('  (none)');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
