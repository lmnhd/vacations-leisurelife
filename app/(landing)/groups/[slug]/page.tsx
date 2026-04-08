import { notFound } from 'next/navigation';
import { CampaignLandingPage } from '@/components/campaign-landing/landing-page';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { CampaignLandingPageGemini } from '@/components/campaign-landing/CampaignLandingPageGemini';
import { CampaignLandingPageClaude } from '@/components/campaign-landing/CampaignLandingPageClaude';
import { CampaignLandingPageGpt } from '@/components/campaign-landing/landing-page-gpt';

export const dynamic = 'force-dynamic';

export default async function GroupCampaignLandingPage(
    {
        params,
        searchParams,
    }: {
        params: Promise<{ slug: string }>;
        searchParams: Promise<{ preview?: string }>;
    },
) {
    const { slug } = await params;
    const { preview } = await searchParams;

    const result = await getCampaignLandingBySlug(slug, {
        includeDraftPreview: preview === '1',
    });

    if (!result) {
        notFound();
    }

    return <CampaignLandingPageClaude landing={result.landing} />;
}