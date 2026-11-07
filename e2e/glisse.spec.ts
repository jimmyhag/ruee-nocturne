// Phase 27 : glissade au clavier (C tenue) et au doigt (GLISSE, verrouillée d'un appui), carte (M, minicarte, pause),
// nouvelle carte à chaque partie.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const P = (window as any).__game.world.player;
    return { sliding: P.sliding as boolean, v: Math.hypot(P.vx, P.vz), walk: P.speed as number };
  });

test('clavier : C pendant la marche lance une glissade plus rapide que la marche', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'projet PC');
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 2000 });
  const s = await state(page);
  expect(s.v).toBeGreaterThan(s.walk * 1.2);
  await page.keyboard.up('KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === false, null, { timeout: 2000 });
  await page.keyboard.up('KeyD');
  expect(errors).toEqual([]);
});

test('tactile : un appui sur GLISSE lance la glissade (bouton allumé) sans tenir le doigt', async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, 'projet mobile');
  await openGame(page);
  await page.locator('#playBtn').tap();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => (window as any).__game.debug.god());
  await expect(page.locator('#btnSlide')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const x0 = Math.round(vp.width * 0.25),
    y0 = Math.round(vp.height * 0.6);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  // second doigt : un appui bref sur GLISSE
  const b = (await page.locator('#btnSlide').boundingBox())!;
  const bx = Math.round(b.x + b.width / 2),
    by = Math.round(b.y + b.height / 2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x0 + 60, y: y0, id: 1 },
      { x: bx, y: by, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x0 + 60, y: y0, id: 1 }] });
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 2000 });
  await expect(page.locator('#btnSlide')).toHaveClass(/on/);
  const s = await state(page);
  expect(s.v).toBeGreaterThan(s.walk * 1.2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('carte : M (ou la minicarte au doigt) ouvre la grande carte en pause, avec le brouillard et la part explorée', async ({
  page,
  hasTouch,
}, info) => {
  await openGame(page);
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  await expect(page.locator('#minimap')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/${info.project.name}-minicarte.png` });
  if (hasTouch) await page.locator('#minimap').tap();
  else await page.keyboard.press('KeyM');
  await expect(page.locator('#map')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('map');
  await expect(page.locator('#mapExplored')).toHaveText(/\d+\s?%/);
  const t0 = await page.evaluate(() => (window as any).__game.world.t);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__game.world.t)).toBe(t0); // partie en pause
  await page.screenshot({ path: `shots/${info.project.name}-carte.png` });
  if (hasTouch) await page.locator('#mapClose').tap();
  else await page.keyboard.press('KeyM');
  await expect(page.locator('#map')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
  // depuis la pause : bouton Carte, puis Fermer revient à la pause
  await page.evaluate(() => (window as any).__game.debug.pause?.());
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pauseMapBtn').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('#mapClose').click();
  await expect(page.locator('#pause')).toBeVisible();
});

test('chaque partie tire une nouvelle carte (relief et lieux), construite en moins de 2 s', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'une fois suffit');
  await openGame(page);
  const seeds: number[] = [];
  for (let k = 0; k < 2; k++) {
    const ms = await page.evaluate(async () => {
      const g = (window as any).__game;
      const t0 = performance.now();
      g.start();
      return performance.now() - t0;
    });
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    expect(ms, 'construction de la carte et du décor').toBeLessThan(2000);
    seeds.push(await page.evaluate(() => (window as any).__game.mapSeed));
    await page.waitForTimeout(20);
  }
  expect(seeds[0]).not.toBe(seeds[1]);
});
