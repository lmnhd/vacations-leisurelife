import { LandingContent } from "@/components/landing-content";
import { LandingHero } from "@/components/landing-hero";
import { LandingNavbar } from "@/components/landing-navbar";
import { LandingValueProps } from "@/components/landing-value-props";
import { LandingFooter } from "@/components/landing-footer";
import { getPublicDealTiles } from "@/lib/cb/deals-system/public-deals";
export const dynamic = 'force-dynamic'

export default async function LandingPage(){
    // Only show the "View Deals" jump button when there is at least one
    // approval-gated, link-valid, bookable Deal to scroll to.
    const dealTiles = await getPublicDealTiles().catch(() => []);
    const hasDeals = dealTiles.length > 0;
    return (
    <div className="flex flex-col min-h-screen">
        <LandingNavbar />

        <LandingHero hasDeals={hasDeals} />
        <LandingValueProps />
        <div id="deals" className="scroll-mt-20">
          <LandingContent/>
        </div>
        <LandingFooter />
    </div>
    )
}