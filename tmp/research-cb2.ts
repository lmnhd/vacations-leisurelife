import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    function dump(name: string, text: string) {
        writeFileSync(`tmp/${name}.txt`, text);
        console.log(`Saved ${name}.txt`);
    }

    try {
        await page.goto(CB_BASE_URL + '/training/home/?search=groups', { waitUntil: 'networkidle' });
        let bodyText = await page.evaluate(() => document.body.innerText);
        dump('training-groups-search', bodyText);

        const groupLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: a.href }))
                .filter(a => a.text.toLowerCase().includes('group') || a.href.toLowerCase().includes('group'));
        });
        dump('group-links', JSON.stringify(groupLinks, null, 2));

        // Let's directly visit some common group info URLs if they exist
        await page.goto(CB_BASE_URL + '/groups/view_groups/', { waitUntil: 'networkidle' });
        bodyText = await page.evaluate(() => document.body.innerText);
        dump('view-groups-page', bodyText);
        
        // Check if there is a 'Group Policy' link in the results
        for(let l of groupLinks) {
            if (l.text.toLowerCase().includes('policy') || l.text.toLowerCase().includes('guideline') || l.text.toLowerCase().includes('rule')) {
                await page.goto(l.href, { waitUntil: 'networkidle' });
                let pText = await page.evaluate(() => document.body.innerText);
                dump(`policy-${l.text.replace(/[^a-z0-9]/gi, '_')}`, pText);
            }
        }
        
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

run();
