import React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BadgeDollarSign,UtensilsCrossedIcon,Martini, Wifi } from "lucide-react";


export interface ToolTipsProps {
    'onboardCredits'?: boolean;
    'freeDining'?: boolean;
    'freeDrinks'?: boolean;
    'freeWifi'?: boolean;
}
type ToolTipPropsType = {
    icon: any;
    tip: string;
    name: string;
};
const tips = [
    {
        icon: BadgeDollarSign,
        tip:'Onboard Credit',
        name:'onboardCredits'
        
    },
    {
        icon: UtensilsCrossedIcon,
        tip:'Free Dining',
        name:'freeDining'
    },
    {
        icon: Martini,
        tip:'Free Drinks',
        name:'freeDrinks'
    },
    {
        icon: Wifi ,
        tip:'Free Wifi',
        name:'freeWifi'
        
    }
]
export default function FeaturesToolTip({options}:{options:ToolTipsProps}) {
  return (
    <div className='h-10 w-full flex justify-start border-b shadow gap-3 bg-gray-200'>
        {tips.map((tip,index) => {
            const name:string = tip.name
            const val:boolean = options[name]
            console.log(val)
            // if(val) return null 
            return val && (
                 <TooltipProvider key={index}>
                    <Tooltip>
                    <TooltipTrigger>
                        <div className='flex items-center justify-center'>
                           <tip.icon className='text-gray-500 border-2 h-6 mx-2'/>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent className='bg-gray-700  text-white text-center'>
                        {tip.tip}
                    </TooltipContent>
                    </Tooltip>
                   
                </TooltipProvider>
            )
        })}
    </div>
    
  )
}
