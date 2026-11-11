// Phase 30 : effets d'armes stylisés. Chaque arme produit un effet visible à l'écran (instances non nulles dans son
// écrivain, éclairs épais, arc de Faux, lueurs), capturé en rendu net et pixel, sur PC et iPhone ; boules de feu.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** Condition d'effet visible, évaluée dans la page (`g` = window.__game). */
const CASES: [string, string][] = [
  ['orbe', 'g.scene.glowW.mesh.count > 0'],
  ['foudre', 'g.scene.bolts.w.mesh.count > 0'],
  ['faux', 'g.scene.slashW.mesh.count > 0 && g.scene.slashN > 0'],
  ['lames', 'g.scene.slashW.mesh.count > 0'],
  ['lance', 'g.scene.glowW.mesh.count > 0 && g.scene.bladeW.mesh.count > 0'],
  ['meteores', 'g.scene.glowW.mesh.count > 0 && g.world.wstate.metN > 0'],
  ['aura', 'g.scene.aura.visible === true'],
  // phase 47 C : claque du Fouet (trait de l'éclair), flaque de Vitriol, esprits et balise (orbes lumineux)
  ['fouet', 'g.scene.bolts.w.mesh.count > 0'],
  ['vitriol', 'g.world.wstate.vitN > 0 && g.scene.metW.mesh.count > 0'],
  ['esprits', 'g.world.wstate.spN > 0 && g.scene.glowW.mesh.count > 0'],
  ['balise', 'g.world.wstate.balN > 0 && g.scene.glowW.mesh.count > 0'],
];

async function setQuality(page: Page, q: 'net' | 'pixel') {
  await page.evaluate((q) => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: q } });
  }, q);
}

for (const q of ['net', 'pixel'] as const)
  test(`chaque arme a un effet visible (rendu ${q})`, async ({ page }, info) => {
    test.setTimeout(300_000); // onze armes depuis la phase 47 C
    const errors = collectConsoleErrors(page);
    await openGame(page);
    await setQuality(page, q);
    for (const [k, cond] of CASES) {
      await startRun(page, 5);
      await page.evaluate((k) => {
        const g = (window as any).__game;
        g.debug.god();
        g.world.player.need = 1e9;
        g.world.player.invul = 1e9;
        for (const w of Object.keys(g.world.weapons)) delete g.world.weapons[w];
        g.debug.give(k, 8);
        g.debug.spawn(0, 24, 6);
      }, k);
      await page.waitForFunction(new Function(`const g = window.__game; return ${cond};`) as () => boolean, null, {
        timeout: 15_000,
        polling: 16,
      });
      await page.evaluate(() => (window as any).__game.debug.speed(0)); // figé sur l'effet pour la capture
      await page.screenshot({ path: `shots/${info.project.name}-arme-${k}-${q}.png` });
      await page.evaluate(() => (window as any).__game.debug.speed(1));
    }
    expect(errors).toEqual([]);
  });

test('boules de feu des Sorciers : une comète lumineuse et son cercle', async ({ page }, info) => {
  await openGame(page);
  await startRun(page, 5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.world.player.invul = 1e9;
    g.debug.spawn(10, 4, 12); // Sorciers
  });
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === 5) return true; // ShotKind.Fireball
      return false;
    },
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__game.scene.glowW.mesh.count)).toBeGreaterThan(0);
  await page.screenshot({ path: `shots/${info.project.name}-boule-de-feu.png` });
});
