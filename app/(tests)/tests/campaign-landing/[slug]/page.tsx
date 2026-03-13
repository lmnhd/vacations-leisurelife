import { notFound } from 'next/navigation';
import { CampaignLandingPage } from '@/components/campaign-landing/landing-page';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { Card, CardContent } from '@/components/ui/card';

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
            {/* Developer/Reviewer Toolbar */}
            <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-6 py-3 text-amber-950 shadow-sm">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em]">Review Mode Route</p>
                        <p className="text-sm">Viewing <span className="font-semibold">{result.landing.title}</span> • State: {result.landing.state}</p>
                    </div>
                    <p className="text-xs max-w-sm text-amber-800">
                        This view is not public. Any structural layout notes or instructions have been removed from the public component to prevent guest confusion.
                    </p>
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
                    <CampaignLandingPage landing={result.landing} />
                </div>
            </div>
            <div className="h-16" />
        </div>
    );
}