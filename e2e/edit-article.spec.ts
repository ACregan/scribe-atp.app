import { test, expect } from "@playwright/test";

test("edit page loads with existing article content", async ({ page }) => {
  await page.goto("/article/edit/dev-mode-article");
  await expect(page.getByLabel("Title")).toHaveValue("Dev mode article");
  await expect(page.getByLabel("URL slug")).toHaveValue("dev-mode-article");
});

test("save button reads 'No Changes' when clean and 'Save Changes' when dirty", async ({
  page,
}) => {
  await page.goto("/article/edit/dev-mode-article");
  await expect(page.getByRole("button", { name: "No Changes" })).toBeDisabled();

  await page.getByLabel("Title").fill("Updated Title");
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toBeEnabled();
});

test("saving stays on the edit page and resets the button to No Changes", async ({
  page,
}) => {
  await page.goto("/article/edit/dev-mode-article");
  await page.getByLabel("Title").fill("Updated Title");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page).toHaveURL("/article/edit/dev-mode-article");
  await expect(page.getByText("Article saved")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("button", { name: "No Changes" })).toBeDisabled();
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

// ── Image picker ───────────────────────────────────────────────────────────────

test("image picker modal opens when the Insert image toolbar button is clicked", async ({
  page,
}) => {
  await page.goto("/article/edit/dev-mode-article");
  await page.locator('[contenteditable="true"]').waitFor();

  await page.locator('[title="Insert image"]').click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Image Library" }),
  ).toBeVisible();
});

test("image picker modal closes when the close button is clicked", async ({
  page,
}) => {
  await page.goto("/article/edit/dev-mode-article");
  await page.locator('[contenteditable="true"]').waitFor();

  await page.locator('[title="Insert image"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Close modal" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
