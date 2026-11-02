import type { Card, Input, WeaponKey } from '../../src/sim/types';
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

const ACCEPT_ALL = (): boolean => true; // constante : pas de closure allouée à chaque pick

/** Index de la carte de plus grande valeur parmi celles qui passent le filtre (ou -1 si aucune). */
function bestCard(w: World, cards: Card[], accept: (c: Card) => boolean): number {
  let best = -1,
    bv = -1e9;
  for (let i = 0; i < cards.length; i++) {
    if (!accept(cards[i])) continue;
    const v = cardValue(w, cards[i]);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/**
 * Choix du bot restreint à une liste d'armes autorisées (option `--weapons` de la CLI).
 * Si le bot prend une carte d'arme hors liste, on la remplace par la meilleure carte
 * autorisée (passif, soin ou arme de la liste) ; si aucune n'est autorisée, carte 0 quand même.
 * `allowed` à null = aucune restriction.
 */
export function pickAllowed(bot: Bot, w: World, cards: Card[], allowed: ReadonlySet<string> | null): number {
  const idx = bot.pick(w, cards);
  if (!allowed) return idx;
  const isAllowed = (c: Card) => c.kind !== 'w' || allowed.has(c.key);
  const chosen = cards[idx];
  if (chosen && isAllowed(chosen)) return idx;
  const alt = bestCard(w, cards, isAllowed);
  return alt >= 0 ? alt : 0;
}

/**
 * Garde-fou de `--weapons` : si le tirage n'offrait que des armes hors liste (garantie « au moins une arme »
 * de la progression), la carte prise est retirée après coup. Le monde reste déterministe : même seed, même retrait.
 */
export function enforceAllowed(w: World, allowed: ReadonlySet<string> | null): void {
  if (!allowed) return;
  for (const k of Object.keys(w.weapons)) if (!allowed.has(k)) delete w.weapons[k as WeaponKey];
}

/** Réglages du bot « average » ; « greedy » n'en est qu'une variante plus gourmande. */
export interface AverageOptions {
  /** Nom affiché dans la CLI. */
  name?: string;
  /** Part d'aléa dans les choix de cartes (0 = pick optimal). */
  randomness?: number;
  /** Rayon (u) dans lequel la gemme la plus proche attire le bot, même en fuite. */
  gemRadius?: number;
  /** Poids de l'attraction vers la gemme pendant une fuite. */
  gemPullFleeing?: number;
  /** Poids de l'attraction vers la gemme hors danger. */
  gemPullFree?: number;
}

/**
 * Bot de référence (skill sim-testing §2) : fuit le centre de masse des ennemis dans 8 u,
 * dash quand ≥ 6 ennemis à < 2 u, saute si entouré, pick = meilleur gain de DPS avec 30 % d'aléa.
 */
export function makeAverage(seed: number, opts: AverageOptions = {}): Bot {
  const name = opts.name ?? 'average';
  const randomness = opts.randomness ?? 0.3;
  const gemR2 = (opts.gemRadius ?? 7) ** 2;
  const pullFleeing = opts.gemPullFleeing ?? 0.6;
  const pullFree = opts.gemPullFree ?? 1.2;
  const r = new Rng(seed);
  return {
    name,
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
      // attiré par la gemme la plus proche dans gemRadius (même en fuyant)
      let gx = 0,
        gz = 0,
        gd = gemR2;
      for (let i = 0; i < w.gemCount; i++) {
        const g = w.gems[i];
        const d = (g.x - P.x) ** 2 + (g.z - P.z) ** 2;
        if (d < gd) {
          gd = d;
          gx = g.x - P.x;
          gz = g.z - P.z;
        }
      }
      if (gd < gemR2) {
        const l = Math.sqrt(gd) || 1;
        const k = n > 0 ? pullFleeing : pullFree;
        out.mx += (gx / l) * k;
        out.mz += (gz / l) * k;
      }
      // borne l'entrée à un vecteur unitaire (la sim normalise de toute façon au-delà de 1)
      const ml = Math.sqrt(out.mx * out.mx + out.mz * out.mz);
      if (ml > 1) {
        out.mx /= ml;
        out.mz /= ml;
      }
      out.dash = close >= 6 && P.dashCd <= 0;
      // TODO phase 3 : Volant — sauter quand un Volant est à < 3 u (l'ennemi n'existe pas encore)
      out.jump = close >= 3 && P.onGround && !out.dash;
    },
    pick(w, cards) {
      if (r.next() < randomness) return r.int(cards.length);
      return Math.max(0, bestCard(w, cards, ACCEPT_ALL));
    },
  };
}

/**
 * Plafond : même pilotage qu'« average » mais va chercher les gemmes de plus loin et plus fort,
 * pick optimal sans aléa.
 * TODO phase 3 : coffres — aller les ramasser quand ils existeront.
 */
export function makeGreedy(seed: number): Bot {
  return makeAverage(seed, { name: 'greedy', randomness: 0, gemRadius: 14, gemPullFleeing: 1.0, gemPullFree: 1.6 });
}

export function makeBot(name: string, seed: number): Bot {
  if (name === 'naive') return naive;
  if (name === 'greedy') return makeGreedy(seed);
  return makeAverage(seed);
}
