// Phase 11 — mouvement utile : un muret se franchit d'un saut (phase 16, clavier / bouton tactile), une éruption se saute,
// l'onde de choc du Gardien se saute. Les ennemis ne font pas de dégâts pendant ces tests (dmgMul 0) : on isole le danger.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, player, startRun } from './helpers';

const KIND_ERUPTION = 2; // ShotKind.Eruption
const KIND_RING = 3; // ShotKind.Ring

async function godMode(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    w.player.maxHp = w.player.hp = 100_000;
    w.nextEruption = 1e9;
    // ennemis inoffensifs (même ceux qui apparaissent ensuite)
    setInterval(() => {
      const ww = g.world;
      if (!ww) return;
      for (let i = 0; i < ww.enemyCount; i++) ww.enemies[i].dmgMul = 0;
    }, 30);
  });
}
async function hp(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => (window as any).__game.world.player.hp as number);
}
/** Saut immédiat : touche Espace, ou tap tactile au centre du bouton (coordonnées lues une fois : pas d'attente d'actionnabilité). */
let jumpBox: { x: number; y: number } | null = null;
async function jump(page: import('@playwright/test').Page, touch: boolean): Promise<void> {
  if (!touch) {
    await page.keyboard.press('Space');
    return;
  }
  if (!jumpBox) {
    const b = (await page.locator('#btnJump').boundingBox())!;
    jumpBox = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  await page.touchscreen.tap(jumpBox.x, jumpBox.y);
}

test('un muret bloque en marchant et se franchit d’un saut (phase 16)', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await godMode(page);
  jumpBox = null;
  // un muret nord-sud posé à 2 u à l'est du joueur (indexé dans la grille des murets comme ceux de la carte)
  const wall = await page.evaluate(() => {
    const w = (window as any).__game.world;
    const P = w.player;
    P.y = 0;
    P.onGround = true;
    const x = P.x + 2,
      z1 = P.z - 5,
      z2 = P.z + 5;
    w.walls.push({ x1: x, z1, x2: x, z2, r: 0.45, h: 1, kind: 0 });
    const i = w.walls.length - 1;
    for (let cx = Math.floor((x - 1) / 6); cx <= Math.floor((x + 1) / 6); cx++)
      for (let cz = Math.floor((z1 - 1) / 6); cz <= Math.floor((z2 + 1) / 6); cz++) {
        const k = cx * 65536 + cz;
        const arr = w.wallGrid.get(k) ?? [];
        arr.push(i);
        w.wallGrid.set(k, arr);
      }
    return { x };
  });
  await page.keyboard.down('KeyD'); // vers +x : le muret est à l'est
  // avance jusqu'au muret (le temps de jeu peut tourner lentement sous SwiftShader : on attend la position, pas un délai)
  await page.waitForFunction((x) => (window as any).__game.world.player.x > x - 1.0, wall.x, { timeout: 15_000 });
  await page.waitForTimeout(400); // continue de pousser contre le muret
  const blocked = await player(page);
  expect(blocked.x).toBeLessThan(wall.x - 0.8); // bloqué : rayon du muret + rayon du joueur
  await jump(page, hasTouch);
  await page.waitForFunction((x) => (window as any).__game.world.player.x > x + 0.9, wall.x, { timeout: 15_000 });
  await page.keyboard.up('KeyD');
  await page.waitForFunction(() => (window as any).__game.world.player.onGround, null, { timeout: 15_000 });
  expect((await player(page)).x).toBeGreaterThan(wall.x + 0.85); // de l'autre côté
  expect(errors).toEqual([]);
});

test('une éruption blesse au sol et se saute à mi-télégraphe', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await godMode(page);
  jumpBox = null;
  const arm = () =>
    page.evaluate(() => {
      const w = (window as any).__game.world;
      // phase 37 : les dégâts suivent le temps du monde (diffT, recalculé depuis stageT à chaque pas)
      w.t = Math.max(w.t, 200);
      w.stageT = Math.max(w.stageT, 200);
      w.nextEruption = w.stageT + 0.05;
    });
  const waitShot = (kind: number, maxLife: number) =>
    page.waitForFunction(
      ([k, ml]) => {
        const w = (window as any).__game.world;
        for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === k && w.shots[i].life < ml) return true;
        return false;
      },
      [kind, maxLife] as [number, number],
      { timeout: 15_000 },
    );
  const waitGone = (kind: number) =>
    page.waitForFunction(
      (k) => {
        const w = (window as any).__game.world;
        for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === k) return false;
        return true;
      },
      kind,
      { timeout: 15_000 },
    );
  // 1) immobile : touché et projeté
  let before = await hp(page);
  await arm();
  await waitShot(KIND_ERUPTION, 0.9);
  await page.waitForFunction((b) => b - (window as any).__game.world.player.hp > 15, before, { timeout: 15_000 }); // touché
  const launched = await page.evaluate(() => {
    const P = (window as any).__game.world.player;
    return P.y > 0 || P.vy > 0 || !P.onGround; // projeté (lu juste après le coup)
  });
  expect(launched).toBe(true);
  await waitGone(KIND_ERUPTION);
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.nextEruption = 1e9;
  });
  await page.waitForFunction(() => (window as any).__game.world.player.onGround === true, null, { timeout: 15_000 });
  // 2) saut quand le cercle est à mi-course : indemne
  before = await hp(page);
  await arm();
  await waitShot(KIND_ERUPTION, 0.5);
  await jump(page, hasTouch);
  await waitGone(KIND_ERUPTION);
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.nextEruption = 1e9;
  });
  expect(before - (await hp(page))).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('l’onde de choc du Gardien blesse une fois au sol et se saute', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await godMode(page);
  jumpBox = null;
  const ring = () =>
    page.evaluate((k) => {
      const w = (window as any).__game.world;
      const s = w.allocShot();
      s.kind = k;
      s.r = 1;
      s.x = s.px = w.player.x + 5;
      s.z = s.pz = w.player.z;
      s.vx = s.vz = 0;
      s.life = 1.3; // 9 u/s : atteint le joueur après ~0,45 s, sort après 12,7 u
      s.dmg = 30;
      s.hit = false;
    }, KIND_RING);
  const gone = () =>
    page.waitForFunction(
      (k) => {
        const w = (window as any).__game.world;
        for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === k) return false;
        return true;
      },
      KIND_RING,
      { timeout: 15_000 },
    );
  let before = await hp(page);
  await ring();
  await gone();
  expect(before - (await hp(page))).toBeCloseTo(30, 0);
  // saute quand l'anneau est à ~4,3 u (0,38 s avant la bande de contact : en l'air de 0,11 à 0,62 s après l'impulsion)
  before = await hp(page);
  await ring();
  await page.waitForFunction(
    (k) => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.shotCount; i++) {
        const s = w.shots[i];
        if (s.kind === k && 5 - s.r < 4.3) return true;
      }
      return false;
    },
    KIND_RING,
    { timeout: 15_000 },
  );
  await jump(page, hasTouch);
  await gone();
  expect(before - (await hp(page))).toBeLessThan(1);
  expect(errors).toEqual([]);
});
