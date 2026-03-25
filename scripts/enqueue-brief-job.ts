import { loadEnvConfig } from '@next/env';
import { createAgentJob } from '@/lib/agent-api/runner';

loadEnvConfig(process.cwd());

const slug = process.argv[2];
if (!slug) {
    console.error('Usage: npx tsx scripts/enqueue-brief-job.ts <campaign-slug>');
    process.exit(1);
}

async function main(): Promise<void> {
    const job = await createAgentJob(
        {
            workflowId: 'campaign_brief_generate',
            campaignSlug: slug,
            stopBeforeMedia: true,
        },
        'manual-cli',
    );
    console.log(`Enqueued: jobId=${job.jobId} status=${job.status} campaign=${job.campaignSlug}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
