// "use client";

import { Card, CardContent, CardTitle } from "./ui/card";
import PromotionTile, {PromotionTileProps} from '@/components/promotion-tile'
import CBDestinationPicksTiles from "./cb/cbdestinationpickstile";



const promotionsTest:PromotionTileProps[] = [
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 1",
    port: "Port of Galveston",
    header1: "Western Caribbean",
    header2: "Carnival Vista",
    description: "lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco",
    price:{perPerson:"1000"},
    detailsLink: "/cruises/1",
    bookButton:true,
    toolTips:{freeDrinks:true,onboardCredits:true,freeWifi:true,freeDining:true}
    
  },
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 2",
    port: 'Cozumel, Mexico',
    header1: "Western Caribbean",
    description: "Depart from the Port of Galveston, Texas",
    price:{perPerson:"1000"},
    detailsLink: "/cruises/2",
    // bookButton:true
    toolTips:{freeWifi:true}
  },
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 8",
    port: 'Cozumel, Mexico',
    header1: "Western Caribbean",
    description: "Depart from the Port of Galveston, Texas",
    price:{perPerson:"1000"},
    detailsLink: "/cruises/2",
    // bookButton:true
    toolTips:{freeWifi:true}
  },
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 3",
    port: "Port of Galveston",
    header1: "Western Caribbean",
    description: "Explore the islands of the Western Caribbean with free dining and $200 onbooard credit",
    price:{perPerson:"800"},
    bookButton:true,
    toolTips:{freeDrinks:true},
    detailsLink: "/cruises/1"
  },
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 4",
    port: "Port of Galveston",
    header1: "Western Caribbean",
    description: "live it up on the high seas of the pacific with free dining and $200 onbooard credit",
    detailsLink: "/cruises/1",
    toolTips:{freeDrinks:true,onboardCredits:true}
  },
  {
    imageSrc: "https://images.unsplash.com/photo-1515377905703-ecb22b01fbeb?ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y3J1aXNlJTIwc2hpcHxlbnwwfHwwfHw%3D&ixlib=rb-1.2.1&w=1000&q=80",
    alt: "Cruise Ship",
    day: "Day 5",
    port: "Port of Galveston",
    header1: "Western Caribbean",
    description: "lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    detailsLink: "/cruises/1"
  },
 
];

export const LandingContent = async () => {
 

  return (
  <>

     <div 
     //className="bg-primary/50 hover:bg-gradient-to-br hover:from-lime-400/70 hover:via-lime-500  hover:to-lime-400/70"
     //className="px-10 pb-20 bg-primary hover:bg-gradient-to-r hover:from-primary-foreground/70 hover:via-primary/70 hover:to-primary-foreground/70 transition-all ease-in-out duration-500 "
     >
      <CBDestinationPicksTiles/>
       
     </div>
    </>
  );
};
