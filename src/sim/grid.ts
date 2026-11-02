import { GRID_CELL, GRID_HALF_CELLS } from './balance';
import type { Enemy } from './types';

// Grille spatiale à tableaux fixes (bucket sort) : zéro allocation après construction.
// Centrée sur le joueur à chaque reconstruction, ce qui évite les clés négatives.
const N = GRID_HALF_CELLS * 2;
const CELLS = N * N;

export class SpatialGrid {
  private cellStart = new Int32Array(CELLS + 1);
  private cellCount = new Int32Array(CELLS);
  private items: Int32Array;
  private cellOf: Int32Array;
  private ox = 0;
  private oz = 0;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
  }

  private cellIndex(x: number, z: number): number {
    let ix = Math.floor((x - this.ox) / GRID_CELL) + GRID_HALF_CELLS;
    let iz = Math.floor((z - this.oz) / GRID_CELL) + GRID_HALF_CELLS;
    if (ix < 0) ix = 0;
    else if (ix >= N) ix = N - 1;
    if (iz < 0) iz = 0;
    else if (iz >= N) iz = N - 1;
    return ix * N + iz;
  }

  build(enemies: Enemy[], count: number, cx: number, cz: number): void {
    this.ox = cx;
    this.oz = cz;
    this.cellCount.fill(0);
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(enemies[i].x, enemies[i].z);
      this.cellOf[i] = c;
      this.cellCount[c]++;
    }
    let acc = 0;
    for (let c = 0; c < CELLS; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }
    this.cellStart[CELLS] = acc;
    // réutilise cellCount comme curseur d'écriture
    this.cellCount.fill(0);
    for (let i = 0; i < count; i++) {
      const c = this.cellOf[i];
      this.items[this.cellStart[c] + this.cellCount[c]++] = i;
    }
    this.size = count;
  }

  /**
   * Écrit dans `out` les indices des ennemis dont le disque intersecte (x,z,r). Retourne le nombre.
   * `radiusPad` = plus grand rayon d'ennemi (pour couvrir les cellules voisines).
   */
  query(enemies: Enemy[], x: number, z: number, r: number, radiusPad: number, out: Int32Array): number {
    let n = 0;
    const M = r + radiusPad;
    const ix0 = Math.max(0, Math.floor((x - M - this.ox) / GRID_CELL) + GRID_HALF_CELLS);
    const ix1 = Math.min(N - 1, Math.floor((x + M - this.ox) / GRID_CELL) + GRID_HALF_CELLS);
    const iz0 = Math.max(0, Math.floor((z - M - this.oz) / GRID_CELL) + GRID_HALF_CELLS);
    const iz1 = Math.min(N - 1, Math.floor((z + M - this.oz) / GRID_CELL) + GRID_HALF_CELLS);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const c = ix * N + iz;
        const s = this.cellStart[c],
          e = this.cellStart[c + 1];
        for (let k = s; k < e; k++) {
          const i = this.items[k];
          const en = enemies[i];
          if (!en.alive) continue;
          const dx = en.x - x,
            dz = en.z - z,
            rr = r + en.r;
          if (dx * dx + dz * dz < rr * rr && n < out.length) out[n++] = i;
        }
      }
    }
    return n;
  }

  /** Voisins dans les 9 cellules autour de l'ennemi i (séparation). */
  neighbors(i: number, out: Int32Array): number {
    let n = 0;
    const c = this.cellOf[i];
    const ix = (c / N) | 0,
      iz = c % N;
    for (let a = -1; a <= 1; a++) {
      const jx = ix + a;
      if (jx < 0 || jx >= N) continue;
      for (let b = -1; b <= 1; b++) {
        const jz = iz + b;
        if (jz < 0 || jz >= N) continue;
        const cc = jx * N + jz;
        const s = this.cellStart[cc],
          e = this.cellStart[cc + 1];
        for (let k = s; k < e; k++) {
          const j = this.items[k];
          if (j !== i && n < out.length) out[n++] = j;
        }
      }
    }
    return n;
  }
}
