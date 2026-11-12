// Phase 48, livraison 2 (demande de Jimmy) : totems de boss. Un totem activé ajoute un boss à chaque vague de boss du
// monde ; le portail attend qu'ils soient tous vaincus.
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/**
 * Tue le boss suivi par la barre. Attend d'abord qu'il soit en vie : juste après une mise à mort, `bossIndex` désigne
 * encore le boss tombé jusqu'au pas de sim suivant (à 5 images/s sur le runner, un second appel le frappait dans le vide).
 */
async function killBoss(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      return w.bossIndex >= 0 && w.enemies[w.bossIndex].alive === true;
    },
    null,
    { timeout: 20_000 },
  );
  await page.evaluate(() => (window as any).__game.debug.killBoss());
}

test('totem de boss : jauge, un boss de plus à 3:00 et au totem, portail au dernier', async ({ page }, info) => {
  test.setTimeout(150_000); // trois combats de boss à la suite : plus d'une minute sur le runner (SwiftShader)
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await startRun(page, 23);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } });
    const b = w.bossTotems[0];
    g.debug.teleport(b.x - 4.5, b.z + 4.5);
  });
  expect(await page.evaluate(() => (window as any).__game.world.bossTotems.length)).toBe(2);
  await page.waitForTimeout(800);
  await expect(page.locator('#bossXLbl')).toBeHidden();
  await page.screenshot({ path: `shots/${p}-totem-de-boss.png` });
  // dans le cercle : la pastille dit ce qu'il fera, la jauge monte, puis « Boss +1 »
  await page.evaluate(() => {
    const g = (window as any).__game;
    const b = g.world.bossTotems[0];
    g.debug.teleport(b.x + 0.4, b.z + 1.1);
  });
  await expect(page.locator('#poiChip')).toHaveClass(/bosstotem/);
  await expect(page.locator('#poiText')).toHaveText('Totem de boss · un boss de plus à chaque vague');
  await page.waitForFunction(() => (window as any).__game.world.bossExtra === 1, null, { timeout: 30_000 });
  await expect(page.locator('#bossXLbl')).toHaveText('Boss +1');
  await expect(page.locator('#banner')).toContainText('Boss en plus : +1 par vague');
  // 3:00 : deux boss de survie au lieu d'un ; la barre dit qu'il en reste un autre
  await page.evaluate(() => (window as any).__game.debug.stageTime(179.5));
  await page.waitForFunction(() => (window as any).__game.world.survivalAlive === 2, null, { timeout: 20_000 });
  await expect(page.locator('#bossbar')).toBeVisible();
  await expect(page.locator('#bossname')).toContainText('encore 1');
  await expect(page.locator('#banner')).toContainText('Boss de survie'); // celle du boss de la vague, pas du boss en plus
  await page.waitForTimeout(3000); // le temps qu'ils entrent dans le champ
  await page.screenshot({ path: `shots/${p}-deux-boss.png` });
  // deux types de boss à l'écran : relevé des appels de rendu (4 de plus qu'un seul type : corps et contour)
  console.log(
    `[${p}] appels de rendu avec deux boss :`,
    await page.evaluate(() => (window as any).__game.renderer.info.render.calls),
  );
  await killBoss(page);
  await page.waitForFunction(() => (window as any).__game.world.survivalAlive === 1, null, { timeout: 20_000 });
  await expect(page.locator('#bossname')).not.toContainText('encore');
  await killBoss(page);
  await page.waitForFunction(() => (window as any).__game.world.survivalAlive === 0, null, { timeout: 20_000 });
  // le totem du monde : deux boss ; le portail ne s'ouvre qu'au second
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.totem.x, g.world.totem.z);
  });
  await page.waitForFunction(() => (window as any).__game.world.totemAlive === 2, null, { timeout: 30_000 });
  await killBoss(page);
  await page.waitForFunction(() => (window as any).__game.world.totemAlive === 1, null, { timeout: 20_000 });
  expect(await page.evaluate(() => (window as any).__game.world.portal.open)).toBe(false);
  await killBoss(page);
  await page.waitForFunction(() => (window as any).__game.world.portal.open === true, null, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
