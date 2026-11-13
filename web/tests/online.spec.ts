import { expect, test } from "@playwright/test";

// Requires the API server (with a database) on :4000.
test("sign up, create a private room and see its code", async ({ page }) => {
  const id = Date.now();
  await page.goto("/register");
  await page.getByPlaceholder("Username").fill(`user${id}`);
  await page.getByPlaceholder("Email").fill(`user${id}@test.dev`);
  await page.getByPlaceholder(/Password/).fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("link", { name: `user${id}` })).toBeVisible();

  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(page).toHaveURL(/\/game\/.+\?code=[0-9A-F]{6}/);
  await expect(page.getByText("Waiting for them to join…")).toBeVisible();
});
