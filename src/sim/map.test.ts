// Carte construite (phase 16) : connexité garantie, espacement des obstacles, déterminisme, murets franchis d'un saut,
// ennemis qui contournent un ouvrage par le champ de flux, tirs arrêtés par les obstacles.
import { describe, expect, it } from 'vitest';
import { FLOW, MAP, PLAY_LIMIT, PLAYER, STEP, WORLD_HALF } from './balance';
import { segDist } from './map';
import { spawnEnemy } from './spawner';
import { step } from './step';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const input = (mx: number, mz: number, jump = false): Input => ({ mx, mz, jump, spell: false, pick: 0 });

/** Distance libre de (x, z) au bord du plus proche obstacle (toute la carte, sans grille : test seulement). */
function freeAt(w: World, x: number, z: number): number {
  let best = Infinity;
  for (const o of w.obstacles) best = Math.min(best, Math.hypot(x - o.x, z - o.z) - o.r);
  for (const s of w.walls) best = Math.min(best, segDist(x, z, s.x1, s.z1, s.x2, s.z2) - s.r);
  return best;
}

/**
 * Connexité pour un ennemi de rayon `rad` : grille de G u sur la zone jouable, une case est libre si son centre est à
 * plus de `rad` de tout obstacle ; diffusion depuis le départ. Renvoie le nombre de cases libres jamais atteintes.
 * G = 0,25 : plus fin que la plus petite marge de passage (0,5 u), sinon la grille fermerait de vrais passages.
 */
const G = 0.25;
function unreachable(w: World, rad: number): { free: number; lost: number } {
  const H = Math.floor(PLAY_LIMIT / G),
    N = 2 * H;
  const free = new Uint8Array(N * N);
  // marquage par obstacle (rapide) : tout libre, puis on bouche les cases proches de chaque obstacle (distances au carré,
  // boucles sans fermeture : le test tourne aussi sous instrumentation de couverture en CI)
  free.fill(1);
  const span = (lo: number, hi: number): [number, number] => [Math.max(0, Math.floor(lo / G + H)), Math.min(N - 1, Math.floor(hi / G + H))];
  for (const o of w.obstacles) {
    const m = o.r + rad,
      m2 = m * m;
    const [i0, i1] = span(o.x - m, o.x + m),
      [j0, j1] = span(o.z - m, o.z + m);
    for (let i = i0; i <= i1; i++) {
      const dx = (i - H + 0.5) * G - o.x;
      for (let j = j0; j <= j1; j++) {
        const dz = (j - H + 0.5) * G - o.z;
        if (dx * dx + dz * dz < m2) free[j * N + i] = 0;
      }
    }
  }
  for (const s of w.walls) {
    const m = s.r + rad;
    const [i0, i1] = span(Math.min(s.x1, s.x2) - m, Math.max(s.x1, s.x2) + m),
      [j0, j1] = span(Math.min(s.z1, s.z2) - m, Math.max(s.z1, s.z2) + m);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        if (segDist((i - H + 0.5) * G, (j - H + 0.5) * G, s.x1, s.z1, s.x2, s.z2) < m) free[j * N + i] = 0;
  }
  const seen = new Uint8Array(N * N);
  const q = new Int32Array(N * N);
  let head = 0,
    tail = 0;
  const s0 = H * N + H;
  seen[s0] = 1;
  q[tail++] = s0;
  while (head < tail) {
    const c = q[head++];
    const i = c % N,
      j = (c - i) / N;
    // 4 voisines, sans tableau temporaire
    const push = (n: number) => {
      if (!seen[n] && free[n]) {
        seen[n] = 1;
        q[tail++] = n;
      }
    };
    if (i + 1 < N) push(c + 1);
    if (i > 0) push(c - 1);
    if (j + 1 < N) push(c + N);
    if (j > 0) push(c - N);
  }
  let nFree = 0,
    lost = 0;
  for (let c = 0; c < N * N; c++)
    if (free[c]) {
      nFree++;
      if (!seen[c]) lost++;
    }
  return { free: nFree, lost };
}

describe('carte construite (phases 16 et 27)', () => {
  it('toute case libre est atteignable par une Brute élite : la carte du jeu et 24 seeds', { timeout: 120_000 }, () => {
    const rad = 1.25; // Brute élite : r 1,0 × 1,25
    for (const seed of [MAP.seed, ...Array.from({ length: 24 }, (_, i) => i + 1)]) {
      const w = new World(seed);
      const { free, lost } = unreachable(w, rad);
      expect(free * G * G, `seed ${seed} : aire libre`).toBeGreaterThan(50_000);
      expect(lost, `seed ${seed} : cases libres isolées`).toBe(0);
    }
  });
  it('chaque carte a des ruines, des cercles de pierres et des troncs ; la clairière de départ est vide', () => {
    for (const seed of [MAP.seed, 3, 17, 42]) {
      const w = new World(seed);
      const murets = w.walls.filter((s) => s.kind === 0).length,
        troncs = w.walls.filter((s) => s.kind === 1).length;
      // phase 27 : lieux seulement sur le plat, six sortes (ruines, cercles, troncs, cimetières, campements, citrouilles)
      expect(w.places.length, `seed ${seed}`).toBeGreaterThanOrEqual(20); // phase 28 : les grandes pistes prennent de la place
      expect(murets, `seed ${seed}`).toBeGreaterThan(10);
      expect(troncs, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(w.stoneCenters.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(w.yards.length + w.camps.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(w.walls.filter((s) => s.kind === 2).length, `seed ${seed} : clôtures`).toBe(8 * w.yards.length);
      expect(w.stoneEnd - w.rockEnd).toBeGreaterThanOrEqual(6 * w.stoneCenters.length);
      expect(w.obstacles.length - w.stoneEnd).toBe(5 * w.yards.length + MAP.campItems * w.camps.length);
      expect(w.propKinds.length).toBe(w.obstacles.length - w.stoneEnd);
      expect(freeAt(w, 0, 0)).toBeGreaterThan(MAP.start - 1.5);
      for (const p of w.places) expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(MAP.startClear);
    }
  });
  it('arbres et rochers épars laissent MAP.pass de passage entre eux et avec les ouvrages', () => {
    const w = new World(8);
    const circles = w.obstacles.slice(0, w.rockEnd);
    for (let i = 0; i < circles.length; i++) {
      const a = circles[i];
      for (let j = i + 1; j < circles.length; j++) {
        const b = circles[j];
        if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r).toBeGreaterThanOrEqual(MAP.pass - 1e-9);
      }
      for (const s of w.walls) expect(segDist(a.x, a.z, s.x1, s.z1, s.x2, s.z2) - s.r - a.r).toBeGreaterThanOrEqual(MAP.pass - 1e-9);
    }
  });
  it('même seed, même carte', () => {
    const a = new World(21),
      b = new World(21);
    expect(b.obstacles).toEqual(a.obstacles);
    expect(b.walls).toEqual(a.walls);
    expect(Array.from(b.solid)).toEqual(Array.from(a.solid));
  });
  it('toute case libre de la grille du flux est atteinte depuis le joueur (aucune poche à cette résolution)', () => {
    for (const seed of [MAP.seed, 1, 2, 3, 9, 14]) {
      const w = new World(seed);
      for (const [px, pz] of [
        [0, 0],
        [60, -40],
        [-90, 100],
      ]) {
        w.player.x = px;
        w.player.z = pz;
        w.flow.compute(w);
        const S = FLOW.half * 2;
        let lost = 0;
        // le champ est local (fenêtre de 2 × FLOW.half cases) : une case du bord peut n'être atteinte que par un détour
        // hors fenêtre ; on vérifie l'intérieur (marge de 10 cases), où se joue la poursuite
        for (let lj = 10; lj < S - 10; lj++)
          for (let li = 10; li < S - 10; li++) {
            const gi = li + w.flow.oi,
              gj = lj + w.flow.oj;
            if (gi < 0 || gj < 0 || gi >= w.solidN || gj >= w.solidN) continue;
            if (!w.solid[gj * w.solidN + gi] && w.flow.dist[lj * S + li] < 0) lost++;
          }
        expect(lost, `seed ${seed} joueur ${px},${pz}`).toBe(0);
      }
    }
  });
  it('la grille des cases pleines couvre les murets', () => {
    const w = new World(5);
    const s = w.walls[0];
    const mx = (s.x1 + s.x2) / 2,
      mz = (s.z1 + s.z2) / 2;
    const i = Math.floor((mx + WORLD_HALF) / FLOW.cell),
      j = Math.floor((mz + WORLD_HALF) / FLOW.cell);
    let any = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) any |= w.solid[(j + b) * w.solidN + i + a];
    expect(any).toBe(1);
  });
});

/** Monde vide d'obstacles avec un seul muret en U (ouvert vers +z, brèche au fond) ; le joueur à l'intérieur. */
function uWorld(): World {
  const w = new World(1);
  w.weapons = {};
  w.obstacles = [];
  w.walls = [];
  w.obstacleGrid.clear();
  w.wallGrid.clear();
  w.lakes = [];
  // U fermé au sud (z = −4) sans brèche, côtés en x = ±4, ouvert au nord : l'ennemi au sud doit faire le tour
  const add = (x1: number, z1: number, x2: number, z2: number) => {
    w.walls.push({ x1, z1, x2, z2, r: MAP.wallR, h: MAP.wallH, kind: 0 });
    const i = w.walls.length - 1;
    for (let cx = Math.floor((Math.min(x1, x2) - 1) / 6); cx <= Math.floor((Math.max(x1, x2) + 1) / 6); cx++)
      for (let cz = Math.floor((Math.min(z1, z2) - 1) / 6); cz <= Math.floor((Math.max(z1, z2) + 1) / 6); cz++) {
        const k = cx * 65536 + cz;
        const arr = w.wallGrid.get(k) ?? [];
        arr.push(i);
        w.wallGrid.set(k, arr);
      }
  };
  add(-4, -4, 4, -4);
  add(-4, -4, -4, 4);
  add(4, -4, 4, 4);
  w.solid.fill(0);
  const C = FLOW.cell,
    N = w.solidN;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = -WORLD_HALF + (i + 0.5) * C,
        z = -WORLD_HALF + (j + 0.5) * C;
      for (const s of w.walls) if (segDist(x, z, s.x1, s.z1, s.x2, s.z2) < s.r + FLOW.clear) w.solid[j * N + i] = 1;
    }
  w.player.x = w.player.px = 0;
  w.player.z = w.player.pz = 0;
  return w;
}

describe('marche autour des ouvrages (champ de flux)', () => {
  it('un Spectre au sud d’un U fermé fait le tour et rejoint le joueur', () => {
    const w = uWorld();
    const i = spawnEnemy(w, 0, Math.PI, 9); // plein sud, derrière le fond du U
    const e = w.enemies[i];
    e.spd = 1;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.spawnAcc = -1e9;
    let reached = false;
    for (let k = 0; k < 60 * 12 && !reached; k++) {
      step(w, still, STEP);
      if (Math.hypot(e.x - w.player.x, e.z - w.player.z) < e.r + PLAYER.radius + 0.2) reached = true;
    }
    expect(reached).toBe(true);
    // il n'a jamais traversé le muret
    expect(freeAt(w, e.x, e.z)).toBeGreaterThan(e.r - 0.05);
  });
  it('sans champ de flux (tout droit), le même Spectre resterait coincé contre le fond', () => {
    const w = uWorld();
    const i = spawnEnemy(w, 0, Math.PI, 9);
    const e = w.enemies[i];
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.spawnAcc = -1e9;
    (w.flow as unknown as { steer: () => void }).steer = () => {}; // désactive : out garde la direction directe
    for (let k = 0; k < 60 * 6; k++) step(w, still, STEP);
    expect(e.z).toBeLessThan(-4); // toujours derrière le fond du U
  });
  it('le joueur franchit un muret d’un saut, pas en marchant', () => {
    const w = uWorld();
    w.player.z = w.player.pz = -2.5; // dans le U, face au fond
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.spawnAcc = -1e9;
    for (let k = 0; k < 60; k++) step(w, input(0, -1), STEP);
    expect(w.player.z).toBeGreaterThan(-4); // bloqué
    step(w, input(0, -1, true), STEP);
    for (let k = 0; k < 50; k++) step(w, input(0, -1), STEP);
    expect(w.player.z).toBeLessThan(-4.8); // passé par-dessus
  });
  it('une flèche s’arrête sur un muret', () => {
    const w = uWorld();
    expect(w.blocksShot(0, -4, 0.3)).toBe(true);
    expect(w.blocksShot(0, 0, 0.3)).toBe(false);
  });
});
