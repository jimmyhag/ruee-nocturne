// Phase 28 : nouvelles armes en action, grandes pistes (arches, tremplin, chrono) et icônes dessinées des cartes.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('Faux, Lance et Météores frappent, avec leurs effets à l’écran', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.debug.give('faux', 5);
    g.debug.give('lance', 5);
    g.debug.give('meteores', 5);
    g.debug.spawn(0, 40, 7);
  });
  // un cercle de météore annoncé, une lance en vol (dessinée) : on attend chacun
  await page.waitForFunction(() => (window as any).__game.world.wstate.metN > 0, null, { timeout: 8000 });
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === 4) return true; // ProjKind.Lance
      return false;
    },
    null,
    { timeout: 8000 },
  );
  await page.screenshot({ path: `shots/${info.project.name}-armes28.png` });
  await page.waitForFunction(() => (window as any).__game.world.kills > 5, null, { timeout: 10000 });
  // la barre d'équipement montre les icônes des armes
  expect(await page.locator('#gear .gw svg.ico').count()).toBeGreaterThanOrEqual(3); // phase 38 : barre du bas
  expect(errors).toEqual([]);
});

test('piste chronométrée : l’arche de départ lance le chrono, l’arrivée à temps donne un coffre', async ({
  page,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 4);
  const race = await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    const r = g.world.races[0];
    // un pas en amont de l'arche, face à la descente : la capture montre l'arche, la piste claire et le tremplin
    const dx = r.fx - r.sx,
      dz = r.fz - r.sz,
      L = Math.hypot(dx, dz);
    g.debug.teleport(r.sx - (dx / L) * 7, r.sz - (dz / L) * 7);
    return { n: g.world.races.length, kickers: g.world.kickers.length, pistes: g.world.pistes.length };
  });
  expect(race.n).toBeGreaterThanOrEqual(3);
  expect(race.pistes).toBe(race.n);
  expect(race.kickers).toBeGreaterThanOrEqual(race.n);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${info.project.name}-piste-depart.png` });
  await page.evaluate(() => {
    const g = (window as any).__game;
    const r = g.world.races[0];
    g.debug.teleport(r.sx, r.sz);
  });
  await page.waitForFunction(() => (window as any).__game.world.races[0].state === 1, null, { timeout: 3000 });
  await expect(page.locator('#poiChip.race')).toBeVisible();
  await expect(page.locator('#poiChip')).toContainText(/\d/);
  await expect(page.locator('#banner')).toContainText(/chronométrée|Timed/i);
  // vue de la piste depuis le haut, puis du tremplin au pied
  await page.evaluate(() => {
    const g = (window as any).__game;
    const r = g.world.races[0];
    g.debug.teleport(r.sx + (r.fx - r.sx) * 0.55, r.sz + (r.fz - r.sz) * 0.55);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${info.project.name}-piste-milieu.png` });
  await page.evaluate(() => {
    const g = (window as any).__game;
    const r = g.world.races[0];
    g.debug.teleport(r.fx, r.fz);
  });
  await page.waitForFunction(() => (window as any).__game.world.racesWon === 1, null, { timeout: 3000 });
  await expect(page.locator('#banner')).toContainText(/coffre|chest/i);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${info.project.name}-piste-arrivee.png` });
  expect(errors).toEqual([]);
});

test('cartes : chaque arme, tome et objet a son icône dessinée', async ({ page, hasTouch }, info) => {
  await openGame(page);
  await startRun(page, 5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.levelUp();
  });
  await page.waitForSelector('#levelup:not([hidden])');
  const n = await page.locator('#cards .card').count();
  expect(await page.locator('#cards .card .glyph svg.ico').count()).toBeGreaterThanOrEqual(n - 1);
  await page.screenshot({ path: `shots/${info.project.name}-cartes-icones.png` });
  if (hasTouch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9;
    g.debug.chest();
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('#luTitle');
    return !!el && /Coffre|Chest/.test(el.textContent ?? '');
  });
  await expect(page.locator('#cards .card .glyph svg.ico')).toHaveCount(3);
  await page.screenshot({ path: `shots/${info.project.name}-coffre-icones.png` });
});

test('descente glissée : le héros reste en pose de glisse sur les bosses (phase 29)', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'clavier (la glisse au doigt est couverte par glisse.spec)');
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 4);
  const dir = await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    const r = g.world.races[0];
    g.debug.teleport(r.sx, r.sz);
    const dx = r.fx - r.sx,
      dz = r.fz - r.sz,
      L = Math.hypot(dx, dz);
    return [dx / L, dz / L];
  });
  const keys: string[] = [];
  if (dir[0] > 0.38) keys.push('KeyD');
  if (dir[0] < -0.38) keys.push('KeyA');
  if (dir[1] > 0.38) keys.push('KeyS');
  if (dir[1] < -0.38) keys.push('KeyW');
  await page.waitForFunction(() => (window as any).__game.scene.heroAnim, null, { timeout: 10000 });
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyC');
  let gliding = 0,
    inSlide = 0;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const g = (window as any).__game,
        P = g.world.player;
      return { glide: P.sliding || P.airMom, clip: g.scene.heroAnim.playing as number };
    });
    if (s.glide) {
      gliding++;
      if (s.clip === 14) inSlide++; // HeroAnim.Slide
    }
    await page.waitForTimeout(50);
  }
  for (const k of keys) await page.keyboard.up(k);
  expect(gliding).toBeGreaterThan(5);
  expect(inSlide / gliding).toBeGreaterThanOrEqual(0.9);
  await page.screenshot({ path: `shots/${test.info().project.name}-descente-glissee.png` });
  expect(errors).toEqual([]);
});
