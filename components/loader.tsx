import { Loader2 } from "lucide-react";
import Image from "next/image";

export const Loader = () => {
  return <div
  className="flex flex-col items-center justify-center h-full gap-y-4"
  >
    <div className="relative w-10 h-10 animate-pulse">
    <Loader2
   
    
    
    />
    </div>
    <p className="text-sm text-center text-muted-foreground">
        Loading...
    </p>
  </div>;
};
