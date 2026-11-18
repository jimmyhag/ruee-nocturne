// Lot L5 : paliers visuels d'arme (docs/specs/l5-paliers-arme.md). Une arme au niveau 24 prend la carte du niveau 25 :
// bannière « Palier I — Orbe filante », liseré de l'icône, teinte des projectiles ; en réduction des effets, bannière et
// son seulement. Captures d'une Orbe aux paliers 0, I, II et III (lues avant la livraison).
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** Orbe seule au niveau 24, personne ne monte de niveau tout seul, puis la carte « Orbe niveau 25 » proposée. */
async function offerTierCard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    g.debug.god();
    w.player.need = 1e9; // pas de montée de niveau naturelle pendant le test
    for (const k of Object.keys(w.weapons)) delete w.weapons[k];
    g.debug.give('orbe', 24);
    w.cards.length = 0;
    w.cards.push({ kind: 'w', key: 'orbe', lv: 25, n: 1, s0: 0, s1: -1, s2: -1 });
    w.pending = 1;
    w.mode = 1; // Mode.LevelUp : l'écran des cartes s'ouvre à la frame suivante
  });
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  await expect(page.locator('#cards .card')).toHaveCount(1);
}
/** Prend la carte : au doigt sur mobile, au clavier sur PC (règle 4). */
async function pick(page: Page, touch: boolean): Promise<void> {
  if (touch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
/** Plus fort tremblement de caméra vu à chaque image à partir de maintenant (lu par `maxShake`). */
async function watchShake(page: Page): Promise<void> {
  await page.evaluate(() => {
    const W = window as any;
    W.__maxShake = 0;
    const f = () => {
      W.__maxShake = Math.max(W.__maxShake, W.__game.scene.shake);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}
const maxShake = (page: Page) => page.evaluate(() => (window as any).__maxShake as number);
const orbHalo = (page: Page) => page.evaluate(() => (window as any).__game.scene.tOrbHalo.c.getHex() as number);
const orbIcon = (page: Page) => page.locator('#gear .gw').first();

test('A weapon crosses a visual tier', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 3);
  await offerTierCard(page);
  const before = await orbHalo(page);
  await expect(orbIcon(page)).not.toHaveClass(/tier/);
  await watchShake(page);
  await pick(page, hasTouch);
  // l'écran célèbre : bannière, tremblement léger
  await expect(page.locator('#banner')).toHaveText('Palier I — Orbe filante');
  await expect(page.locator('#banner')).toHaveClass(/on/);
  await expect.poll(() => maxShake(page)).toBeGreaterThan(0);
  // son apparence change : teinte des projectiles, liseré de l'icône dans la barre d'équipement
  expect(await page.evaluate(() => (window as any).__game.world.wtier.orbe)).toBe(1);
  await expect.poll(() => orbHalo(page)).not.toBe(before);
  await expect(orbIcon(page)).toHaveClass(/tier1/);
  expect(errors).toEqual([]);
});

test('With reduced effects the celebration is sober', async ({ page, hasTouch }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, reducedFx: true, fxChosen: true });
  });
  await startRun(page, 3);
  await offerTierCard(page);
  await watchShake(page);
  await pick(page, hasTouch);
  await expect(page.locator('#banner')).toHaveText('Palier I — Orbe filante'); // la bannière joue…
  await page.waitForTimeout(600);
  expect(await maxShake(page)).toBe(0); // …sans tremblement (ni hit-stop ni gerbe : Vitest, src/render/feel.test.ts)
  await expect(orbIcon(page)).toHaveClass(/tier1/); // le palier se voit quand même
});

/** Laisse courir la partie jusqu'à `n` projectiles en vol, puis fige la boucle pour la capture. */
async function freezeWithShots(page: Page, n: number): Promise<void> {
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await page.waitForTimeout(350); // de nouveaux tirs partent au palier courant
  await page.waitForFunction((n) => (window as any).__game.world.projCount >= n, n, { timeout: 15_000 });
  await page.waitForTimeout(120); // les traînées se forment
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(150);
}
/** Cadre centré sur le héros (les orbes sont petites à l'échelle de l'écran entier). */
function around(page: Page): { x: number; y: number; width: number; height: number } {
  const v = page.viewportSize() ?? { width: 1280, height: 720 };
  const side = Math.round(Math.min(v.width, v.height) * 0.7);
  return { x: Math.round((v.width - side) / 2), y: Math.round(v.height * 0.52 - side / 2), width: side, height: side };
}

test('captures : une Orbe aux paliers 0, I, II et III, puis quatre armes au palier III', async ({ page }, info) => {
  test.setTimeout(150_000);
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    (document.getElementById('perf') as HTMLElement).hidden = true;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } }); // pas de repli automatique en pixel
  });
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    for (const k of Object.keys(g.world.weapons)) delete g.world.weapons[k];
    g.debug.upgrade('orbe', 8); // quelques projectiles de plus (niveau 9 : aucun palier)
  });
  // l'Orbe tire sur une ronde d'ennemis ; une capture par palier (niveaux 24, 25, 50, 100), boucle figée en plein tir
  for (const [n, lv] of [
    [0, 24],
    [1, 25],
    [2, 50],
    [3, 100],
  ] as const) {
    await page.evaluate((lv) => {
      const g = (window as any).__game;
      g.debug.give('orbe', lv);
      g.debug.spawn(0, 16, 8);
    }, lv);
    await freezeWithShots(page, 2);
    expect(await page.evaluate(() => (window as any).__game.world.wtier.orbe)).toBe(n);
    await page.screenshot({ path: `shots/${info.project.name}-palier-${n}.png`, clip: around(page) });
  }
  // les armes à lueur ajoutée et à modèle (Halo, Lames, Boomerang, Mines) au palier III, l'Orbe toujours là
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const k of ['aura', 'lames', 'boomerang', 'mines']) {
      g.debug.upgrade(k, 8);
      g.debug.give(k, 100);
    }
    g.debug.spawn(0, 16, 6);
  });
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `shots/${info.project.name}-palier-3-armes.png` });
});
