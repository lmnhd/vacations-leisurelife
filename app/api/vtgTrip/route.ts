

import { auth } from "@clerk/nextjs";
import { getDealData, start } from "./vtg.mjs";

import { NextResponse } from "next/server";

export async function POST(req:Request, res: Response) {

 //return NextResponse.json({message: "hello"});
 // const { userId } = auth();
  try {
    const body = await req.json();
    console.log("VTGTRIP CALL :",body)
  // const { data } = body;
   const {num, ship} = body;
  // console.log(num)
  // console.log(ship)
  
  

  const results = await getDealData(num, ship);
  //console.log(results)
  //const results = {"111": "222"};
  return NextResponse.json(results);
  } catch (error: any) {
    return new Response(error.message, { status: 501 });
  }
  
}
