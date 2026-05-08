import { chromium } from "playwright";
import path from "path";

const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();

  await page.goto(
    "https://www.cbagenttools.com/groups/view_groups/?price_advantage=on",
    { waitUntil: "networkidle" },
  );

  const links = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr");
    return Array.from(rows)
      .slice(0, 3)
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          td.innerText.trim(),
        );
        return cells;
      });
  });

  console.log("Extracted links from rows:", links);
  await browser.close();
}
run();
