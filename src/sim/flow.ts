// Champ de flux (phase 16) : distance en cases jusqu'au joueur sur une grille locale (FLOW.half × 2 cases de côté),
// recalculée toutes les FLOW.period s par un parcours en largeur sur les cases libres de w.solid. Les ennemis au sol
// vont tout droit tant que cela les rapproche dans le champ, sinon ils prennent la case voisine la plus proche :
// derrière un muret ils trouvent la brèche, en terrain ouvert rien ne change. Tableaux préalloués, aucune allocation.
import { FLOW, WORLD_HALF } from './balance';
import type { World } from './world';

const S = FLOW.half * 2; // côté de la grille locale, en cases
const UNSEEN = -1;
// 8 voisins : (di, dj)
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const INV_SQRT2 = Math.SQRT1_2;

export class FlowField {
  readonly dist = new Int16Array(S * S);
  private readonly queue = new Int32Array(S * S);
  /** Case (dans la grille de toute la carte) du coin bas-gauche de la grille locale. */
  oi = 0;
  oj = 0;
  private timer = 0;
  ready = false;

  /** Recalcule si la période est écoulée. */
  tick(w: World, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0 && this.ready) return;
    this.timer = FLOW.period;
    this.compute(w);
  }

  compute(w: World): void {
    const N = w.solidN,
      C = FLOW.cell,
      sol = w.solid,
      dist = this.dist,
      q = this.queue;
    const pi = Math.floor((w.player.x + WORLD_HALF) / C),
      pj = Math.floor((w.player.z + WORLD_HALF) / C);
    // la carte est statique : même case du joueur, même champ (le plus souvent quand il ne bouge pas ou tourne en rond)
    if (this.ready && pi - FLOW.half === this.oi && pj - FLOW.half === this.oj) return;
    this.oi = pi - FLOW.half;
    this.oj = pj - FLOW.half;
    dist.fill(UNSEEN);
    const li0 = FLOW.half,
      lj0 = FLOW.half;
    let head = 0,
      tail = 0;
    dist[lj0 * S + li0] = 0;
    q[tail++] = lj0 * S + li0;
    while (head < tail) {
      const c = q[head++];
      const li = c % S,
        lj = (c - li) / S,
        nd = dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const ni = li + DI[k],
          nj = lj + DJ[k];
        if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
        const n = nj * S + ni;
        if (dist[n] !== UNSEEN) continue;
        const gi = ni + this.oi,
          gj = nj + this.oj;
        if (gi < 0 || gj < 0 || gi >= N || gj >= N || sol[gj * N + gi]) continue;
        dist[n] = nd;
        q[tail++] = n;
      }
    }
    this.ready = true;
  }

  /** Distance de la case locale contenant (x, z), ou -1 (hors grille ou non atteinte). */
  at(x: number, z: number): number {
    const li = Math.floor((x + WORLD_HALF) / FLOW.cell) - this.oi,
      lj = Math.floor((z + WORLD_HALF) / FLOW.cell) - this.oj;
    if (li < 0 || lj < 0 || li >= S || lj >= S) return UNSEEN;
    return this.dist[lj * S + li];
  }

  /**
   * Direction de marche pour un ennemi au sol en (x, z) dont la direction directe vers le joueur est (ux, uz), unitaire.
   * Écrit une direction unitaire dans out[0], out[1] : la directe si elle fait progresser, sinon vers la meilleure voisine.
   * `detour` : l'ennemi butait sur un obstacle, on ignore la directe et on suit le flux case par case.
   */
  steer(x: number, z: number, ux: number, uz: number, out: Float64Array, detour = false): void {
    out[0] = ux;
    out[1] = uz;
    if (!this.ready) return;
    const C = FLOW.cell;
    const li = Math.floor((x + WORLD_HALF) / C) - this.oi,
      lj = Math.floor((z + WORLD_HALF) / C) - this.oj;
    if (li < 1 || lj < 1 || li >= S - 1 || lj >= S - 1) return; // hors grille : tout droit
    const d0 = this.dist[lj * S + li];
    if (d0 >= 0 && d0 <= 1) return; // case du joueur ou voisine
    if (d0 > 1 && !detour) {
      const ahead = this.at(x + ux * C, z + uz * C);
      if (ahead >= 0 && ahead < d0) return; // tout droit progresse
    }
    // case pleine (collé contre un muret, dans la marge) ou détour : vers la voisine libre la plus proche du joueur.
    // Diagonale seulement si les deux cases orthogonales sont libres : deux cases en diagonale peuvent être de part et
    // d'autre d'un muret oblique (1,41 u > 1,3 u d'épaisseur avec les marges), deux cases orthogonales jamais.
    let best = d0 < 0 ? 0x7fff : d0,
      bk = -1;
    for (let k = 0; k < 8; k++) {
      const n = (lj + DJ[k]) * S + (li + DI[k]);
      const dn = this.dist[n];
      if (dn < 0 || dn >= best) continue;
      if (k >= 4 && (this.dist[lj * S + li + DI[k]] < 0 || this.dist[(lj + DJ[k]) * S + li] < 0)) continue;
      best = dn;
      bk = k;
    }
    if (bk < 0) {
      // case pleine entourée de cases pleines (enfoncé dans la marge d'un angle de muret) : on cherche à deux cases
      if (d0 >= 0 || li < 2 || lj < 2 || li >= S - 2 || lj >= S - 2) return;
      let bi = 0,
        bj = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const dn = this.dist[(lj + dj) * S + li + di];
          if (dn >= 0 && dn < best) {
            best = dn;
            bi = di;
            bj = dj;
          }
        }
      if (bi === 0 && bj === 0) return;
      const l = Math.sqrt(bi * bi + bj * bj);
      out[0] = bi / l;
      out[1] = bj / l;
      return;
    }
    const f = bk >= 4 ? INV_SQRT2 : 1;
    out[0] = DI[bk] * f;
    out[1] = DJ[bk] * f;
  }
}
