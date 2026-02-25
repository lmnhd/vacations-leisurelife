# Completed Chat System Tools Documentation

This document comprehensively outlines the five tools successfully built and integrated into the Leisure Life Interactive Chat System. These tools expand the capabilities of the AI agents within the `fast_booking` and `onboarding` flows.

---

## Tool 1: Excursion Finder (`excursion_finder`)

### Overview
A live scraping tool that interfaces with the Viator partner portal to discover shore excursions, tours, and activities based on a specific destination and date range.

### Architecture & Components
*   **JSON Definition**: `lib/chat/prompt-data/tools/research/excursion-finder.json`
*   **Handler Logic**: `lib/chat/tools/excursion-finder.ts`
*   **API Test Endpoint**: `/api/tests/excursion-finder`
*   **Context Registration**: Available in `fast_booking.package_search` and `fast_booking.package_presentation`.

### Mechanics
1.  **Input**: Takes a `destination` (e.g., "Nassau, Bahamas") and optionally a `startDate` and `endDate`.
2.  **Processing**: The Playwright scraper spins up headlessly, navigates to Viator, and executes a targeted search.
3.  **Output**: Returns a curated list of excursions including the title, duration, price, rating, and a direct booking link.

---

## Tool 2: Cruise Brothers Scraper (`cruise_brothers_scraper`)

### Overview
A two-part system designed to ingest, cache, and query live "Today's Promos" and "Price Advantages" from the Cruise Brothers agent portal (`cbagenttools.com`).

### Architecture & Components
*   **Ingestion Script**: `scripts/scrape-cb-deals.ts` (Playwright script that uses `storageState` to maintain an authenticated session).
*   **Cron Endpoint**: `app/api/serverutils/refresh-cb-cache/route.ts` (Allows automated background execution of the ingestion script).
*   **JSON Definition**: `lib/chat/prompt-data/tools/agency/cruise-brothers-scraper.json`
*   **Handler Logic**: `lib/chat/tools/cruise-brothers-scraper.ts`
*   **API Test Endpoint**: `/api/tests/cruise-brothers-scraper`
*   **Context Registration**: Available in `fast_booking.package_search`.

### Mechanics
1.  **Ingestion**: Background cron job hits the Cruise Brothers portal, extracts hundreds of live promos and groups, and saves them to a local JSON cache (`.github/data/cb-deals-cache.json`).
2.  **Querying**: The chat pipeline tool reads the cached JSON and performs keyword scoring based on the agent's query (e.g., "Royal Caribbean", "Bermuda") to return the most relevant, pre-packaged deals instantly.

---

## Tool 3: Pricing Comparator (`pricing_comparator`)

### Overview
A purely computational analysis tool that evaluates proposed cruise packages against the client's stated budget, calculating comprehensive affordability metrics.

### Architecture & Components
*   **JSON Definition**: `lib/chat/prompt-data/tools/booking/pricing-comparator.json`
*   **Handler Logic**: `lib/chat/tools/pricing-comparator.ts`
*   **API Test Endpoint**: `/api/tests/pricing-comparator`
*   **Context Registration**: Available in `fast_booking.package_search` and `fast_booking.package_presentation`.

### Mechanics
1.  **Input**: Accepts `baseFare`, `taxesFeesPortExpenses`, `gratuities`, `numberOfGuests`, `numberOfNights`, and `clientTotalBudget`.
2.  **Processing**: Calculates total holistic cost, per-person-total, per-person-per-night rate, and algorithmic budget variance.
3.  **Output**: Yields a formatted `affordabilitySummary` string (e.g., "GREAT NEWS: This package is $150 under budget! ... Excellent value at $85 per person, per night.") injected directly into the LLM's context.

---

## Tool 4: Odysseus General Search (`odysseus_search`)

### Overview
A live scraping bridge to the Odysseus Cruise Booking Engine, utilized when there are no suitable pre-packaged "deals" or when the client requests highly specific availability.

### Architecture & Components
*   **Engine Wrapper**: `lib/services/odysseus/OdysseusEngine.ts`
*   **JSON Definition**: `lib/chat/prompt-data/tools/booking/odysseus-search.json`
*   **Handler Logic**: `lib/chat/tools/odysseus-search.ts`
*   **API Test Endpoint**: `/api/tests/odysseus-search`
*   **Context Registration**: Available in `fast_booking.package_search`.

### Mechanics
1.  **Input**: Accepts standard search parameters like `vendorId`, `dates`, `passengers`, and `guestAges`.
2.  **Processing**: The tool instantiates the headless `OdysseusEngine`, automatically assumes the active session, bypasses HTML wrappers, and executes a search array. It intercepts the underlying XHR/JSON payloads to extract pure data.
3.  **Output**: Returns up to 10 live itineraries including Ship Name, Duration, Departure/Arrival Ports, and `startingAtUSD` base fare pricing.

---

## Tool 5: Cruise Groups Manager (`cruise_groups_manager`)

### Overview
A dual-action tool providing direct integration with the CBAgentTools "Cruise Groups" module, enabling the AI to discover existing group spaces or register new private groups.

### Architecture & Components
*   **JSON Definition**: `lib/chat/prompt-data/tools/agency/cruise-groups-manager.json`
*   **Handler Logic**: `lib/chat/tools/cruise-groups-manager.ts`
*   **API Test Endpoint**: `/api/tests/cruise-groups-manager`
*   **Context Registration**: Available in `fast_booking.package_search` and `fast_booking.package_presentation`.

### Mechanics
1.  **Search Mode**: 
    *   Navigates to `/groups/view_groups/`.
    *   Scrapes active tables for Group IDs, Ships, Vendors, and Sail Dates.
    *   Filters by the LLM's `searchQuery` to locate matching group allocations quickly.
2.  **Create Mode**: 
    *   Navigates to the Formstack-powered `/groups/build/` registration flow.
    *   Takes dynamic `groupData` (Group Number, Name, Ship, Line, Date) and programmatically auto-fills complex UI inputs (text fields, React MUI date pickers).
    *   Simulates the final submission to register the group into the Odysseus ecosystem formally.
