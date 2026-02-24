/**
 * manual-browser-test.ts
 * Launches a clean Playwright browser (ignores saved session).
 * Navigate manually, log in, and test the Continue button.
 */

import { chromium } from 'playwright';

async function run() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    // Log every URL change
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
            console.log('[URL] ->', frame.url());
        }
    });

    // Start at CBAgentTools login
    await page.goto('https://bookings.cbagenttools.com', { waitUntil: 'domcontentloaded' });

    console.log('\n===========================================');
    console.log('Browser is open. Please log in manually.');
    console.log('Then navigate to the Guest Info form and');
    console.log('click Continue — watching for URL changes.');
    console.log('Waiting 10 minutes...');
    console.log('===========================================\n');

    // Wait 10 minutes
    await page.waitForTimeout(10 * 60 * 1000);

    // Save the fresh session for future runs
    await context.storageState({ path: '.playwright-state.json' });
    console.log('\nSession saved to .playwright-state.json');
    console.log('Final URL:', page.url());
    await browser.close();
}

run().catch(console.error);
