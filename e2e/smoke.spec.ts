import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame } from './helpers';

test('la page charge, une partie démarre, le rendu tient le budget', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);

  await expect(page.locator('canvas#c')).toBeVisible();
  await expect(page.locator('#playBtn')).toBeVisible();

  // rendu « pixel » : la boucle est testée à résolution réduite (SwiftShader à la résolution native tourne à 8 fps)
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
  });
  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // la boucle avance : 3 s de temps de jeu, quel que soit le rythme de la machine (runner de CI à 2 cœurs, SwiftShader)
  await page.waitForFunction(() => (window as any).__game.world.t > 3, null, { timeout: 30_000 });
  await page.waitForTimeout(500); // une fenêtre de mesure du rendu

  const state = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      app: g.app as string,
      enemies: g.world.enemyCount as number,
      t: g.world.t as number,
      calls: g.renderer.info.render.calls as number,
      triangles: g.renderer.info.render.triangles as number,
    };
  });
  expect(state.app).toBe('play');
  expect(state.t).toBeGreaterThan(3); // la boucle avance même sous SwiftShader
  expect(state.enemies).toBeGreaterThan(0);
  expect(state.calls, 'draw calls ≤ 40 (PLAN.md §4.3)').toBeLessThanOrEqual(40);
  expect(state.triangles).toBeLessThan(150_000);
  expect(errors, 'aucune erreur console hors polices').toEqual([]);
});

test('le service worker est enregistré et la page se recharge hors ligne', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker : Chromium seulement');
  await openGame(page);
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const keys = await caches.keys();
      return reg?.active?.state === 'activated' && keys.some((k) => k.startsWith('workbox-precache'));
    },
    null,
    { polling: 200 },
  );
  // second chargement : la page est contrôlée par le service worker (sans clients.claim, il faut une navigation)
  let controlled = false;
  for (let tries = 0; tries < 3 && !controlled; tries++) {
    await page.reload();
    await page.waitForTimeout(500);
    controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  }
  expect(controlled, 'page contrôlée par le service worker').toBe(true);
  // « hors ligne » : tout ce qui atteint le réseau est coupé. Les requêtes servies par le service worker
  // depuis le précache ne passent pas par ici (context.setOffline coupe aussi la navigation avant le SW).
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#playBtn')).toBeVisible();
  await context.unroute('**/*');
});
