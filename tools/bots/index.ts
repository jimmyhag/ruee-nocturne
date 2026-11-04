import type { Card, Input, TomeKey, WeaponKey } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { ShotKind } from '../../src/sim/types';
import { Rng } from '../../src/sim/rng';
import { ELITE_TYPE, ENEMIES, HAZARDS, STEP, TOMES, VOLANT_TYPE, WEAPON_LINES } from '../../src/sim/balance';

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

/** Valeur d'une ligne de stat pour le bot (phase 12) : gain relatif approximatif, +1 projectile pèse lourd. */
const LINE_VALUE: Record<string, number> = {
  // armes
  dmg: 7,
  cd: 6,
  n: 22,
  speed: 3,
  pierce: 10,
  r: 6,
  period: 6,
  spd: 4,
  chain: 9,
  range: 4,
  // tomes
  elite: 4,
  kb: 2,
  life: 3,
  proj: 26,
  size: 5,
  pspeed: 3,
  hp: 6,
  regen: 5,
  armor: 6,
  dashcd: 3,
  dashinvul: 2,
  xp: 6,
  magnet: 4,
  luck: 4,
  chestgold: 1,
  gold: 2,
  elitegold: 1,
};
function lineValue(c: Card, s: number): number {
  if (s < 0) return 0;
  const l = c.kind === 'w' ? WEAPON_LINES[c.key as WeaponKey][s] : TOMES[c.key as TomeKey][s];
  const base = LINE_VALUE[l.stat] ?? 3;
  // tome Dégâts / Cadence : s'applique à toutes les armes, vaut plus qu'une ligne d'arme
  return c.kind === 't' && (l.stat === 'dmg' || l.stat === 'cd') ? base * 1.3 : base;
}

/** Valeur d'une carte pour un bot : somme de ses lignes (phase 12) ; nouvelle arme et soin valorisés par règle simple. */
function cardValue(w: World, c: Card): number {
  if (c.kind === 'heal') return w.player.hp / w.player.maxHp < 0.4 ? 100 : 5;
  let v = lineValue(c, c.s0) + lineValue(c, c.s1) + lineValue(c, c.s2);
  if (c.kind === 'w' && c.lv === 1) v += 18; // une arme de plus : une base entière
  if (c.kind === 't' && c.key === 'vitalite' && w.player.hp / w.player.maxHp < 0.4) v += 15;
  return v;
}

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
  /** Rayon (u) dans lequel un coffre attire le bot (greedy : de loin). */
  chestRadius?: number;
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
  const chestR2 = (opts.chestRadius ?? 10) ** 2;
  const r = new Rng(seed);
  let stuck = 0; // frames consécutives où le joueur n'a presque pas avancé malgré l'entrée (bord de plateau, arbre)
  return {
    name,
    decide(w, _frame, out) {
      const P = w.player;
      // phase 11 : bloqué au pied d'un plateau (ou contre un arbre) → on saute, comme un joueur qui grimpe
      const wanted = Math.sqrt(out.mx * out.mx + out.mz * out.mz);
      const moved = Math.sqrt((P.x - P.px) ** 2 + (P.z - P.pz) ** 2);
      stuck = wanted > 0.5 && P.onGround && moved < P.speed * STEP * 0.3 ? stuck + 1 : 0;
      const blocked = stuck >= 3;
      let cx = 0,
        cz = 0,
        n = 0,
        close = 0,
        diving = false;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d2 = dx * dx + dz * dz;
        // Volant qui s'apprête à plonger à < 3 u : on saute au bon moment (survivor-design §6)
        if (e.type === VOLANT_TYPE && e.state === 1 && e.timer < 0.2 && d2 < 9) diving = true;
        if (d2 < 64) {
          const danger = ENEMIES[e.type].dmg * (1 + e.r); // le Gardien pèse 10× un Spectre
          const wgt = danger / (d2 + 0.5);
          cx += dx * wgt;
          cz += dz * wgt;
          n++;
          if (d2 < 4) close++;
        }
      }
      // cercles rouges du Colosse : un joueur moyen lit le télégraphe et sort de la zone
      // phase 11 : éruption sous les pieds imminente ou onde de choc qui arrive → saut au bon moment
      let hazard = false;
      for (let i = 0; i < w.shotCount; i++) {
        const s = w.shots[i];
        const dx = s.x - P.x,
          dz = s.z - P.z,
          d2 = dx * dx + dz * dz;
        if (s.kind === ShotKind.Eruption) {
          if (s.life < 0.4 && d2 < (s.r + 0.6) ** 2) hazard = true;
          continue;
        }
        if (s.kind === ShotKind.Ring) {
          const gap = Math.sqrt(d2) - s.r; // distance restante avant le passage de l'anneau
          if (gap > -0.6 && gap < HAZARDS.ring.speed * 0.3) hazard = true;
          continue;
        }
        if (s.kind !== ShotKind.Zone) continue;
        if (d2 < (s.r + 1.5) ** 2) {
          const wgt = 60 / (d2 + 0.5);
          cx += dx * wgt;
          cz += dz * wgt;
          n++;
        }
      }
      // Brute élite qui charge dans notre direction : on la traverse en dash (invulnérable) si elle est proche
      let charged = false;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (!(e.elite && e.type === ELITE_TYPE) || e.state !== 1 || e.timer > 0.25) continue;
        const dx = P.x - e.x,
          dz = P.z - e.z;
        const along = dx * e.tx + dz * e.tz; // projection sur la ligne de charge
        const side = Math.abs(dx * e.tz - dz * e.tx);
        if (along > 0 && along < HAZARDS.charge.dist + 1 && side < e.r + 1) charged = true;
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
      // un coffre à portée attire plus qu'une gemme (évolutions, 3–5 cartes)
      let kx = 0,
        kz = 0,
        kd = chestR2;
      for (let i = 0; i < w.chestCount; i++) {
        const c = w.chests[i];
        const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
        if (d < kd) {
          kd = d;
          kx = c.x - P.x;
          kz = c.z - P.z;
        }
      }
      if (kd < chestR2) {
        const l = Math.sqrt(kd) || 1;
        const k = n > 0 ? pullFleeing * 1.5 : pullFree * 1.5;
        out.mx += (kx / l) * k;
        out.mz += (kz / l) * k;
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
      out.dash = (close >= 6 || charged) && P.dashCd <= 0;
      out.jump = (diving || hazard || blocked || close >= 3) && P.onGround && !out.dash;
    },
    pick(w, cards) {
      if (r.next() < randomness) return r.int(cards.length);
      return Math.max(
        0,
        bestCard(w, cards, () => true),
      );
    },
  };
}

/**
 * Plafond : même pilotage qu'« average » mais va chercher gemmes et coffres de plus loin et plus fort,
 * pick optimal sans aléa.
 */
export function makeGreedy(seed: number): Bot {
  return makeAverage(seed, {
    name: 'greedy',
    randomness: 0,
    gemRadius: 14,
    gemPullFleeing: 1.0,
    gemPullFree: 1.6,
    chestRadius: 22,
  });
}

export function makeBot(name: string, seed: number): Bot {
  if (name === 'naive') return naive;
  if (name === 'greedy') return makeGreedy(seed);
  return makeAverage(seed);
}
