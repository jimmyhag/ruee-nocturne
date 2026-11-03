import type { PassiveKey, WeaponKey } from '../types';
import type { World } from '../world';

// Les noms et descriptions vivent côté UI (src/ui/cards.ts + src/i18n) : la sim ne porte que des clés et des stats.
export interface WeaponDef {
  glyph: string;
  color: string;
  stats: (lv: number) => Record<string, number>;
}

// Grammaire survivor-design §4 : portée / ciblage / rythme jamais partagés par deux armes.
export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  orbe: {
    // longue · auto plus proche · salve
    glyph: '●',
    color: '#ffcc4d',
    stats: (lv) => ({ cd: 0.95 - 0.09 * (lv - 1), n: [1, 1, 2, 2, 3][lv - 1], dmg: 10 + 5 * (lv - 1), pierce: lv >= 4 ? 2 : 1, speed: 17 }),
  },
  aura: {
    // contact · zone autour · continu
    glyph: '◎',
    color: '#59d8ff',
    stats: (lv) => ({ r: 2.2 + 0.45 * (lv - 1), dmg: 5 + 2.5 * (lv - 1), period: 0.45 }),
  },
  lames: {
    // courte · orbite · continu
    glyph: '✦',
    color: '#fff1db',
    // r 1,8 + 0,15·lv (2,3 avant) : avec 2,45 u un Dard collé au joueur passait sous l'anneau (80 % de morts < 3 min en solo)
    stats: (lv) => ({ n: lv + 1, dmg: 12 + 5 * (lv - 1), r: 1.8 + 0.15 * lv, spd: 3 + 0.35 * lv }),
  },
  foudre: {
    // longue · aléatoire + chaîne · lent et fort
    glyph: 'ϟ',
    color: '#d8f4ff',
    stats: (lv) => ({ cd: 2.3 - 0.28 * (lv - 1), dmg: 28 + 12 * (lv - 1), chain: 2 + lv }),
  },
  boomerang: {
    // longue · direction du regard · salve ; niveau 5 : deux boomerangs (changement qualitatif)
    glyph: '⟲',
    color: '#7ee0a1',
    stats: (lv) => ({ cd: 1.7 - 0.16 * (lv - 1), dmg: 14 + 6 * (lv - 1), range: 9 + 0.5 * (lv - 1), speed: 14, n: lv >= 5 ? 2 : 1 }),
  },
  mines: {
    // contact · là où je passe · pose ; niveau 5 : explosions en chaîne
    glyph: '✸',
    color: '#ff7a3d',
    stats: (lv) => ({ cd: 0.9 - 0.08 * (lv - 1), dmg: 30 + 12 * (lv - 1), r: 2.2 + 0.15 * (lv - 1), n: 4 + lv, chain: lv >= 5 ? 1 : 0 }),
  },
};
export const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];
// stats(lv) est appelée à chaque step (sim) et à chaque frame (rendu) : mémoïsée par niveau, le résultat est
// partagé et ne doit jamais être modifié par l'appelant.
for (const k of WEAPON_KEYS) {
  const raw = WEAPONS[k].stats;
  const cache: Record<string, number>[] = [];
  WEAPONS[k].stats = (lv) => (cache[lv] ??= raw(lv));
}

/** Évolutions (PLAN §3.1) : arme niveau 5 + passif associé + un coffre. ≈ ×2,5 (survivor-design §5). Valeurs : EVOLVE. */
export interface EvolutionDef {
  passive: PassiveKey;
  glyph: string;
  color: string;
}
export const EVOLUTIONS: Partial<Record<WeaponKey, EvolutionDef>> = {
  orbe: { passive: 'force', glyph: '✹', color: '#ffcc4d' }, // Nova
  aura: { passive: 'coeur', glyph: '◉', color: '#59d8ff' }, // Soleil noir
  lames: { passive: 'vitesse', glyph: '✧', color: '#fff1db' }, // Tempête
  foudre: { passive: 'cadence', glyph: '⚡', color: '#d8f4ff' }, // Orage
};

export interface PassiveDef {
  glyph: string;
  color: string;
  max: number;
  apply: (w: World) => void;
}
export const PASSIVES: Record<PassiveKey, PassiveDef> = {
  vitesse: { glyph: '»', color: '#ff8a3d', max: 5, apply: (w) => void (w.player.speed *= 1.1) }, // +10 % de vitesse
  coeur: {
    glyph: '♥',
    color: '#ff5470',
    max: 5,
    apply: (w) => {
      // +25 PV max et 25 PV soignés
      w.player.maxHp += 25;
      w.player.hp = Math.min(w.player.maxHp, w.player.hp + 25);
    },
  },
  regen: { glyph: '+', color: '#7ee0a1', max: 5, apply: (w) => void (w.player.regen += 0.6) }, // 0,6 PV/s
  aimant: { glyph: '∩', color: '#59d8ff', max: 4, apply: (w) => void (w.player.magnet *= 1.35) }, // +35 % de collecte
  force: { glyph: '▲', color: '#ffcc4d', max: 5, apply: (w) => void (w.player.dmgMul += 0.15) }, // +15 % de dégâts
  cadence: { glyph: '◐', color: '#c7b3cf', max: 5, apply: (w) => void (w.player.cdMul *= 0.92) }, // −8 % de recharge
  trefle: { glyph: '☘', color: '#7ee0a1', max: 4, apply: (w) => void (w.player.luck += 1) }, // +6 % de 4e carte, coffres
  bourse: { glyph: '$', color: '#ffcc4d', max: 4, apply: (w) => void (w.player.goldMul *= 1.25) }, // +25 % d'or
};
export const PASSIVE_KEYS = Object.keys(PASSIVES) as PassiveKey[];
