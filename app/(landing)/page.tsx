import { LandingContent } from "@/components/landing-content";
import { LandingHero } from "@/components/landing-hero";
import { LandingNavbar } from "@/components/landing-navbar";
import { LandingValueProps } from "@/components/landing-value-props";
import { LandingFooter } from "@/components/landing-footer";
export const dynamic = 'force-dynamic'

export default async function LandingPage(){
    return (
    <div className="flex flex-col min-h-screen">
        <LandingNavbar />
        
        <LandingHero />
        <LandingValueProps />
        <div id="deals" className="scroll-mt-20">
          <LandingContent/>
        </div>
        <LandingFooter />
    </div>
    )
}