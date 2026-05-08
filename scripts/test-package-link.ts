import { chromium } from "playwright";
import path from "path";

const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(); // no state
  const page = await context.newPage();

  console.log(
    "Navigating to https://bookings.cbagenttools.com/swift/cruise/package/1556883?siid=1049337",
  );
  const response = await page.goto(
    "https://bookings.cbagenttools.com/swift/cruise/package/1556883?siid=1049337",
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(20000);

  console.log("Final URL:", page.url());
  console.log("Response status:", response?.status());
  const text = await page.innerText("body");
  console.log("Body text:", text.slice(0, 200));
  await page.screenshot({ path: "test-package-link.png" });

  await browser.close();
}
run();
