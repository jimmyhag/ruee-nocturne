// Rendu net (phase 9) : réglage auto/net/pixel, résolution interne, et repli automatique quand les frames traînent.
// 1.69.2 (docs/specs/rendu-allege.md) : le repli « 2 → 1 → 0 » devient la descente net → net allégé → ×0,85 → ×0,7 →
// ×0,6, sans jamais le pixel ; une lenteur du JS n'abaisse pas la résolution ; le rendu remonte quand la horde passe.
import { expect, test, type Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const setQuality = (page: Page, q: string) =>
  page.evaluate((q) => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: q } });
  }, q);
const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__game;
    const c = g.renderer.domElement as HTMLCanvasElement;
    return {
      level: g.scene.qualityLevel as number,
      step: g.scene.step as number,
      w: c.width,
      h: c.height,
      pixel: c.classList.contains('pixel'),
    };
  });

test('net par défaut : résolution interne à l’échelle de l’écran ; pixel : ≈ 380 px de haut et classe CSS', async ({
  page,
}) => {
  await openGame(page);
  const vp = page.viewportSize()!;
  let s = await state(page);
  expect(s.level).toBe(2);
  expect(s.pixel).toBe(false);
  expect(s.h).toBeGreaterThanOrEqual(Math.min(vp.height, 1600) - 2); // DPR 1 sur desktop ; mobile plafonné à 1600
  const netArea = s.w * s.h;
  await setQuality(page, 'pixel');
  s = await state(page);
  expect(s.level).toBe(0);
  expect(s.pixel).toBe(true);
  expect(Math.min(s.w, s.h / 1.2)).toBeLessThanOrEqual(400); // ≈ 380 px sur le petit côté (paysage : hauteur)
  expect(s.w * s.h).toBeLessThan(netArea * 0.45);
  await expect(page.locator('#setQuality [data-quality="pixel"]')).toHaveAttribute('aria-pressed', 'true');
  await setQuality(page, 'net');
  s = await state(page);
  expect(s.level).toBe(2);
  expect(s.pixel).toBe(false);
});

/** Partie en réglage auto, joueur invincible et sans écran de niveau, passé les 3 premières secondes (mesure active). */
async function autoRun(page: Page): Promise<void> {
  await openGame(page);
  await setQuality(page, 'auto');
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // un écran de niveau met la partie en pause et remet les séries de mesure à zéro
  });
  await page.waitForFunction(() => (window as any).__game.world.t > 3);
}
/** Images simulées : `gap` ms entre deux images, dont `js` ms de JavaScript (crochets `slowFrames` et `jsTime`). */
const frames = (page: Page, gap: number, js: number) =>
  page.evaluate(
    ([gap, js]) => {
      const d = (window as any).__game.debug;
      d.slowFrames(gap);
      d.jsTime(js);
    },
    [gap, js],
  );
const stepIs = (page: Page, n: number, timeout: number) =>
  page.waitForFunction((n) => (window as any).__game.scene.step === n, n, { timeout });

test('Rendering lightens before lowering the resolution', async ({ page }) => {
  await autoRun(page);
  const net = await state(page);
  expect(net.step).toBe(0);
  await frames(page, 40, 4); // la carte graphique traîne, le JS est léger
  await stepIs(page, 1, 15_000);
  const lite = await state(page);
  expect(lite.pixel).toBe(false);
  expect([lite.w, lite.h]).toEqual([net.w, net.h]); // la résolution interne ne change pas
});

test('Auto setting never pixelates the image', async ({ page }) => {
  test.setTimeout(90_000);
  await autoRun(page);
  const net = await state(page);
  // le canevas ne passe jamais en mode pixel, à aucune image de la descente
  await page.evaluate(() => {
    const c = (window as any).__game.renderer.domElement as HTMLCanvasElement;
    const seen = ((window as any).__pixelSeen = { pixel: false });
    const watch = () => {
      if (c.classList.contains('pixel')) seen.pixel = true;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await frames(page, 40, 4);
  const heights: number[] = [];
  for (let n = 1; n <= 4; n++) {
    await stepIs(page, n, 15_000);
    heights.push((await state(page)).h);
  }
  // palier par palier : ×1 (allégé), ×0,85, ×0,7, ×0,6 de la hauteur nette, filtrage lisse
  const k = heights.map((h) => h / net.h);
  expect(k[0]).toBe(1);
  expect(k[1]).toBeCloseTo(0.85, 2);
  expect(k[2]).toBeCloseTo(0.7, 2);
  expect(k[3]).toBeCloseTo(0.6, 2);
  await page.waitForTimeout(7000); // trois fenêtres lentes de plus : le plancher tient
  const floor = await state(page);
  expect(floor.step).toBe(4);
  expect(floor.pixel).toBe(false);
  expect(await page.evaluate(() => (window as any).__pixelSeen.pixel)).toBe(false);
});

test('Slow JavaScript does not lower the resolution', async ({ page }) => {
  test.setTimeout(90_000);
  await autoRun(page);
  const net = await state(page);
  await frames(page, 40, 36); // le JS prend 90 % de l'image : c'est lui le goulot
  await stepIs(page, 1, 15_000);
  await page.waitForTimeout(13_000); // six fenêtres lentes de plus
  const s = await state(page);
  expect(s.step).toBe(1); // allégé…
  expect([s.w, s.h]).toEqual([net.w, net.h]); // …à résolution pleine
  expect(s.pixel).toBe(false);
});

test('Rendering climbs back when the horde passes', async ({ page }) => {
  test.setTimeout(90_000);
  await autoRun(page);
  const net = await state(page);
  await page.evaluate(() => (window as any).__game.debug.renderStep(2)); // descendue au palier ×0,85
  expect((await state(page)).h).toBeLessThan(net.h);
  await frames(page, 16, 4); // 60 images par seconde : la horde est passée
  await stepIs(page, 1, 15_000); // 10 s d'images fluides : un palier plus haut
  await stepIs(page, 0, 15_000); // puis un autre : le net
  expect(await state(page)).toEqual(net);
});

test('Net setting never steps down', async ({ page }) => {
  await autoRun(page);
  await setQuality(page, 'net');
  const net = await state(page);
  expect(net).toMatchObject({ level: 2, step: 0, pixel: false });
  await frames(page, 40, 4);
  await page.waitForTimeout(9000); // quatre fenêtres lentes
  expect(await state(page)).toEqual(net);
});

// Décision 4 : au palier allégé, chaque tir ennemi, chaque ennemi, l'élite et le boss sont dessinés ; seuls les
// projectiles du héros au-delà du plafond (les plus loin de lui), les traînées, des particules, le décor lointain et la
// version détaillée des ennemis lointains disparaissent. Image figée : la même scène au net, puis allégée.
test('Lightening hides no danger', async ({ page }) => {
  test.setTimeout(90_000);
  await autoRun(page);
  await frames(page, 20, 4); // ni lentes ni fluides : le palier imposé reste
  await page.waitForFunction(() => (window as any).__game.scene.enemyKind === 'gltf', null, { timeout: 20_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    const d = g.debug;
    d.give('orbe', 8);
    d.give('boomerang', 8);
    d.give('lance', 8);
    d.spawn(0, 90, 10); // la horde, près et loin
    d.spawn(1, 90, 17);
    d.spawn(0, 90, 22);
    d.spawn(9, 12, 9); // archers et cracheurs : des tirs ennemis
    d.spawn(5, 10, 8);
    d.spawn(10, 6, 9); // sorciers : boules de feu et leurs cercles
    d.spawn(3, 1, 7); // un boss
    d.elite(2, 5); // une élite
    for (let i = 0; i < g.world.enemyCount; i++) {
      const e = g.world.enemies[i];
      e.hp = e.max = 1e7; // la horde reste le temps de la mesure
    }
  });
  // la sim avance hors rendu (SwiftShader dessine quelques images par seconde) jusqu'à des tirs ennemis ; une salve
  // de 40 orbes (crochet `volley`) met plus de projectiles du héros en vol que le plafond ; puis l'image est figée
  const ready = await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    g.debug.speed(0);
    const shots = () => {
      let n = 0;
      for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === 0 || w.shots[i].kind === 4) n++;
      return n;
    };
    for (let k = 0; k < 80 && shots() < 2; k++) {
      g.debug.warp(0.1);
      g.debug.god(); // warp rend au joueur ses PV normaux
    }
    g.debug.volley(40);
    g.debug.warp(0.25);
    g.debug.god();
    let flying = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind !== 2 && w.projs[i].kind !== 3) flying++;
    return { shots: shots(), flying, t: w.t, enemies: w.enemyCount, mode: w.mode };
  });
  expect(ready.shots >= 2 && ready.flying > 24, `tirs ennemis et salve en vol : ${JSON.stringify(ready)}`).toBe(true);
  const look = (step: number) =>
    page.evaluate(async (step) => {
      const g = (window as any).__game;
      const s = g.scene;
      const next = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))));
      g.debug.speed(0); // image figée : le même monde aux deux paliers
      g.debug.renderStep(step);
      await next();
      await next();
      const w = g.world;
      let alive = 0,
        spit = 0,
        arrow = 0,
        zones = 0,
        flying = 0,
        near = 0,
        far = 0;
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].alive) alive++;
      for (let i = 0; i < w.shotCount; i++) {
        const k = w.shots[i].kind;
        if (k === 0) spit++;
        else if (k === 4) arrow++;
        else zones++;
      }
      // en vol : tout sauf les mines (2) et les plaques de feu (3), posées au sol et toujours dessinées
      for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind !== 2 && w.projs[i].kind !== 3) flying++;
      for (const wr of s.enemyW) near += wr.mesh.count;
      for (const wr of s.enemyFarW) far += wr ? wr.mesh.count : 0;
      return {
        alive,
        near,
        far,
        boss: s.enemyW[3].mesh.count as number,
        brutesNear: s.enemyW[2].mesh.count as number,
        elites: s.eliteN as number,
        spit,
        arrow,
        zones,
        spitDrawn: s.spitW.mesh.count as number,
        arrowDrawn: s.arrowW.mesh.count as number,
        zonesDrawn: s.zoneW.mesh.count as number,
        flying,
        projDrawn: s.projDrawn as number,
        triangles: g.renderer.info.render.triangles as number,
      };
    }, step);
  const net = await look(0);
  const lite = await look(1);
  console.log(`net ${JSON.stringify(net)}\nallégé ${JSON.stringify(lite)}`);
  for (const r of [net, lite]) {
    expect(r.near + r.far, 'chaque ennemi est dessiné').toBe(r.alive);
    expect(r.boss, 'le boss est dessiné, en version détaillée').toBe(1);
    expect(r.elites, 'l’élite est marquée').toBe(1);
    expect(r.brutesNear, 'l’élite reste détaillée').toBeGreaterThanOrEqual(1);
    expect(r.spitDrawn, 'chaque crachat est dessiné').toBe(r.spit);
    expect(r.arrowDrawn, 'chaque flèche est dessinée').toBe(r.arrow);
    expect(r.zonesDrawn, 'chaque cercle de tir est dessiné').toBeGreaterThanOrEqual(r.zones);
  }
  expect(net.far, 'au net, aucun ennemi en version simple').toBe(0);
  expect(lite.far, 'allégé : les ennemis lointains en version simple').toBeGreaterThan(0);
  expect(net.projDrawn, 'au net, tous les projectiles du héros').toBe(net.flying);
  expect(lite.flying).toBeGreaterThan(20);
  expect(lite.projDrawn, 'allégé : le plafond, pas plus').toBe(20);
  expect(lite.triangles, 'moins de triangles qu’au net').toBeLessThan(net.triangles);
});
