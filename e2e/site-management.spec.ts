import { test, expect } from "@playwright/test";

// ── /groups page ──────────────────────────────────────────────────────────────

test("Add New Group modal opens when button is clicked on /groups", async ({
  page,
}) => {
  await page.goto("/groups");
  await page.getByRole("button", { name: "Add New Group" }).click();
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();
});

test("Add New Group modal opens when navigating to /groups/new directly", async ({
  page,
}) => {
  await page.goto("/groups/new");
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();
});

test("Add New Group modal can be opened, closed, and reopened", async ({
  page,
}) => {
  await page.goto("/groups");
  await page.getByRole("button", { name: "Add New Group" }).click();
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close modal" }).click();
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Add New Group" }).click();
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();
});

test("site dropdown is empty by default in Add New Group modal", async ({
  page,
}) => {
  await page.goto("/groups");
  await page.getByRole("button", { name: "Add New Group" }).click();
  await expect(page.locator('select[name="siteRkey"]')).toHaveValue("");
});

test("groups page shows sites and groups from fixture data", async ({
  page,
}) => {
  await page.goto("/groups");
  await expect(page.getByText("NoRobots.blog")).toBeVisible();
  await expect(page.getByText("Perpetual Summer LTD")).toBeVisible();
  await expect(page.getByText("Engineering")).toBeVisible();
  await expect(page.getByText("Getting Started")).toBeVisible();
});

// Note: "Save & Leave" in the site-list blocker modal is intentionally not
// tested here — it requires drag-and-drop to make the tree dirty, which is
// too flaky to automate reliably with dnd-kit.

// ── /article/list/:siteSlug page ──────────────────────────────────────────────

test("Add New Group modal opens when button is clicked on site list page", async ({
  page,
}) => {
  await page.goto("/article/list/norobots-blog");
  await page.getByRole("button", { name: "Add New Group" }).click();
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();
});

test("Add New Group modal opens when navigating to site list /new directly", async ({
  page,
}) => {
  await page.goto("/article/list/norobots-blog/new");
  await expect(
    page.getByRole("heading", { name: "Add new group" }),
  ).toBeVisible();
});

test("site list shows groups and articles from fixture data", async ({
  page,
}) => {
  await page.goto("/article/list/norobots-blog");
  await expect(
    page.getByText("Engineering", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Hello World", { exact: true })).toBeVisible();
});
