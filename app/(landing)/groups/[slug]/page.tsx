import { notFound } from 'next/navigation';
import { CampaignLandingPage } from '@/components/campaign-landing/landing-page';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';

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

    return <CampaignLandingPage landing={result.landing} />;
}