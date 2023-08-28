import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import Configuration, { ClientOptions, OpenAI } from "openai";

import { increaseApiLimit, checkApiLImit } from "@/lib/api-limit";

const configuration: ClientOptions = {
  apiKey: process.env.OPENAI_API_KEY,
};

const openai = new OpenAI(configuration);

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { messages } = body;
    console.log(messages);
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!configuration.apiKey) {
      return new NextResponse("OpenAI key not configured", { status: 500 });
    }

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }
    const freeTrial = await checkApiLImit();

    if (!freeTrial) {
      return new NextResponse("Free trial limit exceeded", { status: 403 });
    }



    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      max_tokens: 150,
    });

    await increaseApiLimit();

    return NextResponse.json(response.choices[0]);
  } catch (error) {
    console.log(error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
