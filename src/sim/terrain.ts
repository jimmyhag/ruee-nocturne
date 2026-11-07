// Relief (phase 27, PLAN §3.4) : carte de hauteur déterministe en plans nets. Plateaux à flancs plans (rectangles
// arrondis), terrasses, longues rampes du sol au sommet (pistes de glisse) et combes (tranchées à fond plat). Construite
// une fois avec la carte (graine de la carte), lue par la sim (pente → vitesse, glissade) et par le rendu (sol déplacé,
// tout posé au sol local). Convention : dans la sim, y reste une hauteur au-dessus du sol local.
// Exécuté à la création du monde : les allocations y sont permises.
import { PLAY_LIMIT, SLOPE, TERRAIN, WORLD_HALF } from './balance';
import type { Rng } from './rng';
import type { World } from './world';

/** Nombre de nœuds par côté de la grille de hauteurs. */
export const TERRAIN_N = Math.round((2 * WORLD_HALF) / TERRAIN.cell) + 1;

/** Plateau posé (lu par la génération des points d'intérêt : sommets, pieds de rampes). */
export interface Plateau {
  x: number;
  z: number;
  a: number; // demi-côtés
  b: number;
  th: number; // orientation
  top: number;
}
/** Rampe : de (x0, z0) à hauteur h0 jusqu'à (x1, z1) à hauteur h1. */
export interface Ramp {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h0: number;
  h1: number;
  half: number;
}

const pick = (r: Rng, [a, b]: number[]): number => r.range(a, b);

/** Applique `f` (contribution de hauteur, ou NaN pour « rien ») aux nœuds de la boîte, en gardant le maximum. */
function raise(H: Float32Array, x0: number, x1: number, z0: number, z1: number, f: (x: number, z: number) => number): void {
  const N = TERRAIN_N,
    C = TERRAIN.cell;
  const i0 = Math.max(0, Math.floor((x0 + WORLD_HALF) / C)),
    i1 = Math.min(N - 1, Math.ceil((x1 + WORLD_HALF) / C)),
    j0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / C)),
    j1 = Math.min(N - 1, Math.ceil((z1 + WORLD_HALF) / C));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const v = f(-WORLD_HALF + i * C, -WORLD_HALF + j * C);
      if (v > H[j * N + i]) H[j * N + i] = v;
    }
}

/** Plateau : sommet plat, flancs plans de pente TERRAIN.bank (distance signée au rectangle arrondi). */
function addPlateau(H: Float32Array, p: Plateau): void {
  const c = Math.cos(p.th),
    s = Math.sin(p.th),
    rc = Math.min(p.a, p.b) * 0.45,
    reach = Math.max(p.a, p.b) + p.top / TERRAIN.bank + 2;
  raise(H, p.x - reach, p.x + reach, p.z - reach, p.z + reach, (x, z) => {
    const dx = x - p.x,
      dz = z - p.z;
    const u = Math.abs(dx * c + dz * s) - (p.a - rc),
      v = Math.abs(-dx * s + dz * c) - (p.b - rc);
    const d = Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - rc;
    return p.top - TERRAIN.bank * Math.max(0, d);
  });
}

/** Rampe : plan incliné de h0 (départ) à h1 (arrivée), bords latéraux et extrémités en flancs de pente TERRAIN.bank. */
function addRamp(H: Float32Array, m: Ramp): void {
  const L = Math.hypot(m.x1 - m.x0, m.z1 - m.z0),
    ux = (m.x1 - m.x0) / L,
    uz = (m.z1 - m.z0) / L,
    hi = Math.max(m.h0, m.h1),
    reach = m.half + hi / TERRAIN.bank + 2;
  raise(H, Math.min(m.x0, m.x1) - reach, Math.max(m.x0, m.x1) + reach, Math.min(m.z0, m.z1) - reach, Math.max(m.z0, m.z1) + reach, (x, z) => {
    const dx = x - m.x0,
      dz = z - m.z0;
    const t = dx * ux + dz * uz,
      lat = Math.abs(-dx * uz + dz * ux);
    let h: number;
    if (t < 0) h = m.h0 + TERRAIN.bank * t;
    else if (t > L) h = m.h1 - TERRAIN.bank * (t - L);
    else h = m.h0 + ((m.h1 - m.h0) * t) / L;
    return h - TERRAIN.bank * Math.max(0, lat - m.half);
  });
}

/** Combe : fond plat à −depth le long d'une ligne brisée, flancs plans ; creuse (minimum) ce qui est au-dessus. */
function addCombe(H: Float32Array, pts: number[], half: number, depth: number): void {
  const N = TERRAIN_N,
    C = TERRAIN.cell;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k],
      az = pts[k + 1],
      bx = pts[k + 2],
      bz = pts[k + 3];
    const reach = half + (TERRAIN.peak + depth) / TERRAIN.bank;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + WORLD_HALF) / C)),
      i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + WORLD_HALF) / C)),
      j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + WORLD_HALF) / C)),
      j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + WORLD_HALF) / C));
    const ux = bx - ax,
      uz = bz - az,
      l2 = ux * ux + uz * uz;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = -WORLD_HALF + i * C,
          z = -WORLD_HALF + j * C;
        let t = ((x - ax) * ux + (z - az) * uz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (ax + ux * t), z - (az + uz * t));
        const v = -depth + TERRAIN.bank * Math.max(0, d - half);
        if (v < H[j * N + i]) H[j * N + i] = v;
      }
  }
}

/** Pose un disque à `level` ; autour, le sol est ramené vers ce niveau à la pente des flancs (raccord net, sans bosse). */
function flatten(H: Float32Array, x: number, z: number, rad: number, level: number): void {
  const N = TERRAIN_N,
    C = TERRAIN.cell,
    out = rad + (TERRAIN.peak + TERRAIN.lakeDepth + 4) / TERRAIN.bank;
  const i0 = Math.max(0, Math.floor((x - out + WORLD_HALF) / C)),
    i1 = Math.min(N - 1, Math.ceil((x + out + WORLD_HALF) / C)),
    j0 = Math.max(0, Math.floor((z - out + WORLD_HALF) / C)),
    j1 = Math.min(N - 1, Math.ceil((z + out + WORLD_HALF) / C));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-WORLD_HALF + i * C - x, -WORLD_HALF + j * C - z);
      const k = j * N + i,
        m = TERRAIN.bank * Math.max(0, d - rad);
      const dh = H[k] - level;
      H[k] = level + (dh > m ? m : dh < -m ? -m : dh);
    }
}

/** Construit w.height (et w.plateaus, w.ramps) : plateaux, terrasses, rampes, combes, puis aplats et pente bornée. */
export function buildTerrain(w: World, r: Rng): void {
  const H = w.height;
  H.fill(0);
  const T = TERRAIN,
    lim = PLAY_LIMIT - 16;
  // 1. plateaux, chacun avec une ou deux rampes ; une terrasse sur certains (et sa rampe depuis le plateau)
  for (let k = 0, tries = 0; k < T.plateaus && tries < 400; tries++) {
    const a = r.range(T.plateauMin, T.plateauMax),
      b = r.range(T.plateauMin, T.plateauMax),
      x = r.range(-lim, lim),
      z = r.range(-lim, lim),
      th = r.range(0, Math.PI),
      top = T.levels[Math.floor(r.next() * T.levels.length)];
    const big = Math.max(a, b);
    if (Math.hypot(x, z) < T.startFlat + big * 0.8 + 6) continue; // la clairière (à plat) rogne le flanc voisin
    if (w.lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + big + 6)) continue;
    if (w.plateaus.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.a, p.b) + big + 4)) continue;
    const p: Plateau = { x, z, a, b, th, top };
    w.plateaus.push(p);
    addPlateau(H, p);
    const c = Math.cos(th),
      s = Math.sin(th);
    const nr = 1 + (r.next() < 0.55 ? 1 : 0);
    const side0 = Math.floor(r.next() * 4);
    for (let q = 0; q < nr; q++) {
      const side = (side0 + q * 2) % 4; // deux rampes : côtés opposés
      // normale sortante et demi-côté de ce bord (repère local du plateau)
      const nx = side === 0 ? 1 : side === 1 ? -1 : 0,
        nz = side === 2 ? 1 : side === 3 ? -1 : 0;
      const ext = nx !== 0 ? a : b,
        along = nx !== 0 ? b : a;
      const off = r.range(-along * 0.4, along * 0.4);
      const lx = nx * ext + (nz !== 0 ? off : 0),
        lz = nz * ext + (nx !== 0 ? off : 0);
      const ex = x + lx * c - lz * s,
        ez = z + lx * s + lz * c,
        wx = nx * c - nz * s,
        wz = nx * s + nz * c,
        L = pick(r, T.rampLen) * (top / 4);
      const m: Ramp = { x0: ex - wx * 1.5, z0: ez - wz * 1.5, x1: ex + wx * L, z1: ez + wz * L, h0: top, h1: 0, half: pick(r, T.rampHalf) };
      w.ramps.push(m);
      addRamp(H, m);
    }
    if (r.next() < T.terrace) {
      const a2 = a * 0.45,
        b2 = b * 0.45,
        ox = r.range(-(a - a2) * 0.5, (a - a2) * 0.5),
        oz = r.range(-(b - b2) * 0.5, (b - b2) * 0.5);
      const tx = x + ox * c - oz * s,
        tz = z + ox * s + oz * c,
        top2 = top + T.terraceUp;
      w.plateaus.push({ x: tx, z: tz, a: a2, b: b2, th, top: top2 });
      addPlateau(H, { x: tx, z: tz, a: a2, b: b2, th, top: top2 });
      // rampe de la terrasse : vers l'intérieur du plateau (pente ≈ 2 / 10)
      const dir = ox >= 0 ? -1 : 1,
        wx = dir * c,
        wz = dir * s,
        sx = tx + wx * a2,
        sz = tz + wz * a2;
      const m: Ramp = { x0: sx - wx, z0: sz - wz, x1: sx + wx * 10, z1: sz + wz * 10, h0: top2, h1: top, half: 3 };
      w.ramps.push(m);
      addRamp(H, m);
    }
    k++;
  }
  // 2. combes : lignes brisées (deux segments) loin du départ
  for (let k = 0, tries = 0; k < T.combes && tries < 200; tries++) {
    const x = r.range(-lim, lim),
      z = r.range(-lim, lim);
    if (Math.hypot(x, z) < T.startFlat + 24) continue;
    const a1 = r.range(0, Math.PI * 2),
      a2 = a1 + r.range(-0.9, 0.9),
      l1 = pick(r, T.combeLen),
      l2 = pick(r, T.combeLen);
    const pts = [x, z, x + Math.cos(a1) * l1, z + Math.sin(a1) * l1];
    pts.push(pts[2] + Math.cos(a2) * l2, pts[3] + Math.sin(a2) * l2);
    let ok = true;
    for (let q = 0; q < pts.length; q += 2) if (Math.abs(pts[q]) > lim || Math.abs(pts[q + 1]) > lim) ok = false;
    // tout le tracé (échantillonné tous les 2 u) reste loin de la clairière de départ
    for (let q = 0; q + 3 < pts.length && ok; q += 2)
      for (let t = 0; t <= 1; t += 2 / Math.max(l1, l2))
        if (Math.hypot(pts[q] + (pts[q + 2] - pts[q]) * t, pts[q + 1] + (pts[q + 3] - pts[q + 1]) * t) < T.startFlat + 16) ok = false;
    if (!ok) continue;
    const half = pick(r, T.combeHalf);
    w.combes.push({ pts, half });
    addCombe(H, pts, half, pick(r, T.combeDepth));
    k++;
  }
  // 3. aplats : lacs (cuvette), clairière de départ (à 0) en dernier
  for (const l of w.lakes) flatten(H, l.x, l.z, l.r, Math.min(0, w.heightAt(l.x, l.z)) - T.lakeDepth);
  flatten(H, 0, 0, T.startFlat + T.cell, 0); // une case de marge : l’interpolation reste à 0 jusqu’au bord
  // 4. garde-fou : pente bornée (les raccords et les croisements de formes restent sous TERRAIN.bank en pratique)
  limitSlope(H, TERRAIN_N, T.cell);
}

/** Écart de hauteur sur un disque (centre + 2 anneaux de 8 points) : les lieux construits ne se posent que sur le plat. */
export function unevenness(w: World, x: number, z: number, rad: number): number {
  let lo = w.heightAt(x, z),
    hi = lo;
  for (let ring = 1; ring <= 2; ring++)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2,
        d = (rad * ring) / 2,
        h = w.heightAt(x + Math.cos(a) * d, z + Math.sin(a) * d);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  return hi - lo;
}

/** Après la carte : chaque lieu construit est posé exactement à plat (il a été choisi sur un terrain presque plat). */
export function settlePlaces(w: World): void {
  for (const pl of w.places) flatten(w.height, pl.x, pl.z, pl.r * TERRAIN.placeR, w.heightAt(pl.x, pl.z));
  flatten(w.height, 0, 0, TERRAIN.startFlat + TERRAIN.cell, 0); // la clairière de départ reste exactement plate
  limitSlope(w.height, TERRAIN_N, TERRAIN.cell);
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

/** Gradient du sol (dh/dx, dh/dz) en (x, z), écrit dans out[0], out[1]. Aucune allocation. */
export function gradAt(H: Float32Array, x: number, z: number, out: Float64Array): void {
  const e = TERRAIN.cell * 0.5;
  out[0] = (heightAt(H, x + e, z) - heightAt(H, x - e, z)) / (2 * e);
  out[1] = (heightAt(H, x, z + e) - heightAt(H, x, z - e)) / (2 * e);
}
