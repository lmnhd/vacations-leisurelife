
import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(req: Request, context : {params: Promise<{message: string}>}) {
  try {
   // retrieve message from headers
   let response = '';
    const { message } = await context.params;
    console.log(message);

    switch (message) {
        case 'LLV_PHONE':
         response = process.env.NEXT_PUBLIC_LLV_PHONE || '';
    }

    
    

    return new NextResponse(response, { status: 200 });
  } catch (error) {
    console.log("[CODE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
