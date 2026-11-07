// Phase 18 : relief ; phase 27 : plans nets (plateaux, terrasses, rampes, combes). Jamais de marche (pente bornée),
// départ, lacs et lieux construits à plat.
import { describe, expect, it } from 'vitest';
import { MAP, SLOPE, STEP, TERRAIN, WORLD_HALF } from './balance';
import { startRun, step } from './step';
import { TERRAIN_N } from './terrain';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
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
  it('phase 28 : grandes pistes (sommet, longue descente à bosses, tremplin) et tremplins isolés, dégagés', () => {
    for (const seed of [MAP.seed, 5, 13]) {
      const w = new World(seed);
      expect(w.pistes.length, `graine ${seed}`).toBeGreaterThanOrEqual(3);
      expect(w.kickers.length).toBeGreaterThanOrEqual(w.pistes.length + 3);
      for (const p of w.pistes) {
        const L = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
        expect(L).toBeGreaterThanOrEqual(TERRAIN.pisteLen[0] - 1e-9);
        // la descente : haut de piste au sommet, bas au sol, et ça descend tout du long (hors bosses)
        expect(w.heightAt(p.x0, p.z0)).toBeGreaterThan(p.top - 0.5);
        expect(w.heightAt(p.x1, p.z1)).toBeLessThan(1);
        let prev = Infinity,
          drops = 0;
        for (let t = 0.05; t <= 0.95; t += 0.05) {
          const h = w.heightAt(p.x0 + (p.x1 - p.x0) * t, p.z0 + (p.z1 - p.z0) * t);
          if (h < prev) drops++;
          prev = h;
        }
        expect(drops).toBeGreaterThanOrEqual(13); // quelques remontées : les bosses
        // dégagée : aucun arbre, rocher ni ouvrage dans le couloir
        for (const o of w.obstacles) {
          const ux = (p.x1 - p.x0) / L,
            uz = (p.z1 - p.z0) / L,
            t = (o.x - p.x0) * ux + (o.z - p.z0) * uz,
            lat = Math.abs(-(o.x - p.x0) * uz + (o.z - p.z0) * ux);
          if (t > 0 && t < L) expect(lat, 'obstacle sur une piste').toBeGreaterThan(p.half);
        }
      }
      // tremplin : le sol monte puis tombe (une crête)
      for (const k of w.kickers) {
        const h0 = w.heightAt(k.x, k.z),
          hTop = w.heightAt(k.x + k.dx * TERRAIN.kickLen, k.z + k.dz * TERRAIN.kickLen),
          hAfter = w.heightAt(k.x + k.dx * (TERRAIN.kickLen + 3), k.z + k.dz * (TERRAIN.kickLen + 3));
        expect(hTop - h0).toBeGreaterThan(1.5);
        expect(hAfter).toBeLessThan(hTop - 1);
      }
    }
  });
  it('phase 27 : plateaux à sommet plat, longues rampes en pente douce du pied au sommet, combes creusées', () => {
    for (const seed of [MAP.seed, 4, 11]) {
      const w = new World(seed);
      expect(w.plateaus.length, `graine ${seed}`).toBeGreaterThanOrEqual(15);
      expect(w.ramps.length).toBeGreaterThanOrEqual(w.plateaus.length * 0.8);
      expect(w.combes.length).toBeGreaterThanOrEqual(4);
      // sommets : plats sur l'essentiel de leur surface (hors lieux, lacs et combes qui peuvent les entailler)
      let flatTops = 0;
      for (const p of w.plateaus) {
        const h = w.heightAt(p.x, p.z);
        if (h > p.top + 1) flatTops++; // une terrasse couvre le centre
        else if (Math.abs(h - p.top) < 0.05 && spread(w, p.x, p.z, Math.min(p.a, p.b) * 0.4) < 0.05) flatTops++;
      }
      expect(flatTops / w.plateaus.length, `graine ${seed} : sommets plats (une combe peut en entailler)`).toBeGreaterThan(0.5);
      // rampes du sol : le sol suit au moins le plan de la rampe, en pente douce et régulière
      let smooth = 0,
        n = 0;
      for (const m of w.ramps) {
        if (m.h1 !== 0) continue;
        n++;
        let ok = true;
        const L = Math.hypot(m.x1 - m.x0, m.z1 - m.z0);
        expect(m.h0 / L).toBeLessThan(0.3);
        for (let t = 0.1; t <= 0.9; t += 0.1) {
          const x = m.x0 + (m.x1 - m.x0) * t,
            z = m.z0 + (m.z1 - m.z0) * t;
          if (w.heightAt(x, z) < m.h0 + (m.h1 - m.h0) * t - 0.15) ok = false;
        }
        if (ok) smooth++;
      }
      expect(smooth / n, `graine ${seed} : rampes intactes (une combe peut en couper)`).toBeGreaterThan(0.6);
      let low = 0;
      for (const c of w.combes) if (w.heightAt(c.pts[2], c.pts[3]) < -1) low++;
      expect(low).toBeGreaterThanOrEqual(w.combes.length - 1);
    }
  });
  it('pente ≤ TERRAIN.maxSlope partout, sur la carte du jeu et 12 graines ; il y a bien du relief', () => {
    for (const seed of [MAP.seed, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const w = new World(seed);
      expect(maxSlope(w), `graine ${seed}`).toBeLessThanOrEqual(TERRAIN.maxSlope + 1e-3);
      let top = 0;
      for (let k = 0; k < w.height.length; k++) top = Math.max(top, w.height[k]);
      expect(top, `graine ${seed}`).toBeGreaterThan(2.5);
      expect(top).toBeLessThanOrEqual(Math.max(TERRAIN.peak, TERRAIN.mountain[1]) + 0.01); // phase 28 : montagnes des pistes
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
