import React from 'react'
import pexelmachine from '@/app/utils/CommonObjects/pexelmachine'
import { getCBSpecials, cbPicks } from "@/app/(dashboard)/(routes)/promotions/index";
import PromotionTile, {PromotionTileProps} from '../promotion-tile';

export  default async function CBDestinationPicksTiles() {
    //const __destinationPicks:any[] = await cbPicks()
    
    
    //console.log(__destinationPicks)

    //const sortedDestinations:any[] = sortByDestination(__destinationPicks)

    function sortByDestination(picks:any[]){
        const foundDestinations:any[] = []
        const result = []
        picks.forEach((pick,index) => {
            const testdest:string = pick.destination.replace('Destination:','').split(' - ')[0].trim();
            if(!foundDestinations.includes(testdest)){
                foundDestinations.push(testdest)
                
                const picks = [];
                picks.push(pick);
                foundDestinations.push({destination:testdest,picks:picks,count:1})
                
            }else{
                const dest = foundDestinations.find((dest) => dest.destination === testdest)
                dest.picks.push(pick)
                dest.count = dest.count + 1
                foundDestinations.splice(foundDestinations.indexOf(dest),1,dest)
                
            }

            
        })
        console.log(foundDestinations)
        return foundDestinations
    }

     const photos:any = await pexelmachine(6,'australian vacation')
     console.log(photos)
    //  promotionsTest.forEach((promotion,index) => {
    //    //console.log(photos.photos[index])
    //    promotion.imageSrc = photos.photos[index].src.medium
    //  })
    
     //console.log(promotionsTest)

  return (
    <div>CBDestinationPicksTiles</div>
  )
}
