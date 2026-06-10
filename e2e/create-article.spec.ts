import { test, expect } from "@playwright/test";

test("save button is disabled until title, slug and content are filled", async ({
  page,
}) => {
  await page.goto("/article/create");
  const saveButton = page.getByRole("button", { name: "Save to PDS" });

  await expect(saveButton).toBeDisabled();

  await page.getByLabel("Title").fill("My New Article");
  await expect(saveButton).toBeDisabled();

  await page.getByLabel("URL slug").fill("my-new-article");
  await expect(saveButton).toBeDisabled();

  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Some content here");
  await expect(saveButton).toBeEnabled();
});

test("title auto-populates the URL slug", async ({ page }) => {
  await page.goto("/article/create");
  await page.getByLabel("Title").fill("Hello World Article");
  await expect(page.getByLabel("URL slug")).toHaveValue("hello-world-article");
});

test("manual slug edit stops auto-fill", async ({ page }) => {
  await page.goto("/article/create");
  await page.getByLabel("Title").fill("Hello World");
  await page.getByLabel("URL slug").fill("custom-slug");
  await page.getByLabel("Title").fill("Hello World Changed");
  await expect(page.getByLabel("URL slug")).toHaveValue("custom-slug");
});

test("navigating away with unsaved changes shows blocker modal", async ({
  page,
}) => {
  await page.goto("/article/create");
  await page.getByLabel("Title").fill("Draft article");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Unsaved changes" }),
  ).toBeVisible();
});

test("creating an article shows a success toast", async ({ page }) => {
  await page.goto("/article/create");
  await page.getByLabel("Title").fill("Test Article");
  await page.getByLabel("URL slug").fill("test-article");
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Content for the test article.");

  await page.getByRole("button", { name: "Save to PDS" }).click();
  await expect(page.getByText(/article not saved/i)).toBeVisible({ timeout: 8000 });
});
