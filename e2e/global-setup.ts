import { chromium } from "@playwright/test";

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:3008/login");
  await page.getByLabel("Bluesky Handle").fill("testuser.bsky.social");
  await page.getByRole("button", { name: "Sign in with Bluesky" }).click();
  await page.waitForURL("http://localhost:3008/");

  await page.context().storageState({ path: "e2e/.auth/session.json" });
  await browser.close();
}
