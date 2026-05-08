import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { CruiseSearchCriteria, CruiseResult } from './types';

// Store state locally in the project root for now
// When moving to Render, this could be stored in Redis or an S3 bucket
const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');

export class OdysseusEngine {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    public odysseusPage: Page | null = null;

    // Store intercept data temporarily
    public interceptedData: any[] = [];

    /**
     * Initialize the headless browser and attach the global XHR interceptor.
     */
    async init(headless: boolean = false) {
        console.log('[OdysseusEngine] Starting initialization...');
        // Use real Chrome to avoid bot detection (Playwright Chromium is fingerprint-detected)
        this.browser = await chromium.launch({
            headless,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
        });

        // Attempt to load existing authentication session
        if (fs.existsSync(STATE_FILE)) {
            console.log('[OdysseusEngine] Found existing session state. Loading cookies...');
            this.context = await this.browser.newContext({
                storageState: STATE_FILE,
                viewport: { width: 1920, height: 1080 }
            });
        } else {
            console.log('[OdysseusEngine] No session state found. Creating fresh context...');
            this.context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 }
            });
        }

        // CRITICAL: Attach to any new tabs (Odysseus uses `target="_blank"` heavily)
        this.context.on('page', (newPage) => {
            console.log('[OdysseusEngine] New tab detected. Attaching XHR listener...');
            this.setupNetworkInterceptor(newPage);
        });

        this.page = await this.context.newPage();
        this.setupNetworkInterceptor(this.page);
        console.log('[OdysseusEngine] Initialization complete.');
    }

    /**
     * Global listener to catch all JSON payloads related to the booking flow
     */
    private setupNetworkInterceptor(page: Page) {
        page.on('response', async (response) => {
            const url = response.url();

            if (
                url.includes('/nitroapi/v2/cruise') ||
                url.includes('/nitroapi/v2/reservation') ||
                url.includes('availability') ||
                url.includes('pricing')
            ) {
                const type = response.headers()['content-type'] || '';
                if (type.includes('json') && response.status() === 200) {
                    try {
                        const json = await response.json();
                        console.log(`[XHR Intercepted] URL: ${url}`);
                        this.interceptedData.push({ url, payload: json });
                    } catch (e) { /* silent fail on unparseable JSON */ }
                }
            }
        });
    }

    /**
     * Manages the authentication handoff via CBAgentTools
     */
    async login(): Promise<boolean> {
        const page = this.page;
        if (!page || !this.context) throw new Error('Engine not initialized');

        console.log('[OdysseusEngine] Navigating to CBAgentTools...');
        await page.goto('https://www.cbagenttools.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Check if we are already logged in based on visible DOM elements or URL
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || await page.isVisible('input[name="password"]')) {
            const email = process.env.CB_EMAIL;
            const password = process.env.CB_PASSWORD;

            if (email && password) {
                console.log('[OdysseusEngine] Login page detected — auto-filling credentials...');
                await page.fill('input[name="username"], input[type="email"], input[name="email"]', email);
                await page.fill('input[name="password"]', password);
                await page.click('button[type="submit"], input[type="submit"]');
                await page.waitForLoadState('networkidle', { timeout: 30000 });
                console.log('[OdysseusEngine] ✅ Auto-login complete.');
            } else {
                console.log('======================================================');
                console.log('ACTION REQUIRED: CB_EMAIL / CB_PASSWORD not set in .env.local');
                console.log('Please log in manually in the browser window.');
                console.log('======================================================');
                await page.waitForTimeout(60000);
            }

            // Save state so future cold starts skip login
            await this.context.storageState({ path: STATE_FILE });
            console.log('[OdysseusEngine] ✅ Session state saved!');
        } else {
            console.log('[OdysseusEngine] ✅ Active authenticated session found!');
        }

        // Now click to open Cruise Engine
        console.log('[OdysseusEngine] Navigating directly to Odysseus Cruise Engine...');
        try {
            await page.goto('https://bookings.cbagenttools.com/swift/cruise?advancedsearch=true&siid=1049337&lang=1', { waitUntil: 'domcontentloaded' });
            this.odysseusPage = page;
            await this.odysseusPage.waitForLoadState('networkidle');
        } catch (e) {
            console.log('[OdysseusEngine] Failed to navigate to Odysseus Engine. Taking screenshot...');
            await page.screenshot({ path: 'odysseus-nav-error.png' });
            throw e;
        }

        console.log('[OdysseusEngine] Successfully reached Odysseus Cruise Engine!');

        return true;
    }

    /**
     * Performs a preliminary network health check on the Odysseus UI.
     * Prevents the automation from proceeding if Cruise Brothers has changed their DOM structure.
     */
    async validateHealth(): Promise<boolean> {
        const page = this.odysseusPage;
        if (!page) throw new Error('Engine not initialized or Odysseus tab not opened.');

        console.log('[OdysseusEngine] Running Preliminary Health Check mappings...');

        const requiredSelectors = [
            'ody-dropdown[data-ody-id="cruiselines"]',
            'ody-dropdown[data-ody-id="destinations"]',
            'input[data-ody-id="sailingDates"]',
            'ody-dropdown[data-ody-id="maxOccupancy"]',
            'button[data-ody-id="SearchButton"]'
        ];

        for (const selector of requiredSelectors) {
            try {
                // Check if the element handles are present in the DOM
                const element = await page.locator(selector).first();
                await element.waitFor({ state: 'attached', timeout: 5000 });
                console.log(`[Health Check] ✅ Selector found: ${selector}`);
            } catch (e) {
                console.error(`[Health Check] ❌ CRITICAL: Expected selector missing! -> ${selector}`);
                await page.screenshot({ path: 'health-check-failure.png' });
                throw new Error(`Health Check Failed: Odysseus DOM schema has potentially changed. Missing: ${selector}`);
            }
        }

        console.log('[OdysseusEngine] Health Check Passed. Safe to proceed with Booking Flow.');
        return true;
    }

    /**
     * Helper to handle select2 custom dropdowns in Odysseus
     */
    private async select2Option(odyId: string, optionValue: string) {
        if (!this.odysseusPage) return;
        const page = this.odysseusPage;
        console.log(`[OdysseusEngine] Attempting to select Option ${optionValue} in ${odyId}...`);
        try {
            // Drive the native select directly — no UI click needed since we dispatch the change event
            await page.locator(`ody-dropdown[data-ody-id="${odyId}"] select`).selectOption({ value: optionValue }, { force: true });
            await page.$eval(`ody-dropdown[data-ody-id="${odyId}"] select`, (el: HTMLSelectElement) => {
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await page.waitForTimeout(300);
        } catch (e) {
            console.log(`[OdysseusEngine] Failed to select option in ${odyId}:`, e);
        }
    }

    /**
     * Executes a cruise search query
     */
    async searchCruises(criteria: CruiseSearchCriteria): Promise<CruiseResult[]> {
        const page = this.odysseusPage;
        if (!page) throw new Error('Engine not initialized or Odysseus tab not opened.');

        console.log('[OdysseusEngine] Executing search for:', criteria);

        const occupancyStr = criteria.passengers >= 5 ? '5_undefined' : `${criteria.passengers}_${criteria.passengers}`;
        await this.select2Option('maxOccupancy', occupancyStr);

        // TODO: Phase 2 - Implement destination, cruise line, and date selection
        // The data-ody-id selectors mapping:
        // Destinations: 'ody-dropdown[data-ody-id="destinations"] select'
        // Dates: 'input[data-ody-id="sailingDates"]'
        // Cruise Lines: 'ody-dropdown[data-ody-id="cruiselines"] select'
        // Ships: 'ody-dropdown[data-ody-id="ships"] select'

        if (criteria.vendorId) {
            await this.select2Option('cruiselines', criteria.vendorId.toString());
        }

        if (criteria.startDate && criteria.endDate) {
            console.log(`[OdysseusEngine] Setting Sailing Dates: ${criteria.startDate} - ${criteria.endDate}`);
            try {
                // Focus the date input to open the calendar
                await page.locator('input[data-ody-id="sailingDates"]').click();
                await page.waitForTimeout(500);

                // Use eval to forcibly set the value and trigger the change event
                await page.$eval('input[data-ody-id="sailingDates"]', (el: any, dateStr) => {
                    el.value = dateStr;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }, `${criteria.startDate} - ${criteria.endDate}`);
            } catch (e) {
                console.log('[OdysseusEngine] Failed to set sailing dates.');
            }
        }

        console.log('[OdysseusEngine] Triggering Search...');
        await page.locator('button[data-ody-id="SearchButton"]').click();

        // Wait for the results loader to appear and then disappear
        await page.waitForLoadState('networkidle');

        // Extract the responses we've accumulated from the API call
        const searchResponses = this.interceptedData.filter(d =>
            d.url.includes('/nitroapi/v2/cruise?') &&
            !d.url.includes('facets')
        );

        let cruiseResults: CruiseResult[] = [];

        if (searchResponses.length > 0) {
            // Take the last one in case there were multiple identical requests
            const latestResponse = searchResponses[searchResponses.length - 1];
            if (latestResponse.payload && latestResponse.payload.data && latestResponse.payload.data.list) {
                cruiseResults = latestResponse.payload.data.list as CruiseResult[];
            }
        }

        console.log(`[OdysseusEngine] Search Complete. Successfully parsed ${cruiseResults.length} cruise results.`);
        return cruiseResults;
    }

    /**
     * Automates clicking into a specific itinerary to load cabin category availability.
     * @param index The zero-based index of the cruise result to book
     */
    async selectItinerary(index: number = 0): Promise<boolean> {
        const page = this.odysseusPage;
        if (!page) throw new Error('Engine not initialized or Odysseus tab not opened.');

        console.log(`[OdysseusEngine] Selecting Itinerary at index ${index}...`);

        try {
            // Find the nth book button on the results page
            const bookButton = page.locator('button[data-ody-id="CruiseResultsBookButton"]').nth(index);

            // We use a broader approach: wait for networkidle after clicking.
            await bookButton.click();
            await page.waitForTimeout(1000); // Give it a moment to dispatch the event
            await page.waitForLoadState('networkidle', { timeout: 30000 });

            console.log(`[OdysseusEngine] Successfully navigated to Cabin Category selection for index ${index}.`);
            return true;
        } catch (e) {
            console.error(`[OdysseusEngine] Failed to select itinerary at index ${index}. Taking screenshot...`);
            await page.screenshot({ path: `select-itinerary-error-${index}.png` });
            throw e;
        }
    }

    /**
     * Bypasses the Guest Information form by constructing the details.aspx URL
     * and navigating directly to it. This avoids the flaky Angular form validation
     * and anti-bot detection on the Continue button.
     *
     * Returns the shareable booking URL exposed by the portal on success, or
     * the constructed details.aspx entrypoint as a fallback if the share field
     * is unavailable. Returns null if extraction or navigation fails.
     */
    async bypassGuestInfoAndContinue(guestAges: number[] = [35, 35], guestState: string = 'FL'): Promise<string | null> {
        if (!this.odysseusPage) throw new Error("Odysseus page not initialized.");
        const page = this.odysseusPage;

        console.log(`[OdysseusEngine] Bypassing Guest Info form via URL construction...`);

        // 1. Extract required parameters from the current URL
        // Example: https://bookings.cbagenttools.com/swift/cruise/package/1477753--7-nights-st--kitts...?siid=1049337&lang=1
        const currentUrl = page.url();
        const urlObj = new URL(currentUrl);
        const siid = urlObj.searchParams.get('siid') || '';

        // Extract PID from the path: .../package/1477753--7-nights...
        const pathParts = urlObj.pathname.split('/');
        const packageSegment = pathParts[pathParts.length - 1];
        const pid = packageSegment.split('--')[0];

        if (!pid) {
            console.log(`[OdysseusEngine] Failed to extract PID from URL: ${currentUrl}`);
            return null;
        }

        console.log(`[OdysseusEngine] Extracted PID: ${pid}, SIID: ${siid}`);

        // 2. Construct the target details.aspx URL
        // We omit 'brn' as the server should generate/redirect it.
        // We use a dummy US phone number and the guest ages.
        const agesParam = guestAges.join('%2c'); // e.g. 35,35 -> 35%2c35
        const resParam = `US%2c${guestState}%2cDAB`; // Country,State,Airport (dummy DAB)

        const detailsUrl = `https://bookings.cbagenttools.com/web/cruises/details.aspx?source=swift&pid=${pid}&packageTourId=-1&lang=1&p1=${guestAges.length}&p2=${agesParam}&skipDetails=true&op=0%2c0%2c0%2c0%2c0%2c0%2c0%2c0%2c%2c%2c0%2c0&res=${resParam}&tt=29&Email=&FName=&LName=&PhoneNum=1112223333&PhoneCallingCode=1&phoneCountryCode=us&officeId=193${siid ? `&siid=${siid}` : ''}`;

        console.log(`[OdysseusEngine] Navigating directly to: ${detailsUrl}`);

        // 3. Navigate and wait for the redirect chain to settle
        try {
            await page.goto(detailsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });

            // It should redirect to category.aspx eventually
            let finalUrl = page.url();
            console.log(`[OdysseusEngine] Landed on: ${finalUrl}`);

            if (finalUrl.includes('farecodes.aspx')) {
                console.log(`[OdysseusEngine] On farecodes.aspx, waiting for category redirect...`);
                await page.waitForURL('**/category.aspx**', { timeout: 30000 }).catch(() => { });
                finalUrl = page.url();
            }

            console.log(`[OdysseusEngine] Final URL: ${finalUrl}`);

            const shareLink = await page
                .locator('#shareToClipboard, #visible-input')
                .first()
                .inputValue()
                .catch(() => '');
            if (shareLink && shareLink.trim().length > 0) {
                const normalizedShareLink = shareLink.trim().replace(/&amp;/g, '&');
                console.log(`[OdysseusEngine] Share link extracted: ${normalizedShareLink}`);
                await page.screenshot({ path: 'post-bypass-state.png', fullPage: true });
                return normalizedShareLink;
            }

            await page.screenshot({ path: 'post-bypass-state.png', fullPage: true });
            return detailsUrl;

        } catch (e) {
            console.log(`[OdysseusEngine] Navigation to details.aspx failed:`, e);
            await page.screenshot({ path: 'post-bypass-error.png', fullPage: true });
            return null;
        }
    }

    /**
     * Executes the final steps to hold a cabin:
     * 1. Clicks the "Book Now" button on the Category page to select a category.
     * 2. (Scaffold) Intended to select a specific cabin and continue to passenger details.
     * 3. (Scaffold) Intended to fill final names/addresses and click the actual "Hold" button.
     * Currently implemented up to Category Selection to inspect the Cabin Selection page.
     */
    async holdCabin(guestDetails: any): Promise<boolean> {
        if (!this.odysseusPage) throw new Error("Odysseus page not initialized.");
        const page = this.odysseusPage;

        console.log(`[OdysseusEngine] Scaffolding holdCabin flow...`);

        try {
            // 1. We should be on the category.aspx page (or equivalent category selection view).
            // Find the first available "Book Now" button for a category.
            console.log(`[OdysseusEngine] Waiting for category Book Now buttons...`);
            const bookNowBtn = page.locator('[data-ody-id="BookNowButton"]').first();
            await bookNowBtn.waitFor({ state: 'visible', timeout: 30000 });

            console.log(`[OdysseusEngine] Clicking Book Now for the first category...`);
            await bookNowBtn.click();

            // Handle the HTML "non-refundable" confirmation modal
            const continueModalBtn = page.locator('a[onclick="SubmitSelection()"]');
            try {
                // Check if the modal appears within 5 seconds
                await continueModalBtn.waitFor({ state: 'visible', timeout: 5000 });
                console.log(`[OdysseusEngine] Acknowledging non-refundable HTML modal...`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                    continueModalBtn.click()
                ]);
            } catch (e) {
                // Modal didn't appear. It might have started navigating directly.
                console.log(`[OdysseusEngine] No HTML modal detected, waiting for potential direct navigation...`);
                await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });
            }

            // We should now be on the Cabin/Deck selection page
            let currentUrl = page.url();
            console.log(`[OdysseusEngine] Navigated to Cabin selection page: ${currentUrl}`);

            // Take screenshot and dump HTML for inspection of Cabin page
            await page.screenshot({ path: 'cabin-selection-state.png', fullPage: true });

            console.log(`[OdysseusEngine] Waiting for specific Stateroom Book Now buttons...`);
            const stateroomBtn = page.locator('[data-ody-id="StateroomBookNowButton"]').first();
            await stateroomBtn.waitFor({ state: 'visible', timeout: 30000 });

            console.log(`[OdysseusEngine] Clicking first Stateroom Book Now button...`);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                stateroomBtn.click()
            ]);

            currentUrl = page.url();
            console.log(`[OdysseusEngine] Navigated to Passenger Details page: ${currentUrl}`);

            // Take screenshot and dump HTML of the final reservation page for inspection
            await page.screenshot({ path: 'passenger-details-state.png', fullPage: true });
            console.log(`[OdysseusEngine] Screenshot saved as passenger-details-state.png`);

            const fsReq = await import('fs');
            const html = await page.content();
            fsReq.writeFileSync('passenger-details-page.html', html);
            console.log(`[OdysseusEngine] Saved passenger-details-page.html for inspection.`);

            // STOP here for scaffolding purposes. We don't want to accidentally submit a real hold yet.
            console.log(`[OdysseusEngine] Scaffolding paused at Passenger Details. Waiting for next implementation step.`);
            return true;
        } catch (e) {
            console.log(`[OdysseusEngine] Error during holdCabin scaffolding:`, e);
            await page.screenshot({ path: 'hold-cabin-error.png', fullPage: true });
            return false;
        }
    }

    /**
     * Gracefully close the browser context
     */
    async close() {
        if (this.browser) {
            console.log('[OdysseusEngine] Closing down browser...');
            await this.browser.close();
        }
    }
}
