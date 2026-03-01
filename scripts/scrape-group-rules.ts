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
        console.log('\nScanning for Payment / Modification flow...');
        await page.goto(CB_BASE_URL + '/groups/modification-requests/?request_type=payment', { waitUntil: 'networkidle' });

        // Grab any instructional text or form fields related to payments
        const paymentText = await page.evaluate(() => {
           const body = document.querySelector('body')?.innerText || '';
           return body.replace(/\n\s*\n/g, '\n').substring(0, 4000);
        });

        console.log('\n=== PAYMENT MODIFICATION TEXT ===\n');
        console.log(paymentText);
        
        // Let's also check if there's a specific "How to pay for groups" or "Payment Links" section
        await page.goto(CB_BASE_URL + '/groups/view_groups/', { waitUntil: 'networkidle' });
        
        const bookingLinkText = await page.evaluate(() => {
            // Find "Booking Engine Link" or similar
            const panels = document.querySelectorAll('.card, .alert, .info-panel, td, th');
            return Array.from(panels).map(p => p.textContent?.trim()).filter(t => t && t.toLowerCase().includes('link')).join('\n---\n');
        });
        
        console.log('\n=== BOOKING LINK INFO ===\n');
        console.log(bookingLinkText);
        
        // Check a specific group to see its booking link format
        await page.goto(CB_BASE_URL + '/groups/view_group/44071/', { waitUntil: 'networkidle' });
        
        const groupLinks = await page.evaluate(() => {
           const anchors = document.querySelectorAll('a');
           return Array.from(anchors).map(a => ({ text: a.textContent?.trim(), href: a.href })).filter(a => a.text?.toLowerCase().includes('book') || a.text?.toLowerCase().includes('link'));
        });
        
        console.log('\n=== SPECIFIC GROUP LINKS ===\n');
        console.dir(groupLinks);

    } catch (e) {
        console.error('Extraction Error:', e);
    } finally {
        await browser.close();
        console.log('\nDone.');
    }
}

run();
