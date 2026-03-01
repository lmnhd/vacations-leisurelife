import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

async function getAuthenticatedContext() {
    const hasExistingSession = existsSync(STATE_FILE);

    if (hasExistingSession) {
        console.log('[scrape-groups] Found saved session. Loading cookies...');
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: STATE_FILE });
        const page = await context.newPage();

        await page.goto(CB_BASE_URL + '/bookings/home/', { waitUntil: 'networkidle' });

        const currentUrl = page.url().toLowerCase();
        if (currentUrl.includes('/login') || currentUrl.includes('/accounts/')) {
            console.log('[scrape-groups] Session expired. Falling through to fresh login...');
            await browser.close();
        } else {
            console.log('[scrape-groups] Authenticated via saved session.');
            return { browser, page };
        }
    }

    console.log('[scrape-groups] No valid session. Performing automated login...');
    const email = process.env.CB_EMAIL ?? 'cc.lemonhead@gmail.com';
    const password = process.env.CB_PASSWORD ?? 'Rollpop1!';

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(CB_BASE_URL + '/accounts/login/', { waitUntil: 'domcontentloaded' });
    await page.fill('input#username', email);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    return { browser, page };
}

async function run() {
    console.log('\n--- Starting CB Agent Tools Group Discovery ---\n');
    const { browser, page } = await getAuthenticatedContext();

    try {
        console.log('\nNavigating to View Groups page to look for valid links...');
        await page.goto(CB_BASE_URL + '/groups/view_groups/', { waitUntil: 'networkidle' });

        // Grab ALL links to group-related stuff
        const links = await page.evaluate(() => {
           const anchors = document.querySelectorAll('a');
           return Array.from(anchors).map(a => ({ text: a.textContent?.trim(), href: a.href }));
        });

        console.log('\n=== GROUP LINKS ===\n');
        links.filter(l => l.href && l.href.includes('group') && l.text).forEach(l => console.log(l.text + ' -> ' + l.href));

    } catch (e) {
        console.error('Extraction Error:', e);
    } finally {
        await browser.close();
        console.log('\nDone.');
    }
}

run();
