import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ storageState: STATE_FILE });
        const page = await context.newPage();

        await page.goto(CB_BASE_URL + '/training/home/?search=groups', { waitUntil: 'networkidle' });

        const allLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => {
                return {
                    href: a.href,
                    text: a.innerText.trim() || a.textContent?.trim(),
                    parentText: a.parentElement ? a.parentElement.innerText.trim() : ''
                };
            }).filter(a => a.href && a.href.includes('/training/'));
        });
        
        writeFileSync('tmp/all-training-links.json', JSON.stringify(allLinks, null, 2));
        
        // Find the 'Cruise Brothers Group Policy' one
        const targetUrl = allLinks.find(l => l.parentText.includes('Cruise Brothers Group Policy') || l.href.includes('policy'))?.href;
        
        if (targetUrl) {
            console.log("Found target URL: ", targetUrl);
            await page.goto(targetUrl, { waitUntil: 'networkidle' });
            
            // It might be a PDF link or a page
            const pageText = await page.evaluate(() => document.body.innerText);
            writeFileSync('tmp/cb-policy-page.txt', pageText);
            
            // Check if there's an iframe or embed (e.g. PDF)
            const iframeSrc = await page.evaluate(() => document.querySelector('iframe, embed')?.getAttribute('src'));
            if (iframeSrc) {
               console.log("Found iframe/PDF: ", iframeSrc);
               writeFileSync('tmp/cb-policy-iframe.txt', iframeSrc);
            }
        }

    } catch(e) { console.error(e); }
    await browser.close();
}

run();
