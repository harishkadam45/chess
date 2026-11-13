import { expect, test } from "@playwright/test";

test("home page loads and links to the computer game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /another dimension/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Play computer" }).click();
  await expect(page).toHaveURL(/\/play\/ai/);
});

test("playing e4 against the engine gets a reply", async ({ page }) => {
  await page.goto("/play/ai");
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  // The move list shows our move, then the engine's reply.
  await expect(page.getByRole("button", { name: "e4", exact: true })).toBeVisible();
  await expect(page.locator("aside .font-mono button")).toHaveCount(2, { timeout: 20_000 });
});

test("dark theme is the default and the toggle switches to light and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByLabel("Toggle theme")).toHaveText("☀️"); // hydrated
  await page.getByLabel("Toggle theme").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByLabel("Toggle theme").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
