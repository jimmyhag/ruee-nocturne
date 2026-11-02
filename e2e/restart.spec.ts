import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

test('mort → Rejouer → en jeu en moins de 2 s (règle d’or n°1)', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.waitForTimeout(500);

  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
  // chrono : écran de mort visible → bouton → partie en cours
  const t0 = Date.now();
  await page.locator('#againBtn').click();
  await page.waitForFunction(() => {
    const g = (window as any).__game;
    return g.app === 'play' && g.world && g.world.t < 1;
  });
  const elapsed = Date.now() - t0;
  console.log(`relance : ${elapsed} ms`);
  expect(elapsed).toBeLessThan(2000);
  await expect(page.locator('#hud')).toBeVisible();
});
