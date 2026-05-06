import { chromium } from 'playwright';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    await page.goto('https://www.cbagenttools.com/groups/view_group/44071/', { waitUntil: 'networkidle' });

    const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors.map(a => ({ text: a.innerText.trim(), href: a.href })).filter(a => a.text.includes('Personal Link') || a.href.includes('swift') || a.href.includes('package'));
    });

    console.log("Extracted links:", links);
    await browser.close();
}
run();
