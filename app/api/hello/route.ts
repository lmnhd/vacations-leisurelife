
import { NextResponse } from "next/server";

export async function GET(req:Request) {
   

	// console.log(result?.data);
   try {
     
    return NextResponse.json({message: "Hello World!"})
   } catch (error) {
    return new NextResponse("Internal Server Error", { status: 500 } )
   }

 
 
  
}
