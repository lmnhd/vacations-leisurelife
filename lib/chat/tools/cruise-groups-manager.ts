import { chromium, Page } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

export type CruiseGroupData = {
    groupNumber?: string;
    groupName?: string;
    cruiseLine?: string;
    cruiseShip?: string;
    sailDate?: string; // MM/DD/YYYY
};

export type CruiseGroupsManagerInput = {
    action: 'search' | 'create';
    searchQuery?: string;
    groupData?: CruiseGroupData;
};

export type CruiseGroupsManagerOutput = {
    status: 'success' | 'error';
    message: string;
    results: any[];
};

/**
 * Ensures we are authenticated using the existing .playwright-state.json
 */
async function getAuthenticatedContext() {
    console.log('[cruise-groups-manager] Initializing headless browser...');
    const browser = await chromium.launch({ headless: true });

    if (!existsSync(STATE_FILE)) {
        await browser.close();
        throw new Error('No active Playwright session found. Please run the CB scraper or Odysseus Engine first to establish a session.');
    }

    console.log('[cruise-groups-manager] Loading session state...');
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    return { browser, context, page };
}

/**
 * Action: Search for existing groups
 */
async function performSearch(page: Page, query: string): Promise<CruiseGroupsManagerOutput> {
    console.log('[cruise-groups-manager] Navigating to Groups view...');
    await page.goto(`${CB_BASE_URL}/groups/view_groups/`, { waitUntil: 'domcontentloaded' });

    // The page has a search input we can utilize, or we can just scrape the table and filter in memory.
    // For simplicity and speed, we'll scrape the table and filter.
    console.log(`[cruise-groups-manager] Executing search for: ${query}`);

    const groups = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return null;
            return {
                groupId: cells[0]?.textContent?.trim() || '',
                shipName: cells[1]?.textContent?.trim() || '',
                vendor: cells[2]?.textContent?.trim() || '',
                sailDate: cells[3]?.textContent?.trim() || '',
                startingPrice: cells[4]?.textContent?.trim() || '',
                priceAdvantage: cells[5]?.textContent?.trim() || ''
            };
        }).filter(Boolean);
    });

    const lowerQuery = query.toLowerCase();
    const filtered = groups.filter(g =>
        g && (
            g.groupId.toLowerCase().includes(lowerQuery) ||
            g.shipName.toLowerCase().includes(lowerQuery) ||
            g.vendor.toLowerCase().includes(lowerQuery)
        )
    );

    return {
        status: 'success',
        message: `Found ${filtered.length} groups matching '${query}'.`,
        results: filtered
    };
}

/**
 * Action: Register a new private group
 */
async function performCreate(page: Page, data: CruiseGroupData): Promise<CruiseGroupsManagerOutput> {
    console.log('[cruise-groups-manager] Navigating to Build A Group form...');

    // The build group link redirects to a formstack iframe
    await page.goto(`${CB_BASE_URL}/groups/build/`, { waitUntil: 'networkidle' });

    // Ensure we are actually on the form page
    const currentUrl = page.url();
    if (!currentUrl.includes('formstack')) {
        throw new Error(`Failed to reach Formstack form. Current URL: ${currentUrl}`);
    }

    console.log('[cruise-groups-manager] Filling out Formstack registration...');

    // These selectors are from our specific discovery session
    if (!data.groupNumber || !data.groupName || !data.cruiseLine || !data.cruiseShip || !data.sailDate) {
        throw new Error('All groupData fields (number, name, line, ship, date) are required for creation.');
    }

    try {
        await page.fill('input#field145657397', data.groupNumber);
        await page.fill('input#field145834012', data.groupName);
        await page.fill('input#field145657559', data.cruiseLine);
        await page.fill('input#field145657599', data.cruiseShip);

        // Date filling (React/MUI date picker)
        // Since it's an input inside a complex div, we might be able to type it directly if we focus it.
        // Formstack date inputs often allow direct text entry MM/DD/YYYY
        await page.locator('div[role="group"]').click();
        await page.keyboard.type(data.sailDate);

        // Agent details (pulling from environment or defaults)
        await page.fill('input#field145657431-first', process.env.AGENT_FIRST_NAME || 'CC');
        await page.fill('input#field145657431-last', process.env.AGENT_LAST_NAME || 'Lemonhead');
        await page.fill('input#field145657831', process.env.CB_EMAIL || 'cc.lemonhead@gmail.com');

        console.log('[cruise-groups-manager] Form filled. (DRY RUN - Submission disabled for safety)');
        // In a real environment: await page.locator('button#fsSubmitButton5311126').click();

        return {
            status: 'success',
            message: `Successfully drafted registration for Group ${data.groupName} (${data.groupNumber}) on ${data.cruiseShip}. (Submission simulated for safety)`,
            results: [data]
        };

    } catch (e) {
        console.error('[cruise-groups-manager] Form fill failed:', e);
        await page.screenshot({ path: 'group-create-error.png' });
        throw new Error('Failed to complete the Group Registration form. Check form selectors.');
    }
}

/**
 * Main handler
 */
export async function runCruiseGroupsManager(input: CruiseGroupsManagerInput): Promise<CruiseGroupsManagerOutput> {
    let browserContextManager: { browser: any; context: any; page: any } | null = null;

    try {
        browserContextManager = await getAuthenticatedContext();
        const { page } = browserContextManager;

        if (input.action === 'search') {
            if (!input.searchQuery) throw new Error("A searchQuery is required for the 'search' action.");
            return await performSearch(page, input.searchQuery);
        } else if (input.action === 'create') {
            if (!input.groupData) throw new Error("groupData is required for the 'create' action.");
            return await performCreate(page, input.groupData);
        } else {
            throw new Error(`Unknown action type: ${input.action}`);
        }

    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred in Cruise Groups Manager';
        console.error('[cruise-groups-manager]', msg);
        return {
            status: 'error',
            message: msg,
            results: []
        };
    } finally {
        if (browserContextManager?.browser) {
            await browserContextManager.browser.close();
            console.log('[cruise-groups-manager] Browser connection closed.');
        }
    }
}
