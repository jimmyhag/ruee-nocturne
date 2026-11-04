// Phase 11 — mouvement utile : un plateau se monte d'un saut (clavier / bouton tactile), une éruption se saute,
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

test('un plateau bloque au sol et se monte d’un saut ; les marcheurs restent au pied', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await godMode(page);
  jumpBox = null;
  const p = await page.evaluate(() => {
    const w = (window as any).__game.world;
    const pl = w.plateaux[0];
    const P = w.player;
    P.x = P.px = pl.x - pl.r - 1.5;
    P.z = P.pz = pl.z;
    P.y = P.py = 0;
    P.onGround = true;
    return { x: pl.x, z: pl.z, r: pl.r, h: w.groundAt(pl.x, pl.z) as number };
  });
  expect(p.h).toBeCloseTo(1.4, 5);
  await page.keyboard.down('KeyD'); // vers +x : le plateau est à l'est
  // avance jusqu'au pied (le temps de jeu peut tourner lentement sous SwiftShader : on attend la position, pas un délai)
  await page.waitForFunction((edge) => (window as any).__game.world.player.x > edge - 0.9, p.x - p.r, {
    timeout: 15_000,
  });
  await page.waitForTimeout(400); // continue de pousser contre le bord
  const blocked = await player(page);
  expect(blocked.y).toBe(0);
  expect(blocked.x).toBeLessThan(p.x - p.r); // bloqué au pied
  expect(blocked.x).toBeGreaterThan(p.x - p.r - 1);
  await jump(page, hasTouch);
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      return w.player.onGround && w.player.y > 1;
    },
    null,
    { timeout: 15_000 },
  );
  await page.keyboard.up('KeyD');
  const up = await player(page);
  expect(up.y).toBeCloseTo(p.h, 5);
  expect(Math.hypot(up.x - p.x, up.z - p.z)).toBeLessThan(p.r);
  // 1,5 s plus tard : aucun marcheur sur le plateau (ils butent au pied) ; le joueur n'a pas bougé
  await page.waitForTimeout(1500);
  const walkersOnTop = await page.evaluate(
    (pl) => {
      const w = (window as any).__game.world;
      let n = 0;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (e.type === 4 || e.type === 8) continue; // Volant, Faucheur
        if (Math.hypot(e.x - pl.x, e.z - pl.z) < pl.r) n++;
      }
      return n;
    },
    { x: p.x, z: p.z, r: p.r },
  );
  expect(walkersOnTop).toBe(0);
  expect((await player(page)).y).toBeCloseTo(p.h, 5);
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
      w.t = Math.max(w.t, 200);
      w.nextEruption = w.t + 0.05;
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
  // 2) saut quand la fissure est à mi-course : indemne
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
