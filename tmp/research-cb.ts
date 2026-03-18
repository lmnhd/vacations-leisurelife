import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

async function getAuthenticatedContext() {
    const email = process.env.CB_EMAIL ?? 'cc.lemonhead@gmail.com';
    const password = process.env.CB_PASSWORD ?? 'Rollpop1!';

    const hasExistingSession = existsSync(STATE_FILE);

    if (hasExistingSession) {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: STATE_FILE });
        const page = await context.newPage();

        await page.goto(CB_BASE_URL + '/bookings/home/', { waitUntil: 'networkidle' });

        const currentUrl = page.url().toLowerCase();
        if (!currentUrl.includes('/login') && !currentUrl.includes('/accounts/')) {
            return { browser, page, context };
        }
        await browser.close();
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(CB_BASE_URL + '/accounts/login/', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="username"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await context.storageState({ path: STATE_FILE });

    return { browser, page, context };
}

async function run() {
    const { browser, page, context } = await getAuthenticatedContext();

    function dump(name: string, text: string) {
        writeFileSync(`tmp/${name}.txt`, text);
        console.log(`Saved ${name}.txt`);
    }

    try {
        await page.goto(CB_BASE_URL + '/bookings/home/', { waitUntil: 'networkidle' });
        
        // Grab nav links to see where "Groups" or "Knowledge" is
        const navLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(a => a.text);
        });
        dump('nav-links', JSON.stringify(navLinks, null, 2));

        // Try going directly to /groups/
        let response = await page.goto(CB_BASE_URL + '/groups/', { waitUntil: 'networkidle' });
        if (response && response.ok()) {
            const bodyText = await page.evaluate(() => document.body.innerText);
            dump('groups-page', bodyText);
        }

        // Try going to training/knowledge base
        response = await page.goto(CB_BASE_URL + '/training/', { waitUntil: 'networkidle' });
        if (response && response.ok()) {
            const bodyText = await page.evaluate(() => document.body.innerText);
            dump('training-page', bodyText);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

run();
