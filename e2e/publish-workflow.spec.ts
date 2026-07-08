import { test, expect } from "@playwright/test";

// Since ADR 0013, Publish is a single consolidated action (site -> group,
// with inline create-group) that lives only on /article/list, applied to
// Unassigned Drafts. It no longer lives on the per-site view. Unpublish
// (still labelled "moveToDraft" internally) stays on the per-site view,
// fully detaching an article back to loose rather than moving it within
// the site.

const ARTICLE_LIST_URL = "/article/list";
const SITE_LIST_URL = "/article/list/norobots-blog";

// ── Publish flow (/article/list) ──────────────────────────────────────────────

test("Unassigned Drafts show a Publish button", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await expect(page.getByText("Dev Orphan Draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});

test("clicking Publish opens the Publish Article modal", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).toBeVisible();
  await expect(
    page.locator("dialog[open]").getByText("Dev Orphan Draft"),
  ).toBeVisible();
});

test("Publish modal shows site and group selectors", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  const siteSelect = page.locator('dialog[open] select[name="siteRkey"]');
  await expect(siteSelect).toBeVisible();
  await expect(siteSelect).toContainText("NoRobots.blog");
  await expect(siteSelect).toContainText("Perpetual Summer LTD");

  const groupSelect = page.locator('dialog[open] select[name="groupSlug"]');
  await expect(groupSelect).toBeVisible();
  await expect(groupSelect).toContainText("Getting Started");
});

test("switching site updates the available groups", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  await page
    .locator('dialog[open] select[name="siteRkey"]')
    .selectOption("perpetualsummer-ltd");
  const groupSelect = page.locator('dialog[open] select[name="groupSlug"]');
  await expect(groupSelect).toContainText("Create new group");
  await expect(groupSelect).not.toContainText("Getting Started");
});

test("selecting create-new-group reveals a title field", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  await page
    .locator('dialog[open] select[name="groupSlug"]')
    .selectOption({ label: "+ Create new group" });
  await expect(
    page.locator("dialog[open]").getByLabel("New group title"),
  ).toBeVisible();
});

test("Publish modal Cancel button closes the modal", async ({ page }) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).not.toBeVisible();
});

test("publishing an article shows a success toast and closes the modal", async ({
  page,
}) => {
  await page.goto(ARTICLE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(page.getByText("Article published")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).not.toBeVisible();
});

// ── Unpublish flow (per-site view) ────────────────────────────────────────────

test("published articles show an Unpublish button", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await expect(page.getByText("Hello World", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
});

test("clicking Unpublish opens a confirmation modal", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(
    page.getByRole("heading", { name: "Unpublish Article" }),
  ).toBeVisible();
  await expect(
    page.locator("dialog[open]").getByText("NoRobots.blog (Dev)"),
  ).toBeVisible();
  await expect(
    page.locator("dialog[open]").getByText("Engineering"),
  ).toBeVisible();
});

test("Unpublish modal Cancel button closes the modal", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(
    page.getByRole("heading", { name: "Unpublish Article" }),
  ).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Unpublish Article" }),
  ).not.toBeVisible();
});

test("confirming Unpublish redirects back to the site list", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Confirm" })
    .click();
  await page.waitForURL("**/article/list/norobots-blog");
  await expect(
    page.getByText("Engineering", { exact: true }).first(),
  ).toBeVisible();
});
