import { test, expect } from "@playwright/test";

test("sites page shows fixture sites", async ({ page }) => {
  await page.goto("/sites");
  await expect(
    page.getByRole("heading", { name: "NoRobots.blog" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Perpetual Summer LTD" }),
  ).toBeVisible();
});

test("Add New Site button opens modal", async ({ page }) => {
  await page.goto("/sites");
  await page.getByRole("button", { name: "Add New Site" }).click();
  await expect(
    page.getByRole("heading", { name: "Add New Site" }),
  ).toBeVisible();
});

test("Add New Site modal opens when navigating to /sites/new", async ({
  page,
}) => {
  await page.goto("/sites/new");
  await expect(
    page.getByRole("heading", { name: "Add New Site" }),
  ).toBeVisible();
});

test("Add New Site modal can be opened, closed, and reopened", async ({
  page,
}) => {
  await page.goto("/sites");
  await page.getByRole("button", { name: "Add New Site" }).click();
  await expect(
    page.getByRole("heading", { name: "Add New Site" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close modal" }).click();
  await expect(
    page.getByRole("heading", { name: "Add New Site" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Add New Site" }).click();
  await expect(
    page.getByRole("heading", { name: "Add New Site" }),
  ).toBeVisible();
});

test("closing /sites/new modal navigates back to /sites", async ({ page }) => {
  await page.goto("/sites/new");
  await page.getByRole("button", { name: "Close modal" }).click();
  await expect(page).toHaveURL("/sites");
});

test("Delete button opens delete confirmation modal", async ({ page }) => {
  await page.goto("/sites");
  await page.getByRole("button", { name: "Delete site" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Delete Site" }),
  ).toBeVisible();
});
