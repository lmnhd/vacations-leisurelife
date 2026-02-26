import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '..', '.playwright-state.json');

// Helper function to attach network interception to ANY page
function setupNetworkInterceptor(page: any) {
    // Let's log *everything* that isn't a static asset just in case it's not JSON
    page.on('response', async (response: any) => {
        const url = response.url();

        // Ignore images, css, fonts to reduce noise
        if (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.css') || url.endsWith('.woff2') || url.includes('google-analytics') || url.includes('facebook') || url.includes('/assets/')) return;

        // We want to catch the main payload endpoints. Let's cast a very wide net.
        if (
            url.includes('api') ||
            url.includes('search') ||
            url.includes('pricing') ||
            url.includes('availability') ||
            url.includes('odysseus') ||
            url.includes('graphql') ||
            url.includes('ajax') ||
            url.includes('json') ||
            url.includes('booking') ||
            url.includes('fare')
        ) {

            const status = response.status();
            const type = response.headers()['content-type'] || 'unknown';

            // Log the URL so we can see what's firing
            console.log(`\n[Network] ${status} | Type: ${type} | ${url}`);

            // If it looks like JSON, let's try to peek at the keys
            if (type.includes('json') && status === 200) {
                try {
                    const json = await response.json();
                    const keys = Object.keys(json).join(', ');
                    console.log(`   -> JSON Body Keys: [ ${keys} ]`);
                } catch (e) { /* ignore */ }
            }
        }
    });
}

async function runOdysseusFlow() {
    console.log('Starting Odysseus Booking Flow...');

    const browser = await chromium.launch({ headless: false });
    let context;

    if (fs.existsSync(STATE_FILE)) {
        console.log('Found existing session state. Loading cookies...');
        context = await browser.newContext({ storageState: STATE_FILE });
    } else {
        context = await browser.newContext();
    }

    // Attach to new tabs immediately
    context.on('page', (newPage) => {
        console.log('\n[System] New tab/page opened! Attaching wide-net network interceptor...');
        setupNetworkInterceptor(newPage);
    });

    const page = await context.newPage();
    setupNetworkInterceptor(page);

    try {
        console.log('Navigating to CBAgentTools...');
        await page.goto('https://www.cbagenttools.com', { waitUntil: 'networkidle' });

        const url = page.url();
        if (url.includes('/login') || await page.isVisible('input[name="password"]')) {
            console.log('Waiting for manual login...');
            await page.waitForTimeout(60000);
            await context.storageState({ path: STATE_FILE });
            console.log('✅ Session state saved!');
        } else {
            console.log('✅ Found active authenticated session! Bypassing login...');
        }

        console.log('\n======================================================');
        console.log('Odysseus Engine should be OPEN. Interception is SUPER WIDE.');
        console.log('Please perform a search manually in the launched browser window.');
        console.log('Watch this console to see the JSON XHR requests being captured.');
        console.log('Press Ctrl+C in your terminal to stop the script when you are done.');
        console.log('======================================================\n');

        // Keep script running 
        await new Promise(() => { });

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
}

runOdysseusFlow();
