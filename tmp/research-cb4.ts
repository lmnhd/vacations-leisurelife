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

        await page.goto('https://www.cbagenttools.com/training/content/79/', { waitUntil: 'domcontentloaded' });
        
        console.log("Waiting for content to load...");
        // Wait 10 seconds to ensure AJAX loads
        await page.waitForTimeout(10000);
        
        let pText = await page.evaluate(() => document.body.innerText);
        writeFileSync('tmp/cb-policy-final.txt', pText);
        
        const iframeSrc = await page.evaluate(() => document.querySelector('iframe, embed')?.getAttribute('src'));
        if (iframeSrc) {
            console.log("Iframe src:", iframeSrc);
            writeFileSync('tmp/cb-policy-iframe.txt', iframeSrc);
            
            // If it's a PDF or we can navigate to the iframe src, do so:
            if (!iframeSrc.includes('youtube')) {
                await page.goto(iframeSrc, { waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);
                pText = await page.evaluate(() => document.body.innerText);
                writeFileSync('tmp/cb-policy-pdf.txt', pText);
            }
        }
        
    } catch(e) { console.error(e); }
    await browser.close();
}

run();
