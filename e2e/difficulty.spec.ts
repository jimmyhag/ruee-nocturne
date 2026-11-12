// Phase 48 (demande de Jimmy) : la difficulté de la partie. Un crâne violet sur la carte : y rester la monte de 10 %.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

async function calmRun(page: Page, seed: number): Promise<void> {
  await openGame(page);
  await startRun(page, seed);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    // rendu fixé : en automatique, le repli de qualité sous SwiftShader affiche « Rendu allégé » à la place de la bannière
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } });
  });
}
const difficulty = (page: Page): Promise<number> =>
  page.evaluate(() => (window as any).__game.world.player.difficulty as number);

test('crâne de difficulté : visible, jauge, +5 % affichés partout', async ({ page, hasTouch }, info) => {
  const p = info.project.name;
  await calmRun(page, 21);
  const nSkulls = await page.evaluate(() => (window as any).__game.world.skulls.length);
  expect(nSkulls).toBeGreaterThanOrEqual(7); // phase 50 : 7 à 20, tirés avec la carte
  expect(nSkulls).toBeLessThanOrEqual(20);
  await expect(page.locator('#diffLbl')).toHaveText('▲ 0 %'); // phase 50 : 0 % = normal, affiché dès le départ
  // à quelques pas : le crâne, son anneau et sa colonne violette
  await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.world.skulls[0];
    g.debug.teleport(s.x - 4.5, s.z + 4.5); // hors de portée de la pastille (rayon du cercle + 2 u)
  });
  await page.waitForTimeout(800);
  await expect(page.locator('#poiChip')).toBeHidden();
  await page.screenshot({ path: `shots/${p}-crane.png` });
  expect(await difficulty(page)).toBe(0); // regarder ne suffit pas
  // dans le cercle : la pastille dit ce qu'il fera, la jauge monte
  await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.world.skulls[0];
    g.debug.teleport(s.x + 0.5, s.z + 0.9);
  });
  await expect(page.locator('#poiChip')).toHaveClass(/skull/);
  await expect(page.locator('#poiText')).toHaveText('Crâne · difficulté 0 % → 5 %');
  await page.waitForFunction(() => (window as any).__game.world.skulls[0].on === true, null, { timeout: 30000 });
  expect(await difficulty(page)).toBeCloseTo(0.05, 6); // phase 50 : +5 % par crâne
  await expect(page.locator('#diffLbl')).toHaveText('▲ 5 %');
  await expect(page.locator('#banner')).toContainText('Difficulté 5 %');
  await expect(page.locator('#poiChip')).toBeHidden(); // activé : plus rien à charger
  await page.screenshot({ path: `shots/${p}-crane-active.png` });
  // la fiche de stats de la pause le dit aussi
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.locator('#pauseBtn').click();
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#pauseStats')).toContainText('Difficulté');
  await expect(page.locator('#pauseStats')).toContainText('5 %');
});

test('la difficulté fait venir plus de monstres ; l’écran de fin la rappelle', async ({ page }) => {
  test.setTimeout(150_000); // deux mesures de 4 s de jeu sous SwiftShader, puis une mort : large sur une machine chargée
  await openGame(page);
  await startRun(page, 22);
  // même instant de la partie, sans et avec 100 % de difficulté en plus : deux fois plus d'apparitions
  const spawned = async (d: number): Promise<number> =>
    page.evaluate((diff) => {
      const g = (window as any).__game;
      const w = g.world;
      w.player.maxHp = w.player.hp = 1e9;
      w.player.need = 1e9;
      w.weapons = {};
      w.player.difficulty = diff;
      w.enemyCount = 0;
      const t0 = w.t;
      return new Promise<number>((resolve) => {
        const tick = (): void => {
          if (w.t - t0 >= 4) resolve(w.enemyCount + w.kills);
          else requestAnimationFrame(tick);
        };
        tick();
      });
    }, d);
  const base = await spawned(0);
  const hard = await spawned(1);
  expect(hard).toBeGreaterThan(base * 1.4);
  // mourir : la difficulté atteinte est sur l'écran de fin
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.skullsOn = 3;
    w.player.difficulty = 0.3;
    w.player.maxHp = 100;
    w.player.invul = 0;
    w.player.hp = 0;
  });
  await page.waitForFunction(() => (window as any).__game.app === 'over');
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#oDiff')).toHaveText('Difficulté atteinte : 30 % · crânes activés : 3'); // phase 50 : 0 % = normal
});
