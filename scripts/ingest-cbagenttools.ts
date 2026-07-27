import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
    KNOWLEDGE_SECTION_KINDS,
    type KnowledgeDocType,
    type KnowledgeEntry,
    type KnowledgeSectionKind,
} from '../lib/chat/tools/cb-knowledge-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated CB Agent Tools ingestion — July 2026 expansion.
//
// The original pass captured only the vendor directory and today's-view promos.
// The copilot now also answers insurance-by-state, deposit/refund, cancellation,
// flight, and training questions, which need a broader authenticated crawl.
//
// This ingester:
//   1. Inventories accessible CBAT sections by reading the portal navigation and
//      auto-enumerating candidate policy / training / help links (no hardcoded
//      URLs required for the discovered surfaces).
//   2. Ingests each page with source URL, supplier, jurisdiction, effective date,
//      and retrieval date.
//   3. Preserves tables and linked PDFs as separately attributable entries.
//   4. Writes a reviewable inventory manifest alongside the knowledge cache; the
//      companion freshness script (`check-cbagenttools-freshness.ts`) flags stale
//      entries.
// ─────────────────────────────────────────────────────────────────────────────

const CB_LOGIN_URL = 'https://www.cbagenttools.com';
const CB_ORIGIN = 'https://www.cbagenttools.com';

const OUTPUT_DIRECTORY = path.join(process.cwd(), '.github', 'data');
const OUTPUT_FILE_PATH = path.join(OUTPUT_DIRECTORY, 'cb-knowledge-cache.json');
const INVENTORY_FILE_PATH = path.join(OUTPUT_DIRECTORY, 'cb-knowledge-inventory.json');

/** Curated structured surfaces that have bespoke extractors (best-quality data). */
const STRUCTURED_SOURCES = {
    vendor: 'https://www.cbagenttools.com/marketing/vendor_urls/',
    promotions: 'https://www.cbagenttools.com/marketing/todaysview/',
} as const;

/**
 * Heuristics that map a link's href/text to a section kind. Ordered — first match
 * wins. Used to both decide whether to crawl a discovered link and to classify it.
 */
const SECTION_MATCHERS: ReadonlyArray<{ kind: KnowledgeSectionKind; pattern: RegExp }> = [
    { kind: 'insurance', pattern: /insur|protection|waiver|travel\s*guard|coverage/i },
    { kind: 'deposit', pattern: /deposit|down\s*payment|hold/i },
    { kind: 'refund', pattern: /refund|money\s*back/i },
    { kind: 'cancellation', pattern: /cancel|cancellation|penalt/i },
    { kind: 'flight', pattern: /flight|air|airline|airfare|choice\s*air/i },
    { kind: 'training', pattern: /train|academy|learn|tutorial|how\s*to|guide|help|faq|support|resource/i },
    { kind: 'agency', pattern: /polic|procedure|handbook|announcement|commission|agent/i },
];

/** Nav areas we read to discover candidate section links. */
const NAV_SELECTORS = [
    'nav a[href]',
    'header a[href]',
    'aside a[href]',
    '.sidebar a[href]',
    '.menu a[href]',
    '.navbar a[href]',
    'ul.dropdown-menu a[href]',
    'a[href*="/help"]',
    'a[href*="/training"]',
    'a[href*="/support"]',
    'a[href*="/marketing"]',
    'a[href*="/resource"]',
];

const MAX_DISCOVERED_PAGES = 40;
const MAX_ENTRY_CONTENT_CHARS = 4000;

type DiscoveredLink = {
    url: string;
    text: string;
    kind: KnowledgeSectionKind;
};

type InventoryRecord = {
    url: string;
    linkText: string;
    kind: KnowledgeSectionKind;
    status: 'ingested' | 'empty' | 'error';
    entryCount: number;
    note?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeText(rawText: string): string {
    return rawText.replace(/\s+/g, ' ').trim();
}

function ensureEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function classifyLink(href: string, text: string): KnowledgeSectionKind | null {
    const haystack = `${href} ${text}`;
    for (const matcher of SECTION_MATCHERS) {
        if (matcher.pattern.test(haystack)) {
            return matcher.kind;
        }
    }
    return null;
}

/** US state code / name in link or heading text -> jurisdiction stamp. */
const US_STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY',
]);

function inferJurisdiction(text: string): string | undefined {
    const codeMatch = text.match(/\b([A-Z]{2})\b/g);
    if (codeMatch) {
        const state = codeMatch.find((code) => US_STATE_CODES.has(code));
        if (state) {
            return state;
        }
    }
    return undefined;
}

// ─── Login ──────────────────────────────────────────────────────────────────

async function loginToCBAgentTools(input: {
    email: string;
    password: string;
}): Promise<{
    browser: Awaited<ReturnType<typeof chromium.launch>>;
    page: Page;
}> {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(CB_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const usernameSelector = 'input[name="username"], input[type="text"], textbox';
    const passwordSelector = 'input[name="password"], input[type="password"]';
    const submitSelector = 'button[type="submit"], button:has-text("Submit")';

    await page.waitForSelector(passwordSelector, { timeout: 15000 });
    await page.fill(usernameSelector, input.email);
    await page.fill(passwordSelector, input.password);
    await page.click(submitSelector);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        await browser.close();
        throw new Error('CBAgentTools login did not complete successfully.');
    }

    return { browser, page };
}

// ─── Structured extractors (curated, highest-quality) ──────────────────────────

async function scrapeVendorEntries(page: Page): Promise<KnowledgeEntry[]> {
    const retrievedAtIso = new Date().toISOString();
    await page.goto(STRUCTURED_SOURCES.vendor, { waitUntil: 'domcontentloaded' });

    const rows = await page.locator('table tr').all();
    const entries: KnowledgeEntry[] = [];

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 4) continue;

        const vendorName = normalizeText(await cells[0]!.innerText());
        const commission = normalizeText(await cells[1]!.innerText());
        const agentPhone = normalizeText(await cells[3]!.innerText());
        const groupPhone = cells[4] ? normalizeText(await cells[4]!.innerText()) : '';

        if (!vendorName || vendorName === 'Vendor Name') continue;

        entries.push({
            title: vendorName,
            content: `Cruise line: ${vendorName}. Commission: ${commission}. Agent phone: ${agentPhone}${groupPhone ? `. Group phone: ${groupPhone}` : ''}.`,
            source: 'Cruise Brothers Vendor Directory',
            url: STRUCTURED_SOURCES.vendor,
            tags: ['vendor', 'commission', 'cruise line', vendorName.toLowerCase(), agentPhone],
            supplier: vendorName,
            jurisdiction: 'ALL',
            sectionKind: 'vendor',
            docType: 'directory',
            retrievedAtIso,
        });
    }

    return entries;
}

async function scrapePromotionEntries(page: Page): Promise<KnowledgeEntry[]> {
    const retrievedAtIso = new Date().toISOString();
    await page.goto(STRUCTURED_SOURCES.promotions, { waitUntil: 'domcontentloaded' });

    const promoLinks = await page.locator('a[href*="/marketing/promotion/"]').all();
    const entries: KnowledgeEntry[] = [];
    const seen = new Set<string>();

    for (const link of promoLinks) {
        const title = normalizeText(await link.innerText());
        if (!title || seen.has(title)) continue;
        seen.add(title);

        entries.push({
            title,
            content: `Current promotion: ${title}. Available through Cruise Brothers agent portal.`,
            source: 'Cruise Brothers Promotions',
            url: STRUCTURED_SOURCES.promotions,
            tags: ['promotion', 'deal', 'offer', title.toLowerCase()],
            sectionKind: 'promotion',
            docType: 'page',
            retrievedAtIso,
        });
    }

    return entries;
}

// ─── Discovery: inventory accessible sections from the navigation ──────────────

async function discoverSectionLinks(page: Page): Promise<DiscoveredLink[]> {
    // Read the authenticated landing/handbook page to enumerate nav links.
    await page.goto('https://www.cbagenttools.com/bookings/home/', { waitUntil: 'domcontentloaded' }).catch(() => {
        /* fall back to whatever page we're on post-login */
    });

    const rawLinks = await page.evaluate((selectors: string[]) => {
        const found = new Map<string, string>();
        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach((node) => {
                const anchor = node as HTMLAnchorElement;
                const href = anchor.href;
                const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim();
                if (href && !found.has(href)) {
                    found.set(href, text);
                }
            });
        }
        return Array.from(found, ([href, text]) => ({ href, text }));
    }, NAV_SELECTORS);

    const discovered: DiscoveredLink[] = [];
    const seen = new Set<string>();

    for (const { href, text } of rawLinks) {
        // Same-origin, non-asset links only.
        if (!href.startsWith(CB_ORIGIN)) continue;
        if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf)(\?|$)/i.test(href)) continue;
        // Skip the structured surfaces we already extract with bespoke logic.
        if (href.startsWith(STRUCTURED_SOURCES.vendor) || href.startsWith(STRUCTURED_SOURCES.promotions)) continue;
        // Skip transactional/booking-action surfaces — read-only knowledge only.
        if (/\/(input_reservation|search_trip|odysseus\/booking|accounting|logout|extendsession)/i.test(href)) continue;

        const kind = classifyLink(href, text);
        if (!kind) continue;

        const normalized = href.split('#')[0]!;
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        discovered.push({ url: normalized, text, kind });
        if (discovered.length >= MAX_DISCOVERED_PAGES) break;
    }

    return discovered;
}

// ─── Page ingestion: text, tables, and PDFs as separate entries ────────────────

async function ingestDiscoveredPage(
    page: Page,
    link: DiscoveredLink
): Promise<{ entries: KnowledgeEntry[]; note?: string }> {
    const retrievedAtIso = new Date().toISOString();
    await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { /* best effort */ });

    const heading = normalizeText(
        (await page.locator('h1, h2').first().innerText().catch(() => '')) || link.text || link.url
    );

    // Try to read an effective/published date printed on the page.
    const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
    const dateMatch = bodyText.match(
        /(?:effective|updated|revised|published|last\s+(?:updated|revised))[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i
    );
    const effectiveDate = dateMatch ? normalizeText(dateMatch[1]!) : undefined;
    const jurisdiction = inferJurisdiction(`${heading} ${link.text}`);

    const baseMeta = {
        source: `Cruise Brothers ${link.kind} (${heading})`,
        sectionKind: link.kind,
        effectiveDate,
        jurisdiction,
        retrievedAtIso,
    } satisfies Partial<KnowledgeEntry>;

    const entries: KnowledgeEntry[] = [];

    // 1) Main page prose as one entry.
    const mainContent = bodyText.slice(0, MAX_ENTRY_CONTENT_CHARS);
    if (mainContent.length >= 40) {
        entries.push({
            ...baseMeta,
            title: heading,
            content: mainContent,
            url: link.url,
            tags: [link.kind, ...(jurisdiction ? [jurisdiction.toLowerCase()] : [])],
            docType: 'page' as KnowledgeDocType,
        });
    }

    // 2) Each table becomes a separately attributable entry.
    const tables = await page.locator('table').all();
    for (let t = 0; t < tables.length; t += 1) {
        const tableText = normalizeText(await tables[t]!.innerText().catch(() => ''));
        if (tableText.length < 20) continue;
        entries.push({
            ...baseMeta,
            title: `${heading} — table ${t + 1}`,
            content: tableText.slice(0, MAX_ENTRY_CONTENT_CHARS),
            url: link.url,
            tags: [link.kind, 'table', ...(jurisdiction ? [jurisdiction.toLowerCase()] : [])],
            docType: 'table',
        });
    }

    // 3) Linked PDFs become separately attributable pointer entries.
    const pdfAnchors = await page.locator('a[href$=".pdf"], a[href*=".pdf?"]').all();
    const seenPdf = new Set<string>();
    for (const anchor of pdfAnchors) {
        const href = await anchor.getAttribute('href').catch(() => null);
        if (!href) continue;
        const absolute = new URL(href, link.url).toString().split('#')[0]!;
        if (seenPdf.has(absolute)) continue;
        seenPdf.add(absolute);
        const label = normalizeText(await anchor.innerText().catch(() => '')) || absolute.split('/').pop()!;
        entries.push({
            ...baseMeta,
            title: `${heading} — PDF: ${label}`,
            content: `Linked ${link.kind} PDF document: "${label}". Source page: ${link.url}. Retrieve and confirm the current version directly with the supplier.`,
            url: absolute,
            tags: [link.kind, 'pdf', ...(jurisdiction ? [jurisdiction.toLowerCase()] : [])],
            docType: 'pdf',
        });
    }

    return {
        entries,
        note: entries.length === 0 ? 'no extractable content' : undefined,
    };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

async function runIngestion(): Promise<void> {
    const email = ensureEnvVar('CB_EMAIL');
    const password = ensureEnvVar('CB_PASSWORD');

    const { browser, page } = await loginToCBAgentTools({ email, password });

    try {
        const inventory: InventoryRecord[] = [];
        const allEntries: KnowledgeEntry[] = [];

        // Curated structured surfaces first.
        const vendorEntries = await scrapeVendorEntries(page);
        allEntries.push(...vendorEntries);
        inventory.push({
            url: STRUCTURED_SOURCES.vendor,
            linkText: 'Vendor Directory',
            kind: 'vendor',
            status: vendorEntries.length > 0 ? 'ingested' : 'empty',
            entryCount: vendorEntries.length,
        });

        const promoEntries = await scrapePromotionEntries(page);
        allEntries.push(...promoEntries);
        inventory.push({
            url: STRUCTURED_SOURCES.promotions,
            linkText: "Today's Promotions",
            kind: 'promotion',
            status: promoEntries.length > 0 ? 'ingested' : 'empty',
            entryCount: promoEntries.length,
        });

        // Auto-crawl discovered policy / training / help sections.
        const discovered = await discoverSectionLinks(page);
        console.log(`[ingest-cbagenttools] discovered ${discovered.length} candidate section link(s).`);

        for (const link of discovered) {
            try {
                const { entries, note } = await ingestDiscoveredPage(page, link);
                allEntries.push(...entries);
                inventory.push({
                    url: link.url,
                    linkText: link.text,
                    kind: link.kind,
                    status: entries.length > 0 ? 'ingested' : 'empty',
                    entryCount: entries.length,
                    note,
                });
            } catch (error: unknown) {
                inventory.push({
                    url: link.url,
                    linkText: link.text,
                    kind: link.kind,
                    status: 'error',
                    entryCount: 0,
                    note: error instanceof Error ? error.message : 'unknown error',
                });
            }
        }

        if (allEntries.length === 0) {
            throw new Error('No knowledge entries were collected from CBAgentTools.');
        }

        const generatedAtIso = new Date().toISOString();

        await mkdir(OUTPUT_DIRECTORY, { recursive: true });
        await writeFile(
            OUTPUT_FILE_PATH,
            JSON.stringify({ generatedAtIso, entries: allEntries }, null, 2),
            'utf-8'
        );

        // Inventory manifest for review + freshness scheduling.
        const byKind = Object.fromEntries(
            KNOWLEDGE_SECTION_KINDS.map((kind) => [
                kind,
                allEntries.filter((entry) => entry.sectionKind === kind).length,
            ])
        );
        await writeFile(
            INVENTORY_FILE_PATH,
            JSON.stringify(
                {
                    generatedAtIso,
                    totalEntries: allEntries.length,
                    entriesByKind: byKind,
                    sections: inventory,
                },
                null,
                2
            ),
            'utf-8'
        );

        console.log(`Cruise Brothers knowledge cache written to: ${OUTPUT_FILE_PATH}`);
        console.log(`Entries captured: ${allEntries.length}`);
        console.log(`Inventory manifest written to: ${INVENTORY_FILE_PATH}`);
    } finally {
        await browser.close();
    }
}

runIngestion().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error';
    console.error(`[ingest-cbagenttools] ${message}`);
    process.exitCode = 1;
});
