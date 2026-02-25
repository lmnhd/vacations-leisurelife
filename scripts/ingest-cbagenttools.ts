import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CB_LOGIN_URL = 'https://www.cbagenttools.com';
const TARGET_PAGES: ReadonlyArray<{ url: string; source: string; tags: string[] }> = [
    {
        url: 'https://www.cbagenttools.com',
        source: 'Cruise Brothers Agent Handbook',
        tags: ['handbook', 'agent', 'policy'],
    },
    {
        url: 'https://bookings.cbagenttools.com',
        source: 'Supplier Portal Procedures',
        tags: ['supplier', 'portal', 'procedures'],
    },
];

const OUTPUT_DIRECTORY = path.join(process.cwd(), '.github', 'data');
const OUTPUT_FILE_PATH = path.join(OUTPUT_DIRECTORY, 'cb-knowledge-cache.json');

type KnowledgeCacheEntry = {
    title: string;
    content: string;
    source: string;
    url: string;
    tags: string[];
};

function normalizeText(rawText: string): string {
    return rawText.replace(/\s+/g, ' ').trim();
}

function ensureEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

async function loginToCBAgentTools(input: {
    email: string;
    password: string;
}): Promise<{
    browser: Awaited<ReturnType<typeof chromium.launch>>;
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>;
}> {
    const browser = await chromium.launch({
        headless: true,
    });

    const page = await browser.newPage();
    await page.goto(CB_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const emailSelector = 'input[name="email"], input[type="email"]';
    const passwordSelector = 'input[name="password"], input[type="password"]';
    const submitSelector = 'button[type="submit"], button:has-text("Sign In"), button:has-text("Login")';

    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.waitForSelector(passwordSelector, { timeout: 15000 });

    await page.fill(emailSelector, input.email);
    await page.fill(passwordSelector, input.password);
    await page.click(submitSelector);

    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        await browser.close();
        throw new Error('CBAgentTools login did not complete successfully.');
    }

    return {
        browser,
        page,
    };
}

async function scrapeKnowledgeEntries(page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>): Promise<KnowledgeCacheEntry[]> {
    const allEntries: KnowledgeCacheEntry[] = [];

    for (const targetPage of TARGET_PAGES) {
        await page.goto(targetPage.url, { waitUntil: 'domcontentloaded' });

        const pageTitle = normalizeText(await page.title());
        const pageBodyText = normalizeText(
            await page.locator('main, article, body').first().innerText({ timeout: 15000 })
        );

        const trimmedBody = pageBodyText.slice(0, 6000);
        if (trimmedBody.length === 0) {
            continue;
        }

        allEntries.push({
            title: pageTitle.length > 0 ? pageTitle : targetPage.source,
            content: trimmedBody,
            source: targetPage.source,
            url: targetPage.url,
            tags: [...targetPage.tags],
        });
    }

    return allEntries;
}

async function runIngestion(): Promise<void> {
    const email = ensureEnvVar('CB_EMAIL');
    const password = ensureEnvVar('CB_PASSWORD');

    const { browser, page } = await loginToCBAgentTools({ email, password });

    try {
        const entries = await scrapeKnowledgeEntries(page);
        if (entries.length === 0) {
            throw new Error('No knowledge entries were collected from CBAgentTools.');
        }

        await mkdir(OUTPUT_DIRECTORY, { recursive: true });
        await writeFile(
            OUTPUT_FILE_PATH,
            JSON.stringify(
                {
                    generatedAtIso: new Date().toISOString(),
                    entries,
                },
                null,
                2
            ),
            'utf-8'
        );

        console.log(`Cruise Brothers knowledge cache written to: ${OUTPUT_FILE_PATH}`);
        console.log(`Entries captured: ${entries.length}`);
    } finally {
        await browser.close();
    }
}

runIngestion().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error';
    console.error(`[ingest-cbagenttools] ${message}`);
    process.exitCode = 1;
});
