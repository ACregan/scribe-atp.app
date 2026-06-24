import { test, expect } from "@playwright/test";

test("article list shows published articles and orphaned drafts", async ({
  page,
}) => {
  await page.goto("/article/list");
  await expect(page.getByText("My First Post")).toBeVisible();
  await expect(page.getByText("Dev Orphan Draft")).toBeVisible();
});

test("delete button on orphaned draft opens confirmation modal", async ({
  page,
}) => {
  await page.goto("/article/list");
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete Draft" }),
  ).toBeVisible();
});

test("confirming delete closes the modal", async ({ page }) => {
  await page.goto("/article/list");
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete Draft" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Delete Draft" }),
  ).not.toBeVisible();
});

test("edit link on an orphaned draft navigates to the edit page", async ({
  page,
}) => {
  await page.goto("/article/list");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page).toHaveURL(/\/article\/edit\//);
});
