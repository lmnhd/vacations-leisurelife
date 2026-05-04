import { notFound } from 'next/navigation';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { CampaignLandingPageVisualSystem } from '@/components/campaign-landing/landing-page-visual-system';

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

    return <CampaignLandingPageVisualSystem landing={result.landing} />;
}
