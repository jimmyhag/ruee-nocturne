// Lot L2 (docs/specs/l2-premieres-parties.md) : dévoilement progressif dans le navigateur. Première partie sans glisse
// (bouton et touche masqués), bannière « Nouveau ! » au début de la partie qui dévoile une étape, glisse au clavier
// comme au doigt une fois dévoilée, joueur ancien sans rien de retiré, défi du jour avec tout pour tous.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const world = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__game.world;
    return {
      reveal: w.reveal as number,
      seed: w.seed as number,
      shrines: w.shrines.length as number,
      skulls: w.skulls.length as number,
      bossTotems: w.bossTotems.length as number,
      totem: w.totem.state as number,
      merchant: w.merchant.active as boolean,
    };
  });
const meta = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__game.meta;
    return { reveal: m.reveal as number, runs: m.runs as number };
  });
/** Partie finie : 3 minutes et quelques, puis la mort ; l'écran de fin s'affiche. */
async function finishRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(185);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
}
/** Marche à droite puis demande une glisse (touche C, ou un appui sur GLISSE avec le joystick tenu). */
async function askSlide(page: Page, hasTouch: boolean): Promise<void> {
  if (!hasTouch) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);
    await page.keyboard.down('KeyC');
    await page.waitForTimeout(200);
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
  await page.waitForTimeout(300);
  const b = (await page.locator('#btnSlide').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x0 + 60, y: y0, id: 1 },
      { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x0 + 60, y: y0, id: 1 }] });
  await page.waitForTimeout(200);
}

test('The first run has only the essentials', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 })); // nouveau joueur
  expect(await meta(page)).toEqual({ reveal: 0, runs: 0 });
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  // armes automatiques, montée de niveau et saut sont là ; ni sanctuaire, ni crâne, ni totem
  expect(await world(page)).toMatchObject({
    reveal: 0,
    shrines: 0,
    skulls: 0,
    bossTotems: 0,
    totem: 3,
    merchant: false,
  });
  expect(await page.evaluate(() => Object.keys((window as any).__game.world.weapons))).toEqual(['orbe']);
  await expect(page.locator('#goalChip')).toBeHidden(); // pas d'objectif « totem »
  await expect(page.locator('#banner')).not.toHaveClass(/on/); // rien à annoncer
  // bouton GLISSE et touche masqués ; la demande ne fait rien
  await expect(page.locator('#btnSlide')).toBeHidden();
  await expect(page.locator('#slideKey')).toBeHidden();
  if (!hasTouch) await expect(page.locator('#keys')).toBeVisible();
  else await expect(page.locator('#btnJump')).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-l2-premiere-partie.png` });
  if (!hasTouch) {
    await askSlide(page, false);
    expect(await page.evaluate(() => (window as any).__game.world.player.sliding)).toBe(false);
    await page.keyboard.up('KeyC');
    await page.keyboard.up('KeyD');
  }
  // relecture du lot L2 : pas d'annonce « 0 totem de boss » une fois l'arrivée passée (aucun totem dans ce monde)
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.stageT = Math.max(w.stageT, 3); // passé le moment de l'annonce (2,5 s), sans attendre sous SwiftShader
  });
  await page.waitForTimeout(400);
  await expect(page.locator('#banner')).not.toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('A system is revealed with a "New!" moment', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 }));
  await startRun(page, 2);
  await finishRun(page);
  expect(await meta(page)).toEqual({ reveal: 1, runs: 1 });
  await page.locator('#againBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const banner = page.locator('#banner');
  await expect(banner).toHaveClass(/on/);
  await expect(banner.locator('.kick')).toHaveText('Nouveau !');
  await expect(banner.locator('small')).toHaveText('La glisse — maintiens GLISSE en descente pour filer plus vite');
  await page.screenshot({ path: `shots/${info.project.name}-l2-nouveau-glisse.png` });
  expect((await world(page)).reveal).toBe(1);
  await expect(page.locator(info.project.name === 'mobile' ? '#btnSlide' : '#slideKey')).toBeVisible();
  // la bannière reste 4 s, ne bloque pas le jeu, puis s'en va
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
  await expect(banner).not.toHaveClass(/on/, { timeout: 6000 });
  // relancée au même dévoilement, la partie n'annonce plus rien
  await page.evaluate(() => (window as any).__game.start(3));
  await page.waitForTimeout(500);
  await expect(banner).not.toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('Slide is revealed on keyboard and touch alike', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // joueur à sa deuxième partie : une partie finie, la glisse dévoilée et déjà annoncée
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, runs: 1, reveal: 1, seenReveal: 1 }));
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  await expect(page.locator(hasTouch ? '#btnSlide' : '#slideKey')).toBeVisible();
  await askSlide(page, hasTouch);
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 2000 });
  if (hasTouch) await expect(page.locator('#btnSlide')).toHaveClass(/on/);
  else {
    await page.keyboard.up('KeyC');
    await page.keyboard.up('KeyD');
  }
  expect(errors).toEqual([]);
});

test('A player who had already played keeps everything', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // sauvegarde d'avant la mise à jour : des parties jouées, pas de champ de dévoilement
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 5,
      runs: 12,
      gold: 1873,
      achievements: ['survie3', 'survie10'],
      bought: ['bucheron'],
      slots: { weapons: 2, passives: 3, rerolls: 1 },
    }),
  );
  const m = await page.evaluate(() => {
    const x = (window as any).__game.meta;
    return { reveal: x.reveal, gold: x.gold, achievements: x.achievements, bought: x.bought, slots: x.slots };
  });
  expect(m).toEqual({
    reveal: 4,
    gold: 1873,
    achievements: ['survie3', 'survie10'],
    bought: ['bucheron'],
    slots: { weapons: 2, passives: 3, rerolls: 1 },
  });
  await startRun(page, 2);
  const w = await world(page);
  expect(w.reveal).toBe(4);
  expect(w.shrines).toBeGreaterThan(0);
  expect(w.skulls).toBeGreaterThan(0);
  expect(w.totem).toBe(0);
  await expect(page.locator(hasTouch ? '#btnSlide' : '#slideKey')).toBeVisible();
  await expect(page.locator('#banner')).not.toHaveClass(/on/); // joueur ancien : aucune bannière
  // l'aide explique tout
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await page.locator('#menuBtn').click();
  await page.locator('#settingsBtn').click(); // « Comment jouer » est dans les réglages
  await page.locator('#helpBtn').click();
  await expect(page.locator('#help dd[data-i18n="menu.ctrl.worlds"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('The daily challenge is the same for everyone', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const daily = async () => {
    await page.locator('#dailyBtn').click();
    await page.locator('#dailyPlayBtn').click();
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    return world(page);
  };
  // nouveau joueur : sa première partie finie (« Première nuit » ouvre le défi), rien d'autre de dévoilé que la glisse
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 5, runs: 1, reveal: 1, seenReveal: 0, achievements: ['survie3'] }),
  );
  await page.locator('#settingsBtn').click(); // « Comment jouer » est dans les réglages
  await page.locator('#helpBtn').click();
  await expect(page.locator('#help dd[data-i18n="menu.ctrl.worlds"]')).toBeHidden(); // l'aide suit le dévoilement
  await page.locator('#helpBackBtn').click();
  const a = await daily();
  await expect(page.locator('#banner')).not.toHaveClass(/on/); // pas de « Nouveau ! » au défi du jour
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  expect(await meta(page)).toEqual({ reveal: 1, runs: 2 }); // le dévoilement n'avance pas
  await page.locator('#menuBtn').click();
  // joueur ancien
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, runs: 40, achievements: ['survie3'] }));
  const b = await daily();
  for (const w of [a, b]) {
    expect(w.reveal).toBe(4);
    expect(w.shrines).toBeGreaterThan(0);
    expect(w.skulls).toBeGreaterThan(0);
    expect(w.totem).toBe(0);
  }
  expect(b).toEqual(a); // même graine, mêmes systèmes
  expect(errors).toEqual([]);
});

test('the first shrine carries a "New" tag on the minimap until it is used', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // troisième partie : les sanctuaires arrivent
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, runs: 2, reveal: 2, seenReveal: 1 }));
  await startRun(page, 2);
  await expect(page.locator('#banner small')).toHaveText('Les sanctuaires — reste dans le cercle pour gagner un bonus');
  const s = await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.enemyCount = 0;
    const sh = g.world.shrines[0];
    g.debug.teleport(sh.x + 12, sh.z); // à 12 u : découvert, hors du cercle
    return { x: sh.x, z: sh.z };
  });
  await page.waitForTimeout(800); // la minicarte se redessine 4 fois par seconde
  await page.locator('#minimap').screenshot({ path: `shots/${info.project.name}-l2-minicarte-nouveau.png` });
  // dans le cercle : la jauge monte, l'étiquette s'en va (capture à lire)
  await page.evaluate((p) => (window as any).__game.debug.teleport(p.x, p.z), s);
  await page.waitForFunction(() => (window as any).__game.world.shrines[0].charge > 0.5, null, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.locator('#minimap').screenshot({ path: `shots/${info.project.name}-l2-minicarte-touche.png` });
  expect(errors).toEqual([]);
});
