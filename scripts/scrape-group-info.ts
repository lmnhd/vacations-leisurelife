import { chromium, Page } from 'playwright';
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

    // Save state after login to avoid relogging in later
    await context.storageState({ path: STATE_FILE });

    return { browser, page };
}

async function extractPageInfo(page: Page, url: string, label: string) {
    console.log(`\nNavigating to ${label} page: ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });

    console.log(`\n=== EXTRACTING DATA FROM ${label.toUpperCase()} ===\n`);

    const pageData = await page.evaluate(() => {
        // Find all main content areas. We might want to remove scripts, styles, etc.
        const bodyContent = document.body;
        
        // Remove noise
        const elementsToRemove = bodyContent.querySelectorAll('script, style, nav, footer, header, #sidebar, .sidebar');
        elementsToRemove.forEach(el => el.remove());

        // Extract paragraphs and headings for context/policies
        const textElements = Array.from(bodyContent.querySelectorAll('h1, h2, h3, h4, p, div.alert, .policy, .card-body, table'));
        const texts = textElements.map(el => {
            if (el.tagName === 'TABLE') {
                return '[TABLE] ' + (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
            }
            return (el as HTMLElement).innerText.trim();
        }).filter(t => t.length > 20);

        // Extract input fields to understand what data they expect
        const inputs = Array.from(bodyContent.querySelectorAll('input, select, textarea')).map((el, idx) => {
            let labelText = '';
            if (el.id) {
                const labelEl = document.querySelector(`label[for="${el.id}"]`) as HTMLElement;
                if (labelEl) labelText = labelEl.innerText.trim();
            }
            if (!labelText && el.closest('label')) {
                labelText = (el.closest('label') as HTMLElement).innerText.trim();
            }
            if (!labelText) labelText = (el as HTMLInputElement).name || el.id || 'Unknown';

            return {
                type: el.tagName.toLowerCase(),
                inputType: (el as HTMLInputElement).type,
                name: (el as HTMLInputElement).name,
                id: el.id,
                label: labelText,
                options: el.tagName.toLowerCase() === 'select' ? Array.from(el.querySelectorAll('option')).map(o => (o as HTMLElement).innerText.trim()) : []
            };
        });

        // Unique texts
        const uniqueTexts = [...new Set(texts)];
        
        // Return raw text of main container if it exists
        const mainContainer = document.querySelector('main, .main-content, .content, #content') || document.body;
        const rawText = (mainContainer as HTMLElement).innerText;

        return {
            texts: uniqueTexts,
            inputs: inputs,
            rawText: rawText.substring(0, 5000) // limit to first 5000 chars of raw text as fallback
        };
    });

    console.log(`--- Texts / Policies / Context ---`);
    pageData.texts.forEach((t, i) => {
        if(i < 30) console.log(t); // Limit output so we don't overflow console
    });

    console.log(`\n--- Inputs / Form Fields ---`);
    pageData.inputs.forEach(input => {
        let details = `[${input.type}${input.inputType ? ':' + input.inputType : ''}] ${input.label} (name: ${input.name}, id: ${input.id})`;
        if (input.options.length > 0) {
            details += `\n    Options: ${input.options.slice(0, 5).join(', ')}${input.options.length > 5 ? '...' : ''}`;
        }
        console.log(details);
    });

    return pageData;
}

async function run() {
    console.log('\n--- Starting CB Agent Tools Group Discovery 2 ---\n');
    let browserContext;
    try {
        browserContext = await getAuthenticatedContext();
        const { browser, page } = browserContext;

        await extractPageInfo(page, 'https://www.cbagenttools.com/groups/view_group/44071/', 'Group View 44071');
        await extractPageInfo(page, 'https://www.cbagenttools.com/groups/modification-requests/', 'Modification Requests');

    } catch (e) {
        console.error('Extraction Error:', e);
    } finally {
        if (browserContext && browserContext.browser) {
            await browserContext.browser.close();
            console.log('\nBrowser closed. Done.');
        }
    }
}

run();
