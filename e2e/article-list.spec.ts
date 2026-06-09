import { test, expect } from "@playwright/test";

test("article list shows assigned articles and orphaned articles", async ({
  page,
}) => {
  await page.goto("/article/list");
  await expect(page.getByText("My First Post")).toBeVisible();
  await expect(page.getByText("Dev Orphan Article")).toBeVisible();
});

test("edit link on an assigned article navigates to the edit page", async ({
  page,
}) => {
  await page.goto("/article/list");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page).toHaveURL(/\/article\/edit\//);
});
