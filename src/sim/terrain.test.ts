// Phase 18 : relief en collines douces. Jamais de marche (pente bornée), départ, lacs et lieux construits à plat.
import { describe, expect, it } from 'vitest';
import { MAP, SLOPE, STEP, TERRAIN, WORLD_HALF } from './balance';
import { startRun, step } from './step';
import { TERRAIN_N } from './terrain';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
const maxSlope = (w: World): number => {
  const H = w.height,
    N = TERRAIN_N;
  let m = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const h = H[j * N + i];
      if (i + 1 < N) m = Math.max(m, Math.abs(H[j * N + i + 1] - h) / TERRAIN.cell);
      if (j + 1 < N) m = Math.max(m, Math.abs(H[(j + 1) * N + i] - h) / TERRAIN.cell);
    }
  return m;
};
const spread = (w: World, x: number, z: number, r: number): number => {
  let a = 1e9,
    b = -1e9;
  for (let dz = -r; dz <= r; dz += 1)
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dz * dz > r * r) continue;
      const h = w.heightAt(x + dx, z + dz);
      a = Math.min(a, h);
      b = Math.max(b, h);
    }
  return b - a;
};

describe('relief (phase 18)', () => {
  it('pente ≤ TERRAIN.maxSlope partout, sur la carte du jeu et 12 graines ; il y a bien du relief', () => {
    for (const seed of [MAP.seed, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const w = new World(seed);
      expect(maxSlope(w), `graine ${seed}`).toBeLessThanOrEqual(TERRAIN.maxSlope + 1e-3);
      let top = 0;
      for (let k = 0; k < w.height.length; k++) top = Math.max(top, w.height[k]);
      expect(top, `graine ${seed}`).toBeGreaterThan(2.5);
      expect(top).toBeLessThanOrEqual(TERRAIN.peak + 0.01);
    }
  });
  it('même graine, même relief ; graines différentes, reliefs différents', () => {
    const a = new World(31),
      b = new World(31),
      c = new World(32);
    expect([...a.height]).toEqual([...b.height]);
    expect(a.heightAt(60, -40)).not.toBe(c.heightAt(60, -40));
  });
  it('clairière de départ, fonds de lacs et lieux construits à plat (les murets restent des murets)', () => {
    for (const seed of [MAP.seed, 3, 9]) {
      const w = new World(seed);
      expect(spread(w, 0, 0, TERRAIN.startFlat)).toBeLessThan(0.1); // un lieu voisin (≥ 30 u) peut mordre le bord
      for (const l of w.lakes) expect(spread(w, l.x, l.z, l.r * 0.9), 'lac').toBeLessThan(0.2); // sous l'eau (rendue 0,25 u au-dessus)
      // les murets sont posés bloc par bloc au sol local (ils ne flottent jamais) : l'aplat est surtout esthétique ;
      // presque tous les lieux sont plats, aucun ne penche de plus d'1 u (deux lieux voisins se partagent leur fondu)
      const sp = w.places.map((p) => spread(w, p.x, p.z, p.r * 0.8)).sort((a, b) => a - b);
      expect(sp[Math.floor(sp.length / 2)], 'médiane').toBeLessThan(0.1);
      expect(sp[Math.floor(sp.length * 0.9)], '9e décile').toBeLessThan(0.4);
      expect(sp[sp.length - 1], 'pire lieu').toBeLessThan(1);
    }
  });
  it('hauteur bornée au bord et interpolation continue', () => {
    const w = new World(5);
    expect(Number.isFinite(w.heightAt(WORLD_HALF + 50, -WORLD_HALF - 50))).toBe(true);
    const h1 = w.heightAt(40.0, 40.0),
      h2 = w.heightAt(40.01, 40.0);
    expect(Math.abs(h1 - h2)).toBeLessThan(0.01);
  });
  it('la pente ralentit en montée et accélère en descente, dans les bornes de SLOPE', () => {
    const w = new World(MAP.seed);
    // un flanc : on cherche le point de plus forte pente
    let bx = 0,
      bz = 0,
      bs = 0;
    for (let x = -150; x <= 150; x += 4)
      for (let z = -150; z <= 150; z += 4) {
        const s = Math.abs(w.heightAt(x + 1, z) - w.heightAt(x - 1, z)) / 2;
        if (s > bs) {
          bs = s;
          bx = x;
          bz = z;
        }
      }
    const up = w.heightAt(bx + 1, bz) > w.heightAt(bx - 1, bz) ? 1 : -1;
    const climb = w.slopeMul(bx, bz, up, 0),
      down = w.slopeMul(bx, bz, -up, 0);
    expect(climb).toBeLessThan(1);
    expect(down).toBeGreaterThan(1);
    expect(climb).toBeGreaterThanOrEqual(SLOPE.min);
    expect(down).toBeLessThanOrEqual(SLOPE.max);
    expect(w.slopeMul(0, 0, 1, 0)).toBe(1); // départ plat
  });
  it('le joueur avance moins vite en montée qu’en descente (même flanc)', () => {
    const run = (dir: number) => {
      const w = new World(MAP.seed);
      startRun(w);
      w.player.maxHp = w.player.hp = 1e9;
      w.player.need = 1e9;
      w.weapons = {};
      w.enemyCount = 0;
      // flanc le plus raide trouvé ci-dessus, recalculé ici
      let bx = 0,
        bz = 0,
        bs = 0;
      for (let x = -150; x <= 150; x += 4)
        for (let z = -150; z <= 150; z += 4) {
          if (w.nearObstacle(x, z)) continue;
          const s = Math.abs(w.heightAt(x + 1, z) - w.heightAt(x - 1, z)) / 2;
          if (s > bs) {
            bs = s;
            bx = x;
            bz = z;
          }
        }
      const up = w.heightAt(bx + 1, bz) > w.heightAt(bx - 1, bz) ? 1 : -1;
      w.player.x = w.player.px = bx;
      w.player.z = w.player.pz = bz;
      step(w, { ...still, mx: up * dir }, STEP);
      return Math.abs(w.player.x - bx);
    };
    expect(run(1)).toBeLessThan(run(-1));
  });
});
