import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // The OSS web app lives in apps/web; specs + helpers live next to it.
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["line"],
  ],
  use: {
    // Override per gate: E2E_BASE_URL=https://dev.evaluchat.org | https://evaluchat.org
    baseURL: process.env.E2E_BASE_URL || "https://dev.evaluchat.org",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true, // headless for WSL/CI; override with --headed for debugging
    viewport: { width: 1280, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  // Promote gate: npx playwright test --grep @regression
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
