import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';
import { applyDiscoveryReviewIteration } from '@/lib/campaigns/discovery-iteration';

type CampaignStateRow = {
    slug: string;
    exists: boolean;
    name: string | null;
    verdict: string | null;
    nextAction: string | null;
    retiredAt: string | null;
    requiredFixCount: number | null;
};

function getArgValues(flag: string): string[] {
    const values: string[] = [];
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === flag) {
            const nextValue = args[index + 1];
            if (nextValue) {
                values.push(nextValue);
                index += 1;
            }
        }
    }

    return values;
}

function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

async function loadState(slug: string): Promise<CampaignStateRow> {
    const campaign = await getCampaignBlueprint(slug);

    return {
        slug,
        exists: !!campaign,
        name: campaign?.name ?? null,
        verdict: campaign?.discoveryRedTeamReview?.verdict ?? null,
        nextAction: campaign?.discoveryIteration?.recommendedNextAction ?? null,
        retiredAt: campaign?.discoveryIteration?.retiredAt ?? null,
        requiredFixCount: campaign?.discoveryRedTeamReview?.requiredFixes.length ?? null,
    };
}

async function refreshState(slug: string): Promise<CampaignStateRow> {
    return refreshStateWithOptions(slug, false);
}

async function refreshStateWithOptions(slug: string, resetIteration: boolean): Promise<CampaignStateRow> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return {
            slug,
            exists: false,
            name: null,
            verdict: null,
            nextAction: null,
            retiredAt: null,
            requiredFixCount: null,
        };
    }

    const reviewSeed = resetIteration
        ? {
            ...campaign,
            discoveryIteration: undefined,
            discoveryRedTeamReview: undefined,
        }
        : campaign;

    const review = await runDiscoveryRedTeamReview(reviewSeed);
    const updatedCampaign = {
        ...applyDiscoveryReviewIteration(reviewSeed, review),
        discoveryRedTeamReview: review,
        updatedAt: new Date().toISOString(),
    };

    await saveCampaignBlueprint(updatedCampaign);

    return {
        slug,
        exists: true,
        name: updatedCampaign.name,
        verdict: review.verdict,
        nextAction: updatedCampaign.discoveryIteration?.recommendedNextAction ?? null,
        retiredAt: updatedCampaign.discoveryIteration?.retiredAt ?? null,
        requiredFixCount: review.requiredFixes.length,
    };
}

async function main(): Promise<void> {
    const slugs = getArgValues('--slug');
    if (slugs.length === 0) {
        throw new Error('Provide at least one --slug value.');
    }

    const shouldRefresh = hasFlag('--refresh');
    const resetIteration = hasFlag('--reset-iteration');
    const rows = shouldRefresh
        ? await Promise.all(slugs.map((slug) => refreshStateWithOptions(slug, resetIteration)))
        : await Promise.all(slugs.map((slug) => loadState(slug)));

    console.log(JSON.stringify(rows, null, 2));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
});