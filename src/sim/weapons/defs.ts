import { EVOLVE } from '../balance';
import type { PassiveKey, WeaponKey } from '../types';
import type { World } from '../world';

const fr = (n: number) => String(n).replace('.', ',');

export interface WeaponDef {
  name: string;
  glyph: string;
  color: string;
  stats: (lv: number) => Record<string, number>;
  text: (s: Record<string, number>) => string;
}

// Grammaire survivor-design §4 : portée / ciblage / rythme jamais partagés par deux armes.
export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  orbe: {
    // longue · auto plus proche · salve
    name: 'Orbe filante',
    glyph: '●',
    color: '#ffcc4d',
    stats: (lv) => ({ cd: 0.95 - 0.09 * (lv - 1), n: [1, 1, 2, 2, 3][lv - 1], dmg: 10 + 5 * (lv - 1), pierce: lv >= 4 ? 2 : 1, speed: 17 }),
    text: (s) => `${s.n} tir${s.n > 1 ? 's' : ''} vers l'ennemi le plus proche, ${s.dmg} dégâts${s.pierce > 1 ? ', transperce' : ''}`,
  },
  aura: {
    // contact · zone autour · continu
    name: 'Halo brûlant',
    glyph: '◎',
    color: '#59d8ff',
    stats: (lv) => ({ r: 2.2 + 0.45 * (lv - 1), dmg: 5 + 2.5 * (lv - 1), period: 0.45 }),
    text: (s) => `Brûle tout dans un rayon de ${fr(+s.r.toFixed(1))} m, ${fr(s.dmg)} dégâts par impulsion`,
  },
  lames: {
    // courte · orbite · continu
    name: 'Lames orbitales',
    glyph: '✦',
    color: '#fff1db',
    // r 1,8 + 0,15·lv (2,3 avant) : avec 2,45 u un Dard collé au joueur passait sous l'anneau (80 % de morts < 3 min en solo)
    stats: (lv) => ({ n: lv + 1, dmg: 12 + 5 * (lv - 1), r: 1.8 + 0.15 * lv, spd: 3 + 0.35 * lv }),
    text: (s) => `${s.n} lames tournent autour de toi, ${s.dmg} dégâts et recul`,
  },
  foudre: {
    // longue · aléatoire + chaîne · lent et fort
    name: 'Foudre en chaîne',
    glyph: 'ϟ',
    color: '#d8f4ff',
    stats: (lv) => ({ cd: 2.3 - 0.28 * (lv - 1), dmg: 28 + 12 * (lv - 1), chain: 2 + lv }),
    text: (s) => `Frappe ${s.chain + 1} ennemis à la suite, ${s.dmg} dégâts chacun`,
  },
  boomerang: {
    // longue · direction du regard · salve ; niveau 5 : deux boomerangs (changement qualitatif)
    name: 'Boomerang',
    glyph: '⟲',
    color: '#7ee0a1',
    stats: (lv) => ({ cd: 1.7 - 0.16 * (lv - 1), dmg: 14 + 6 * (lv - 1), range: 9 + 0.5 * (lv - 1), speed: 14, n: lv >= 5 ? 2 : 1 }),
    text: (s) =>
      `${s.n === 1 ? 'Un boomerang part' : 'Deux boomerangs partent'} devant toi à ${fr(s.range)} m et revien${s.n === 1 ? 't' : 'nent'}, ${s.dmg} dégâts à l'aller et au retour`,
  },
  mines: {
    // contact · là où je passe · pose ; niveau 5 : explosions en chaîne
    name: 'Mines',
    glyph: '✸',
    color: '#ff7a3d',
    stats: (lv) => ({ cd: 0.9 - 0.08 * (lv - 1), dmg: 30 + 12 * (lv - 1), r: 2.2 + 0.15 * (lv - 1), n: 4 + lv, chain: lv >= 5 ? 1 : 0 }),
    text: (s) =>
      `Pose jusqu'à ${s.n} mines sur ton passage, ${s.dmg} dégâts dans ${fr(+s.r.toFixed(1))} m au contact${s.chain ? ', explosent en chaîne' : ''}`,
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

/** Évolutions (PLAN §3.1) : arme niveau 5 + passif associé + un coffre. ≈ ×2,5 (survivor-design §5). */
export interface EvolutionDef {
  passive: PassiveKey;
  name: string;
  glyph: string;
  color: string;
  text: string;
}
export const EVOLUTIONS: Partial<Record<WeaponKey, EvolutionDef>> = {
  orbe: { passive: 'force', name: 'Nova', glyph: '✹', color: '#ffcc4d', text: `Salve circulaire de ${EVOLVE.nova.n} orbes à chaque tir` },
  aura: {
    passive: 'coeur',
    name: 'Soleil noir',
    glyph: '◉',
    color: '#59d8ff',
    text: `Halo ×${fr(EVOLVE.soleil.rMul)} de rayon, dégâts ×${EVOLVE.soleil.dmgMul}, +${EVOLVE.soleil.healPerKill} PV par ennemi brûlé`,
  },
  lames: { passive: 'vitesse', name: 'Tempête', glyph: '✧', color: '#fff1db', text: `Lames à rayon et vitesse ×${EVOLVE.tempete.spdMul}` },
  foudre: { passive: 'cadence', name: 'Orage', glyph: '⚡', color: '#d8f4ff', text: `Foudre ${EVOLVE.orage.cdDiv}× plus fréquente, chaîne +${EVOLVE.orage.chainPlus}` },
};

export interface PassiveDef {
  name: string;
  glyph: string;
  color: string;
  max: number;
  text: string;
  apply: (w: World) => void;
}
export const PASSIVES: Record<PassiveKey, PassiveDef> = {
  vitesse: { name: 'Semelles de vent', glyph: '»', color: '#ff8a3d', max: 5, text: '+10 % de vitesse de course', apply: (w) => void (w.player.speed *= 1.1) },
  coeur: {
    name: 'Cœur de pierre',
    glyph: '♥',
    color: '#ff5470',
    max: 5,
    text: '+25 PV max et 25 PV soignés',
    apply: (w) => {
      w.player.maxHp += 25;
      w.player.hp = Math.min(w.player.maxHp, w.player.hp + 25);
    },
  },
  regen: { name: 'Sève vive', glyph: '+', color: '#7ee0a1', max: 5, text: 'Régénère 0,6 PV par seconde', apply: (w) => void (w.player.regen += 0.6) },
  aimant: { name: 'Aimant', glyph: '∩', color: '#59d8ff', max: 4, text: '+35 % de rayon de collecte', apply: (w) => void (w.player.magnet *= 1.35) },
  force: { name: 'Gants lourds', glyph: '▲', color: '#ffcc4d', max: 5, text: '+15 % de dégâts pour toutes les armes', apply: (w) => void (w.player.dmgMul += 0.15) },
  cadence: { name: 'Sablier fêlé', glyph: '◐', color: '#c7b3cf', max: 5, text: '−8 % de temps de recharge', apply: (w) => void (w.player.cdMul *= 0.92) },
  trefle: { name: 'Trèfle', glyph: '☘', color: '#7ee0a1', max: 4, text: '+6 % de chance d’une 4e carte, coffres plus généreux', apply: (w) => void (w.player.luck += 1) },
  bourse: { name: 'Bourse', glyph: '$', color: '#ffcc4d', max: 4, text: '+25 % d’or ramassé', apply: (w) => void (w.player.goldMul *= 1.25) },
};
export const PASSIVE_KEYS = Object.keys(PASSIVES) as PassiveKey[];
