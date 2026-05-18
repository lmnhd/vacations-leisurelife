import { notFound } from 'next/navigation';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import type { VisualFlavor } from '@/lib/campaigns/schema';
import { ReviewControls } from './review-controls';
import { GuestPortal } from '@/components/campaign-landing/guest-portal';
import { FlavorAuditionToolbar } from '@/components/campaign-landing/flavor-audition-toolbar';

export const dynamic = 'force-dynamic';

const VALID_FLAVORS: VisualFlavor[] = ['editorial_magazine', 'travel_nostalgia', 'indie_zine', 'none'];

function parseFlavorParam(value: string | string[] | undefined): VisualFlavor | undefined {
    if (typeof value !== 'string') return undefined;
    return (VALID_FLAVORS as string[]).includes(value) ? (value as VisualFlavor) : undefined;
}

export default async function CampaignLandingPreviewPage(
    {
        params,
        searchParams,
    }: {
        params: Promise<{ slug: string }>;
        searchParams: Promise<{ flavor?: string | string[] }>;
    },
) {
    const { slug } = await params;
    const { flavor } = await searchParams;
    const flavorOverride = parseFlavorParam(flavor);

    const result = await getCampaignLandingBySlug(slug, {
        includeDraftPreview: true,
        flavorOverride,
    });

    if (!result) {
        notFound();
    }

    const persistedFlavor = result.campaign.manualVisualFlavor
        ?? result.brief?.identityBlueprint?.visualFlavor
        ?? 'none';
    const persistedIsLocked = Boolean(result.campaign.manualVisualFlavor);

    return (
        <div className="flex min-h-screen w-full flex-col bg-slate-100">
            <div className="relative z-20 w-full">
                <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm md:px-6">
                    <div className="mx-auto w-full max-w-7xl">
                        <ReviewControls slug={slug} title={result.landing.title} state={result.landing.state} />
                    </div>
                </div>
            </div>
            <div className="sticky top-0 z-30 w-full">
                <FlavorAuditionToolbar
                    slug={slug}
                    persistedFlavor={persistedFlavor}
                    persistedIsLocked={persistedIsLocked}
                />
            </div>

            {/* Public render — full bleed, no simulated browser frame.
                The Guest Portal is meant to feel edge-to-edge in 2026. */}
            <div className="w-full">
                <GuestPortal landing={result.landing} />
            </div>
        </div>
    );
}
