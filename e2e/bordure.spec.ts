// Phase 29 : bordure de la carte. Une lisière (rochers, sapins, sous-bois) ferme la zone jouable : plus de vide au
// bord, le joueur bute sur les rochers. Captures lues (nord, est, coin) sur PC et iPhone.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('bord de carte : lisière visible, aucun vide, le joueur reste dans la zone jouable', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 4);
  const lim = await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    return 170 - 6; // PLAY_LIMIT
  });
  for (const [name, x, z] of [
    ['nord', 0, -lim + 2],
    ['est', lim - 2, 0],
    ['coin', lim - 2, lim - 2],
  ] as const) {
    await page.evaluate(([x, z]) => (window as any).__game.debug.teleport(x, z), [x, z]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/${info.project.name}-bord-${name}.png` });
  }
  // contre le bord est : la sim borne la position, la lisière est là où l'on bute
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(160, 0);
    g.world.player.x = g.world.player.px = 175; // poussé au-delà : la sim le ramène à la limite au pas suivant
  });
  // on attend le pas de sim qui ramène le joueur (délai fixe trop court sur une machine lente : aucun pas en 300 ms)
  await page
    .waitForFunction((l) => (window as any).__game.world.player.x <= l + 1e-6, lim, { timeout: 5000 })
    .catch(() => undefined);
  const x = await page.evaluate(() => (window as any).__game.world.player.x as number);
  expect(x).toBeLessThanOrEqual(lim + 1e-6);
  // la bordure est bien dans la scène (segments de lisière autour de la carte)
  const segs = await page.evaluate(
    () =>
      (window as any).__game.scene.scene.children.filter(
        (o: any) => o.isMesh && o.geometry?.boundingSphere && Math.abs(o.geometry.boundingSphere.center.x) > 160,
      ).length,
  );
  expect(segs).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
