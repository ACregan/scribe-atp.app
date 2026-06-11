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

// ── Image preview modal ───────────────────────────────────────────────────────

test("double-clicking an image tile opens the preview modal", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "landscape.jpg" }),
  ).toBeVisible();
});

test("image preview modal is centred in the viewport", async ({ page }) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  const dialogCenterX = box!.x + box!.width / 2;
  expect(Math.abs(dialogCenterX - viewport.width / 2)).toBeLessThan(10);
});

test("Prev/Next buttons navigate between images in the preview modal", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await expect(
    page.getByRole("heading", { name: "landscape.jpg" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next ›" }).click();
  await expect(
    page.getByRole("heading", { name: "portrait.jpg" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "‹ Prev" }).click();
  await expect(
    page.getByRole("heading", { name: "landscape.jpg" }),
  ).toBeVisible();
});

test("Close button in the preview modal dismisses it", async ({ page }) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await expect(page.getByRole("dialog")).toBeVisible();
  // The footer Close button (text "Close", not the × header button)
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

// ── Fullscreen viewer ─────────────────────────────────────────────────────────

test("fullscreen viewer opens when the fullscreen button is clicked", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await page.getByRole("button", { name: "View fullscreen" }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);
  await expect(page.getByAltText("landscape.jpg").last()).toBeVisible();
});

test("clicking the image in fullscreen toggles fit/actual view mode", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await page.getByRole("button", { name: "View fullscreen" }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);

  // landscape.jpg is 3000×2000 — larger than any Playwright viewport —
  // so canToggleActual is true and the image wrapper has cursor: zoom-in
  const imageInViewer = page.getByAltText("landscape.jpg").last();
  const initialCursor = await imageInViewer.evaluate(
    (img) => window.getComputedStyle(img.parentElement!).cursor,
  );
  expect(initialCursor).toBe("zoom-in");

  await imageInViewer.click();

  const updatedCursor = await imageInViewer.evaluate(
    (img) => window.getComputedStyle(img.parentElement!).cursor,
  );
  expect(updatedCursor).toBe("zoom-out");
});

test("chevron button in fullscreen shows and hides the info pane", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await page.getByRole("button", { name: "View fullscreen" }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);

  // Move the mouse to trigger the auto-hide chevron to appear
  await page.mouse.move(640, 360);
  const chevron = page.getByRole("button", { name: "Show info" });
  await expect(chevron).toBeVisible();
  await chevron.click();

  // Info pane is open — metadata is visible
  await expect(page.getByText("landscape.jpg").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide info" })).toBeVisible();
});

test("pressing Escape exits fullscreen without closing the modal", async ({
  page,
}) => {
  await page.goto("/images?folder=1");
  await page.getByAltText("landscape.jpg").dblclick();
  await page.getByRole("button", { name: "View fullscreen" }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.fullscreenElement === null);

  // The preview modal should still be open after exiting fullscreen
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "landscape.jpg" }),
  ).toBeVisible();
});
