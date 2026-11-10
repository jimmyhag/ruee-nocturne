// Rendu net (phase 9) : réglage auto/net/pixel, résolution interne, et repli automatique quand les frames traînent.
import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

const setQuality = (page: import('@playwright/test').Page, q: string) =>
  page.evaluate((q) => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: q } });
  }, q);
const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const g = (window as any).__game;
    const c = g.renderer.domElement as HTMLCanvasElement;
    return { level: g.scene.qualityLevel as number, w: c.width, h: c.height, pixel: c.classList.contains('pixel') };
  });

test('net par défaut : résolution interne à l’échelle de l’écran ; pixel : ≈ 380 px de haut et classe CSS', async ({
  page,
}) => {
  await openGame(page);
  const vp = page.viewportSize()!;
  let s = await state(page);
  expect(s.level).toBe(2);
  expect(s.pixel).toBe(false);
  expect(s.h).toBeGreaterThanOrEqual(Math.min(vp.height, 1600) - 2); // DPR 1 sur desktop ; mobile plafonné à 1600
  const netArea = s.w * s.h;
  await setQuality(page, 'pixel');
  s = await state(page);
  expect(s.level).toBe(0);
  expect(s.pixel).toBe(true);
  expect(Math.min(s.w, s.h / 1.2)).toBeLessThanOrEqual(400); // ≈ 380 px sur le petit côté (paysage : hauteur)
  expect(s.w * s.h).toBeLessThan(netArea * 0.45);
  await expect(page.locator('#setQualityBtn')).toHaveText('Rendu : pixel');
  await setQuality(page, 'net');
  s = await state(page);
  expect(s.level).toBe(2);
  expect(s.pixel).toBe(false);
});

test('repli automatique : des frames à 40 ms font descendre le niveau 2 → 1 → 0 en jeu, jamais en mode net', async ({
  page,
}) => {
  await openGame(page);
  await setQuality(page, 'auto');
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // un écran de niveau met la partie en pause et remet le compteur du repli à zéro
  });
  await page.waitForFunction(() => (window as any).__game.world.t > 3);
  await page.evaluate(() => (window as any).__game.debug.slowFrames(40));
  await page.waitForFunction(() => (window as any).__game.scene.qualityLevel === 1, null, { timeout: 15000 });
  await page.waitForFunction(() => (window as any).__game.scene.qualityLevel === 0, null, { timeout: 15000 });
  expect((await state(page)).pixel).toBe(true);
  // en « net », pas de repli : le réglage prime
  await setQuality(page, 'net');
  await page.waitForTimeout(7000);
  expect((await state(page)).level).toBe(2);
});
