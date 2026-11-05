// Relief au rendu (phase 18) : sol déplacé par la carte de hauteur de la sim, et lecture « posé au sol » qui suit
// exactement la surface dessinée (même grille, même interpolation) : rien ne flotte ni ne s'enfonce.
import * as THREE from 'three';
import { TERRAIN, WORLD_HALF } from '../sim/balance';
import type { World } from '../sim/world';

/** Segments par côté du sol : 64 × 64 ≈ 8 k triangles, 1 appel (cases de ≈ 5,3 u, collines de σ ≥ 7 u). */
export const GROUND_SEG = 64;
const N = GROUND_SEG + 1;
const CELL = (2 * WORLD_HALF) / GROUND_SEG;
/** Lumière rasante (du côté de la lune de la scène) pour l'ombrage cuit du sol : une lumière basse révèle le relief. */
const sunDir = new THREE.Vector3(-8, 5, 5).normalize();

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

  /** Échantillonne la sim et construit le maillage du sol (couleurs par sommet : crêtes plus claires, creux plus sombres). */
  build(w: World, mat: THREE.Material): THREE.Mesh {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) this.grid[j * N + i] = w.heightAt(-WORLD_HALF + i * CELL, -WORLD_HALF + j * CELL);
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, GROUND_SEG, GROUND_SEG).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) pos.setY(v, this.gy(pos.getX(v), pos.getZ(v)));
    geo.computeVertexNormals();
    // couleurs par sommet : ombrage « cuit » par la lune (sun) bien plus marqué que la seule lumière de la scène, pour que
    // les pentes douces se lisent depuis la caméra haute la nuit ; creux plus sombres, sommets plus clairs
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const L = sunDir;
    for (let v = 0; v < pos.count; v++) {
      const h = pos.getY(v);
      const lit = nrm.getX(v) * L.x + nrm.getY(v) * L.y + nrm.getZ(v) * L.z - L.y; // 0 sur le plat
      const t = Math.min(1, h / (TERRAIN.peak * 0.8));
      const k = Math.max(0.45, Math.min(1.45, 1 + 3.2 * lit));
      // creux bleutés et sombres → sommets plus clairs et chauds (lisible la nuit depuis la caméra haute)
      col[v * 3] = (0.62 + 0.55 * t) * k;
      col[v * 3 + 1] = (0.7 + 0.45 * t) * k;
      col[v * 3 + 2] = (0.86 + 0.12 * t) * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Mesh(geo, mat);
  }
}
