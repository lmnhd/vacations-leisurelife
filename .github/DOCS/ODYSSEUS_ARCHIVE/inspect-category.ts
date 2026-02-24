import { chromium } from 'playwright';

async function scan() {
    console.log("Launching browser to inspect category-page.html...");
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const fileUrl = 'file:///' + require('path').resolve('category-page.html').replace(/\\/g, '/');
    await page.goto(fileUrl);

    // Find category buttons
    const categoryButtons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a.btn');
        return Array.from(btns).map(b => ({
            text: b.textContent?.trim(),
            odyId: b.getAttribute('data-ody-id'),
            classes: b.className,
            href: b.getAttribute('href')
        })).filter(b => b.text && (b.text.toLowerCase().includes('select') || b.text.toLowerCase().includes('book')));
    });

    console.log("Found interactive buttons with 'Select' or 'Book':", JSON.stringify(categoryButtons, null, 2));

    await browser.close();
}
scan().catch(console.error);
