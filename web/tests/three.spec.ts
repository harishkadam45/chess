import { expect, test, type Browser, type Page } from "@playwright/test";

// 3D board: every move is made by really clicking the WebGL canvas (ray-cast picking), no DOM squares.
// The online tests need the API server + database on :4000.
const run = Date.now();
const STORAGE = {
  cookies: [],
  origins: [{ origin: "http://localhost:3000", localStorage: [{ name: "view", value: "3d" }, { name: "quality", value: "low" }] }],
};

async function ready(page: Page) {
  await page.waitForFunction(() => window.__board3d?.ready, null, { timeout: 90_000 });
}

async function click3d(page: Page, square: string) {
  const p = await page.evaluate((s) => window.__board3d!.squareToClient(s), square);
  await page.mouse.click(p.x, p.y);
}

async function move3d(page: Page, from: string, to: string) {
  await click3d(page, from);
  await page.waitForTimeout(250);
  await click3d(page, to);
}

async function register(browser: Browser, name: string) {
  const ctx = await browser.newContext({ storageState: STORAGE });
  const page = await ctx.newPage();
  await page.goto("/register");
  await page.getByPlaceholder("Username").fill(`${name}${run}`);
  await page.getByPlaceholder("Email").fill(`${name}${run}@test.dev`);
  await page.getByPlaceholder(/Password/).fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/play$/);
  return { ctx, page, name: `${name}${run}` };
}

test("3D board renders and a canvas click-move gets a Stockfish reply", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/ai");
  await expect(page.getByTestId("board3d")).toBeVisible();
  await ready(page);

  // the canvas actually drew a scene: a blank/black frame would compress to almost nothing
  const shot = await page.getByTestId("board3d").screenshot();
  expect(shot.length).toBeGreaterThan(40_000);

  await page.getByRole("button", { name: "New game as White" }).click();
  await move3d(page, "e2", "e4");
  await expect(page.locator("aside .font-mono button")).toHaveCount(2, { timeout: 40_000 });
  expect(errors).toEqual([]);
});

test("illegal and wrong-side clicks do nothing in 3D", async ({ page }) => {
  await page.goto("/play/ai");
  await ready(page);
  await move3d(page, "e2", "e5"); // illegal pawn jump
  await move3d(page, "e7", "e5"); // opponent's piece
  await page.waitForTimeout(1500);
  await expect(page.locator("aside").getByText("No moves yet.")).toBeVisible();
  await move3d(page, "g1", "f3"); // legal knight move still works afterwards
  await expect(page.locator("aside .font-mono button").first()).toHaveText("Nf3");
});

test("2D/3D toggle switches boards and the choice is remembered", async ({ page }) => {
  await page.goto("/play/ai");
  await expect(page.getByTestId("board3d")).toBeVisible();
  await page.getByTestId("view-toggle").click();
  await expect(page.locator('[data-square="e2"]')).toBeVisible();
  await expect(page.getByTestId("board3d")).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-square="e2"]')).toBeVisible(); // remembered
  await page.getByTestId("view-toggle").click();
  await expect(page.getByTestId("board3d")).toBeVisible();
});

test("landing page hero plays a looping demo game in 3D", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /another dimension/ })).toBeVisible();
  await expect(page.getByTestId("board3d")).toBeVisible();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});

test("two players on the 3D board: scholar's mate with a capture", async ({ browser }) => {
  test.setTimeout(300_000); // software WebGL and the Stockfish worker share the CPU here
  const a = await register(browser, "tdalice");
  const b = await register(browser, "tdbob");
  await a.page.getByRole("button", { name: "Create private room" }).click();
  await expect(a.page).toHaveURL(/code=/);
  const code = new URL(a.page.url()).searchParams.get("code")!;
  await b.page.getByPlaceholder("Room code").fill(code);
  await b.page.getByRole("button", { name: "Join" }).click();
  await expect(b.page.getByTestId("board3d")).toBeVisible({ timeout: 45_000 });
  await Promise.all([ready(a.page), ready(b.page)]);

  // Whoever is white: board orientation tells us (a1 below a8 on screen for white)
  const isWhite = async (p: Page) => {
    const a1 = await p.evaluate(() => window.__board3d!.squareToClient("a1"));
    const a8 = await p.evaluate(() => window.__board3d!.squareToClient("a8"));
    return a1.y > a8.y;
  };
  const [white, black] = (await isWhite(a.page)) ? [a.page, b.page] : [b.page, a.page];

  const seq: [Page, string, string][] = [
    [white, "e2", "e4"], [black, "e7", "e5"],
    [white, "f1", "c4"], [black, "b8", "c6"],
    [white, "d1", "h5"], [black, "g8", "f6"],
    [white, "h5", "f7"], // Qxf7#
  ];
  let n = 0;
  for (const [p, f, t] of seq) {
    await move3d(p, f, t);
    n++;
    await expect(a.page.locator("aside .font-mono button")).toHaveCount(n, { timeout: 15_000 });
    await a.page.waitForTimeout(700); // let the glide animation finish before the next pick
  }
  for (const p of [a.page, b.page]) await expect(p.getByText("White wins by checkmate")).toBeVisible();

  // result panel + analysis in 3D
  await white.getByRole("link", { name: "Analyze" }).click();
  await expect(white.getByText("Analysis complete")).toBeVisible({ timeout: 200_000 });
  await white.keyboard.press("Home");
  await white.keyboard.press("End");
  await expect(white.locator("aside .font-mono button[data-current=true]")).toHaveText("Qxf7#");
  await a.ctx.close();
  await b.ctx.close();
});
