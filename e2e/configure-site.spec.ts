import { test, expect } from "@playwright/test";

test("configure page loads with existing site values", async ({ page }) => {
  await page.goto("/site/norobots-blog/configure");
  await expect(page.getByRole("heading", { name: "Configure" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("NoRobots.blog");
});

test("save button is disabled until a change is made", async ({ page }) => {
  await page.goto("/site/norobots-blog/configure");
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toBeDisabled();

  await page.getByLabel("Title").fill("NoRobots.blog Updated");
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toBeEnabled();
});

test("navigating away with unsaved changes shows blocker modal", async ({
  page,
}) => {
  await page.goto("/site/norobots-blog/configure");
  await page.getByLabel("Title").fill("Changed title");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Unsaved changes" }),
  ).toBeVisible();
});

test("saving configuration shows a success toast", async ({ page }) => {
  await page.goto("/site/norobots-blog/configure");
  await page.getByLabel("Title").fill("NoRobots.blog Updated");

  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/configured/i)).toBeVisible({ timeout: 8000 });
});
