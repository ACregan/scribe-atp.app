import { test, expect } from "@playwright/test";

test("view page loads with article title and content", async ({ page }) => {
  await page.goto("/article/view/dev-mode-article");
  await expect(
    page.getByRole("heading", { name: "Dev mode article" }),
  ).toBeVisible();
  await expect(
    page.getByText("This is placeholder content for dev mode."),
  ).toBeVisible();
});

test("Edit button navigates to edit page", async ({ page }) => {
  await page.goto("/article/view/dev-mode-article");
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL("/article/edit/dev-mode-article");
});

test("Back to articles link navigates to article list", async ({ page }) => {
  await page.goto("/article/view/dev-mode-article");
  await page.getByRole("link", { name: "Back to articles" }).click();
  await expect(page).toHaveURL("/article/list");
});
