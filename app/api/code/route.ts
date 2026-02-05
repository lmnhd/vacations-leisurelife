import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server"
import Configuration, { ClientOptions, OpenAI} from "openai"

const configuration : ClientOptions = {
    apiKey: process.env.OPENAI_API_KEY,
}

const openai = new OpenAI(configuration)

const instructionMessage = {
    role: "system",
    content: "You are a code generator. You must answer only in markdown code snippets. Use code comments for explanations."
}


export async function POST(
    req: Request,
) {
    try {
        const { userId } = auth();
        const body = await req.json();
        const {messages} = body;
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

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [instructionMessage, ...messages],
            max_tokens: 500,
        })

        return NextResponse.json(response.choices[0])
    } catch (error) {
        console.log("[CODE_ERROR]",error)
        return new NextResponse("Internal Server Error", { status: 500 } )
    }
}