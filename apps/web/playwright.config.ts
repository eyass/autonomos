import { defineConfig } from "@playwright/test";

const env = {
  AI_MOCK: "1",
  TRIGGER_SECRET_KEY: "tr_dev_e2e_stub",
  TRIGGER_API_URL: "http://127.0.0.1:3999",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  // The onboarding crawl reads the stub company site on localhost. Never set in production.
  CRAWL_ALLOW_PRIVATE: "1",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  webServer: [
    {
      command: "node --env-file-if-exists=../../.env.local --import tsx e2e/trigger-stub.ts",
      port: 3999,
      reuseExistingServer: false,
      env,
    },
    {
      command: "npx next start -p 3100",
      port: 3100,
      reuseExistingServer: false,
      timeout: 120_000,
      env,
    },
  ],
});
