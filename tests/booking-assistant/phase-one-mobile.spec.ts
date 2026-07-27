import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/deals-system/booking-assistant");
  await page.evaluate(() => {
    sessionStorage.clear();
  });
  await page.reload();
});

test("iPhone viewport keeps the primary task reachable without horizontal overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Start booking" }).click();
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("WebKit voice simulation proposes an editable value before confirmation", async ({ page }) => {
  await page.getByRole("button", { name: "Start booking" }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Switch to voice" }).click();
  await page.getByRole("button", { name: "Tap to speak" }).click();

  const firstName = page.getByRole("textbox");
  await expect(firstName).toHaveValue("Margaret");
  await firstName.fill("Maggie");
  await expect(firstName).toHaveValue("Maggie");
});
