import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callLLM, ModelName } from "@/lib/ai/llm-gateway";

const instructionMessage = {
    role: "system",
    content: "You are a code generator. You must answer only in markdown code snippets. Use code comments for explanations."
}


export async function POST(
    req: Request,
) {
    try {
        const { userId } = await auth();
        const body = await req.json();
        const {messages} = body;
        console.log(messages);
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        if (!messages) {
            return new NextResponse("Messages are required", { status: 400 });
        }

        // Route through the gateway — CLAUDE_4_OPUS for code generation (top SWE-bench score)
        const userContent = (messages as Array<{ role: string; content: string }>)
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join('\n');

        const { content, raw } = await callLLM(ModelName.CLAUDE_4_OPUS, userContent, {
            systemPrompt: instructionMessage.content,
            maxTokens:    500,
        });

        // Return in the same shape as the original response.choices[0]
        const rawResponse = raw as { choices?: Array<unknown> };
        const choice = rawResponse?.choices?.[0] ?? { message: { role: 'assistant', content } };
        return NextResponse.json(choice);
    } catch (error) {
        console.log("[CODE_ERROR]",error)
        return new NextResponse("Internal Server Error", { status: 500 } )
    }
}