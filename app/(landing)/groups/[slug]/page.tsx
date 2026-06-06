import { notFound } from 'next/navigation';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { GuestPortal } from '@/components/campaign-landing/guest-portal';
import { RetiredCampaignNotice } from '@/components/campaign-landing/retired-campaign-notice';
import { isCampaignRetired } from '@/lib/campaigns/discovery-iteration';

export const dynamic = 'force-dynamic';

export default async function GroupCampaignLandingPage(
    {
        params,
        searchParams,
    }: {
        params: Promise<{ slug: string }>;
        searchParams: Promise<{ preview?: string; verified?: string; verify_error?: string; guest_token?: string }>;
    },
) {
    const { slug } = await params;
    const { preview, verified, verify_error, guest_token } = await searchParams;

    const isPreview = preview === '1';

    // The public route honors persisted `campaign.manualVisualFlavor` only.
    // URL-based audition (?flavor=...) is intentionally preview-only and applied
    // by the test page below, never here, so external visitors never see preview state.
    const result = await getCampaignLandingBySlug(slug, {
        includeDraftPreview: isPreview,
    });

    if (!result) {
        notFound();
    }

    // A campaign retired on the discovery page is no longer public. We still let
    // operators inspect it via ?preview=1, but external visitors get a blurred
    // "expired" notice instead of a usable landing page.
    if (!isPreview && isCampaignRetired(result.campaign)) {
        return <RetiredCampaignNotice landing={result.landing} />;
    }

    return (
        <GuestPortal
            landing={result.landing}
            emailJustVerified={verified === '1'}
            emailVerifyError={verify_error === '1'}
            verifiedGuestToken={guest_token}
        />
    );
}
