import React from "react";
import { BadgeDollarSign, UtensilsCrossedIcon, Martini, Wifi } from "lucide-react";


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
export default function FeaturesToolTip({ options }: { options: any }) {
    return (
        <div className="flex justify-start w-full h-10 gap-3 bg-gray-200 border-b shadow">
            {tips.map((tip, index) => {
                const name: string = tip.name;
                const val: boolean = options[name];

                if (!val) return null;

                return (
                    <span
                        key={index}
                        title={tip.tip}
                        className="flex items-center justify-center p-0 transition-opacity bg-transparent border-none cursor-pointer hover:opacity-80"
                        aria-label={tip.tip}
                    >
                        <tip.icon className="h-6 mx-2 text-gray-500 border-2 rounded-sm" />
                    </span>
                );
            })}
        </div>
    );
}
