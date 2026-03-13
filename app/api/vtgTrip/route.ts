
import { getDealData } from "./vtg.mjs";

import { NextResponse } from "next/server";

export async function POST(req:Request) {

 //return NextResponse.json({message: "hello"});
 // const { userId } = auth();
  try {
    const body = await req.json();
   
   const {num, ship} = body;

  
  

  const results = await getDealData(num, ship);
  //console.log(results)
  //const results = {"111": "222"};
  return NextResponse.json(results);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(message, { status: 501 });
  }
  
}
