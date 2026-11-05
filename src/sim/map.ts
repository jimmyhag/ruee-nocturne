// Carte construite (phase 16, PLAN §3.4). Les lieux (ruines, cercles de pierres, troncs couchés) sont posés par la seed
// sur une grille de secteurs, puis les arbres et rochers épars autour. Règle d'accès : deux obstacles d'ouvrages
// différents laissent toujours MAP.pass u de passage, et chaque ouvrage a des brèches. Exécuté une fois à la création
// du monde : les allocations y sont permises (rien ici ne tourne pendant un run).
import { DECOR, ELITE, ENEMIES, FLOW, MAP, PLAY_LIMIT, TREE_CELL, WORLD_HALF, ZONES } from './balance';

/** Plus gros rayon d'un marcheur (élite comprise, boss exclus) : marge de la grille `near` hors de laquelle la collision est sautée. */
const ENEMY_MAX_R = Math.max(...ENEMIES.filter((d) => !d.boss).map((d) => d.r)) * ELITE.rMul;
import type { Rng } from './rng';
import type { Obstacle, Wall, World } from './world';

const TAU = Math.PI * 2;

/** Clé de la grille d'obstacles (cellules de TREE_CELL u). */
export const cellKey = (cx: number, cz: number): number => cx * 65536 + cz;

/** Distance du point (x, z) au segment (ax, az)–(bx, bz). */
export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const ux = bx - ax,
    uz = bz - az,
    l2 = ux * ux + uz * uz;
  let t = l2 > 1e-9 ? ((x - ax) * ux + (z - az) * uz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (ax + ux * t),
    dz = z - (az + uz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Distance minimale entre deux segments (pour l'espacement des troncs ; quatre distances point-segment suffisent hors croisement). */
function segSegDist(a: Wall, b: Wall): number {
  return Math.min(
    segDist(a.x1, a.z1, b.x1, b.z1, b.x2, b.z2),
    segDist(a.x2, a.z2, b.x1, b.z1, b.x2, b.z2),
    segDist(b.x1, b.z1, a.x1, a.z1, a.x2, a.z2),
    segDist(b.x2, b.z2, a.x1, a.z1, a.x2, a.z2),
  );
}

/** Ajoute un obstacle circulaire (arbre, rocher, menhir) et l'indexe dans la grille. */
function addCircle(w: World, x: number, z: number, r: number): void {
  w.obstacles.push({ x, z, r });
  const k = cellKey(Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL));
  let arr = w.obstacleGrid.get(k);
  if (!arr) w.obstacleGrid.set(k, (arr = []));
  arr.push(w.obstacles.length - 1);
}

/** Ajoute un muret ou un tronc et l'indexe dans toutes les cellules que couvre sa boîte englobante (marge r). */
function addWall(w: World, x1: number, z1: number, x2: number, z2: number, r: number, h: number, kind: number): void {
  w.walls.push({ x1, z1, x2, z2, r, h, kind });
  const i = w.walls.length - 1;
  const c0x = Math.floor((Math.min(x1, x2) - r) / TREE_CELL),
    c1x = Math.floor((Math.max(x1, x2) + r) / TREE_CELL),
    c0z = Math.floor((Math.min(z1, z2) - r) / TREE_CELL),
    c1z = Math.floor((Math.max(z1, z2) + r) / TREE_CELL);
  for (let cx = c0x; cx <= c1x; cx++)
    for (let cz = c0z; cz <= c1z; cz++) {
      const k = cellKey(cx, cz);
      let arr = w.wallGrid.get(k);
      if (!arr) w.wallGrid.set(k, (arr = []));
      arr.push(i);
    }
}

/**
 * Plus petite distance libre entre (x, z) et le bord des obstacles voisins (grille 3 × 3 : un obstacle de rayon ≤ 1,2
 * plus MAP.pass plus un nouveau rayon ≤ 1,2 tient dans une cellule de 6 u). Négatif = dans un obstacle.
 */
function clearance(w: World, x: number, z: number): number {
  const tx = Math.floor(x / TREE_CELL),
    tz = Math.floor(z / TREE_CELL);
  let best = Infinity;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const k = cellKey(tx + a, tz + b);
      const cs = w.obstacleGrid.get(k);
      if (cs)
        for (const i of cs) {
          const o = w.obstacles[i];
          best = Math.min(best, Math.hypot(x - o.x, z - o.z) - o.r);
        }
      const ws = w.wallGrid.get(k);
      if (ws)
        for (const i of ws) {
          const s = w.walls[i];
          best = Math.min(best, segDist(x, z, s.x1, s.z1, s.x2, s.z2) - s.r);
        }
    }
  return best;
}

function inDisk(list: Obstacle[], x: number, z: number, pad: number): boolean {
  for (const d of list) if ((x - d.x) ** 2 + (z - d.z) ** 2 < (d.r + pad) ** 2) return true;
  return false;
}

/** Murets d'une ruine, en coordonnées locales (un segment = [x1, z1, x2, z2]) ; toujours au moins deux ouvertures. */
function ruinShape(kind: number): number[][] {
  const h = MAP.ruinHalf,
    b = MAP.breach / 2;
  switch (kind) {
    case 0: // L : deux bras ouverts
      return [
        [-h, -h, h, -h],
        [-h, -h, -h, h],
      ];
    case 1: // U : le fond a une brèche, le haut est ouvert
      return [
        [-h, -h, -b, -h],
        [b, -h, h, -h],
        [-h, -h, -h, h],
        [h, -h, h, h],
      ];
    case 2: {
      // enceinte brisée : une brèche au milieu de chaque côté
      const k = MAP.keepHalf;
      const out: number[][] = [];
      for (const [sx, sz, ex, ez] of [
        [-k, -k, k, -k],
        [k, -k, k, k],
        [k, k, -k, k],
        [-k, k, -k, -k],
      ]) {
        const mx = (sx + ex) / 2,
          mz = (sz + ez) / 2,
          ux = Math.sign(ex - sx),
          uz = Math.sign(ez - sz);
        out.push([sx, sz, mx - ux * b, mz - uz * b], [mx + ux * b, mz + uz * b, ex, ez]);
      }
      return out;
    }
    default: {
      // croix : quatre bras qui partent à 3 u du centre (entre deux bras voisins : 4,2 u, passage 3,3 u)
      const a = MAP.crossGap,
        e = MAP.crossGap + h;
      return [
        [0, a, 0, e],
        [0, -a, 0, -e],
        [a, 0, e, 0],
        [-a, 0, -e, 0],
      ];
    }
  }
}

function placeRuin(w: World, r: Rng, cx: number, cz: number): void {
  const segs = ruinShape(Math.floor(r.next() * 4));
  const th = r.range(0, TAU),
    c = Math.cos(th),
    s = Math.sin(th);
  for (const [x1, z1, x2, z2] of segs)
    addWall(w, cx + x1 * c - z1 * s, cz + x1 * s + z1 * c, cx + x2 * c - z2 * s, cz + x2 * s + z2 * c, MAP.wallR, MAP.wallH, 0);
}

function placeStones(w: World, r: Rng, cx: number, cz: number): void {
  const n = MAP.stonesMin + Math.floor(r.next() * (MAP.stonesMax - MAP.stonesMin + 1));
  const a0 = r.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    addCircle(w, cx + Math.sin(a) * MAP.stoneRing, cz + Math.cos(a) * MAP.stoneRing, MAP.stoneR);
  }
  w.stoneCenters.push({ x: cx, z: cz, r: MAP.stoneRing });
}

function placeLogs(w: World, r: Rng, cx: number, cz: number): void {
  const n = 2 + Math.floor(r.next() * 2);
  const th = r.range(0, TAU),
    ux = Math.cos(th),
    uz = Math.sin(th);
  const start = w.walls.length;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * MAP.logGap,
      shift = r.range(-MAP.logShift, MAP.logShift),
      half = r.range(MAP.logLen[0], MAP.logLen[1]) / 2,
      px = cx - uz * off + ux * shift,
      pz = cz + ux * off + uz * shift;
    const cand: Wall = { x1: px - ux * half, z1: pz - uz * half, x2: px + ux * half, z2: pz + uz * half, r: MAP.logR, h: MAP.logH, kind: 1 };
    let ok = true;
    for (let j = start; j < w.walls.length; j++) if (segSegDist(cand, w.walls[j]) < MAP.pass + 2 * MAP.logR) ok = false;
    if (ok) addWall(w, cand.x1, cand.z1, cand.x2, cand.z2, cand.r, cand.h, 1);
  }
}

/** Arbres et rochers : tirage par rejet, hors lacs, hors lieux, à MAP.pass de tout autre obstacle. */
function scatter(w: World, r: Rng, n: number, sMin: number, sMax: number, baseR: number, tries: number, pick: () => [number, number]): void {
  for (let i = 0; i < n; i++)
    for (let t = 0; t < tries; t++) {
      const [x, z] = pick();
      const rad = baseR * r.range(sMin, sMax);
      const edge = PLAY_LIMIT - rad - MAP.pass; // le bord de la zone jouable compte comme un mur
      if (Math.abs(x) > edge || Math.abs(z) > edge) continue;
      if (x * x + z * z < MAP.start * MAP.start) continue;
      if (inDisk(w.lakes, x, z, rad) || inDisk(w.places, x, z, 0)) continue;
      if (clearance(w, x, z) - rad < MAP.pass) continue;
      addCircle(w, x, z, rad);
      break;
    }
}

/** Génère toute la carte : lieux, bois, arbres et rochers épars, puis la grille des cases pleines (champ de flux). */
export function buildMap(w: World, r: Rng): void {
  // 1. lieux par secteur (hors lacs, bois et clairière de départ)
  const n = Math.floor((2 * (PLAY_LIMIT - MAP.edge)) / MAP.sector);
  const o = -(n * MAP.sector) / 2;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const cx = o + (i + 0.5) * MAP.sector + r.range(-MAP.jitter, MAP.jitter),
        cz = o + (j + 0.5) * MAP.sector + r.range(-MAP.jitter, MAP.jitter);
      const roll = r.next();
      if (cx * cx + cz * cz < MAP.startClear * MAP.startClear) continue;
      if (inDisk(w.lakes, cx, cz, MAP.footprint) || inDisk(w.woods, cx, cz, MAP.footprint)) continue;
      if (roll < MAP.ruins) placeRuin(w, r, cx, cz);
      else if (roll < MAP.ruins + MAP.stones) placeStones(w, r, cx, cz);
      else if (roll < MAP.ruins + MAP.stones + MAP.logs) placeLogs(w, r, cx, cz);
      else continue;
      w.places.push({ x: cx, z: cz, r: MAP.footprint });
    }
  const stoneEnd = w.obstacles.length; // menhirs : obstacles[0..stoneEnd)
  // 2. arbres : bois (bosquets) puis épars
  const woodsTrees = (): [number, number] => {
    const wd = w.woods[Math.floor(r.next() * w.woods.length)];
    const a = r.range(0, TAU),
      d = Math.sqrt(r.next()) * wd.r;
    return [wd.x + Math.sin(a) * d, wd.z + Math.cos(a) * d];
  };
  const anywhere = (): [number, number] => [r.range(-WORLD_HALF, WORLD_HALF), r.range(-WORLD_HALF, WORLD_HALF)];
  scatter(w, r, DECOR.woodTrees, 0.9, 1.6, 0.7, 1, woodsTrees);
  scatter(w, r, DECOR.trees, 0.8, 1.7, 0.7, 30, anywhere);
  const treeEnd = w.obstacles.length;
  // 3. rochers épars
  scatter(w, r, DECOR.rocks, 0.5, 1.4, 0.75, 30, anywhere);
  // ordre attendu par le rendu : arbres [0, treeCount), rochers [treeCount, rockEnd), menhirs [rockEnd, longueur)
  reorder(w, stoneEnd, treeEnd);
  buildSolid(w);
}

/** Remet les obstacles dans l'ordre arbres, rochers, menhirs (le rendu lit des plages d'indices) et refait la grille. */
function reorder(w: World, stoneEnd: number, treeEnd: number): void {
  const all = w.obstacles;
  const stones = all.slice(0, stoneEnd),
    trees = all.slice(stoneEnd, treeEnd),
    rocks = all.slice(treeEnd);
  w.obstacles = [];
  w.obstacleGrid.clear();
  for (const t of trees) addCircle(w, t.x, t.z, t.r);
  w.treeCount = w.obstacles.length;
  for (const k of rocks) addCircle(w, k.x, k.z, k.r);
  w.rockEnd = w.obstacles.length;
  for (const s of stones) addCircle(w, s.x, s.z, s.r);
}

/** Grille des cases pleines de toute la carte (FLOW.cell) : 1 si le centre est à moins de r + FLOW.clear d'un obstacle. */
function buildSolid(w: World): void {
  const N = w.solidN,
    C = FLOW.cell;
  w.solid.fill(0);
  w.near.fill(0);
  // near : cases à moins de r + NEAR d'un obstacle ; ailleurs, un ennemi (r ≤ 1,25) ne peut rien toucher et la
  // collision est sautée (la plupart de la carte est ouverte : c'est ce qui garde le pas des 400 ennemis bon marché)
  const NEAR = ENEMY_MAX_R + C;
  const mark = (sol: Uint8Array, x0: number, x1: number, z0: number, z1: number, inside: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor((x0 + WORLD_HALF) / C)),
      i1 = Math.min(N - 1, Math.floor((x1 + WORLD_HALF) / C)),
      j0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / C)),
      j1 = Math.min(N - 1, Math.floor((z1 + WORLD_HALF) / C));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) if (inside(-WORLD_HALF + (i + 0.5) * C, -WORLD_HALF + (j + 0.5) * C)) sol[j * N + i] = 1;
  };
  for (const [sol, pad] of [
    [w.solid, FLOW.clear],
    [w.near, NEAR],
  ] as const) {
    for (const ob of w.obstacles) {
      const m = ob.r + pad;
      mark(sol, ob.x - m, ob.x + m, ob.z - m, ob.z + m, (x, z) => (x - ob.x) ** 2 + (z - ob.z) ** 2 < m * m);
    }
    for (const s of w.walls) {
      const m = s.r + pad;
      mark(sol, Math.min(s.x1, s.x2) - m, Math.max(s.x1, s.x2) + m, Math.min(s.z1, s.z2) - m, Math.max(s.z1, s.z2) + m, (x, z) => segDist(x, z, s.x1, s.z1, s.x2, s.z2) < m);
    }
  }
}

/** Lacs et bois, loin du départ (inchangé depuis la phase 3, bois plus petits en phase 16). */
export function buildZones(w: World, r: Rng): void {
  const place = (n: number, rMin: number, rMax: number, out: Obstacle[]) => {
    for (let i = 0; i < n; i++) {
      let x: number, z: number;
      do {
        x = r.range(-WORLD_HALF * 0.8, WORLD_HALF * 0.8);
        z = r.range(-WORLD_HALF * 0.8, WORLD_HALF * 0.8);
      } while (x * x + z * z < ZONES.minFromCenter * ZONES.minFromCenter);
      out.push({ x, z, r: r.range(rMin, rMax) });
    }
  };
  place(ZONES.lakes, ZONES.lakeRMin, ZONES.lakeRMax, w.lakes);
  place(ZONES.woods, ZONES.woodR, ZONES.woodR, w.woods);
}
