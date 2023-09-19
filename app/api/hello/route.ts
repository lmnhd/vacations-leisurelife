

import { auth } from "@clerk/nextjs";



import { NextResponse } from "next/server";

export async function GET(req:Request, res: Response) {
   

	// console.log(result?.data);
   try {
     
    return NextResponse.json({message: "Hello World!"})
   } catch (error) {
    return new NextResponse("Internal Server Error", { status: 500 } )
   }

 
 
  
}
