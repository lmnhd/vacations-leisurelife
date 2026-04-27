import { NextResponse } from "next/server";
import { callLLM, modelForTask } from "@/lib/ai/llm-gateway";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;
    console.log(messages);

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
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
