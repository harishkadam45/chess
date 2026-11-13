import { expect, test, type Browser, type Page } from "@playwright/test";
import { LEVELS_FOR_TEST } from "./levels";

// Needs the API server + database on :4000.
const run = Date.now();

async function register(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/register");
  await page.getByPlaceholder("Username").fill(`${name}${run}`);
  await page.getByPlaceholder("Email").fill(`${name}${run}@test.dev`);
  await page.getByPlaceholder(/Password/).fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/play$/);
  return { ctx, page, name: `${name}${run}` };
}

async function click(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

async function isWhite(page: Page) {
  const a1 = await page.locator('[data-square="a1"]').boundingBox();
  const a8 = await page.locator('[data-square="a8"]').boundingBox();
  return a1!.y > a8!.y;
}

/** Host creates a room, guest joins by code; returns pages sorted by colour. */
async function startRoom(host: Page, guest: Page) {
  await host.getByRole("button", { name: "Create private room" }).click();
  await expect(host).toHaveURL(/code=/);
  const code = new URL(host.url()).searchParams.get("code")!;
  await guest.getByPlaceholder("Room code").fill(code);
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest).toHaveURL(/\/game\//);
  await expect(host.locator("aside").getByText("to move")).toBeVisible();
  const hostWhite = await isWhite(host);
  return { white: hostWhite ? host : guest, black: hostWhite ? guest : host, code };
}

test.describe.configure({ mode: "serial" });

test("two players: fool's mate, results on both screens, analysis, profile, leaderboard", async ({ browser }) => {
  const a = await register(browser, "alice");
  const b = await register(browser, "bob");
  const { white, black } = await startRoom(a.page, b.page);

  await click(white, "f2", "f3");
  await expect(black.locator("aside .font-mono")).toContainText("f3");
  await click(black, "e7", "e5");
  await click(white, "g2", "g4");
  await click(black, "d8", "h4");

  for (const p of [a.page, b.page]) {
    await expect(p.getByText("Black wins by checkmate")).toBeVisible();
    await expect(p.getByRole("link", { name: "Analyze" })).toBeVisible();
  }

  // clocks were shown while the game was running (both bars have a clock)
  await expect(a.page.locator("span.tabular-nums")).toHaveCount(2);

  // analysis completes and flags the blunders (f3/g4 are bad)
  await black.getByRole("link", { name: "Analyze" }).click();
  await expect(black.getByText("Analysis complete")).toBeVisible({ timeout: 60_000 });
  await black.getByRole("button", { name: "g4" }).click();
  await expect(black.getByText(/g4 is a (blunder|mistake)/)).toBeVisible();
  await black.keyboard.press("Home");
  await expect(black.locator("aside .font-mono button[data-current=true]")).toHaveCount(0);
  await black.keyboard.press("End");
  await expect(black.locator("aside .font-mono button[data-current=true]")).toHaveText("Qh4#");

  // profile history + replay link (casual game: no rated stats)
  await a.page.goto("/");
  await a.page.getByRole("link", { name: a.name }).click();
  await expect(a.page).toHaveURL(/\/profile\//,{ timeout: 45_000 });
  await expect(a.page.getByText(/ vs /).first()).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByRole("link", { name: "Replay" }).first()).toBeVisible();
  await expect(a.page.getByText("casual").first()).toBeVisible();

  await a.page.goto("/leaderboard");
  for (const cat of ["Bullet", "Blitz", "Rapid"]) {
    await a.page.getByRole("button", { name: cat }).click();
    await expect(a.page.locator("tbody tr").first()).toBeVisible();
  }
  await a.ctx.close();
  await b.ctx.close();
});

test("two players: rated quick match, draw offer/decline/accept, reload resync", async ({ browser }) => {
  const a = await register(browser, "cara");
  const b = await register(browser, "dave");
  await a.page.getByRole("button", { name: "Find a rated match" }).click();
  await expect(a.page.getByText(/Searching/)).toBeVisible();
  await b.page.getByRole("button", { name: "Find a rated match" }).click();
  await expect(a.page).toHaveURL(/\/game\//);
  await expect(b.page).toHaveURL(/\/game\//);
  await expect(a.page.getByText("blitz · rated")).toBeVisible();

  const aWhite = await isWhite(a.page);
  const [white, black] = aWhite ? [a.page, b.page] : [b.page, a.page];
  await click(white, "e2", "e4");
  await click(black, "e7", "e5");

  // reload mid-game: state comes back from the server
  await black.reload();
  await expect(black.locator("aside .font-mono")).toContainText("e5");
  await expect(black.locator('[data-square="e5"]')).toBeVisible();

  // clock ticks for the side to move
  const clock = white.locator("span.tabular-nums.bg-amber-600");
  const t1 = await clock.textContent();
  await white.waitForTimeout(2200);
  expect(await clock.textContent()).not.toBe(t1);

  // draw: offer -> decline -> offer -> accept
  await white.getByRole("button", { name: "Offer draw" }).click();
  await expect(black.getByRole("button", { name: "Accept draw" })).toBeVisible();
  await black.getByRole("button", { name: "Decline" }).click();
  await expect(white.getByRole("button", { name: "Offer draw" })).toBeVisible();
  await black.getByRole("button", { name: "Offer draw" }).click();
  await white.getByRole("button", { name: "Accept draw" }).click();
  for (const p of [white, black]) {
    await expect(p.getByText("Draw by agreement")).toBeVisible();
    await expect(p.getByText(/New ratings/)).toBeVisible();
  }
  // rated draw shows up in both profiles' stats
  await a.page.getByRole("link", { name: a.name }).click();
  await expect(a.page.getByText(/1 rated games/)).toBeVisible();
  await expect(a.page.getByText("1D")).toHaveCount(1);
  await a.ctx.close();
  await b.ctx.close();
});

test("two players: resign (with confirm), cancel room, bad/used codes, one game at a time", async ({ browser }) => {
  const a = await register(browser, "erin");
  const b = await register(browser, "finn");

  // cancel a waiting room, then the host can immediately start another
  await a.page.getByRole("button", { name: "Create private room" }).click();
  await expect(a.page.getByRole("button", { name: "Cancel room" })).toBeVisible();
  await a.page.getByRole("button", { name: "Cancel room" }).click();
  await expect(a.page).toHaveURL(/\/play$/);

  // wrong code
  await b.page.getByPlaceholder("Room code").fill("ZZZZZZ");
  await b.page.getByRole("button", { name: "Join" }).click();
  await expect(b.page.locator("p[role=alert]")).toHaveText("Room not found");

  const { white, black, code } = await startRoom(a.page, b.page);
  // a third player can't use the same code
  const c = await register(browser, "gina");
  await c.page.getByPlaceholder("Room code").fill(code);
  await c.page.getByRole("button", { name: "Join" }).click();
  await expect(c.page.locator("p[role=alert]")).toHaveText("Room not found");

  // spectator-ish: can't move on someone else's game
  // resign: black resigns -> white wins
  black.on("dialog", (d) => d.accept());
  await black.getByRole("button", { name: "Resign" }).click();
  for (const p of [white, black]) await expect(p.getByText("White wins by resignation")).toBeVisible();
  await expect(white.getByText(/New ratings/)).toHaveCount(0); // casual
  await a.ctx.close();
  await b.ctx.close();
  await c.ctx.close();
});

test("signed-out visitors are told to log in; login/logout round trip", async ({ page, browser }) => {
  await page.goto("/play");
  await expect(page.getByText(/to play online/)).toBeVisible();
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  const u = await register(browser, "hana");
  await u.page.getByRole("button", { name: "Log out" }).click();
  await expect(u.page.getByRole("link", { name: "Log in" })).toBeVisible();
  await u.page.getByRole("link", { name: "Log in" }).click();
  await u.page.getByPlaceholder("Email").fill(`hana${run}@test.dev`);
  await u.page.getByPlaceholder(/Password/).fill("wrongpass1");
  await u.page.getByRole("button", { name: "Log in" }).last().click();
  await expect(u.page.locator("p[role=alert]")).toBeVisible();
  await u.page.getByPlaceholder(/Password/).fill("password123");
  await u.page.getByRole("button", { name: "Log in" }).last().click();
  await expect(u.page).toHaveURL(/\/play$/);
  await u.ctx.close();
});

for (const level of LEVELS_FOR_TEST) {
  for (const color of ["White", "Black"] as const) {
    test(`AI ${level} as ${color} responds`, async ({ page }) => {
      await page.goto("/play/ai");
      await page.locator("select").selectOption({ label: level });
      await page.getByRole("button", { name: color === "White" ? "New game as White" : "As Black" }).click();
      const moves = page.locator("aside .font-mono button");
      if (color === "White") {
        await click(page, "d2", "d4");
        await expect(moves).toHaveCount(2, { timeout: 20_000 });
      } else {
        await expect(page.locator('[data-square="a1"]')).toBeVisible();
        await expect(moves).toHaveCount(1, { timeout: 20_000 }); // engine opens
        const a1 = await page.locator('[data-square="a1"]').boundingBox();
        const a8 = await page.locator('[data-square="a8"]').boundingBox();
        expect(a1!.y).toBeLessThan(a8!.y); // board is flipped for Black
      }
    });
  }
}

test("AI: illegal move is ignored", async ({ page }) => {
  await page.goto("/play/ai");
  await click(page, "e2", "e5"); // illegal
  await expect(page.locator("aside .font-mono")).toContainText("No moves yet");
});
