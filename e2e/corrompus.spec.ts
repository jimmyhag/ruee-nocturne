// Monstres corrompus (docs/specs/corrompus.md) : l'interface, sur PC et sur téléphone, un test par scénario d'interface
// (titres en anglais). La simulation est dans src/sim/corrupt.test.ts et src/meta/corrupt-hint.test.ts. Captures de
// chaque corrompu et de leurs compétences dans shots/, et dans docs/captures/corrompus/ avec CAPTURES=1 (téléphone).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** Types des sept monstres qui ont une compétence : Spectre, Dard, Brute, Volant, Cracheur, Archer, Sorcier. */
const TYPES = [0, 1, 2, 4, 5, 9, 10];

/** Capture dans shots/ ; au téléphone avec CAPTURES=1, aussi dans docs/captures/corrompus/ (relues pour la livraison). */
async function shot(page: Page, project: string, name: string): Promise<void> {
  await page.screenshot({ path: `shots/${project}-${name}.png` });
  if (process.env.CAPTURES === '1' && project === 'mobile')
    await page.screenshot({ path: `docs/captures/corrompus/${name}.jpg`, type: 'jpeg', quality: 70 });
}

/** Ce que les écrivains d'instances dessinent à l'image courante. */
const count = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__game,
      s = g.scene;
    return {
      calls: g.renderer.info.render.calls as number,
      glow: s.glowW.mesh.count as number,
      eyes: s.corruptN as number,
      // couleur d'instance de chaque type (une seule instance par type ici)
      colors: [0, 1, 2, 4, 5, 9, 10].map((t) => {
        const c = s.enemyW[t].mesh.instanceColor.array as Float32Array;
        return [c[0], c[1], c[2]];
      }),
    };
  });

test('A corrupted monster is recognisable', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene;
    return s.enemyKind === 'gltf' && s.propsReady === true;
  });
  // jeu figé, joueur invincible, plus de montée de niveau ; horde retirée : un monstre de chaque type en cercle, une
  // élite pour que les lueurs soient déjà dessinées (comme en combat), et des particules
  await page.evaluate((types) => {
    const g = (window as any).__game,
      w = g.world;
    g.debug.god();
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.spawnAcc = -1e9;
    w.enemyCount = 0;
    g.debug.speed(0);
    for (let i = 0; i < types.length; i++) g.debug.spawn(types[i], 1, 4.5);
    // chacun à sa place sur un cercle (debug.spawn place à l'angle 0)
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i],
        a = (i / w.enemyCount) * Math.PI * 2;
      e.x = e.px = w.player.x + Math.sin(a) * 4.5;
      e.z = e.pz = w.player.z + Math.cos(a) * 4.5;
    }
    g.debug.elite(0, 9, 0.3);
    g.scene.particles.burst(w.player.x, 1, w.player.z + 3, 0xffffff, 4, 0.1, 0.1, false);
  }, TYPES);
  await page.waitForTimeout(2000); // quelques images, même à 1 image par seconde en rendu logiciel
  const before = await count(page);
  expect(before.eyes).toBe(0);
  // les mêmes monstres, corrompus
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    for (let i = 0; i < w.enemyCount; i++) if (!w.enemies[i].elite) w.enemies[i].corrupt = 1;
  });
  await expect.poll(async () => (await count(page)).eyes, { timeout: 20_000 }).toBe(TYPES.length);
  const after = await count(page);
  // teints de violet : le bleu domine le vert, ce qui n'est vrai d'aucun monstre ordinaire (texture presque blanche)
  for (let k = 0; k < TYPES.length; k++) {
    const [r, g, b] = after.colors[k];
    expect(b, `type ${TYPES[k]} violet`).toBeGreaterThan(g * 1.8);
    expect(b, `type ${TYPES[k]} violet`).toBeGreaterThan(r);
    const [, g0, b0] = before.colors[k];
    expect(b0, `type ${TYPES[k]} ordinaire`).toBeLessThan(g0 * 1.8);
  }
  expect(after.glow - before.glow, 'les yeux qui luisent et l’aura').toBe(2 * TYPES.length);
  // sans appel de dessin en plus (décision 3) : mêmes écrivains, mêmes appels
  expect(after.calls, 'appels de dessin ajoutés par les corrompus').toBe(before.calls);
  expect(after.calls, 'budget d’appels').toBeLessThanOrEqual(p === 'mobile' ? 40 : 80);
  await shot(page, p, 'corrompus');

  // leurs compétences, lancées toutes ensemble : couloir de la Ruée, bombe, éventail, volée, pluie de feu ; le Spectre
  // (1 PV) tombe sous l'arme du héros et se scinde
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    for (let i = 0; i < w.enemyCount; i++) {
      w.enemies[i].timer = 0;
      if (w.enemies[i].type === 0 && !w.enemies[i].elite) w.enemies[i].hp = 0.01;
    }
    g.debug.speed(0.25);
  });
  // la Ruée arme son couloir : image figée
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].type === 1 && w.enemies[i].state === 1) return true;
      return false;
    },
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(1500);
  const lane = await count(page);
  expect(lane.calls, 'budget d’appels, compétences lancées').toBeLessThanOrEqual(p === 'mobile' ? 40 : 80);
  await shot(page, p, 'corrompus-competences');
  // puis les éclats de la Scission et une flaque de feu allumée
  await page.evaluate(() => (window as any).__game.debug.speed(0.25));
  await page.waitForFunction(
    (arm) => {
      const w = (window as any).__game.world;
      let shards = 0,
        lit = 0;
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].corrupt === 2) shards++;
      for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === 6 && w.shots[i].t0 - w.shots[i].life > arm) lit++;
      return shards > 0 && lit > 0;
    },
    0.65,
    { timeout: 60_000 },
  );
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(1500);
  const fire = await count(page);
  expect(fire.calls, 'budget d’appels, éclats et flaques').toBeLessThanOrEqual(p === 'mobile' ? 40 : 80);
  await shot(page, p, 'corrompus-scission-feu');
  expect(errors).toEqual([]);
});

test('Corrupted monsters are explained the first time', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // un joueur qui a vu toutes les autres consignes, jamais un corrompu
  await page.evaluate(() => (window as any).__game.setMeta({ ...(window as any).__game.meta, hints: 63 }));
  await startRun(page, 3);
  // le monde passe en prolongation (+1 min) : la horde y amène des corrompus ; ni vague ni élite en rattrapage
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    g.debug.god();
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.stageT = w.diffT = 660;
  });
  await page.waitForFunction(() => (window as any).__game.world.corrupted > 0, null, { timeout: 60_000 });
  await expect(page.locator('#tutoText')).toHaveText(
    "Monstres corrompus : l'infini les réveille. Plus dangereux, ils rapportent plus.",
  );
  // retenue : elle ne revient plus
  const hints = await page.evaluate(() => (window as any).__game.meta.hints as number);
  expect(hints & (1 << 6)).toBeTruthy();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.kill();
  });
  await page.waitForFunction(() => (window as any).__game.app !== 'play');
  await startRun(page, 4);
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    g.debug.god();
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.stageT = w.diffT = 660;
  });
  await page.waitForFunction(() => (window as any).__game.world.corrupted > 2, null, { timeout: 60_000 });
  await expect(page.locator('#tutoText')).not.toHaveText(/corrompus/);
  expect(errors).toEqual([]);
});
