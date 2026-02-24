/**
 * monitor-manual-flow.ts
 * Opens browser at search results. YOU navigate manually.
 * Captures every network request + URL change for comparison.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');
const CB_AGENT_TOOLS_URL = 'https://bookings.cbagenttools.com';

async function monitor() {
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
        viewport: { width: 1920, height: 1080 }
    });

    const capturedRequests: Array<{ time: string; method: string; url: string; postData: string }> = [];
    const urlChanges: Array<{ time: string; url: string }> = [];

    // Attach monitoring to any new tab that opens
    context.on('page', (newPage) => {
        console.log('[Monitor] New tab opened:', newPage.url());
        attachMonitoring(newPage);
    });

    const page = await context.newPage();
    attachMonitoring(page);

    function attachMonitoring(p: typeof page) {
        p.on('request', (req) => {
            // Only capture booking-related requests
            if (req.url().includes('cbagenttools') || req.url().includes('nitroapi')) {
                const entry = {
                    time: new Date().toISOString(),
                    method: req.method(),
                    url: req.url(),
                    postData: req.postData() ?? ''
                };
                capturedRequests.push(entry);
                console.log(`[REQ] ${req.method()} ${req.url().substring(0, 100)}`);
            }
        });

        p.on('framenavigated', (frame) => {
            if (frame === p.mainFrame() && frame.url() !== 'about:blank') {
                const entry = { time: new Date().toISOString(), url: frame.url() };
                urlChanges.push(entry);
                console.log(`[NAV] ${frame.url()}`);
            }
        });
    }

    await page.goto(CB_AGENT_TOOLS_URL, { waitUntil: 'domcontentloaded' });

    console.log('\n===========================================');
    console.log('GO! Click Book Now, fill guest info, click Continue.');
    console.log('Monitoring all requests. Waiting 5 minutes...');
    console.log('===========================================\n');

    // Wait 5 minutes
    await page.waitForTimeout(5 * 60 * 1000);

    // Save everything
    fs.writeFileSync('manual-flow-requests.json', JSON.stringify(capturedRequests, null, 2));
    fs.writeFileSync('manual-flow-urls.json', JSON.stringify(urlChanges, null, 2));
    console.log(`\nSaved ${capturedRequests.length} requests to manual-flow-requests.json`);
    console.log(`Saved ${urlChanges.length} URL changes to manual-flow-urls.json`);

    await browser.close();
}

monitor().catch(console.error);
