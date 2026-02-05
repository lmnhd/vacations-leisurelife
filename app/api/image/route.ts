import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server"
import Configuration, { ClientOptions, OpenAI} from "openai"
import { resourceLimits } from "worker_threads";

const configuration : ClientOptions = {
    apiKey: process.env.OPENAI_API_KEY,
}

const openai = new OpenAI(configuration)


export async function POST(
    req: Request,
) {
    try {
        const { userId } = await auth();
        const body = await req.json();
        const { prompt, amount = 1, resolution = "512x512"} = body;
        console.log(body);
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        if (!configuration.apiKey) {
            return new NextResponse("OpenAI key not configured", { status: 500 });
        }

        if (!prompt) {
            return new NextResponse("Prompt is required", { status: 400 });
        }
        if (!amount) {
            return new NextResponse("Amount is required", { status: 400 });
        }
        if (!resolution) {
            return new NextResponse("Resolution is required", { status: 400 });
        }

        const response = await openai.images.generate({
            prompt: prompt,
            n: parseInt(amount, 10),
            size: resolution,

            
        })

        return NextResponse.json(response.data)
    } catch (error) {
        console.log("[IMAGE_ERROR]",error)
        return new NextResponse("Internal Server Error", { status: 500 } )
    }
}