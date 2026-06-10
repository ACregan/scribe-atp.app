import { test, expect } from "@playwright/test";

test("clicking logout redirects to the login page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL("/login");
});

test("visiting a protected route after logout redirects to login", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL("/login");

  await page.goto("/article/create");
  await expect(page).toHaveURL(/\/login/);
});
