import { test, expect } from "@playwright/test";

const SITE_LIST_URL = "/article/list/norobots-blog";

// ── Publish flow ──────────────────────────────────────────────────────────────

test("ungrouped articles show a Publish button", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await expect(
    page.getByText("Getting Started with AT Protocol", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish" }).first(),
  ).toBeVisible();
});

test("clicking Publish opens the Publish Article modal", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).toBeVisible();
  await expect(
    page
      .locator("dialog[open]")
      .getByText("Getting Started with AT Protocol"),
  ).toBeVisible();
});

test("Publish modal shows a group selector with available groups", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).first().click();
  const groupSelect = page.locator('dialog[open] select[name="groupSlug"]');
  await expect(groupSelect).toBeVisible();
  await expect(groupSelect).toContainText("Engineering");
});

test("Publish modal Cancel button closes the modal", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).first().click();
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
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Publish" }).first().click();
  await page
    .locator('dialog[open] select[name="groupSlug"]')
    .selectOption("engineering");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(page.getByText("Article published")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Publish Article" }),
  ).not.toBeVisible();
});

// ── Canonical site picker ─────────────────────────────────────────────────────

test("Publish modal shows canonical site picker when article is on multiple sites", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  // "Getting Started" is on two sites in the fixture — picker should appear
  await page
    .getByText("Getting Started with AT Protocol", { exact: true })
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(
    page.locator('dialog[open] select[name="canonicalSiteUrl"]'),
  ).toBeVisible();
  await expect(
    page.locator('dialog[open] select[name="canonicalSiteUrl"]'),
  ).toContainText("NoRobots.blog");
  await expect(
    page.locator('dialog[open] select[name="canonicalSiteUrl"]'),
  ).toContainText("Perpetual Summer LTD");
});

test("Publish modal does not show canonical site picker for single-site article", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  // "Building a Rich Text Editor" is on one site — no picker
  await page
    .getByText("Building a Rich Text Editor with Lexical", { exact: true })
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(
    page.locator('dialog[open] select[name="canonicalSiteUrl"]'),
  ).not.toBeVisible();
});

// ── Move to Drafts flow ───────────────────────────────────────────────────────

test("published articles show a Move to Drafts button", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await expect(page.getByText("Hello World", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move to Drafts" }),
  ).toBeVisible();
});

test("clicking Move to Drafts opens a confirmation modal", async ({ page }) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Move to Drafts" }).click();
  await expect(
    page.getByRole("heading", { name: "Move to Drafts" }),
  ).toBeVisible();
  await expect(
    page.locator("dialog[open]").getByText("NoRobots.blog (Dev)"),
  ).toBeVisible();
  await expect(
    page.locator("dialog[open]").getByText("Engineering"),
  ).toBeVisible();
});

test("Move to Drafts modal Cancel button closes the modal", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Move to Drafts" }).click();
  await expect(
    page.getByRole("heading", { name: "Move to Drafts" }),
  ).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Move to Drafts" }),
  ).not.toBeVisible();
});

test("confirming Move to Drafts redirects back to the site list", async ({
  page,
}) => {
  await page.goto(SITE_LIST_URL);
  await page.getByRole("button", { name: "Move to Drafts" }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Confirm" })
    .click();
  await page.waitForURL("**/article/list/norobots-blog");
  await expect(
    page.getByText("Engineering", { exact: true }).first(),
  ).toBeVisible();
});
