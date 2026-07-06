import { test, expect } from "@playwright/test";

test("clicking logout redirects to the home page", async ({ page }) => {
  await page.goto("/");
  const logoutButton = page.getByRole("button", { name: "Logout" });
  await expect(logoutButton).toBeVisible();
  await logoutButton.click();
  await expect(page).toHaveURL("/");
});

test("visiting a protected route after logout redirects to login", async ({
  page,
}) => {
  await page.goto("/");

  // Wait for the actual POST /logout response, not just the URL settling to
  // "/" — the client-side redirect can update the URL slightly ahead of the
  // browser fully committing the session-clearing Set-Cookie, which made
  // this test flaky (the next navigation could race ahead of the cookie
  // actually being cleared).
  await Promise.all([
    // React Router v7's single-fetch data mode posts to "/logout.data" (or
    // similar), not a literal "/logout" — matched loosely since no other
    // route in this app contains "logout" as a substring.
    page.waitForResponse(
      (response) =>
        response.url().includes("/logout") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Logout" }).click(),
  ]);
  await expect(page).toHaveURL("/");

  await page.goto("/article/create");
  await expect(page).toHaveURL(/\/login/);
});
