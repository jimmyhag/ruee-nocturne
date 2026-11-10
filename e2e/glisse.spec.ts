// Phase 27 : glissade au clavier (C tenue) et au doigt (GLISSE, verrouillée d'un appui), carte (M, minicarte, pause),
// nouvelle carte à chaque partie ; 1.30.1 : glisse parfaite à la réception (plus de vrille).
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const P = (window as any).__game.world.player;
    return { sliding: P.sliding as boolean, v: Math.hypot(P.vx, P.vz), walk: P.speed as number };
  });

test('clavier : C lance une glissade plus rapide que la marche, un second appui remet debout', async ({
  page,
  hasTouch,
}) => {
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
  // relâcher ne coupe pas ; un second appui remet debout
  expect((await state(page)).sliding).toBe(true);
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === false, null, { timeout: 2000 });
  await page.keyboard.up('KeyD');
  expect(errors).toEqual([]);
});

test('tactile : un appui sur GLISSE lance la glissade (bouton allumé) sans tenir le doigt, un second remet debout', async ({
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
  // second appui sur GLISSE : debout, le bouton s'éteint
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x0 + 60, y: y0, id: 1 },
      { x: bx, y: by, id: 3 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x0 + 60, y: y0, id: 1 }] });
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === false, null, { timeout: 2000 });
  await expect(page.locator('#btnSlide')).not.toHaveClass(/on/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('1.30.1 : glisse → saut → glisse au bon moment de la réception = glisse parfaite, au clavier et au doigt ; plus de vrille', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 2);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.enemyCount = 0;
    g.world.powerNext = 1e9;
  });
  // appuis : C / Espace au clavier ; au doigt, joystick tenu (doigt 1) et boutons GLISSE / SAUT (doigt 2)
  const cdp = hasTouch ? await page.context().newCDPSession(page) : null;
  const vp = page.viewportSize()!;
  const x0 = Math.round(vp.width * 0.25),
    y0 = Math.round(vp.height * 0.6);
  let id = 2;
  const tap = async (sel: string, key: string) => {
    if (!cdp) {
      await page.keyboard.press(key);
      return;
    }
    const b = (await page.locator(sel).boundingBox())!;
    const pt = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: id++ };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0 + 60, y: y0, id: 1 }, pt] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x0 + 60, y: y0, id: 1 }] });
  };
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }],
      });
      await page.waitForTimeout(30);
    }
  } else await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await tap('#btnSlide', 'KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 2000 });
  await tap('#btnJump', 'Space');
  await page.waitForFunction(() => (window as any).__game.world.player.onGround === false, null, { timeout: 2000 });
  expect(await page.evaluate(() => (window as any).__game.world.player.sliding)).toBe(false); // le saut annule
  // on redescend : glisse juste avant de toucher le sol
  await page.waitForFunction(
    () => {
      const P = (window as any).__game.world.player;
      return P.vy < 0 && P.y < 0.9;
    },
    null,
    // 0,62 s de temps de jeu après l'impulsion : en rendu logiciel le jeu tourne à un quart de l'horloge (≈ 2,5 s
    // réelles), la limite de 3 s tombait juste avant la fenêtre
    { timeout: 12_000, polling: 'raf' },
  );
  await tap('#btnSlide', 'KeyC');
  await page.waitForFunction(() => (window as any).__game.world.tricks === 1, null, { timeout: 8000 });
  await expect(page.locator('#dmg span.trick')).toContainText('Glisse parfaite');
  expect(await page.evaluate(() => (window as any).__game.world.player.sliding)).toBe(true);
  await page.screenshot({ path: `shots/${info.project.name}-glisse-parfaite.png` });
  // relevé propre : un appui remet debout
  await tap('#btnSlide', 'KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === false, null, { timeout: 2000 });
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.keyboard.up('KeyD');
  expect(errors).toEqual([]);
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

test('captures : glissade le long d’une rampe, relief net', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openGame(page);
  await startRun(page, 2);
  const ramp = await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    g.debug.god();
    w.player.need = 1e9;
    w.nextWave = 1e9;
    for (let i = 0; i < w.enemyCount; i++) w.enemies[i].alive = false;
    // rampe intacte la plus haute : départ au sommet, en direction du pied
    // rampe intacte (le sol suit son plan : ni combe ni lac ne la coupe), la plus haute
    const intact = (m: any) => {
      for (let t = 0; t <= 1; t += 0.1)
        if (w.heightAt(m.x0 + (m.x1 - m.x0) * t, m.z0 + (m.z1 - m.z0) * t) < m.h0 * (1 - t) - 0.15) return false;
      return true;
    };
    const r = w.ramps.filter((m: any) => m.h1 === 0 && intact(m)).sort((a: any, b: any) => b.h0 - a.h0)[0];
    const L = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ux = (r.x1 - r.x0) / L,
      uz = (r.z1 - r.z0) / L;
    const P = w.player;
    P.x = P.px = r.x0 + ux * 2;
    P.z = P.pz = r.z0 + uz * 2;
    P.gPrev = w.heightAt(P.x, P.z);
    return { ux, uz };
  });
  await page.waitForTimeout(600);
  // marche vers le pied de la rampe, puis glisse (touches selon la direction dominante)
  const kx = Math.abs(ramp.ux) > Math.abs(ramp.uz) ? (ramp.ux > 0 ? 'KeyD' : 'KeyA') : ramp.uz > 0 ? 'KeyS' : 'KeyW';
  await page.keyboard.down(kx);
  await page.waitForFunction(
    () => {
      const P = (window as any).__game.world.player;
      return P.vx * P.vx + P.vz * P.vz > 4; // en marche (machine de test chargée : on attend la sim, pas l'horloge)
    },
    null,
    { timeout: 10_000 },
  );
  await page.keyboard.down('KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 10_000 });
  await page.keyboard.up(kx); // sans entrée, la pente seule guide la glissade (vers le bas de la rampe)
  // temps de jeu (pas temps réel : une machine de test lente avance la sim moins vite) ; vitesse maximale atteinte
  const v = await page.evaluate(
    () =>
      new Promise<{ v: number; walk: number; slid: boolean }>((done) => {
        const w = (window as any).__game.world,
          P = w.player,
          t0 = w.t;
        let v = 0,
          slid = false;
        const tick = () => {
          v = Math.max(v, Math.hypot(P.vx, P.vz));
          slid ||= P.sliding;
          if (w.t >= t0 + 0.9) done({ v, walk: P.speed, slid });
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  await page.screenshot({ path: `shots/${info.project.name}-glissade.png` });
  await page.keyboard.up('KeyC');
  expect(v.slid).toBe(true);
  expect(v.v, 'la descente accélère la glissade').toBeGreaterThan(v.walk * 1.3);
});
