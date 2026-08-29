import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    timezoneId: "Asia/Taipei",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1366, height: 900 } } },
    { name: "large-desktop", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1920, height: 1080 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390", use: { ...devices["iPhone 15"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "mobile-320", use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 320, height: 568 } } },
  ],
});
