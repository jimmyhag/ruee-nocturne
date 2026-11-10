// Phase 42 (demande de Jimmy) : boss de survie à 3:00 et 7:00 dans chaque monde. Préavis, bannière, barre de boss ;
// le tuer n'ouvre pas le portail (seul le boss du totem le fait).
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('boss de survie à 3:00 : préavis, barre de boss, le tuer n’ouvre pas le portail', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    g.debug.stageTime(169);
  });
  await expect(page.locator('#banner')).toContainText(/boss de survie arrive/i, { timeout: 10_000 });
  await page.evaluate(() => (window as any).__game.debug.stageTime(179.5)); // la sim tourne lentement sous SwiftShader
  await page.waitForFunction(() => (window as any).__game.world.survivalAlive === 1, null, { timeout: 15_000 });
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${info.project.name}-boss-survie.png` });
  // le tuer : coffre de boss, mais pas de portail
  await page.evaluate(() => (window as any).__game.debug.killBoss()); // la barre suit le boss de survie
  await page.waitForFunction(() => (window as any).__game.world.survivalAlive === 0, null, { timeout: 20_000 });
  const r = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { portal: w.portal.open, mode: w.mode, totem: w.totem.state };
  });
  expect(r.portal).toBe(false);
  expect(r.totem).toBe(0);
  expect(errors).toEqual([]);
});
