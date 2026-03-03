/**
 * explore-cb-groups.ts
 * Logs into CB Agent Tools and explores the Groups section.
 * Goal: Identify deposit requirements, group hold policies, and any
 * financial obligations imposed on the agent before guests book.
 * 
 * Run: npx ts-node scripts/explore-cb-groups.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CB_EMAIL = process.env.CB_EMAIL || 'cc.lemonhead@gmail.com';
const CB_PASSWORD = process.env.CB_PASSWORD || 'Rollpop1!';

const OUT_DIR = path.join(process.cwd(), 'scripts', 'cb-groups-recon');

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(path.join(OUT_DIR, 'recon-log.txt'), line + '\n');
  };

  const snap = async (label: string) => {
    const file = path.join(OUT_DIR, `${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log(`Screenshot: ${label}.png`);
  };

  try {
    // ── 1. Login ────────────────────────────────────────────────────────────
    log('Navigating to CB Agent Tools...');
    await page.goto('https://www.cbagenttools.com/login', { waitUntil: 'networkidle' });
    log(`URL after /login: ${page.url()}`);

    // If no login form, try the root
    const inputCount = await page.locator('input').count();
    if (inputCount === 0) {
      log('No inputs on /login — trying root URL...');
      await page.goto('https://www.cbagenttools.com', { waitUntil: 'networkidle' });
      // Check for a login/sign-in link
      const loginLink = page.locator('a:has-text("Login"), a:has-text("Sign In"), a:has-text("Log In"), button:has-text("Login")').first();
      if (await loginLink.count() > 0) {
        log('Found login link — clicking...');
        await loginLink.click();
        await page.waitForLoadState('networkidle');
      }
    }
    log(`Pre-fill URL: ${page.url()}`);
    await snap('01-landing');

    // Dump HTML of landing page to find the right selectors
    const landingHtml = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, 'landing-page.html'), landingHtml);
    log('Landing page HTML saved. Scanning for input fields...');

    // Print all input fields found
    const inputs = await page.locator('input').all();
    log(`Found ${inputs.length} input fields on landing page:`);
    for (const input of inputs) {
      const attrs = await input.evaluate((el: HTMLInputElement) => ({
        type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, className: el.className
      }));
      log(`  input: type=${attrs.type} name=${attrs.name} id=${attrs.id} placeholder=${attrs.placeholder}`);
    }

    // Print all buttons
    const buttons = await page.locator('button, input[type="submit"]').all();
    log(`Found ${buttons.length} buttons:`);
    for (const btn of buttons) {
      const text = await btn.innerText().catch(() => '');
      const attrs = await btn.evaluate((el: HTMLElement) => ({ type: (el as HTMLButtonElement).type, id: el.id, className: el.className }));
      log(`  button: text="${text.trim()}" type=${attrs.type} id=${attrs.id}`);
    }

    log('Filling credentials...');
    // CB uses a 'username' field (not email)
    const emailField = page.locator('input[name="username"], input[name="email"], input[type="email"]').first();
    await emailField.fill(CB_EMAIL, { timeout: 10000 }).catch(async () => {
      log('Named selector failed — trying first visible text input...');
      await page.locator('input[type="text"], input:not([type])').first().fill(CB_EMAIL);
    });

    const passField = page.locator('input[name="password"], input[type="password"]').first();
    await passField.fill(CB_PASSWORD);
    await snap('02-credentials-filled');

    await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In"), button:has-text("Log In")').first().click();
    await page.waitForLoadState('networkidle');
    await snap('03-post-login');
    log(`Post-login URL: ${page.url()}`);

    // Dump all navigation links on the authenticated page
    const allLinks = await page.locator('a').all();
    log(`Found ${allLinks.length} links on authenticated home page:`);
    for (const link of allLinks) {
      const href = await link.getAttribute('href').catch(() => '');
      const text = await link.innerText().catch(() => '');
      if (href || text.trim()) {
        log(`  link: "${text.trim().substring(0, 60)}" -> ${href}`);
      }
    }

    // ── 2. Navigate directly to Groups pages (dropdown items aren't clickable) ──
    log('Navigating directly to Groups pages...');

    const groupPages = [
      { label: '04-groups-view-all', url: 'https://www.cbagenttools.com/groups/view_groups/' },
      { label: '05-groups-campaigns', url: 'https://www.cbagenttools.com/groups/view_campaigns/' },
      { label: '06-groups-build', url: 'https://www.cbagenttools.com/groups/build/' },
      { label: '07-groups-modification-requests', url: 'https://www.cbagenttools.com/groups/modification-requests/' },
      { label: '08-groups-info', url: 'https://www.cbagenttools.com/groups/' },
    ];

    const depositKeywords = ['deposit', 'hold', 'fee', 'payment', 'require', 'minimum', 'advance', 'non-refundable', 'per cabin', 'group rate', 'due', 'charge', 'cost', 'liability', 'cancellation'];
    const allFindings: string[] = [];

    for (const { label, url } of groupPages) {
      log(`\nNavigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' }).catch(async (e: Error) => {
        log(`  Error navigating to ${url}: ${e.message}`);
      });
      const currentUrl = page.url();
      log(`  Landed at: ${currentUrl}`);
      await snap(label);

      const pageText = await page.locator('body').innerText().catch(() => '');
      fs.writeFileSync(path.join(OUT_DIR, `${label}-fulltext.txt`), pageText);

      const hits = pageText.split('\n').filter(line =>
        depositKeywords.some(kw => line.toLowerCase().includes(kw))
      );
      if (hits.length > 0) {
        const header = `\n=== KEYWORD HITS at ${currentUrl} ===`;
        log(header);
        allFindings.push(header);
        hits.forEach(line => {
          const entry = `  > ${line.trim()}`;
          log(entry);
          allFindings.push(entry);
        });
      } else {
        log(`  No deposit/fee keywords found on this page.`);
      }
    }

    // Also check the formstack private group booking link spotted on home page
    log('\nChecking Formstack private group booking form...');
    await page.goto('https://anhywhereinc.formstack.com/forms/private_group_booking', { waitUntil: 'networkidle' }).catch(() => {});
    await snap('09-formstack-group-booking');
    const formText = await page.locator('body').innerText().catch(() => '');
    fs.writeFileSync(path.join(OUT_DIR, '09-formstack-fulltext.txt'), formText);
    const formHits = formText.split('\n').filter(line =>
      depositKeywords.some(kw => line.toLowerCase().includes(kw))
    );
    if (formHits.length > 0) {
      log('=== FORMSTACK DEPOSIT KEYWORDS ===');
      formHits.forEach(line => log(`  > ${line.trim()}`));
      allFindings.push('\n=== FORMSTACK ===');
      formHits.forEach(line => allFindings.push(`  > ${line.trim()}`));
    }

    // Write summary
    fs.writeFileSync(path.join(OUT_DIR, 'FINDINGS-SUMMARY.txt'), allFindings.join('\n'));
    log('\n=== RECON COMPLETE. See scripts/cb-groups-recon/FINDINGS-SUMMARY.txt ===');

  } catch (err) {
    console.error('Script error:', err);
    await snap('ERROR-state');
  } finally {
    await page.waitForTimeout(4000);
    await browser.close();
  }
}

run().catch(console.error);
