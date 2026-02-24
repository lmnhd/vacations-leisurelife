# Odysseus Cruise Engine Playwright Automation Strategy

## Overview
This document outlines the architecture, strategies, and lessons learned while building the Playwright-based automation prototype for the Odysseus Cruise Engine. Because Odysseus heavily relies on legacy `.aspx` state management and integrates aggressive bot-detection (likely via Datadome or Akamai), traditional scraping or UI automation approaches must be specifically tailored.

## 1. Authentication & Session Management
Odysseus sits behind `cbagenttools.com`. To access the engine, an active agent session is required.

**Strategy:**
- We do **not** attempt to automate the login form of CBAgentTools due to CAPTCHAs and 2FA.
- Instead, the `OdysseusEngine` relies on a locally stored Playwright state file (`.playwright-state.json`).
- If a valid session exists, we load the cookies and navigate directly to the engine.
- If the session is invalid or missing, the automation pauses for 60 seconds, allowing the user to manually log in via the visible Chromium window. Once authenticated, the class saves the new session state for future use.

## 2. Bot Detection & Fingerprinting Bypass
Early attempts to use `puppeteer-extra-plugin-stealth` failed to bypass the bot-detection gates encountered during the booking flow (specifically the Guest Information form). 

**Solution:**
- We abandoned specialized stealth plugins in favor of launching Playwright using the user's **native local Chrome executable** (`executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`).
- By running a standard browser instance, we inherit a legitimate fingerprint, passing the advanced bot checks that were flagging headless or bundled Chromium instances.
- **Rule:** Always use `channel: 'chrome'` or the direct `executablePath` when initializing the Playwright context for Odysseus.

## 3. Data Extraction via XHR Interception
Odysseus loads cruise data dynamically via XHR requests to `/nitroapi/v2/`. Scraping the DOM is brittle and incomplete.

**Strategy:**
- The engine attaches a global `route` interceptor to the Playwright context.
- We monitor requests to `**/nitroapi/v2/**`.
- When a response is received, we parse the JSON payload directly. This provides cleanly structured data (base prices, itineraries, ship details) without needing complex DOM selectors.
- These JSON payloads define the TypeScript interfaces we use internally (e.g., `CruiseResult`).

## 4. Bypassing the Guest Information Form (URL Construction)
The most significant blocker was the "Guest Information" form (Angular-based). The "Continue" button silently failed when clicked via Playwright, likely due to deep event-listener validation or invisible bot-traps.

**Solution: The URL Bypass**
- We discovered that the form doesn't POST data; it constructs a complex URL (`details.aspx`) and performs a client-side redirect.
- We bypass the UI entirely. After selecting an itinerary:
  1. We extract the `pid` (package ID) and `siid` (session ID) from the current URL.
  2. We programmatically construct the `details.aspx` URL with dummy guest data (e.g., ages, state of residency, placeholders for name/email).
  3. We use `page.goto(constructedUrl)` to jump directly to the processing step.
- This successfully navigates around the unreliable form and lands us on the Category selection page.

## 5. Handling HTML Modals (Non-Refundable Fares)
When selecting a cabin category (e.g., clicking "Book Now"), Odysseus sometimes presents a "Deposit Non Refundable" warning.

**Challenge:**
- This is *not* a standard JavaScript `window.alert` or `window.confirm` dialog. Playwright's native `page.on('dialog')` handler will not catch it.
- It is a DOM-based Bootstrap modal (`<div class="modal">`).

**Solution:**
- After clicking the Category "Book Now" button, we add a generic `waitForTimeout(5000)` combined with a specific check for the modal's "Continue" button (`a[onclick="SubmitSelection()"]`).
- If the modal appears, we explicitly click the HTML button inside it.
- If it times out, we assume the navigation proceeded directly.

## 6. DOM Navigation Selectors
While we use XHR for data, we must still use the DOM for navigation. The following `data-ody-id` selectors proved reliable:
- **Search Button**: `[data-ody-id="SearchButton"]`
- **Itinerary Select**: `[data-ody-id="CruiseResultBookButton"]` (Note: sometimes requires `.first()`)
- **Category Book Now**: `[data-ody-id="BookNowButton"]`
- **Cabin Book Now**: `[data-ody-id="StateroomBookNowButton"]`

## 7. Next Steps for Integration
1. **Schema Mapping**: The intercepted payloads from `odysseus-intercepted-payloads.json` need to be mapped to the formal Prisma schemas defined in `PDR.md`.
2. **AI Instruction Generation**: We need to use these findings to generate exact system prompts instructing the AI how to navigate Odysesus when the user requested "Fast Booking" flow is triggered.
