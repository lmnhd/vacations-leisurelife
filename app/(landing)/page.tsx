import { LandingContent } from "@/components/landing-content";
import { LandingHero } from "@/components/landing-hero";
import { LandingNavbar } from "@/components/landing-navbar";
import { checkPixaBay } from "@/app/utils/CommonObjects/imagemachine.mjs"




export default async function LandingPage(){
    const images = await checkPixaBay("carnival cruise",5)
    console.log(images)
    const settings = {
      dots: true,
      infinite: true,
      speed: 500,
      slidesToShow: 1,
      slidesToScroll: 1,
      autoplay: true,
      autoplaySpeed: 1000,
    };
    return (
    <div className="h-full" >
        <LandingNavbar />
        <img 
        alt="header"
        
        src={images[0].src}
        />
      
        {/* <Slick/> */}
        {/* <LandingHero />
        <LandingContent/> */}
    </div>
    )
}