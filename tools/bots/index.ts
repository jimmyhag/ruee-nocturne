import type { Card, Input } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { WEAPONS } from '../../src/sim/weapons/defs';
import { Rng } from '../../src/sim/rng';
import { ENEMIES } from '../../src/sim/balance';

export interface Bot {
  name: string;
  decide(w: World, frame: number, out: Input): void;
  pick(w: World, cards: Card[]): number;
}

/** Plancher : tourne en cercle, prend la première carte. */
export const naive: Bot = {
  name: 'naive',
  decide(_w, frame, out) {
    const a = frame / 120;
    out.mx = Math.cos(a);
    out.mz = Math.sin(a);
    out.jump = false;
    out.dash = false;
  },
  pick: () => 0,
};

function dpsOf(key: string, lv: number): number {
  const d = WEAPONS[key as keyof typeof WEAPONS];
  if (!d) return 0;
  const s = d.stats(lv);
  switch (key) {
    case 'orbe':
      return (s.n * s.dmg * s.pierce) / s.cd;
    case 'aura':
      return (s.dmg / s.period) * (s.r * s.r * 0.4); // approx : nombre d'ennemis dans l'aura
    case 'lames':
      return s.n * s.dmg * 1.6;
    case 'foudre':
      return ((s.chain + 1) * s.dmg) / s.cd;
  }
  return 0;
}

/** Valeur d'une carte pour un bot : gain de DPS théorique, passifs valorisés par règle simple. */
function cardValue(w: World, c: Card): number {
  if (c.kind === 'heal') return w.player.hp / w.player.maxHp < 0.4 ? 100 : 5;
  if (c.kind === 'w') return dpsOf(c.key, c.lv) - dpsOf(c.key, c.lv - 1) + (c.lv === 1 ? 6 : 0);
  const base: Record<string, number> = { force: 14, cadence: 12, vitesse: 10, coeur: 9, aimant: 7, regen: 6 };
  return base[c.key] ?? 5;
}

/** Fuit le centre de masse des ennemis proches, dash en danger, saute si entouré. 30 % d'aléa dans les choix. */
export function makeAverage(seed: number, randomness = 0.3): Bot {
  const r = new Rng(seed);
  return {
    name: 'average',
    decide(w, _frame, out) {
      const P = w.player;
      let cx = 0,
        cz = 0,
        n = 0,
        close = 0;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d2 = dx * dx + dz * dz;
        if (d2 < 64) {
          const danger = ENEMIES[e.type].dmg * (1 + e.r); // le Gardien pèse 10× un Spectre
          const wgt = danger / (d2 + 0.5);
          cx += dx * wgt;
          cz += dz * wgt;
          n++;
          if (d2 < 4) close++;
        }
      }
      if (n > 0) {
        const l = Math.sqrt(cx * cx + cz * cz) || 1;
        out.mx = -cx / l;
        out.mz = -cz / l;
        // léger biais tangent pour ne pas foncer dans un mur d'ennemis
        out.mx += (-cz / l) * 0.35;
        out.mz += (cx / l) * 0.35;
      } else {
        // va vers la gemme la plus proche
        let bx = 0,
          bz = 0,
          bd = 1e9;
        for (let i = 0; i < w.gemCount; i++) {
          const g = w.gems[i];
          const d = (g.x - P.x) ** 2 + (g.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = g.x;
            bz = g.z;
          }
        }
        if (bd < 1e9) {
          const l = Math.sqrt(bd) || 1;
          out.mx = (bx - P.x) / l;
          out.mz = (bz - P.z) / l;
        } else {
          out.mx = 1;
          out.mz = 0;
        }
      }
      // attiré par la gemme la plus proche dans 7 u (même en fuyant)
      let gx = 0,
        gz = 0,
        gd = 49;
      for (let i = 0; i < w.gemCount; i++) {
        const g = w.gems[i];
        const d = (g.x - P.x) ** 2 + (g.z - P.z) ** 2;
        if (d < gd) {
          gd = d;
          gx = g.x - P.x;
          gz = g.z - P.z;
        }
      }
      if (gd < 49) {
        const l = Math.sqrt(gd) || 1;
        const k = n > 0 ? 0.6 : 1.2;
        out.mx += (gx / l) * k;
        out.mz += (gz / l) * k;
      }
      out.dash = close >= 5 && P.dashCd <= 0;
      out.jump = close >= 3 && P.onGround && !out.dash;
    },
    pick(w, cards) {
      if (r.next() < randomness) return r.int(cards.length);
      let best = 0,
        bv = -1e9;
      for (let i = 0; i < cards.length; i++) {
        const v = cardValue(w, cards[i]);
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      return best;
    },
  };
}

export function makeGreedy(seed: number): Bot {
  const b = makeAverage(seed, 0);
  b.name = 'greedy';
  return b;
}

export function makeBot(name: string, seed: number): Bot {
  if (name === 'naive') return naive;
  if (name === 'greedy') return makeGreedy(seed);
  return makeAverage(seed);
}
