// Relief au rendu (phase 18) : sol déplacé par la carte de hauteur de la sim, et lecture « posé au sol » qui suit
// exactement la surface dessinée (même grille, même interpolation) : rien ne flotte ni ne s'enfonce.
import * as THREE from 'three';
import { TERRAIN, WORLD_HALF } from '../sim/balance';
import type { World } from '../sim/world';

/**
 * Phase 27 : le sol suit exactement la grille de la sim (cases de TERRAIN.cell u) pour garder les arêtes nettes des
 * plateaux et des rampes, découpé en TILES × TILES tuiles écartées hors champ (≈ 2 300 triangles par tuile, 2 à 6 vues).
 */
export const TILES = 5;
const N = Math.round((2 * WORLD_HALF) / TERRAIN.cell) + 1;
const CELL = TERRAIN.cell;
const PER = (N - 1) / TILES; // cases par tuile
/** Lumière rasante (du côté de la lune de la scène) pour l'ombrage cuit du sol : une lumière basse révèle le relief. */
const sunDir = new THREE.Vector3(-8, 5, 5).normalize();
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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

  /**
   * Échantillonne la sim et construit le sol en tuiles : couleurs par sommet (herbe sur le plat, terre et pierre sur les
   * flancs, sommets plus clairs, fonds de combes plus sombres) et ombrage cuit par la lune.
   */
  build(w: World, mat: THREE.Material): THREE.Group {
    const G = this.grid;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) G[j * N + i] = w.heightAt(-WORLD_HALF + i * CELL, -WORLD_HALF + j * CELL);
    // normales et pente aux nœuds (différences centrées : continues d'une tuile à l'autre)
    const nrm = new Float32Array(N * N * 3),
      slope = new Float32Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const gx = (G[j * N + Math.min(N - 1, i + 1)] - G[j * N + Math.max(0, i - 1)]) / (2 * CELL),
          gz = (G[Math.min(N - 1, j + 1) * N + i] - G[Math.max(0, j - 1) * N + i]) / (2 * CELL);
        const l = Math.hypot(gx, 1, gz),
          k = (j * N + i) * 3;
        nrm[k] = -gx / l;
        nrm[k + 1] = 1 / l;
        nrm[k + 2] = -gz / l;
        slope[j * N + i] = Math.hypot(gx, gz);
      }
    const group = new THREE.Group();
    const L = sunDir,
      M = PER + 1;
    for (let tj = 0; tj < TILES; tj++)
      for (let ti = 0; ti < TILES; ti++) {
        const pos = new Float32Array(M * M * 3),
          nor = new Float32Array(M * M * 3),
          uv = new Float32Array(M * M * 2),
          col = new Float32Array(M * M * 3);
        for (let b = 0; b < M; b++)
          for (let a = 0; a < M; a++) {
            const i = ti * PER + a,
              j = tj * PER + b,
              g = j * N + i,
              v = b * M + a;
            const x = -WORLD_HALF + i * CELL,
              z = -WORLD_HALF + j * CELL,
              h = G[g];
            pos[v * 3] = x;
            pos[v * 3 + 1] = h;
            pos[v * 3 + 2] = z;
            nor[v * 3] = nrm[g * 3];
            nor[v * 3 + 1] = nrm[g * 3 + 1];
            nor[v * 3 + 2] = nrm[g * 3 + 2];
            uv[v * 2] = (x + WORLD_HALF) / (2 * WORLD_HALF);
            uv[v * 2 + 1] = 1 - (z + WORLD_HALF) / (2 * WORLD_HALF);
            const lit = nrm[g * 3] * L.x + nrm[g * 3 + 1] * L.y + nrm[g * 3 + 2] * L.z - L.y; // 0 sur le plat
            const t = Math.max(-0.35, Math.min(1, h / (TERRAIN.peak * 0.8)));
            const bank = smooth(0.1, 0.3, slope[g]);
            // courbure (laplacien) : arête d'un sommet (convexe) éclairée, pied de flanc (concave) assombri — les
            // plateaux et les rampes se lisent d'en haut, la nuit, comme des formes nettes
            const lap =
              (G[j * N + Math.min(N - 1, i + 1)] +
                G[j * N + Math.max(0, i - 1)] +
                G[Math.min(N - 1, j + 1) * N + i] +
                G[Math.max(0, j - 1) * N + i] -
                4 * h) /
              (CELL * CELL);
            const edge = Math.max(-0.35, Math.min(0.3, -lap * 1.6));
            const k = Math.max(0.45 + 0.35 * bank, Math.min(1.7, 1 + 3.4 * lit + edge)); // un flanc à l'ombre reste de la terre, pas un trou
            // herbe : creux bleutés, sommets plus clairs ; flanc : terre et pierre chaudes, bien distinctes
            const gr = 0.6 + 0.6 * t,
              gg = 0.68 + 0.5 * t,
              gb = 0.86 + 0.12 * t;
            const br = 1.32 + 0.18 * t,
              bg = 1.0 + 0.12 * t,
              bb = 0.78 + 0.08 * t;
            col[v * 3] = (gr + (br - gr) * bank) * k;
            col[v * 3 + 1] = (gg + (bg - gg) * bank) * k;
            col[v * 3 + 2] = (gb + (bb - gb) * bank) * k;
          }
        const idx = new Uint16Array(PER * PER * 6);
        let n = 0;
        for (let b = 0; b < PER; b++)
          for (let a = 0; a < PER; a++) {
            const v = b * M + a;
            // diagonale alignée sur la pente du quad : les plans gardent leurs arêtes
            const d1 = Math.abs(G[(tj * PER + b) * N + ti * PER + a] - G[(tj * PER + b + 1) * N + ti * PER + a + 1]),
              d2 = Math.abs(G[(tj * PER + b) * N + ti * PER + a + 1] - G[(tj * PER + b + 1) * N + ti * PER + a]);
            if (d1 <= d2) idx.set([v, v + M, v + M + 1, v, v + M + 1, v + 1], n);
            else idx.set([v, v + M, v + 1, v + 1, v + M, v + M + 1], n);
            n += 6;
          }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        group.add(new THREE.Mesh(geo, mat));
      }
    return group;
  }
}
