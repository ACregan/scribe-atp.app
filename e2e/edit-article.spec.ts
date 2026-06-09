import { test, expect } from "@playwright/test";

test("edit page loads with existing article content", async ({ page }) => {
  await page.goto("/article/edit/dev-mode-article");
  await expect(page.getByLabel("Title")).toHaveValue("Dev mode article");
  await expect(page.getByLabel("URL slug")).toHaveValue("dev-mode-article");
});

test("save button is disabled until a change is made", async ({ page }) => {
  await page.goto("/article/edit/dev-mode-article");
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toBeDisabled();

  await page.getByLabel("Title").fill("Updated Title");
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toBeEnabled();
});

test("navigating away with unsaved changes shows blocker modal", async ({
  page,
}) => {
  await page.goto("/article/edit/dev-mode-article");
  await page.getByLabel("Title").fill("Changed title");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Unsaved changes" }),
  ).toBeVisible();
});

test("discarding changes navigates away", async ({ page }) => {
  await page.goto("/article/edit/dev-mode-article");
  await page.getByLabel("Title").fill("Changed title");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Discard & Leave" }).click();
  await expect(page).toHaveURL("/");
});
