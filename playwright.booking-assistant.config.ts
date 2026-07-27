import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/booking-assistant",
  testMatch: "phase-one-mobile.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.BOOKING_ASSISTANT_TEST_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "webkit-iphone",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
});
