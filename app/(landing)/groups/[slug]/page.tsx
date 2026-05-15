import { notFound } from 'next/navigation';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { GuestPortal } from '@/components/campaign-landing/guest-portal';

export const dynamic = 'force-dynamic';

export default async function GroupCampaignLandingPage(
    {
        params,
        searchParams,
    }: {
        params: Promise<{ slug: string }>;
        searchParams: Promise<{ preview?: string; verified?: string; verify_error?: string }>;
    },
) {
    const { slug } = await params;
    const { preview, verified, verify_error } = await searchParams;

    // The public route honors persisted `campaign.manualVisualFlavor` only.
    // URL-based audition (?flavor=...) is intentionally preview-only and applied
    // by the test page below, never here, so external visitors never see preview state.
    const result = await getCampaignLandingBySlug(slug, {
        includeDraftPreview: preview === '1',
    });

    if (!result) {
        notFound();
    }

    return (
        <GuestPortal
            landing={result.landing}
            emailJustVerified={verified === '1'}
            emailVerifyError={verify_error === '1'}
        />
    );
}
