// Phase 39 : monde infini. Victoire au monde 3 → écran de choix ; Continuer (Entrée ou doigt) → HUD « Monde infini »,
// boss toutes les 2:30 ; mort → écran de fin avec le temps tenu. Terminer (Échap ou doigt) → écran de fin comme avant.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

async function calmWin(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    g.debug.win();
  });
  await expect(page.locator('#victory')).toBeVisible({ timeout: 10_000 });
}
async function press(page: Page, hasTouch: boolean, key: string, sel: string): Promise<void> {
  if (hasTouch) await page.locator(sel).tap();
  else await page.keyboard.press(key);
}

test('victoire → monde infini : boss à 2:30, puis écran de fin avec le temps tenu', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calmWin(page);
  await expect(page.locator('#vContinue')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${info.project.name}-victoire.png` });
  await press(page, hasTouch, 'Enter', '#vContinue');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.endless)).toBe(true);
  await expect(page.locator('#stageLbl')).toHaveText(/infini|Endless/);
  await expect(page.locator('#goalChip')).toHaveClass(/g5/);
  await expect(page.locator('#goalText')).toHaveText(/2:\d\d/);
  // veille de la première vague : un boss sort, bannière et barre de boss
  await page.evaluate(() => (window as any).__game.debug.endlessTime(149));
  await page.waitForFunction(() => (window as any).__game.world.endlessWave === 1, null, { timeout: 15_000 });
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${info.project.name}-infini.png` });
  // mort : écran de fin du monde infini, une seule fois
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#oTitle')).toHaveText(/infini|endless/i);
  await expect(page.locator('#oStage')).toHaveText(/vague 1|wave 1/);
  const st = await page.evaluate(() => (window as any).__game.meta.stats);
  expect(st.wins).toBe(1);
  expect(st.endlessBest).toBeGreaterThanOrEqual(149);
  expect(errors).toEqual([]);
});

test('victoire → Terminer : écran de fin comme avant, pas de monde infini', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calmWin(page);
  await press(page, hasTouch, 'Escape', '#vEnd');
  await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#oStage')).toHaveText(/3 mondes|3 worlds/i);
  const r = await page.evaluate(() => ({
    endless: (window as any).__game.world.endless,
    wins: (window as any).__game.meta.stats.wins,
  }));
  expect(r).toEqual({ endless: false, wins: 1 });
  expect(errors).toEqual([]);
});
