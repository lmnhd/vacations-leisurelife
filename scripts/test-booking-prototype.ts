import * as fs from 'fs';
import * as path from 'path';
import { OdysseusEngine } from '../lib/services/odysseus/OdysseusEngine';
import { CruiseSearchCriteria } from '../lib/services/odysseus/types';

async function testBookingPrototype() {
    console.log('--- Starting Odysseus Engine Prototype Test ---');

    const engine = new OdysseusEngine();

    try {
        // 1. Initialize the engine (browser, context, network listeners)
        // Running headless: false so we can watch it work!
        await engine.init(false);

        // 2. Perform Login Flow
        await engine.login();

        // 3. Preliminary Network check: Validate Odysseus DOM
        await engine.validateHealth();

        // 4. Define a Dummy Search
        const searchCriteria: CruiseSearchCriteria = {
            vendorId: 8, // Royal Caribbean
            passengers: 2,
            guestAges: [35, 35],
            guestStateResidence: 'FL'
        };

        // 4. Execute the Search (Currently just logs the inputs until we map the DOM)
        const results = await engine.searchCruises(searchCriteria);
        console.log(`\nReturned ${results.length} cruise results.`);
        if (results.length > 0) {
            console.log('\n--- First Result Sample ---');
            console.log('Cruise Name:', results[0].name);
            console.log('Ship Name:', results[0].ship?.cruiseline?.id === 8 ? 'Royal Caribbean' : 'Unknown');
            console.log('Total Packages:', results[0].packages?.length || 0);
            if (results[0].prices && results[0].prices.length > 0) {
                console.log('Base Prices Array:', results[0].prices[0].items.map(p => `${p.name || p.code}: $${p.value}`).join(', '));
            }
            console.log('---------------------------\n');

            // 5. Test Itinerary Selection Navigation
            console.log(`[Test] Attempting to click "Book" on Voyage Code: ${results[0].code}`);
            await engine.selectItinerary(0);

            // Wait longer to ensure category API calls have time to fire
            await new Promise(resolve => setTimeout(resolve, 20000));

            // Take a screenshot of the category page
            console.log(`[Test] Taking screenshot of the post-Book state...`);
            if (engine.odysseusPage) {
                await engine.odysseusPage.screenshot({ path: 'category-page-state.png', fullPage: true });
                console.log(`[Test] Post-Book URL: ${engine.odysseusPage.url()}`);
            }

            // 6. Bypass Guest Information form and advance to Category page
            const success = await engine.bypassGuestInfoAndContinue([35, 35], 'FL');
            console.log(`[Test] Bypass successful? ${success}. Should be on Category page now.`);

            if (success) {
                // 7. Test the holdCabin scaffolding (clicks Book Now for the first category)
                console.log(`[Test] Proceeding to test holdCabin scaffolding...`);
                await engine.holdCabin({});
                console.log(`[Test] holdCabin scaffolding complete.`);
            }
        }

        // 7. Dump the intercepted payload for analysis
        if (engine.interceptedData.length > 0) {
            console.log(`\n[Test] Captured ${engine.interceptedData.length} relevant network responses. Dumping to file...`);
            fs.writeFileSync(
                path.join(process.cwd(), 'odysseus-intercepted-payloads.json'),
                JSON.stringify(engine.interceptedData, null, 2)
            );
            console.log('[Test] Saved to odysseus-intercepted-payloads.json');
        } else {
            console.log('\n[Test] No matching XHR data was intercepted.');
        }

    } catch (error) {
        console.error('Prototype test failed:', error);
    } finally {
        await engine.close();
        console.log('--- Prototype Test Complete ---');
    }
}

testBookingPrototype();
