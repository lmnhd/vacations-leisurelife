import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CB_LOGIN_URL = 'https://www.cbagenttools.com';
const TARGET_PAGES: ReadonlyArray<{ url: string; source: string; tags: string[] }> = [
    {
        url: 'https://www.cbagenttools.com/marketing/vendor_urls/',
        source: 'Cruise Brothers Vendor Directory',
        tags: ['vendor', 'commission', 'cruise line', 'phone', 'agent'],
    },
    {
        url: 'https://www.cbagenttools.com/marketing/todaysview/',
        source: 'Cruise Brothers Promotions',
        tags: ['promotion', 'deal', 'discount', 'offer', 'cruise line'],
    },
    {
        url: 'https://www.cbagenttools.com/bookings/home/',
        source: 'Cruise Brothers Agent Handbook',
        tags: ['handbook', 'agent', 'policy', 'announcement'],
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

    const usernameSelector = 'input[name="username"], input[type="text"], textbox';
    const passwordSelector = 'input[name="password"], input[type="password"]';
    const submitSelector = 'button[type="submit"], button:has-text("Submit")';

    await page.waitForSelector(passwordSelector, { timeout: 15000 });

    await page.fill(usernameSelector, input.email);
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

async function scrapeVendorEntries(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>
): Promise<KnowledgeCacheEntry[]> {
    await page.goto('https://www.cbagenttools.com/marketing/vendor_urls/', { waitUntil: 'domcontentloaded' });

    const rows = await page.locator('table tr').all();
    const entries: KnowledgeCacheEntry[] = [];

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 4) continue;

        const vendorName = normalizeText(await cells[0].innerText());
        const commission = normalizeText(await cells[1].innerText());
        const agentPhone = normalizeText(await cells[3].innerText());
        const groupPhone = cells[4] ? normalizeText(await cells[4].innerText()) : '';

        if (!vendorName || vendorName === 'Vendor Name') continue;

        entries.push({
            title: vendorName,
            content: `Cruise line: ${vendorName}. Commission: ${commission}. Agent phone: ${agentPhone}${groupPhone ? `. Group phone: ${groupPhone}` : ''}.`,
            source: 'Cruise Brothers Vendor Directory',
            url: 'https://www.cbagenttools.com/marketing/vendor_urls/',
            tags: ['vendor', 'commission', 'cruise line', vendorName.toLowerCase(), agentPhone],
        });
    }

    return entries;
}

async function scrapePromotionEntries(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>
): Promise<KnowledgeCacheEntry[]> {
    await page.goto('https://www.cbagenttools.com/marketing/todaysview/', { waitUntil: 'domcontentloaded' });

    const promoLinks = await page.locator('a[href*="/marketing/promotion/"]').all();
    const entries: KnowledgeCacheEntry[] = [];
    const seen = new Set<string>();

    for (const link of promoLinks) {
        const title = normalizeText(await link.innerText());
        if (!title || seen.has(title)) continue;
        seen.add(title);

        entries.push({
            title,
            content: `Current promotion: ${title}. Available through Cruise Brothers agent portal.`,
            source: 'Cruise Brothers Promotions',
            url: 'https://www.cbagenttools.com/marketing/todaysview/',
            tags: ['promotion', 'deal', 'offer', title.toLowerCase()],
        });
    }

    return entries;
}

async function scrapeKnowledgeEntries(page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>): Promise<KnowledgeCacheEntry[]> {
    const vendorEntries = await scrapeVendorEntries(page);
    const promotionEntries = await scrapePromotionEntries(page);
    return [...vendorEntries, ...promotionEntries];
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
