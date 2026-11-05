// Relief (phase 18, PLAN §3.4) : carte de hauteur déterministe en collines douces. Construite une fois avec la carte
// (graine de la carte), lue par la sim (pente → vitesse) et par le rendu (sol déplacé, tout posé au sol local).
// Convention : dans la sim, y reste une hauteur au-dessus du sol local (saut, contact, murets inchangés).
import { SLOPE, TERRAIN, WORLD_HALF } from './balance';
import type { Rng } from './rng';
import type { World } from './world';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Nombre de nœuds par côté de la grille de hauteurs. */
export const TERRAIN_N = Math.round((2 * WORLD_HALF) / TERRAIN.cell) + 1;

/** Construit w.height : collines, ondulation, aplanissements (départ, lacs, lieux), pente bornée. */
export function buildTerrain(w: World, r: Rng): void {
  const N = TERRAIN_N,
    C = TERRAIN.cell,
    H = w.height;
  H.fill(0);
  // 1. collines gaussiennes (σ = rayon / 2), hauteur bornée pour que la pente au flanc reste douce
  for (let k = 0; k < TERRAIN.hills; k++) {
    const cx = r.range(-WORLD_HALF, WORLD_HALF),
      cz = r.range(-WORLD_HALF, WORLD_HALF),
      rad = r.range(TERRAIN.rMin, TERRAIN.rMax),
      sig = rad / 2,
      h = Math.min(r.range(TERRAIN.hMin, TERRAIN.hMax), TERRAIN.maxSlope * sig * 1.4);
    const i0 = Math.max(0, Math.floor((cx - rad * 1.6 + WORLD_HALF) / C)),
      i1 = Math.min(N - 1, Math.ceil((cx + rad * 1.6 + WORLD_HALF) / C)),
      j0 = Math.max(0, Math.floor((cz - rad * 1.6 + WORLD_HALF) / C)),
      j1 = Math.min(N - 1, Math.ceil((cz + rad * 1.6 + WORLD_HALF) / C));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = -WORLD_HALF + i * C - cx,
          dz = -WORLD_HALF + j * C - cz;
        H[j * N + i] += h * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
      }
  }
  // 2. ondulation lente (deux sinusoïdes déphasées par la graine)
  const p1 = r.range(0, 6.283),
    p2 = r.range(0, 6.283),
    f = 6.283 / TERRAIN.waveLen;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * C,
        z = -WORLD_HALF + j * C;
      H[j * N + i] += TERRAIN.wave * (Math.sin(x * f + p1) * Math.cos(z * f * 0.8 + p2) + 1);
    }
  // sommets adoucis : là où des collines se chevauchent, la hauteur sature vers TERRAIN.peak
  for (let k = 0; k < H.length; k++) H[k] = TERRAIN.peak * Math.tanh(H[k] / TERRAIN.peak);
  // 3. aplanissements : clairière de départ (à 0), lacs (cuvette plate), puis lieux construits (à leur hauteur moyenne,
  // en dernier : rien ne les déforme ensuite)
  flattenDisk(w, 0, 0, TERRAIN.startFlat, TERRAIN.startBlend, 0);
  for (const l of w.lakes)
    flattenDisk(w, l.x, l.z, l.r, TERRAIN.lakeBlend, Math.max(0, sampleMean(w, l.x, l.z, l.r) - TERRAIN.lakeDepth));
  for (const pl of w.places) {
    // un lieu voisin du départ se pose au niveau de la clairière (sinon son aplat mordrait la clairière)
    const d = Math.hypot(pl.x, pl.z) - pl.r - TERRAIN.placeBlend;
    const near = smooth(TERRAIN.startFlat, TERRAIN.startFlat + TERRAIN.startBlend, d);
    flattenDisk(w, pl.x, pl.z, pl.r, TERRAIN.placeBlend, sampleMean(w, pl.x, pl.z, pl.r) * near);
  }
  // 4. pente bornée : passes de Lipschitz (on n'abaisse que ce qui dépasse un voisin + maxSlope · distance)
  limitSlope(H, N, C);
}

/** Hauteur moyenne échantillonnée dans un disque (grille). */
function sampleMean(w: World, x: number, z: number, rad: number): number {
  let s = 0,
    n = 0;
  for (let dz = -rad; dz <= rad; dz += TERRAIN.cell)
    for (let dx = -rad; dx <= rad; dx += TERRAIN.cell) {
      if (dx * dx + dz * dz > rad * rad) continue;
      s += w.heightAt(x + dx, z + dz);
      n++;
    }
  return n ? s / n : 0;
}

/** Ramène le sol à `level` dans le disque, fondu en smoothstep sur `blend` u autour. */
function flattenDisk(w: World, x: number, z: number, rad: number, blend: number, level: number): void {
  const N = TERRAIN_N,
    C = TERRAIN.cell,
    H = w.height,
    out = rad + blend;
  const i0 = Math.max(0, Math.floor((x - out + WORLD_HALF) / C)),
    i1 = Math.min(N - 1, Math.ceil((x + out + WORLD_HALF) / C)),
    j0 = Math.max(0, Math.floor((z - out + WORLD_HALF) / C)),
    j1 = Math.min(N - 1, Math.ceil((z + out + WORLD_HALF) / C));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-WORLD_HALF + i * C - x, -WORLD_HALF + j * C - z);
      const t = smooth(rad, out, d); // 0 dans le disque, 1 au-delà du fondu
      H[j * N + i] = level + (H[j * N + i] - level) * t;
    }
}

/** Impose |h(a) − h(b)| ≤ maxSlope · d entre voisins (8-connexité) par passes aller-retour ; abaisse les excès. */
function limitSlope(H: Float32Array, N: number, C: number): void {
  const d1 = TERRAIN.maxSlope * C * 0.98,
    d2 = d1 * Math.SQRT2;
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    for (let dir = 0; dir < 2; dir++) {
      const step = dir === 0 ? 1 : -1;
      for (let jj = 0; jj < N; jj++) {
        const j = dir === 0 ? jj : N - 1 - jj;
        for (let ii = 0; ii < N; ii++) {
          const i = dir === 0 ? ii : N - 1 - ii;
          const k = j * N + i;
          let m = H[k];
          const pi = i - step,
            pj = j - step;
          if (pi >= 0 && pi < N) m = Math.min(m, H[j * N + pi] + d1);
          if (pj >= 0 && pj < N) {
            m = Math.min(m, H[pj * N + i] + d1);
            if (pi >= 0 && pi < N) m = Math.min(m, H[pj * N + pi] + d2);
            const qi = i + step;
            if (qi >= 0 && qi < N) m = Math.min(m, H[pj * N + qi] + d2);
          }
          if (m < H[k] - 1e-6) {
            H[k] = m;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/** Hauteur du sol en (x, z), interpolation bilinéaire. Bornée au bord de la carte. Aucune allocation. */
export function heightAt(H: Float32Array, x: number, z: number): number {
  const N = TERRAIN_N,
    C = TERRAIN.cell;
  let fx = (x + WORLD_HALF) / C,
    fz = (z + WORLD_HALF) / C;
  fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > N - 1.001 ? N - 1.001 : fz;
  const i = fx | 0,
    j = fz | 0,
    tx = fx - i,
    tz = fz - j,
    k = j * N + i;
  const a = H[k] + (H[k + 1] - H[k]) * tx,
    b = H[k + N] + (H[k + N + 1] - H[k + N]) * tx;
  return a + (b - a) * tz;
}

/** Pente dans la direction (vx, vz) (non normalisée) : dh/ds, positive en montée. */
export function slopeAlong(H: Float32Array, x: number, z: number, vx: number, vz: number): number {
  const l = Math.sqrt(vx * vx + vz * vz);
  if (l < 1e-6) return 0;
  const e = TERRAIN.cell * 0.5,
    ux = vx / l,
    uz = vz / l;
  return (heightAt(H, x + ux * e, z + uz * e) - heightAt(H, x - ux * e, z - uz * e)) / (2 * e);
}

/** Multiplicateur de vitesse dû à la pente (montée plus lente, descente plus rapide), borné par SLOPE. */
export function slopeMul(H: Float32Array, x: number, z: number, vx: number, vz: number): number {
  const m = 1 - SLOPE.k * slopeAlong(H, x, z, vx, vz);
  return m < SLOPE.min ? SLOPE.min : m > SLOPE.max ? SLOPE.max : m;
}
