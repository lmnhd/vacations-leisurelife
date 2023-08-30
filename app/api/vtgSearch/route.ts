

import { auth } from "@clerk/nextjs";
import { search, start } from "./vtg.mjs";

import { NextResponse } from "next/server";

export async function POST(req:Request, res: Response) {
  //const { userId } = auth();
  try {
    const body = await req.json();
  const { data } = body;
  const {incCT,sm, sd, tm, td, d, l,  n, r ,rd, rt, s, v} = data;
  
  const url = `https://www.vacationstogo.com/ticker.cfm?incCT=${incCT}&sm=${sm}&tm=${tm}&r=${r}&l=${l}&s=${s}&n=${n}&d=${d}&v=${v}&sd=${sd}&td=${td}&rd=${rd}&rt=${rt}`

  const results = await search(url);
  return NextResponse.json(results);
  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
  
}
