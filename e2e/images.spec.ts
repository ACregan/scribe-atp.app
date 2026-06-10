import { test, expect } from "@playwright/test";

test("Image Library page loads with heading", async ({ page }) => {
  await page.goto("/images");
  await expect(
    page.getByRole("heading", { name: "Image Library" }),
  ).toBeVisible();
});

test("Image Library shows user folders from fixture data", async ({ page }) => {
  await page.goto("/images");
  // Current user's root folder is labelled "My Images"; other user shows display name
  await expect(page.getByText("My Images")).toBeVisible();
  await expect(page.getByText("Another Writer Images")).toBeVisible();
});

test("Upload Images button is present", async ({ page }) => {
  await page.goto("/images");
  await expect(
    page.getByRole("button", { name: "Upload Images" }),
  ).toBeVisible();
});
