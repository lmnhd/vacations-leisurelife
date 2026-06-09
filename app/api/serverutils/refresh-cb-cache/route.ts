import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

export async function GET(request: Request) {
    // Basic security: require a secret token to trigger this route
    // In production, you would configure this in Vercel Cron and your .env
    const authHeader = request.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const promosOnly = searchParams.get('promosOnly') === '1' || searchParams.get('promosOnly') === 'true';
        const scriptPath = path.join(process.cwd(), 'scripts', 'scrape-cb-deals.ts');
        const command = `npx tsx "${scriptPath}"${promosOnly ? ' --promos-only' : ''}`;

        // Use 'npx tsx' to execute the TypeScript Playwright script
        const { stdout, stderr } = await execAsync(command, {
            cwd: process.cwd(),
            // Ensure child process runs with environment variables
            env: {
                ...process.env,
                PATH: process.env.PATH || '',
            }
        });

        // Parse stdout to find the results output
        const promosMatch = stdout.match(/Promos: (\d+)/);
        const bookablePromosMatch = stdout.match(/Bookable Promos: (\d+)/);
        const groupsMatch = stdout.match(/Groups: (\d+)/);

        return NextResponse.json({
            status: 'success',
            message: 'CB Deals Cache refreshed successfully.',
            details: {
                promosOnly,
                promosFound: promosMatch ? parseInt(promosMatch[1], 10) : 0,
                bookablePromosFound: bookablePromosMatch ? parseInt(bookablePromosMatch[1], 10) : 0,
                groupsFound: groupsMatch ? parseInt(groupsMatch[1], 10) : 0,
            },
            logs: stdout.split('\n').filter(l => l.includes('[scrape-cb-deals]')),
            errors: stderr ? stderr.split('\n').filter(l => l.trim()) : []
        }, { status: 200 });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown execution error';
        return NextResponse.json({
            status: 'error',
            message: 'Failed to refresh CB Deals cache.',
            error: message
        }, { status: 500 });
    }
}
