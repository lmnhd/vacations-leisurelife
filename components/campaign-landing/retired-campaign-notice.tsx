import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { GuestPortal } from '@/components/campaign-landing/guest-portal';

interface RetiredCampaignNoticeProps {
    landing: CampaignLandingViewModel;
}

/**
 * Public-facing view for a retired campaign. The real landing page is rendered
 * behind a heavy blur + scrim and made fully non-interactive (pointer-events:none,
 * aria-hidden), with an "expired" notice floated on top. This keeps the page
 * recognizable as a real, finished campaign without letting the public read,
 * scroll, or submit anything on it.
 */
export function RetiredCampaignNotice({ landing }: RetiredCampaignNoticeProps) {
    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-slate-950">
            {/* Decorative, blurred snapshot of the real page. Not interactive. */}
            <div
                aria-hidden="true"
                className="pointer-events-none select-none blur-2xl saturate-50 scale-105 opacity-60"
            >
                <GuestPortal landing={landing} />
            </div>

            {/* Darkening scrim over the blurred page. */}
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-slate-950/70"
            />

            {/* Expired notice. */}
            <div className="absolute inset-0 flex items-center justify-center px-6 py-16">
                <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                        Campaign closed
                    </p>
                    <h1 className="mt-4 text-2xl font-semibold text-white">
                        This sailing is no longer available
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                        {landing.title} has been retired and is no longer accepting new
                        guests. The trip you were looking for has wrapped up or moved on.
                    </p>
                    <p className="mt-6 text-sm leading-relaxed text-slate-400">
                        New themed group sailings are always forming. Check back soon for
                        the next one.
                    </p>
                </div>
            </div>
        </div>
    );
}
