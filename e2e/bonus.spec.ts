// Phase 35 : bonus au sol. On les voit (cristal + icône), on les ramasse en marchant dessus au clavier comme au doigt,
// le HUD affiche l'effet en cours (pastille + durée) et le Temps figé arrête les ennemis. Captures lues.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/**
 * Marche vers la droite (+x) jusqu'à ce que `done` soit vrai (3 s au plus) : flèche au clavier, joystick flottant au
 * doigt (événements touch CDP).
 */
async function walkRightUntil(page: Page, hasTouch: boolean, done: () => boolean): Promise<void> {
  if (!hasTouch) {
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(done, null, { timeout: 3000 }).finally(() => page.keyboard.up('ArrowRight'));
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const x0 = Math.round(vp.width * 0.25),
    y0 = Math.round(vp.height * 0.6);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page
    .waitForFunction(done, null, { timeout: 3000 })
    .finally(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
}

/** Partie calme : héros invulnérable, sans montée de niveau ni bonus de carte imprévu, ennemis retirés. */
async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.world.powerNext = 1e9;
    g.world.enemyCount = 0;
  });
}

test('bonus au sol : visibles, ramassés en marchant dessus, effet affiché au HUD', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 7);
  await calm(page);
  // les cinq bonus autour du héros, pour la capture ; la Rage juste à sa droite
  await page.evaluate(() => {
    const d = (window as any).__game.debug;
    d.power('aimant', -3, -2.5);
    d.power('or', -1, -4);
    d.power('vitesse', 1.5, -4);
    d.power('gel', 3.5, -2.5);
    d.power('rage', 2.4, 0);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__game.world.powerCount)).toBe(5);
  await expect(page.locator('#dmg .pmark:not([hidden])')).toHaveCount(5);
  await page.screenshot({ path: `shots/${info.project.name}-bonus-sol.png` });
  // marcher dessus
  await walkRightUntil(page, hasTouch, () => (window as any).__game.world.powerT[4] > 0);
  await expect(page.locator('#banner')).toContainText('Rage');
  const pastille = page.locator('#powers .pw[data-k="rage"]');
  await expect(pastille).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-bonus-rage.png` });
  expect(await page.evaluate(() => (window as any).__game.world.powerCount)).toBe(4);
  expect(errors).toEqual([]);
});

test('Temps figé : ennemis immobiles, voile bleuté, puis tout repart', async ({ page }, info) => {
  await openGame(page);
  await startRun(page, 8);
  await calm(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.spawn(0, 12, 7);
    g.debug.power('gel', 0, 0); // sous les pieds
  });
  await page.waitForFunction(() => (window as any).__game.world.powerT[3] > 0, null, { timeout: 2000 });
  await expect(page.locator('body')).toHaveClass(/timestop/);
  await expect(page.locator('#powers .pw[data-k="gel"]')).toBeVisible();
  const pos = () =>
    page.evaluate(() => {
      const w = (window as any).__game.world;
      const out: number[] = [];
      for (let i = 0; i < w.enemyCount; i++) out.push(w.enemies[i].x, w.enemies[i].z);
      return out;
    });
  const a = await pos();
  await page.waitForTimeout(800);
  const b = await pos();
  expect(b.length).toBeGreaterThan(0);
  for (let i = 0; i < a.length; i++) expect(Math.abs(b[i] - a[i])).toBeLessThan(0.05);
  await page.screenshot({ path: `shots/${info.project.name}-bonus-gel.png` });
  // fin de l'effet (4 s) : le voile disparaît et les ennemis avancent de nouveau
  await page.waitForFunction(() => (window as any).__game.world.powerT[3] === 0, null, { timeout: 6000 });
  await expect(page.locator('body')).not.toHaveClass(/timestop/);
  const c = await pos();
  // on attend le déplacement au lieu d'un délai fixe : en rendu logiciel le temps de jeu avance bien moins vite que
  // l'horloge (0,19 à 0,24 u en 600 ms depuis le décor de la phase 44). Des ennemis restés figés font échouer ceci.
  await page
    .waitForFunction(
      (c0) => {
        const w = (window as any).__game.world;
        let moved = 0;
        for (let i = 0; i < w.enemyCount && i * 2 + 1 < c0.length; i++)
          moved = Math.max(moved, Math.abs(w.enemies[i].x - c0[i * 2]), Math.abs(w.enemies[i].z - c0[i * 2 + 1]));
        return moved > 0.3;
      },
      c,
      { timeout: 6000 },
    )
    .catch(() => undefined);
  const d = await pos();
  let moved = 0;
  for (let i = 0; i < c.length; i++) moved = Math.max(moved, Math.abs(d[i] - c[i]));
  expect(moved).toBeGreaterThan(0.3);
});
