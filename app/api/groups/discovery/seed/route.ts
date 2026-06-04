import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateBlueprintFromSeed } from '../core-logic';

export const maxDuration = 300;

let isRunning = false;

const SeedRequestSchema = z.object({
    seed: z.string().min(1, 'Seed concept is required.').max(300),
    deepResearch: z.boolean().optional(),
});

/**
 * POST /api/groups/discovery/seed
 * Body: { seed: string, deepResearch?: boolean }
 *
 * Develops a single blueprint from an operator-supplied niche idea, skipping the
 * Gemini ideation funnel. When deepResearch is true (default), a focused Gemini
 * Deep Research pass grounds the seed before GPT-5 structures the blueprint. The
 * result passes the same launch-window + CB inventory match gates as the batch path
 * and saves as DRAFT (idempotent on slug).
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const parsed = SeedRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
            { status: 400 },
        );
    }

    if (isRunning) {
        return NextResponse.json(
            {
                success: false,
                error: 'A seed blueprint is already being generated. Try again after the current run completes.',
            },
            { status: 409 },
        );
    }

    const { seed, deepResearch } = parsed.data;
    isRunning = true;
    console.log(`[API] POST /api/groups/discovery/seed (seed="${seed}", deepResearch=${deepResearch !== false})`);

    try {
        const result = await generateBlueprintFromSeed({ seed, deepResearch });

        if (!result.campaign) {
            return NextResponse.json(
                {
                    success: false,
                    error: `The seed "${seed}" produced a blueprint that could not be matched to CB inventory or the launch window. Try a different angle, or re-scrape CB inventory.`,
                },
                { status: 422 },
            );
        }

        if (result.skipped) {
            return NextResponse.json({
                success: true,
                skipped: true,
                message: `A blueprint with slug "${result.campaign.id}" already existed — skipped (no duplicate created).`,
                campaign: { id: result.campaign.id, name: result.campaign.name, fetchUrl: `/api/groups/campaign/${result.campaign.id}` },
            });
        }

        return NextResponse.json({
            success: true,
            skipped: false,
            message: `Developed "${result.campaign.name}" from seed "${seed}".`,
            campaign: { id: result.campaign.id, name: result.campaign.name, fetchUrl: `/api/groups/campaign/${result.campaign.id}` },
            seedResearch: result.seedResearch,
        });
    } catch (error) {
        console.error('[API] Error in POST /api/groups/discovery/seed:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    } finally {
        isRunning = false;
    }
}
