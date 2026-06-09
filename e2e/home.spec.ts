import { test, expect } from "@playwright/test";

test("dashboard loads with heading and quick action buttons", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Scope to <main> to avoid collisions with the aside menu links
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "New Site" })).toBeVisible();
  await expect(main.getByRole("link", { name: "New Group" })).toBeVisible();
  await expect(main.getByRole("link", { name: "New Article" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Image Library" })).toBeVisible();
});

test("dashboard shows recently updated articles from fixture data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("My First Post")).toBeVisible();
  await expect(page.getByText("Design Principles")).toBeVisible();
  await expect(
    page.getByText("Getting Started with AT Protocol"),
  ).toBeVisible();
});

test("dashboard shows unassigned articles alert when orphans exist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/UNASSIGNED/i)).toBeVisible();
});

test("New Article quick action navigates to create page", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "New Article" }).click();
  await expect(page).toHaveURL("/article/create");
});

test("New Site quick action navigates to sites new page", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "New Site" }).click();
  await expect(page).toHaveURL("/sites/new");
});
