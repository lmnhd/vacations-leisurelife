import { notFound } from 'next/navigation';
import { CampaignLandingPage } from '@/components/campaign-landing/landing-page';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { ReviewControls } from './review-controls';
import { CampaignLandingPageClaude } from '@/components/campaign-landing/CampaignLandingPageClaude';

export const dynamic = 'force-dynamic';

export default async function CampaignLandingPreviewPage(
    {
        params,
    }: {
        params: Promise<{ slug: string }>;
    },
) {
    const { slug } = await params;
    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: true });

    if (!result) {
        notFound();
    }

    return (
        <div className="flex min-h-screen flex-col bg-slate-100">
            <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm md:px-6">
                <div className="mx-auto w-full max-w-7xl">
                    <ReviewControls slug={slug} title={result.landing.title} state={result.landing.state} />
                </div>
            </div>

            {/* Simulated Device/Browser Frame */}
            <div className="relative mx-auto mt-8 w-full max-w-[1400px] flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                    <div className="ml-4 flex-1 rounded-md bg-white px-3 py-1 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
                        leisurelife.app/groups/{slug}
                    </div>
                </div>
                
                {/* The Public Render */}
                <div className="h-full overflow-y-auto">
                    <CampaignLandingPageClaude landing={result.landing} />
                </div>
            </div>
            <div className="h-16" />
        </div>
    );
}