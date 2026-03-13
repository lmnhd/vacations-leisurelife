import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callLLM, modelForTask } from "@/lib/ai/llm-gateway";

import { increaseApiLimit, checkApiLImit } from "@/lib/api-limit";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    const body = await req.json();
    const { messages } = body;
    console.log(messages);
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }
    const freeTrial = await checkApiLImit();

    if (!freeTrial) {
      return new NextResponse("Free trial limit exceeded", { status: 403 });
    }

    // Route through the gateway legacy chat profile for low-latency website conversation
    const lastUserMessage = (messages as Array<{ role: string; content: string }>)
      .filter((m) => m.role === 'user')
      .pop()?.content ?? '';
    const systemMessage = (messages as Array<{ role: string; content: string }>)
      .find((m) => m.role === 'system')?.content;

    const { content, raw } = await callLLM(modelForTask("legacy_chat"), lastUserMessage, {
      systemPrompt: systemMessage,
      maxTokens:    150,
    });

    await increaseApiLimit();

    // Return in the same shape as the original response.choices[0]
    const rawResponse = raw as { choices?: Array<{ message: { role: string; content: string } }> };
    const choice = rawResponse?.choices?.[0] ?? { message: { role: 'assistant', content } };
    return NextResponse.json(choice);
  } catch (error) {
    console.log(error);
    return new NextResponse("Internal Server Error", { status: 500 });
    // return new NextResponse("Internal Server Error", { status: 500 });
  }
}
