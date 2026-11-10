// Phase 44 : décor stylisé (Quaternius « Ultimate Stylized Nature », CC0) → public/models/nature.glb.
// Les modèles sources sont des FBX (lus par le FBXLoader de three, sans DOM) trop lourds pour un décor instancié :
// 3 000 à 12 000 triangles par arbre, des écorces en PNG 4K. Ici :
// - tronc et branches : sommets soudés, simplifiés (meshopt), couleur d'écorce cuite par sommet (plus de texture) ;
// - feuillage en cartes (un quad par bouquet de feuilles) : une partie des cartes gardée (échantillonnage par points
//   les plus éloignés), agrandie pour garder le volume, un seul côté (matériau à deux faces), normales « en boule »
//   autour du houppier pour un ombrage doux, et un cœur opaque sombre par houppier (la ramure se lit pleine) ;
// - feuillage en maillage (sapins, fleurs) : faces en double retirées, simplifié avec ses UV ;
// - un atlas 1024² : feuilles en masque blanc (la couleur vient des sommets : chaque monde teinte ses arbres),
//   branche de sapin et fleurs en couleur. Les parties sans texture visent un texel blanc opaque de l'atlas.
// COLOR_0 est un VEC4 : rgb = couleur ou nuance, a = 1 pour ce que le monde teinte (feuilles), 0 pour le reste.
import fs from 'node:fs';
import path from 'node:path';
import type { Document, Node } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { NATURE } from './config';
import type { NatureSpec } from './config';

/** Triangle source : 3 positions (repère du modèle, y vers le haut) et 3 UV (v vers le haut, comme three). */
interface Tri {
  p: number[];
  uv: number[];
}
/** Maillage en construction : sommets indexés, un seul matériau pour tout le fichier. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: number[], n: number[], uv: number[], c: number[]): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.col.push(c[0], c[1], c[2], c[3]);
    return this.pos.length / 3 - 1;
  }
  get tris(): number {
    return this.idx.length / 3;
  }
}

type Cell = keyof typeof CELLS;
/** Cases de l'atlas (pixels, origine en haut à gauche comme les UV glTF). */
const CELLS = {
  leaves: { x: 0, y: 0, file: 'Leaves_BW.png', mask: true },
  maple: { x: 1, y: 0, file: 'MapleTree_Leaves_BW.png', mask: true },
  pine: { x: 0, y: 1, file: 'PineTree_Leaves.png', mask: false },
  flowers: { x: 1, y: 1, file: 'Flowers.png', mask: false },
} as const;
/** Textures du pack lues par le script (atlas et couleurs moyennes) : seules celles-ci sont téléchargées. */
export const NATURE_TEXTURES = [
  ...Object.values(CELLS).map((c) => c.file),
  'NormalTree_Bark.png',
  'MapleTree_Bark.png',
  'BirchTree_Bark.png',
  'PineTree_Bark.png',
  'Rocks.png',
];
/** Matériau du pack → rôle dans le modèle. */
function role(name: string): { kind: 'solid' | 'cards' | 'mesh' | 'grass'; cell?: Cell; tex?: string } {
  if (/Bark|Trunk/.test(name)) return { kind: 'solid', tex: `${name}.png` };
  if (/^Rock/.test(name)) return { kind: 'solid', tex: 'Rocks.png' };
  if (name === 'Grass') return { kind: 'grass' };
  if (name === 'MapleTree_Leaves') return { kind: 'cards', cell: 'maple' };
  if (name === 'PineTree_Leaves') return { kind: 'mesh', cell: 'pine' };
  if (name === 'Flowers') return { kind: 'mesh', cell: 'flowers' };
  if (/Leaves$/.test(name)) return { kind: 'cards', cell: 'leaves' };
  throw new Error(`matériau inconnu : ${name}`);
}

/** Lit un FBX : triangles par nom de matériau, dans le repère de la géométrie (y vers le haut dans tout le pack). */
function readFbx(file: string): Map<string, Tri[]> {
  // le chargeur de textures de three réclame un DOM : neutralisé (les textures passent par l'atlas)
  const g = globalThis as { document?: unknown };
  g.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, src: '' }) };
  const buf = fs.readFileSync(file);
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const out = new Map<string, Tri[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = geo.attributes.position,
      U = geo.attributes.uv;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
    for (const gr of groups) {
      const name = mats[gr.materialIndex ?? 0].name;
      const list = out.get(name) ?? [];
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        const t: Tri = { p: [], uv: [] };
        for (let k = 0; k < 3; k++) {
          t.p.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k));
          t.uv.push(U ? U.getX(i + k) : 0, U ? U.getY(i + k) : 0);
        }
        list.push(t);
      }
      out.set(name, list);
    }
  });
  return out;
}

const key3 = (x: number, y: number, z: number, q: number) =>
  `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;

/** Soude les sommets par position : positions uniques, indices, et composante connexe de chaque triangle. */
function weldTris(tris: Tri[], q: number): { pos: number[]; idx: number[]; comp: number[]; nComp: number } {
  const ids = new Map<string, number>();
  const pos: number[] = [],
    idx: number[] = [],
    parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (const t of tris) {
    const v: number[] = [];
    for (let k = 0; k < 3; k++) {
      const key = key3(t.p[k * 3], t.p[k * 3 + 1], t.p[k * 3 + 2], q);
      let id = ids.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        pos.push(t.p[k * 3], t.p[k * 3 + 1], t.p[k * 3 + 2]);
        ids.set(key, id);
        parent.push(id);
      }
      v.push(id);
    }
    idx.push(v[0], v[1], v[2]);
    parent[find(v[0])] = find(v[1]);
    parent[find(v[1])] = find(v[2]);
  }
  const names = new Map<number, number>();
  const comp: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(idx[t]);
    if (!names.has(r)) names.set(r, names.size);
    comp.push(names.get(r)!);
  }
  return { pos, idx, comp, nComp: names.size };
}

/** Retire les triangles en double (faces arrière modélisées : le matériau est à deux faces). */
function dedupeFaces(tris: Tri[], q: number): Tri[] {
  const seen = new Set<string>();
  return tris.filter((t) => {
    const k = [0, 1, 2]
      .map((i) => key3(t.p[i * 3], t.p[i * 3 + 1], t.p[i * 3 + 2], q))
      .sort()
      .join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function bounds(tris: Tri[]): { min: number[]; max: number[] } {
  const min = [1e9, 1e9, 1e9],
    max = [-1e9, -1e9, -1e9];
  for (const t of tris)
    for (let i = 0; i < 9; i++) {
      min[i % 3] = Math.min(min[i % 3], t.p[i]);
      max[i % 3] = Math.max(max[i % 3], t.p[i]);
    }
  return { min, max };
}

/** Couleur moyenne d'une texture du pack (linéarisée par three au chargement : on reste en sRGB 0..1 ici). */
const avgCache = new Map<string, number[]>();
async function avgColor(dir: string, file: string): Promise<number[]> {
  let c = avgCache.get(file);
  if (!c) {
    const { data } = await sharp(path.join(dir, file)).removeAlpha().resize(1, 1, { fit: 'fill' }).raw().toBuffer({
      resolveWithObject: true,
    });
    c = [data[0] / 255, data[1] / 255, data[2] / 255];
    avgCache.set(file, c);
  }
  return c;
}
/** Couleur plus franche : saturation et valeur relevées (les écorces du pack sont ternes vues de loin). */
function vivid(c: number[], sat: number, val: number): number[] {
  const col = new THREE.Color(c[0], c[1], c[2]);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL(hsl.h, Math.min(1, hsl.s * sat), Math.min(0.9, hsl.l * val));
  return [col.r, col.g, col.b];
}

/**
 * Partie pleine (tronc, branches, rocher) : soudée, simplifiée jusqu'à `target` triangles (les petites branches
 * isolées sont retirées d'abord), normales lissées, couleur cuite avec un dégradé du pied (sombre) au sommet.
 */
function addSolid(
  b: Builder,
  tris: Tri[],
  target: number,
  color: number[],
  white: number[],
  size: number,
  flat: boolean,
  tint = false,
): void {
  const w = weldTris(tris, size * 2e-4);
  let idx = new Uint32Array(w.idx);
  const pos = new Float32Array(w.pos);
  if (idx.length / 3 > target) {
    // « Prune » : meshopt retire les composantes isolées trop petites pour l'erreur admise (rameaux sous le feuillage)
    for (const err of [0.02, 0.05, 0.1, 0.2]) {
      idx = new Uint32Array(MeshoptSimplifier.simplify(new Uint32Array(w.idx), pos, 3, target * 3, err, ['Prune'])[0]);
      if (idx.length / 3 <= target * 1.15) break;
    }
  }
  const { min, max } = bounds(tris);
  const h = Math.max(1e-6, max[1] - min[1]);
  // normales : lissées par sommet soudé (troncs), ou par face (rochers à facettes : sommets dupliqués)
  const vn = new Float32Array(pos.length);
  const fn = (a: number, c: number, d: number): number[] => {
    const ux = pos[c * 3] - pos[a * 3],
      uy = pos[c * 3 + 1] - pos[a * 3 + 1],
      uz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[d * 3] - pos[a * 3],
      vy = pos[d * 3 + 1] - pos[a * 3 + 1],
      vz = pos[d * 3 + 2] - pos[a * 3 + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  for (let t = 0; t < idx.length; t += 3) {
    const n = fn(idx[t], idx[t + 1], idx[t + 2]);
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) vn[idx[t + k] * 3 + a] += n[a];
  }
  const shade = (y: number) => 0.72 + 0.36 * Math.min(1, (y - min[1]) / h);
  const put = (v: number, n: number[]) => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const s = shade(pos[v * 3 + 1]);
    return b.vert([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], [n[0] / l, n[1] / l, n[2] / l], white, [
      color[0] * s,
      color[1] * s,
      color[2] * s,
      tint ? 1 : 0,
    ]);
  };
  if (flat) {
    for (let t = 0; t < idx.length; t += 3) {
      const n = fn(idx[t], idx[t + 1], idx[t + 2]);
      b.idx.push(put(idx[t], n), put(idx[t + 1], n), put(idx[t + 2], n));
    }
    return;
  }
  const map = new Map<number, number>();
  for (let t = 0; t < idx.length; t++) {
    const v = idx[t];
    let id = map.get(v);
    if (id === undefined) {
      id = put(v, [vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]]);
      map.set(v, id);
    }
    b.idx.push(id);
  }
}

/** UV du pack (v vers le haut) → UV de l'atlas (v vers le bas, case de 1/2). */
const cellUv = (cell: Cell, u: number, v: number): number[] => [
  (CELLS[cell].x + Math.min(1, Math.max(0, u))) / 2,
  (CELLS[cell].y + 1 - Math.min(1, Math.max(0, v))) / 2,
];

interface Card {
  c: number[]; // centre
  corners: { p: number[]; uv: number[] }[]; // 4 coins, dans l'ordre du contour
}
/** Regroupe les triangles en cartes (quads) : une composante connexe = un bouquet de feuilles. */
function toCards(tris: Tri[], size: number): Card[] {
  const w = weldTris(tris, size * 2e-4);
  const by: Tri[][] = Array.from({ length: w.nComp }, () => []);
  tris.forEach((t, i) => by[w.comp[i]].push(t));
  const cards: Card[] = [];
  for (const list of by) {
    // coins uniques (position → UV du premier triangle qui la porte)
    const corners = new Map<string, { p: number[]; uv: number[] }>();
    for (const t of list)
      for (let k = 0; k < 3; k++) {
        const key = key3(t.p[k * 3], t.p[k * 3 + 1], t.p[k * 3 + 2], size * 2e-4);
        if (!corners.has(key)) corners.set(key, { p: t.p.slice(k * 3, k * 3 + 3), uv: t.uv.slice(k * 2, k * 2 + 2) });
      }
    if (corners.size !== 4) continue; // autre chose qu'un quad : ignoré
    const cs = [...corners.values()];
    const c = [0, 1, 2].map((a) => (cs[0].p[a] + cs[1].p[a] + cs[2].p[a] + cs[3].p[a]) / 4);
    // ordre du contour : angle autour du centre dans le plan de la carte
    const e1 = [0, 1, 2].map((a) => cs[0].p[a] - c[a]);
    const t0 = list[0];
    const n = new THREE.Vector3(t0.p[3] - t0.p[0], t0.p[4] - t0.p[1], t0.p[5] - t0.p[2])
      .cross(new THREE.Vector3(t0.p[6] - t0.p[0], t0.p[7] - t0.p[1], t0.p[8] - t0.p[2]))
      .normalize();
    const u = new THREE.Vector3(e1[0], e1[1], e1[2]).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const ang = (q: { p: number[] }) => {
      const d = new THREE.Vector3(q.p[0] - c[0], q.p[1] - c[1], q.p[2] - c[2]);
      return Math.atan2(d.dot(v), d.dot(u));
    };
    cs.sort((a, b2) => ang(a) - ang(b2));
    cards.push({ c, corners: cs });
  }
  return cards;
}

/** k-moyennes déterministe sur des points 3D (centres de cartes) : centres et rayons (écart-type par axe). */
function clusters(pts: number[][], k: number): { c: number[]; r: number[]; n: number }[] {
  k = Math.min(k, pts.length);
  // graines : points les plus éloignés les uns des autres
  const seeds = [pts[0]];
  while (seeds.length < k) {
    let best = pts[0],
      bd = -1;
    for (const p of pts) {
      const d = Math.min(...seeds.map((s) => (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 + (p[2] - s[2]) ** 2));
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    seeds.push(best);
  }
  let cs = seeds.map((s) => s.slice());
  const of = new Array<number>(pts.length).fill(0);
  for (let it = 0; it < 12; it++) {
    pts.forEach((p, i) => {
      let bd = 1e18;
      cs.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          of[i] = j;
        }
      });
    });
    cs = cs.map((c, j) => {
      const mine = pts.filter((_, i) => of[i] === j);
      return mine.length ? [0, 1, 2].map((a) => mine.reduce((s, p) => s + p[a], 0) / mine.length) : c;
    });
  }
  return cs.map((c, j) => {
    const mine = pts.filter((_, i) => of[i] === j);
    const r = [0, 1, 2].map((a) =>
      Math.sqrt(mine.reduce((s, p) => s + (p[a] - c[a]) ** 2, 0) / Math.max(1, mine.length)),
    );
    return { c, r, n: mine.length };
  });
}

/**
 * Feuillage en cartes : `keep` cartes gardées (les plus éloignées les unes des autres : le contour du houppier
 * d'abord), agrandies ; normales en boule autour du houppier le plus proche ; nuance claire en haut, sombre en bas.
 * Un cœur opaque sombre par houppier ferme les trous vus d'en haut.
 */
function addCards(b: Builder, tris: Tri[], spec: NatureSpec, cell: Cell, white: number[], size: number): void {
  const all = toCards(tris, size);
  if (!all.length) return;
  const keep = Math.min(spec.cards ?? all.length, all.length);
  const blobs = clusters(
    all.map((c) => c.c),
    spec.cores ?? 4,
  );
  // échantillonnage par points les plus éloignés (déterministe : départ au point le plus haut)
  const chosen: Card[] = [];
  const dist = new Float64Array(all.length).fill(1e18);
  let cur = all.reduce((m, c, i) => (c.c[1] > all[m].c[1] ? i : m), 0);
  for (let n = 0; n < keep; n++) {
    chosen.push(all[cur]);
    let best = 0,
      bd = -1;
    for (let i = 0; i < all.length; i++) {
      const d =
        (all[i].c[0] - all[cur].c[0]) ** 2 + (all[i].c[1] - all[cur].c[1]) ** 2 + (all[i].c[2] - all[cur].c[2]) ** 2;
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > bd) {
        bd = dist[i];
        best = i;
      }
    }
    cur = best;
  }
  const grow = Math.min(spec.grow ?? 2.2, Math.sqrt(all.length / keep) * (spec.leaf ?? 1));
  let y0 = 1e9,
    y1 = -1e9;
  for (const c of all) {
    y0 = Math.min(y0, c.c[1]);
    y1 = Math.max(y1, c.c[1]);
  }
  const nearest = (p: number[]) =>
    blobs.reduce((m, bl) =>
      (p[0] - bl.c[0]) ** 2 + (p[1] - bl.c[1]) ** 2 + (p[2] - bl.c[2]) ** 2 <
      (p[0] - m.c[0]) ** 2 + (p[1] - m.c[1]) ** 2 + (p[2] - m.c[2]) ** 2
        ? bl
        : m,
    );
  const ballNormal = (p: number[], bl: { c: number[] }) => {
    const n = new THREE.Vector3(p[0] - bl.c[0], p[1] - bl.c[1] + size * 0.03, p[2] - bl.c[2]).normalize();
    n.y += 0.35; // vers le haut : le dessus du houppier prend la lumière
    return n.normalize();
  };
  chosen.forEach((card, i) => {
    const bl = nearest(card.c);
    // nuance : hauteur dans le houppier, plus une variation par carte (bouquets qui se détachent)
    const t = (card.c[1] - y0) / Math.max(1e-6, y1 - y0);
    const s = 0.6 + 0.34 * t + ((i * 7) % 5) * 0.015;
    const ids = card.corners.map((q) => {
      const p = [0, 1, 2].map((a) => card.c[a] + (q.p[a] - card.c[a]) * grow);
      const n = ballNormal(p, bl);
      return b.vert(p, [n.x, n.y, n.z], cellUv(cell, q.uv[0], q.uv[1]), [s, s, s, 1]);
    });
    // face avant tournée vers l'extérieur du houppier (la face arrière, vue de l'intérieur, sera plus sombre)
    const fnv = new THREE.Vector3(...card.corners[1].p)
      .sub(new THREE.Vector3(...card.corners[0].p))
      .cross(new THREE.Vector3(...card.corners[2].p).sub(new THREE.Vector3(...card.corners[0].p)));
    const out = new THREE.Vector3(card.c[0] - bl.c[0], card.c[1] - bl.c[1], card.c[2] - bl.c[2]);
    if (fnv.dot(out) >= 0) b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    else b.idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
  });
  // cœurs : icosaèdre aplati par houppier, teinté comme les feuilles mais plus sombre
  if (spec.cores === 0) return;
  const ico = new THREE.IcosahedronGeometry(1, spec.coreDetail ?? 0);
  const ip = ico.attributes.position;
  for (const bl of blobs) {
    if (bl.n < 3) continue;
    const k = spec.core ?? 1.45;
    const r = [
      Math.max(bl.r[0], size * 0.04) * k,
      Math.max(bl.r[1], size * 0.03) * k * 0.9,
      Math.max(bl.r[2], size * 0.04) * k,
    ];
    const map = new Map<string, number>();
    for (let i = 0; i < ip.count; i++) {
      const d = [ip.getX(i), ip.getY(i), ip.getZ(i)];
      const key = key3(d[0], d[1], d[2], 1e-4);
      let id = map.get(key);
      if (id === undefined) {
        const n = new THREE.Vector3(d[0], d[1] + 0.35, d[2]).normalize();
        const t = (bl.c[1] + d[1] * r[1] - y0) / Math.max(1e-6, y1 - y0);
        const s = 0.42 + 0.16 * Math.max(0, Math.min(1, t));
        id = b.vert([bl.c[0] + d[0] * r[0], bl.c[1] + d[1] * r[1], bl.c[2] + d[2] * r[2]], [n.x, n.y, n.z], white, [
          s,
          s,
          s,
          1,
        ]);
        map.set(key, id);
      }
      b.idx.push(id);
    }
  }
  ico.dispose();
}

/** Feuillage en maillage (branches de sapin, fleurs) : double face retirée, simplifié avec ses UV. */
function addMesh(b: Builder, tris: Tri[], target: number, cell: Cell, size: number, tint: boolean): void {
  const list = dedupeFaces(tris, size * 2e-4);
  // soudure par position + UV
  const ids = new Map<string, number>();
  const P: number[] = [],
    U: number[] = [],
    I: number[] = [];
  for (const t of list)
    for (let k = 0; k < 3; k++) {
      const key = `${key3(t.p[k * 3], t.p[k * 3 + 1], t.p[k * 3 + 2], size * 2e-4)}/${t.uv[k * 2].toFixed(3)},${t.uv[k * 2 + 1].toFixed(3)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = P.length / 3;
        P.push(t.p[k * 3], t.p[k * 3 + 1], t.p[k * 3 + 2]);
        U.push(t.uv[k * 2], t.uv[k * 2 + 1]);
        ids.set(key, id);
      }
      I.push(id);
    }
  let idx = new Uint32Array(I);
  const pos = new Float32Array(P),
    uv = new Float32Array(U);
  if (idx.length / 3 > target) {
    for (const flags of [[], ['Permissive']] as 'Permissive'[][]) {
      idx = new Uint32Array(
        MeshoptSimplifier.simplifyWithAttributes(
          new Uint32Array(I),
          pos,
          3,
          uv,
          2,
          [1, 1],
          null,
          target * 3,
          0.08,
          flags,
        )[0],
      );
      if (idx.length / 3 <= target * 1.15) break;
    }
  }
  const { min, max } = bounds(list);
  const cx = (min[0] + max[0]) / 2,
    cz = (min[2] + max[2]) / 2,
    h = Math.max(1e-6, max[1] - min[1]);
  const map = new Map<number, number>();
  for (let t = 0; t < idx.length; t++) {
    const v = idx[t];
    let id = map.get(v);
    if (id === undefined) {
      const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      // normales en cône autour de l'axe du modèle : ombrage doux, sans le papillotement des faces fines
      const n = new THREE.Vector3(p[0] - cx, h * 0.45, p[2] - cz).normalize();
      const s = 0.8 + 0.3 * ((p[1] - min[1]) / h);
      id = b.vert(p, [n.x, n.y, n.z], cellUv(cell, uv[v * 2], uv[v * 2 + 1]), [s, s, s, tint ? 1 : 0]);
      map.set(v, id);
    }
    b.idx.push(id);
  }
}

/** Touffe d'herbe : brins à deux faces, dégradé du pied (sombre) à la pointe (claire), teinte du monde. */
function addGrass(b: Builder, tris: Tri[], white: number[], size: number): void {
  const list = dedupeFaces(tris, size * 2e-4);
  const { min, max } = bounds(list);
  const h = Math.max(1e-6, max[1] - min[1]);
  for (const t of list) {
    const ids = [0, 1, 2].map((k) => {
      const p = t.p.slice(k * 3, k * 3 + 3);
      const f = (p[1] - min[1]) / h;
      const s = 0.55 + 0.6 * f;
      // normale vers le haut : l'herbe prend la lumière du sol qu'elle couvre, sans facettes
      return b.vert(p, [0, 1, 0], white, [s, s, s, 1]);
    });
    b.idx.push(ids[0], ids[1], ids[2]);
  }
}

/** Atlas 1024² (PNG à palette) : masques blancs et cases en couleur dont les bords sont étendus dans le vide. */
async function buildAtlas(dir: string): Promise<{ png: Uint8Array; white: number[] }> {
  const S = NATURE.atlas,
    C = S / 2;
  const out = Buffer.alloc(S * S * 4);
  let white: number[] | null = null;
  for (const cell of Object.values(CELLS)) {
    const { data } = await sharp(path.join(dir, cell.file)).ensureAlpha().resize(C, C, { fit: 'fill' }).raw().toBuffer({
      resolveWithObject: true,
    });
    const px = Buffer.from(data);
    if (cell.mask) {
      for (let i = 0; i < C * C; i++) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
    } else {
      // étend la couleur des bords dans les pixels transparents (sinon liseré sombre au filtrage)
      for (let pass = 0; pass < 24; pass++) {
        const src = Buffer.from(px);
        for (let y = 0; y < C; y++)
          for (let x = 0; x < C; x++) {
            const i = (y * C + x) * 4;
            if (src[i + 3] > 8 || px[i + 3] === 1) continue;
            let r = 0,
              g = 0,
              bl = 0,
              n = 0;
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const xx = x + dx,
                yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= C || yy >= C) continue;
              const j = (yy * C + xx) * 4;
              if (src[j + 3] > 8 || src[j + 3] === 1) {
                r += src[j];
                g += src[j + 1];
                bl += src[j + 2];
                n++;
              }
            }
            if (n) {
              px[i] = r / n;
              px[i + 1] = g / n;
              px[i + 2] = bl / n;
              px[i + 3] = 1; // marqueur « couleur étendue » (reste sous le seuil de découpe)
            }
          }
      }
    }
    for (let y = 0; y < C; y++) px.copy(out, ((cell.y * C + y) * S + cell.x * C) * 4, y * C * 4, (y + 1) * C * 4);
    // texel blanc opaque pour les parties sans texture : centre d'une feuille pleine du masque
    if (cell.mask && !white) {
      const R = 10;
      search: for (let y = R; y < C - R; y += 2)
        for (let x = R; x < C - R; x += 2) {
          let ok = true;
          for (let dy = -R; dy <= R && ok; dy += 2)
            for (let dx = -R; dx <= R && ok; dx += 2) if (px[((y + dy) * C + x + dx) * 4 + 3] < 250) ok = false;
          if (ok) {
            white = [(cell.x * C + x + 0.5) / S, (cell.y * C + y + 0.5) / S];
            break search;
          }
        }
    }
  }
  if (!white) throw new Error('atlas : pas de zone blanche opaque pour les parties sans texture');
  const png = await sharp(out, { raw: { width: S, height: S, channels: 4 } })
    .png({ palette: true, colours: 192, compressionLevel: 9, effort: 10 })
    .toBuffer();
  return { png: new Uint8Array(png), white };
}

export interface NatureOut {
  nodes: Record<string, number>;
}

/** Ajoute tous les modèles de NATURE.models au document (un nœud par clé, un matériau, un atlas). */
export async function buildNature(doc: Document, sources: string, log = false): Promise<NatureOut> {
  await MeshoptSimplifier.ready;
  const texDir = path.join(sources, 'Textures');
  const { png, white } = await buildAtlas(texDir);
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const tex = doc.createTexture('nature').setImage(png).setMimeType('image/png');
  const mat = doc
    .createMaterial('nature')
    .setBaseColorTexture(tex)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)
    .setRoughnessFactor(1)
    .setMetallicFactor(0);
  const scene = doc.getRoot().listScenes()[0] ?? doc.createScene('nature');
  const nodes: Record<string, number> = {};
  for (const [key, spec] of Object.entries(NATURE.models)) {
    const parts = readFbx(path.join(sources, 'FBX', `${spec.file}.fbx`));
    const allTris = [...parts.values()].flat();
    const bb = bounds(allTris);
    const size = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    const b = new Builder();
    for (const [name, tris] of parts) {
      const r = role(name);
      if (r.kind === 'solid') {
        const base = spec.color ?? vivid(await avgColor(texDir, r.tex!), 1.25, 1.12);
        addSolid(b, tris, spec.solid ?? 200, base, white, size, /^Rock/.test(name), !!spec.tintSolid);
      } else if (r.kind === 'cards') addCards(b, tris, spec, r.cell!, white, size);
      else if (r.kind === 'mesh') addMesh(b, tris, spec.mesh ?? 300, r.cell!, size, r.cell === 'pine');
      else addGrass(b, tris, white, size);
    }
    // repère final : pied au sol (y = 0), hauteur 1, axe du tronc en (0, 0) (centre des sommets pleins les plus bas)
    const h = bb.max[1] - bb.min[1];
    let sx = 0,
      sz = 0,
      n = 0;
    for (let i = 0; i < b.pos.length; i += 3)
      if ((spec.tintSolid || b.col[(i / 3) * 4 + 3] === 0) && b.pos[i + 1] < bb.min[1] + h * 0.12) {
        sx += b.pos[i];
        sz += b.pos[i + 2];
        n++;
      }
    const ox = n && spec.kind === 'tree' ? sx / n : (bb.min[0] + bb.max[0]) / 2,
      oz = n && spec.kind === 'tree' ? sz / n : (bb.min[2] + bb.max[2]) / 2;
    for (let i = 0; i < b.pos.length; i += 3) {
      b.pos[i] = (b.pos[i] - ox) / h;
      b.pos[i + 1] = (b.pos[i + 1] - bb.min[1]) / h;
      b.pos[i + 2] = (b.pos[i + 2] - oz) / h;
    }
    if (b.tris > spec.tris) throw new Error(`${key} : ${b.tris} triangles > ${spec.tris}`);
    const acc = (
      type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
      arr: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
    ) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', acc('VEC3', new Float32Array(b.pos)))
      .setAttribute('NORMAL', acc('VEC3', new Float32Array(b.nor)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(b.uv)))
      .setAttribute('COLOR_0', acc('VEC4', new Float32Array(b.col)))
      .setIndices(acc('SCALAR', new Uint16Array(b.idx)))
      .setMaterial(mat);
    const node: Node = doc.createNode(key).setMesh(doc.createMesh(key).addPrimitive(prim));
    scene.addChild(node);
    nodes[key] = b.tris;
    if (log)
      console.log(
        `nature ${key.padEnd(14)} ${spec.file.padEnd(22)} ${String(allTris.length).padStart(6)} → ${b.tris} triangles`,
      );
  }
  return { nodes };
}
