import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login with a handle lands on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Bluesky Handle").fill("testuser.bsky.social");
  await page.getByRole("button", { name: "Sign in with Bluesky" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("unauthenticated visit to a protected route redirects to login", async ({
  page,
}) => {
  await page.goto("/article/create");
  await expect(page).toHaveURL(/\/login/);
});
