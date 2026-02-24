"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OdysseusEngine = void 0;
var playwright_1 = require("playwright");
var fs = require("fs");
var path = require("path");
// Store state locally in the project root for now
// When moving to Render, this could be stored in Redis or an S3 bucket
var STATE_FILE = path.join(process.cwd(), '.playwright-state.json');
var OdysseusEngine = /** @class */ (function () {
    function OdysseusEngine() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.odysseusPage = null;
        // Store intercept data temporarily
        this.interceptedData = [];
    }
    /**
     * Initialize the headless browser and attach the global XHR interceptor.
     */
    OdysseusEngine.prototype.init = function () {
        return __awaiter(this, arguments, void 0, function (headless) {
            var _a, _b, _c, _d;
            var _this = this;
            if (headless === void 0) { headless = false; }
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        console.log('[OdysseusEngine] Starting initialization...');
                        // Use real Chrome to avoid bot detection (Playwright Chromium is fingerprint-detected)
                        _a = this;
                        return [4 /*yield*/, playwright_1.chromium.launch({
                                headless: headless,
                                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
                            })];
                    case 1:
                        // Use real Chrome to avoid bot detection (Playwright Chromium is fingerprint-detected)
                        _a.browser = _e.sent();
                        if (!fs.existsSync(STATE_FILE)) return [3 /*break*/, 3];
                        console.log('[OdysseusEngine] Found existing session state. Loading cookies...');
                        _b = this;
                        return [4 /*yield*/, this.browser.newContext({
                                storageState: STATE_FILE,
                                viewport: { width: 1920, height: 1080 }
                            })];
                    case 2:
                        _b.context = _e.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        console.log('[OdysseusEngine] No session state found. Creating fresh context...');
                        _c = this;
                        return [4 /*yield*/, this.browser.newContext({
                                viewport: { width: 1920, height: 1080 }
                            })];
                    case 4:
                        _c.context = _e.sent();
                        _e.label = 5;
                    case 5:
                        // CRITICAL: Attach to any new tabs (Odysseus uses `target="_blank"` heavily)
                        this.context.on('page', function (newPage) {
                            console.log('[OdysseusEngine] New tab detected. Attaching XHR listener...');
                            _this.setupNetworkInterceptor(newPage);
                        });
                        _d = this;
                        return [4 /*yield*/, this.context.newPage()];
                    case 6:
                        _d.page = _e.sent();
                        this.setupNetworkInterceptor(this.page);
                        console.log('[OdysseusEngine] Initialization complete.');
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Global listener to catch all JSON payloads related to the booking flow
     */
    OdysseusEngine.prototype.setupNetworkInterceptor = function (page) {
        var _this = this;
        page.on('response', function (response) { return __awaiter(_this, void 0, void 0, function () {
            var url, type, json, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = response.url();
                        if (!(url.includes('/nitroapi/v2/cruise') ||
                            url.includes('/nitroapi/v2/reservation') ||
                            url.includes('availability') ||
                            url.includes('pricing'))) return [3 /*break*/, 4];
                        type = response.headers()['content-type'] || '';
                        if (!(type.includes('json') && response.status() === 200)) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, response.json()];
                    case 2:
                        json = _a.sent();
                        console.log("[XHR Intercepted] URL: ".concat(url));
                        this.interceptedData.push({ url: url, payload: json });
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
    };
    /**
     * Manages the authentication handoff via CBAgentTools
     */
    OdysseusEngine.prototype.login = function () {
        return __awaiter(this, void 0, void 0, function () {
            var page, currentUrl, _a, e_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        page = this.page;
                        if (!page || !this.context)
                            throw new Error('Engine not initialized');
                        console.log('[OdysseusEngine] Navigating to CBAgentTools...');
                        return [4 /*yield*/, page.goto('https://www.cbagenttools.com', { waitUntil: 'domcontentloaded' })];
                    case 1:
                        _b.sent();
                        currentUrl = page.url();
                        _a = currentUrl.includes('/login');
                        if (_a) return [3 /*break*/, 3];
                        return [4 /*yield*/, page.isVisible('input[name="password"]')];
                    case 2:
                        _a = (_b.sent());
                        _b.label = 3;
                    case 3:
                        if (!_a) return [3 /*break*/, 6];
                        console.log('======================================================');
                        console.log('ACTION REQUIRED: CBAgentTools Login Page is OPEN.');
                        console.log('1. Please log in manually in the browser window.');
                        console.log('2. Once logged in, click "Booking Engine" -> "Cruise Engine".');
                        console.log('3. Wait for the Odysseus Engine to fully load.');
                        console.log('======================================================');
                        // Wait for the user to login manually. Timeout at 60s.
                        return [4 /*yield*/, page.waitForTimeout(60000)];
                    case 4:
                        // Wait for the user to login manually. Timeout at 60s.
                        _b.sent();
                        // Save state so we never have to do this again
                        return [4 /*yield*/, this.context.storageState({ path: STATE_FILE })];
                    case 5:
                        // Save state so we never have to do this again
                        _b.sent();
                        console.log('[OdysseusEngine] ✅ Session state saved!');
                        return [3 /*break*/, 7];
                    case 6:
                        console.log('[OdysseusEngine] ✅ Active authenticated session found!');
                        _b.label = 7;
                    case 7:
                        // Now click to open Cruise Engine
                        console.log('[OdysseusEngine] Navigating directly to Odysseus Cruise Engine...');
                        _b.label = 8;
                    case 8:
                        _b.trys.push([8, 11, , 13]);
                        return [4 /*yield*/, page.goto('https://bookings.cbagenttools.com/swift/cruise?advancedsearch=true&siid=1049337&lang=1', { waitUntil: 'domcontentloaded' })];
                    case 9:
                        _b.sent();
                        this.odysseusPage = page;
                        return [4 /*yield*/, this.odysseusPage.waitForLoadState('networkidle')];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 11:
                        e_2 = _b.sent();
                        console.log('[OdysseusEngine] Failed to navigate to Odysseus Engine. Taking screenshot...');
                        return [4 /*yield*/, page.screenshot({ path: 'odysseus-nav-error.png' })];
                    case 12:
                        _b.sent();
                        throw e_2;
                    case 13:
                        console.log('[OdysseusEngine] Successfully reached Odysseus Cruise Engine!');
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Performs a preliminary network health check on the Odysseus UI.
     * Prevents the automation from proceeding if Cruise Brothers has changed their DOM structure.
     */
    OdysseusEngine.prototype.validateHealth = function () {
        return __awaiter(this, void 0, void 0, function () {
            var page, requiredSelectors, _i, requiredSelectors_1, selector, element, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        page = this.odysseusPage;
                        if (!page)
                            throw new Error('Engine not initialized or Odysseus tab not opened.');
                        console.log('[OdysseusEngine] Running Preliminary Health Check mappings...');
                        requiredSelectors = [
                            'ody-dropdown[data-ody-id="cruiselines"]',
                            'ody-dropdown[data-ody-id="destinations"]',
                            'input[data-ody-id="sailingDates"]',
                            'ody-dropdown[data-ody-id="maxOccupancy"]',
                            'button[data-ody-id="SearchButton"]'
                        ];
                        _i = 0, requiredSelectors_1 = requiredSelectors;
                        _a.label = 1;
                    case 1:
                        if (!(_i < requiredSelectors_1.length)) return [3 /*break*/, 8];
                        selector = requiredSelectors_1[_i];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 7]);
                        return [4 /*yield*/, page.locator(selector).first()];
                    case 3:
                        element = _a.sent();
                        return [4 /*yield*/, element.waitFor({ state: 'attached', timeout: 5000 })];
                    case 4:
                        _a.sent();
                        console.log("[Health Check] \u2705 Selector found: ".concat(selector));
                        return [3 /*break*/, 7];
                    case 5:
                        e_3 = _a.sent();
                        console.error("[Health Check] \u274C CRITICAL: Expected selector missing! -> ".concat(selector));
                        return [4 /*yield*/, page.screenshot({ path: 'health-check-failure.png' })];
                    case 6:
                        _a.sent();
                        throw new Error("Health Check Failed: Odysseus DOM schema has potentially changed. Missing: ".concat(selector));
                    case 7:
                        _i++;
                        return [3 /*break*/, 1];
                    case 8:
                        console.log('[OdysseusEngine] Health Check Passed. Safe to proceed with Booking Flow.');
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Helper to handle select2 custom dropdowns in Odysseus
     */
    OdysseusEngine.prototype.select2Option = function (odyId, optionValue) {
        return __awaiter(this, void 0, void 0, function () {
            var page, e_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.odysseusPage)
                            return [2 /*return*/];
                        page = this.odysseusPage;
                        console.log("[OdysseusEngine] Attempting to select Option ".concat(optionValue, " in ").concat(odyId, "..."));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        // Click the select2 container to open the dropdown
                        return [4 /*yield*/, page.locator("ody-dropdown[data-ody-id=\"".concat(odyId, "\"] .select2-selection")).click({ force: true })];
                    case 2:
                        // Click the select2 container to open the dropdown
                        _a.sent();
                        return [4 /*yield*/, page.waitForTimeout(500)];
                    case 3:
                        _a.sent(); // Give the dropdown animation a moment
                        // The dropdown list items are attached to the body or a nearby wrapper, not inside the select. 
                        // We use the generic locator for the dropdown results and force the native select change event.
                        return [4 /*yield*/, page.locator("ody-dropdown[data-ody-id=\"".concat(odyId, "\"] select")).selectOption({ value: optionValue }, { force: true })];
                    case 4:
                        // The dropdown list items are attached to the body or a nearby wrapper, not inside the select. 
                        // We use the generic locator for the dropdown results and force the native select change event.
                        _a.sent();
                        return [4 /*yield*/, page.$eval("ody-dropdown[data-ody-id=\"".concat(odyId, "\"] select"), function (el) {
                                var event = new Event('change', { bubbles: true });
                                el.dispatchEvent(event);
                            })];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, page.waitForTimeout(500)];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        e_4 = _a.sent();
                        console.log("[OdysseusEngine] Failed to select option in ".concat(odyId, ":"), e_4);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Executes a cruise search query
     */
    OdysseusEngine.prototype.searchCruises = function (criteria) {
        return __awaiter(this, void 0, void 0, function () {
            var page, occupancyStr, e_5, searchResponses, cruiseResults, latestResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        page = this.odysseusPage;
                        if (!page)
                            throw new Error('Engine not initialized or Odysseus tab not opened.');
                        console.log('[OdysseusEngine] Executing search for:', criteria);
                        occupancyStr = criteria.passengers >= 5 ? '5_undefined' : "".concat(criteria.passengers, "_").concat(criteria.passengers);
                        return [4 /*yield*/, this.select2Option('maxOccupancy', occupancyStr)];
                    case 1:
                        _a.sent();
                        if (!criteria.vendorId) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.select2Option('cruiselines', criteria.vendorId.toString())];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        if (!(criteria.startDate && criteria.endDate)) return [3 /*break*/, 9];
                        console.log("[OdysseusEngine] Setting Sailing Dates: ".concat(criteria.startDate, " - ").concat(criteria.endDate));
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 8, , 9]);
                        // Focus the date input to open the calendar
                        return [4 /*yield*/, page.locator('input[data-ody-id="sailingDates"]').click()];
                    case 5:
                        // Focus the date input to open the calendar
                        _a.sent();
                        return [4 /*yield*/, page.waitForTimeout(500)];
                    case 6:
                        _a.sent();
                        // Use eval to forcibly set the value and trigger the change event
                        return [4 /*yield*/, page.$eval('input[data-ody-id="sailingDates"]', function (el, dateStr) {
                                el.value = dateStr;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }, "".concat(criteria.startDate, " - ").concat(criteria.endDate))];
                    case 7:
                        // Use eval to forcibly set the value and trigger the change event
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        e_5 = _a.sent();
                        console.log('[OdysseusEngine] Failed to set sailing dates.');
                        return [3 /*break*/, 9];
                    case 9:
                        console.log('[OdysseusEngine] Triggering Search...');
                        return [4 /*yield*/, page.locator('button[data-ody-id="SearchButton"]').click()];
                    case 10:
                        _a.sent();
                        // Wait for the results loader to appear and then disappear
                        return [4 /*yield*/, page.waitForLoadState('networkidle')];
                    case 11:
                        // Wait for the results loader to appear and then disappear
                        _a.sent();
                        searchResponses = this.interceptedData.filter(function (d) {
                            return d.url.includes('/nitroapi/v2/cruise?') &&
                                !d.url.includes('facets');
                        });
                        cruiseResults = [];
                        if (searchResponses.length > 0) {
                            latestResponse = searchResponses[searchResponses.length - 1];
                            if (latestResponse.payload && latestResponse.payload.data && latestResponse.payload.data.list) {
                                cruiseResults = latestResponse.payload.data.list;
                            }
                        }
                        console.log("[OdysseusEngine] Search Complete. Successfully parsed ".concat(cruiseResults.length, " cruise results."));
                        return [2 /*return*/, cruiseResults];
                }
            });
        });
    };
    /**
     * Automates clicking into a specific itinerary to load cabin category availability.
     * @param index The zero-based index of the cruise result to book
     */
    OdysseusEngine.prototype.selectItinerary = function () {
        return __awaiter(this, arguments, void 0, function (index) {
            var page, bookButton, e_6;
            if (index === void 0) { index = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        page = this.odysseusPage;
                        if (!page)
                            throw new Error('Engine not initialized or Odysseus tab not opened.');
                        console.log("[OdysseusEngine] Selecting Itinerary at index ".concat(index, "..."));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 7]);
                        bookButton = page.locator('button[data-ody-id="CruiseResultsBookButton"]').nth(index);
                        // We use a broader approach: wait for networkidle after clicking.
                        return [4 /*yield*/, bookButton.click()];
                    case 2:
                        // We use a broader approach: wait for networkidle after clicking.
                        _a.sent();
                        return [4 /*yield*/, page.waitForTimeout(1000)];
                    case 3:
                        _a.sent(); // Give it a moment to dispatch the event
                        return [4 /*yield*/, page.waitForLoadState('networkidle', { timeout: 30000 })];
                    case 4:
                        _a.sent();
                        console.log("[OdysseusEngine] Successfully navigated to Cabin Category selection for index ".concat(index, "."));
                        return [2 /*return*/, true];
                    case 5:
                        e_6 = _a.sent();
                        console.error("[OdysseusEngine] Failed to select itinerary at index ".concat(index, ". Taking screenshot..."));
                        return [4 /*yield*/, page.screenshot({ path: "select-itinerary-error-".concat(index, ".png") })];
                    case 6:
                        _a.sent();
                        throw e_6;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Bypasses the Guest Information form by constructing the details.aspx URL
     * and navigating directly to it. This avoids the flaky Angular form validation
     * and anti-bot detection on the Continue button.
     */
    OdysseusEngine.prototype.bypassGuestInfoAndContinue = function () {
        return __awaiter(this, arguments, void 0, function (guestAges, guestState) {
            var page, currentUrl, urlObj, siid, pathParts, packageSegment, pid, agesParam, resParam, detailsUrl, finalUrl, e_7;
            if (guestAges === void 0) { guestAges = [35, 35]; }
            if (guestState === void 0) { guestState = 'FL'; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.odysseusPage)
                            throw new Error("Odysseus page not initialized.");
                        page = this.odysseusPage;
                        console.log("[OdysseusEngine] Bypassing Guest Info form via URL construction...");
                        currentUrl = page.url();
                        urlObj = new URL(currentUrl);
                        siid = urlObj.searchParams.get('siid') || '';
                        pathParts = urlObj.pathname.split('/');
                        packageSegment = pathParts[pathParts.length - 1];
                        pid = packageSegment.split('--')[0];
                        if (!pid) {
                            console.log("[OdysseusEngine] Failed to extract PID from URL: ".concat(currentUrl));
                            return [2 /*return*/, false];
                        }
                        console.log("[OdysseusEngine] Extracted PID: ".concat(pid, ", SIID: ").concat(siid));
                        agesParam = guestAges.join('%2c');
                        resParam = "US%2c".concat(guestState, "%2cDAB");
                        detailsUrl = "https://bookings.cbagenttools.com/web/cruises/details.aspx?source=swift&pid=".concat(pid, "&packageTourId=-1&lang=1&p1=").concat(guestAges.length, "&p2=").concat(agesParam, "&skipDetails=true&op=0%2c0%2c0%2c0%2c0%2c0%2c0%2c0%2c%2c%2c0%2c0&res=").concat(resParam, "&tt=29&Email=&FName=&LName=&PhoneNum=1112223333&PhoneCallingCode=1&phoneCountryCode=us&officeId=193").concat(siid ? "&siid=".concat(siid) : '');
                        console.log("[OdysseusEngine] Navigating directly to: ".concat(detailsUrl));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 9]);
                        return [4 /*yield*/, page.goto(detailsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, page.waitForLoadState('networkidle', { timeout: 15000 }).catch(function () { })];
                    case 3:
                        _a.sent();
                        finalUrl = page.url();
                        console.log("[OdysseusEngine] Landed on: ".concat(finalUrl));
                        if (!finalUrl.includes('farecodes.aspx')) return [3 /*break*/, 5];
                        console.log("[OdysseusEngine] On farecodes.aspx, waiting for category redirect...");
                        return [4 /*yield*/, page.waitForURL('**/category.aspx**', { timeout: 30000 }).catch(function () { })];
                    case 4:
                        _a.sent();
                        finalUrl = page.url();
                        _a.label = 5;
                    case 5:
                        console.log("[OdysseusEngine] Final URL: ".concat(finalUrl));
                        return [4 /*yield*/, page.screenshot({ path: 'post-bypass-state.png', fullPage: true })];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, finalUrl.includes('category.aspx')];
                    case 7:
                        e_7 = _a.sent();
                        console.log("[OdysseusEngine] Navigation to details.aspx failed:", e_7);
                        return [4 /*yield*/, page.screenshot({ path: 'post-bypass-error.png', fullPage: true })];
                    case 8:
                        _a.sent();
                        return [2 /*return*/, false];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Executes the final steps to hold a cabin:
     * 1. Clicks the "Book Now" button on the Category page to select a category.
     * 2. (Scaffold) Intended to select a specific cabin and continue to passenger details.
     * 3. (Scaffold) Intended to fill final names/addresses and click the actual "Hold" button.
     * Currently implemented up to Category Selection to inspect the Cabin Selection page.
     */
    OdysseusEngine.prototype.holdCabin = function (guestDetails) {
        return __awaiter(this, void 0, void 0, function () {
            var page, bookNowBtn, continueModalBtn, e_8, currentUrl, stateroomBtn, fsReq, html, e_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.odysseusPage)
                            throw new Error("Odysseus page not initialized.");
                        page = this.odysseusPage;
                        console.log("[OdysseusEngine] Scaffolding holdCabin flow...");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 16, , 18]);
                        // 1. We should be on the category.aspx page (or equivalent category selection view).
                        // Find the first available "Book Now" button for a category.
                        console.log("[OdysseusEngine] Waiting for category Book Now buttons...");
                        bookNowBtn = page.locator('[data-ody-id="BookNowButton"]').first();
                        return [4 /*yield*/, bookNowBtn.waitFor({ state: 'visible', timeout: 30000 })];
                    case 2:
                        _a.sent();
                        console.log("[OdysseusEngine] Clicking Book Now for the first category...");
                        return [4 /*yield*/, bookNowBtn.click()];
                    case 3:
                        _a.sent();
                        continueModalBtn = page.locator('a[onclick="SubmitSelection()"]');
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 7, , 9]);
                        // Check if the modal appears within 5 seconds
                        return [4 /*yield*/, continueModalBtn.waitFor({ state: 'visible', timeout: 5000 })];
                    case 5:
                        // Check if the modal appears within 5 seconds
                        _a.sent();
                        console.log("[OdysseusEngine] Acknowledging non-refundable HTML modal...");
                        return [4 /*yield*/, Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                                continueModalBtn.click()
                            ])];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 7:
                        e_8 = _a.sent();
                        // Modal didn't appear. It might have started navigating directly.
                        console.log("[OdysseusEngine] No HTML modal detected, waiting for potential direct navigation...");
                        return [4 /*yield*/, page.waitForLoadState('networkidle', { timeout: 30000 }).catch(function () { })];
                    case 8:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 9:
                        currentUrl = page.url();
                        console.log("[OdysseusEngine] Navigated to Cabin selection page: ".concat(currentUrl));
                        // Take screenshot and dump HTML for inspection of Cabin page
                        return [4 /*yield*/, page.screenshot({ path: 'cabin-selection-state.png', fullPage: true })];
                    case 10:
                        // Take screenshot and dump HTML for inspection of Cabin page
                        _a.sent();
                        console.log("[OdysseusEngine] Waiting for specific Stateroom Book Now buttons...");
                        stateroomBtn = page.locator('[data-ody-id="StateroomBookNowButton"]').first();
                        return [4 /*yield*/, stateroomBtn.waitFor({ state: 'visible', timeout: 30000 })];
                    case 11:
                        _a.sent();
                        console.log("[OdysseusEngine] Clicking first Stateroom Book Now button...");
                        return [4 /*yield*/, Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                                stateroomBtn.click()
                            ])];
                    case 12:
                        _a.sent();
                        currentUrl = page.url();
                        console.log("[OdysseusEngine] Navigated to Passenger Details page: ".concat(currentUrl));
                        // Take screenshot and dump HTML of the final reservation page for inspection
                        return [4 /*yield*/, page.screenshot({ path: 'passenger-details-state.png', fullPage: true })];
                    case 13:
                        // Take screenshot and dump HTML of the final reservation page for inspection
                        _a.sent();
                        console.log("[OdysseusEngine] Screenshot saved as passenger-details-state.png");
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('fs'); })];
                    case 14:
                        fsReq = _a.sent();
                        return [4 /*yield*/, page.content()];
                    case 15:
                        html = _a.sent();
                        fsReq.writeFileSync('passenger-details-page.html', html);
                        console.log("[OdysseusEngine] Saved passenger-details-page.html for inspection.");
                        // STOP here for scaffolding purposes. We don't want to accidentally submit a real hold yet.
                        console.log("[OdysseusEngine] Scaffolding paused at Passenger Details. Waiting for next implementation step.");
                        return [2 /*return*/, true];
                    case 16:
                        e_9 = _a.sent();
                        console.log("[OdysseusEngine] Error during holdCabin scaffolding:", e_9);
                        return [4 /*yield*/, page.screenshot({ path: 'hold-cabin-error.png', fullPage: true })];
                    case 17:
                        _a.sent();
                        return [2 /*return*/, false];
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gracefully close the browser context
     */
    OdysseusEngine.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.browser) return [3 /*break*/, 2];
                        console.log('[OdysseusEngine] Closing down browser...');
                        return [4 /*yield*/, this.browser.close()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return OdysseusEngine;
}());
exports.OdysseusEngine = OdysseusEngine;
