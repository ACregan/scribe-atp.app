import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["junit", { outputFile: "test-results/junit.xml" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:3008",
    storageState: "e2e/.auth/session.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    port: 3008,
    reuseExistingServer: !process.env.CI,
    env: {
      E2E: "true",
      SESSION_SECRET: "e2e-test-secret-do-not-use-in-production",
    },
  },
});
