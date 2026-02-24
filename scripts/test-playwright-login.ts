import { chromium } from 'playwright';

async function testOdysseusLogin() {
  console.log('Initiating Playwright test for cbagenttools...');
  
  const browser = await chromium.launch({ headless: false }); // See it happen for the test
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to CBAgentTools...');
    await page.goto('https://www.cbagenttools.com', { waitUntil: 'networkidle' });
    
    console.log('Attempting to log in...');
    // Replace with actual credentials once we know the selectors or prompt the user
    await page.fill('input[name="email"]', process.env.CB_EMAIL || 'cclements@cruisebrothers.com');
    await page.fill('input[name="password"]', process.env.CB_PASSWORD || 'your_password_here');
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle' });
    console.log('Logged into CBAgentTools successfully.');

    // Now try to reach the cruise engine
    console.log('Navigating to Booking Engine -> Cruise Engine...');
    // We'll need the exact text or selector from the UI
    await page.getByText('Booking Engine').click();
    await page.getByText('Cruise Engine').click();
    
    // The SSO will likely open a new tab/window, handle it:
    const newPage = await context.waitForEvent('page');
    await newPage.waitForLoadState('networkidle');
    
    console.log('Successfully reached Odysseus Cruise Engine!');
    console.log('New Page URL:', newPage.url());

    // Take a screenshot of the Odysseus dashboard
    await newPage.screenshot({ path: 'odysseus-dashboard.png' });
    console.log('Screenshot saved as odysseus-dashboard.png');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Keep browser open for a few seconds to see result
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

testOdysseusLogin();
