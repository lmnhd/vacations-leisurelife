import { LandingContent } from "@/components/landing-content";
import { LandingHero } from "@/components/landing-hero";
import { LandingNavbar } from "@/components/landing-navbar";
//import { checkPixaBay } from "@/app/utils/CommonObjects/imagemachine.mjs"
import {createClient} from 'pexels'
import {getRandomNumberBetween} from '@/app/utils/CommonObjects/imagemachine.mjs'
import Image from "next/image";
import heroImage from '@/public/two-2413470_1920.jpg'


//https://www.istockphoto.com/photo/tropical-paradise-gm155375632-19833254




export default async function LandingPage(){
   


   
    return (
    <div className="" >
        <LandingNavbar />
        
        <LandingHero />
        <LandingContent/>
    </div>
    )
}