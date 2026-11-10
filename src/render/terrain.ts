// Relief au rendu (phase 18) : sol déplacé par la carte de hauteur de la sim, et lecture « posé au sol » qui suit
// exactement la surface dessinée (même grille, même interpolation) : rien ne flotte ni ne s'enfonce.
import * as THREE from 'three';
import { TERRAIN, WORLD_HALF } from '../sim/balance';
import type { World } from '../sim/world';

/**
 * Phase 27 : le sol suit exactement la grille de la sim (cases de TERRAIN.cell u) pour garder les arêtes nettes des
 * plateaux et des rampes. La caméra ne voit qu'environ 50 × 30 u : un seul maillage de WIN × WIN cases (≈ 96 u de côté,
 * ≈ 4 600 triangles, un appel) suit le joueur et se recale par pas de RECENTER u, rempli depuis les tableaux de toute
 * la carte calculés une fois (hauteurs, normales, couleurs). Les ouvrages, eux, sont rangés en TILES × TILES tuiles.
 */
export const TILES = 3;
const N = Math.round((2 * WORLD_HALF) / TERRAIN.cell) + 1;
const CELL = TERRAIN.cell;
const WIN = 48; // cases par côté de la fenêtre de sol
const RECENTER = 16; // u : on recale la fenêtre quand le joueur s'éloigne de son centre de plus que ça
/** Lumière rasante (du côté de la lune de la scène) pour l'ombrage cuit du sol : une lumière basse révèle le relief. */
const sunDir = new THREE.Vector3(-8, 5, 5).normalize();
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Distance du point au segment (construction des couleurs seulement). */
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const ux = bx - ax,
    uz = bz - az,
    l2 = ux * ux + uz * uz;
  let t = l2 > 1e-9 ? ((x - ax) * ux + (z - az) * uz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (ax + ux * t), z - (az + uz * t));
}
/** Hachage entier → 0..1 (coins de la grille du bruit). */
function hash01(a: number, b: number, seed: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
/** Bruit de valeur lissé, 0..1, déterministe pour une graine (taches du sol : construction seulement). */
function noise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  const fx = x - xi,
    fz = z - zi;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const h00 = hash01(xi, zi, seed),
    h01 = hash01(xi, zi + 1, seed);
  const a = h00 + (hash01(xi + 1, zi, seed) - h00) * u,
    b = h01 + (hash01(xi + 1, zi + 1, seed) - h01) * u;
  return a + (b - a) * v;
}
export class TerrainView {
  /** Hauteurs aux sommets du sol (N × N), échantillonnées une fois sur la sim. */
  readonly grid = new Float32Array(N * N);
  /** Hauteur du sol dessiné en (x, z) : bilinéaire sur la grille du maillage. Aucune allocation. */
  readonly gy = (x: number, z: number): number => {
    const G = this.grid;
    let fx = (x + WORLD_HALF) / CELL,
      fz = (z + WORLD_HALF) / CELL;
    fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > N - 1.001 ? N - 1.001 : fz;
    const i = fx | 0,
      j = fz | 0,
      tx = fx - i,
      tz = fz - j,
      k = j * N + i;
    const a = G[k] + (G[k + 1] - G[k]) * tx,
      b = G[k + N] + (G[k + N + 1] - G[k + N]) * tx;
    return a + (b - a) * tz;
  };

  /** Pente du sol au dernier gyGrad (dh/dx, dh/dz). */
  gradX = 0;
  gradZ = 0;
  /** Hauteur et pente (gradX, gradZ) en une seule lecture bilinéaire (les 4 mêmes coins). Aucune allocation. */
  gyGrad(x: number, z: number): number {
    const G = this.grid;
    let fx = (x + WORLD_HALF) / CELL,
      fz = (z + WORLD_HALF) / CELL;
    fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > N - 1.001 ? N - 1.001 : fz;
    const i = fx | 0,
      j = fz | 0,
      tx = fx - i,
      tz = fz - j,
      k = j * N + i;
    const h00 = G[k],
      h10 = G[k + 1],
      h01 = G[k + N],
      h11 = G[k + N + 1];
    const a = h00 + (h10 - h00) * tx,
      b = h01 + (h11 - h01) * tx;
    this.gradX = ((h10 - h00) * (1 - tz) + (h11 - h01) * tz) / CELL;
    this.gradZ = (b - a) / CELL;
    return a + (b - a) * tz;
  }

  /** Normales et couleurs de toute la carte (calculées une fois par carte) ; la fenêtre de sol y puise. */
  private nrm = new Float32Array(N * N * 3);
  private col = new Float32Array(N * N * 3);
  /** Phase 44 : par sommet, part de terre (x) et part de couleur unie sans texture (y : pistes). */
  private mix = new Float32Array(N * N * 2);
  /** Part de sol sans herbe en (x, z) (terre, piste) : le semis d'herbe et de fleurs l'évite. Aucune allocation. */
  bareAt(x: number, z: number): number {
    const i = Math.max(0, Math.min(N - 1, Math.round((x + WORLD_HALF) / CELL))),
      j = Math.max(0, Math.min(N - 1, Math.round((z + WORLD_HALF) / CELL)));
    return this.mix[(j * N + i) * 2] + this.mix[(j * N + i) * 2 + 1];
  }
  private winGeo: THREE.BufferGeometry | null = null;
  private winI = -1e9; // nœud du coin de la fenêtre (−1e9 : à remplir)
  private winJ = -1e9;

  /**
   * Échantillonne la sim, prépare normales et couleurs (herbe sur le plat, terre et pierre sur les flancs, arêtes
   * claires, pieds de flancs sombres, ombrage cuit par la lune) et renvoie le maillage du sol (fenêtre mobile).
   */
  build(w: World, mat: THREE.Material): THREE.Group {
    const G = this.grid,
      nrm = this.nrm,
      col = this.col,
      mix = this.mix,
      L = sunDir;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) G[j * N + i] = w.heightAt(-WORLD_HALF + i * CELL, -WORLD_HALF + j * CELL);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const g = j * N + i,
          h = G[g];
        const gx = (G[j * N + Math.min(N - 1, i + 1)] - G[j * N + Math.max(0, i - 1)]) / (2 * CELL),
          gz = (G[Math.min(N - 1, j + 1) * N + i] - G[Math.max(0, j - 1) * N + i]) / (2 * CELL);
        const l = Math.hypot(gx, 1, gz);
        nrm[g * 3] = -gx / l;
        nrm[g * 3 + 1] = 1 / l;
        nrm[g * 3 + 2] = -gz / l;
        const lit = nrm[g * 3] * L.x + nrm[g * 3 + 1] * L.y + nrm[g * 3 + 2] * L.z - L.y; // 0 sur le plat
        const t = Math.max(-0.35, Math.min(1, h / (TERRAIN.peak * 0.8)));
        const bank = smooth(0.1, 0.3, Math.hypot(gx, gz));
        // courbure (laplacien) : arête d'un sommet (convexe) éclairée, pied de flanc (concave) assombri — les plateaux et
        // les rampes se lisent d'en haut, la nuit, comme des formes nettes
        const lap =
          (G[j * N + Math.min(N - 1, i + 1)] +
            G[j * N + Math.max(0, i - 1)] +
            G[Math.min(N - 1, j + 1) * N + i] +
            G[Math.max(0, j - 1) * N + i] -
            4 * h) /
          (CELL * CELL);
        const edge = Math.max(-0.35, Math.min(0.3, -lap * 1.6));
        const k = Math.max(0.66 + 0.2 * bank, Math.min(1.38, 1 + 1.7 * lit + edge)); // un flanc à l'ombre reste lisible
        // phase 44 : le sol est texturé (tapis du monde et terre, mélangés par `mix`). La couleur de sommet ne porte
        // plus que l'ombrage cuit, de grandes taches claires et sombres (le motif répété ne se voit plus) et un
        // léger réchauffement sur les hauteurs.
        const x = -WORLD_HALF + i * CELL,
          z = -WORLD_HALF + j * CELL;
        const macro = noise2(x * 0.045, z * 0.045, w.seed);
        const sh = k * (0.88 + 0.24 * macro);
        let r = sh * (1 + 0.07 * t + 0.08 * (macro - 0.5)),
          gC = sh,
          bC = sh * (1 - 0.07 * t - 0.1 * (macro - 0.5));
        // terre : flancs, sous-bois, rives des lacs, lieux construits, et quelques plaques au hasard
        let dirt = bank;
        // rejet par distance au carré d'abord : 29 000 sommets × une quarantaine de zones (relecture perf)
        for (const o of w.woods) {
          const d2 = (x - o.x) * (x - o.x) + (z - o.z) * (z - o.z);
          if (d2 < (o.r + 1) * (o.r + 1)) dirt = Math.max(dirt, 0.9 * smooth(o.r + 1, o.r - 5, Math.sqrt(d2)));
        }
        for (const o of w.lakes) {
          const d2 = (x - o.x) * (x - o.x) + (z - o.z) * (z - o.z);
          if (d2 < (o.r + 3.5) * (o.r + 3.5)) dirt = Math.max(dirt, smooth(o.r + 3.5, o.r + 0.5, Math.sqrt(d2)));
        }
        for (const o of w.places) {
          const d2 = (x - o.x) * (x - o.x) + (z - o.z) * (z - o.z);
          if (d2 < (o.r + 1) * (o.r + 1)) dirt = Math.max(dirt, 0.85 * smooth(o.r + 1, o.r - 2.5, Math.sqrt(d2)));
        }
        dirt = Math.max(dirt, 0.8 * smooth(0.64, 0.82, noise2(x * 0.085 + 31.7, z * 0.085 + 17.3, w.seed)));
        // phase 28 : grandes pistes en neige tassée (claire, bleutée) bordée d'un liseré sombre ; tremplins en bois clair
        let pist = 0,
          rim = 0;
        for (const p of w.pistes) {
          const d = segDist(x, z, p.x0, p.z0, p.x1, p.z1);
          pist = Math.max(pist, smooth(p.half + 0.8, p.half - 1.2, d));
          rim = Math.max(rim, 1 - Math.min(1, Math.abs(d - p.half) / 1.1));
        }
        for (const q of w.kickers) {
          const d = segDist(x, z, q.x, q.z, q.x + q.dx * TERRAIN.kickLen, q.z + q.dz * TERRAIN.kickLen);
          pist = Math.max(pist, smooth(TERRAIN.kickHalf + 0.6, TERRAIN.kickHalf - 1, d));
        }
        if (pist > 0 || rim > 0) {
          // sur la piste la texture s'efface (mix.y) : la couleur de sommet donne directement la neige tassée
          const kk = 0.75 + 0.35 * k;
          r += (0.33 * kk - r) * pist * 0.9;
          gC += (0.5 * kk - gC) * pist * 0.9;
          bC += (0.68 * kk - bC) * pist * 0.9;
          const dk = 1 - rim * 0.3;
          r *= dk;
          gC *= dk;
          bC *= dk;
        }
        mix[g * 2] = dirt * (1 - pist);
        mix[g * 2 + 1] = pist * 0.9;
        col[g * 3] = r;
        col[g * 3 + 1] = gC;
        col[g * 3 + 2] = bC;
      }
    // pied des arbres isolés : une plaque de terre (les sous-bois sont déjà en terre)
    for (let t = 0; t < w.treeCount; t++) {
      const o = w.obstacles[t];
      const R = o.r + 2.2;
      const i0 = Math.max(0, Math.ceil((o.x - R + WORLD_HALF) / CELL)),
        i1 = Math.min(N - 1, Math.floor((o.x + R + WORLD_HALF) / CELL)),
        j0 = Math.max(0, Math.ceil((o.z - R + WORLD_HALF) / CELL)),
        j1 = Math.min(N - 1, Math.floor((o.z + R + WORLD_HALF) / CELL));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(-WORLD_HALF + i * CELL - o.x, -WORLD_HALF + j * CELL - o.z);
          const g = (j * N + i) * 2;
          mix[g] = Math.max(mix[g], 0.7 * smooth(R, o.r * 0.5, d) * (1 - mix[g + 1]));
        }
    }
    // fenêtre : tableaux alloués une fois, remplis à chaque recalage
    if (!this.winGeo) {
      const M = WIN + 1,
        geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * M * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(M * M * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(M * M * 2), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M * M * 3), 3));
      geo.setAttribute('blend', new THREE.BufferAttribute(new Float32Array(M * M * 2), 2));
      geo.setIndex(new THREE.BufferAttribute(new Uint16Array(WIN * WIN * 6), 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WIN * CELL);
      this.winGeo = geo;
    }
    this.winI = this.winJ = -1e9;
    this.follow(0, 0);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.winGeo, mat);
    // dessiné après les autres opaques : les fragments du sol cachés par le décor et les personnages sont rejetés
    // par la profondeur avant son shader à trois textures (relecture perf, phase 44)
    mesh.renderOrder = 1;
    mesh.frustumCulled = false; // toujours sous la caméra
    group.add(mesh);
    return group;
  }

  /** Recale la fenêtre de sol sous (x, z) si le joueur s'est éloigné de son centre. Aucune allocation. */
  follow(x: number, z: number): void {
    const geo = this.winGeo;
    if (!geo) return;
    const cx = -WORLD_HALF + (this.winI + WIN / 2) * CELL,
      cz = -WORLD_HALF + (this.winJ + WIN / 2) * CELL;
    if (Math.abs(x - cx) < RECENTER && Math.abs(z - cz) < RECENTER) return;
    // coin de la fenêtre, aligné sur la grille et gardé dans la carte
    const i0 = Math.max(0, Math.min(N - 1 - WIN, Math.round((x + WORLD_HALF) / CELL) - WIN / 2)),
      j0 = Math.max(0, Math.min(N - 1 - WIN, Math.round((z + WORLD_HALF) / CELL) - WIN / 2));
    this.winI = i0;
    this.winJ = j0;
    const M = WIN + 1,
      G = this.grid;
    const pos = geo.attributes.position as THREE.BufferAttribute,
      nor = geo.attributes.normal as THREE.BufferAttribute,
      uv = geo.attributes.uv as THREE.BufferAttribute,
      col = geo.attributes.color as THREE.BufferAttribute,
      ble = geo.attributes.blend as THREE.BufferAttribute;
    const B = ble.array as Float32Array;
    const P = pos.array as Float32Array,
      Nn = nor.array as Float32Array,
      U = uv.array as Float32Array,
      Cc = col.array as Float32Array;
    for (let b = 0; b < M; b++)
      for (let a = 0; a < M; a++) {
        const g = (j0 + b) * N + i0 + a,
          v = b * M + a;
        const px = -WORLD_HALF + (i0 + a) * CELL,
          pz = -WORLD_HALF + (j0 + b) * CELL;
        P[v * 3] = px;
        P[v * 3 + 1] = G[g];
        P[v * 3 + 2] = pz;
        Nn[v * 3] = this.nrm[g * 3];
        Nn[v * 3 + 1] = this.nrm[g * 3 + 1];
        Nn[v * 3 + 2] = this.nrm[g * 3 + 2];
        Cc[v * 3] = this.col[g * 3];
        Cc[v * 3 + 1] = this.col[g * 3 + 1];
        Cc[v * 3 + 2] = this.col[g * 3 + 2];
        B[v * 2] = this.mix[g * 2];
        B[v * 2 + 1] = this.mix[g * 2 + 1];
        U[v * 2] = (px + WORLD_HALF) / (2 * WORLD_HALF);
        U[v * 2 + 1] = 1 - (pz + WORLD_HALF) / (2 * WORLD_HALF);
      }
    const idx = geo.index!.array as Uint16Array;
    let n = 0;
    for (let b = 0; b < WIN; b++)
      for (let a = 0; a < WIN; a++) {
        const v = b * M + a,
          g = (j0 + b) * N + i0 + a;
        // diagonale le long de la pente du quad : les plans gardent leurs arêtes
        if (Math.abs(G[g] - G[g + N + 1]) <= Math.abs(G[g + 1] - G[g + N])) {
          idx[n++] = v;
          idx[n++] = v + M;
          idx[n++] = v + M + 1;
          idx[n++] = v;
          idx[n++] = v + M + 1;
          idx[n++] = v + 1;
        } else {
          idx[n++] = v;
          idx[n++] = v + M;
          idx[n++] = v + 1;
          idx[n++] = v + 1;
          idx[n++] = v + M;
          idx[n++] = v + M + 1;
        }
      }
    pos.needsUpdate = nor.needsUpdate = uv.needsUpdate = col.needsUpdate = ble.needsUpdate = true;
    geo.index!.needsUpdate = true;
  }
}
