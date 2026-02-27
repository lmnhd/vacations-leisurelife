import { NextResponse } from 'next/server';
import { runOdysseusWarmup } from './core-logic';

export async function POST(): Promise<NextResponse> {
    try {
        const summary = await runOdysseusWarmup();
        return NextResponse.json(summary, { status: 200 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
