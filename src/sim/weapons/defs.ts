import { CRIT, SYN, Syn, TOMES, TOME_CAPS, WEAPON_LINES } from '../balance';
import type { TomeKey, WeaponKey } from '../types';
import type { World } from '../world';

// Les noms et descriptions vivent côté UI (src/ui/cards.ts + src/i18n) : la sim ne porte que des clés et des stats.
export interface WeaponDef {
  glyph: string;
  color: string;
  base: Record<string, number>; // stats de départ ; les lignes (WEAPON_LINES) les font monter, voir refreshStats
}

// Grammaire survivor-design §4 : portée / ciblage / rythme jamais partagés par deux armes.
export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  // longue · auto plus proche · salve
  orbe: { glyph: '●', color: '#ffcc4d', base: { cd: 0.95, n: 1, dmg: 10, pierce: 1, speed: 17, crit: 0 } },
  // contact · zone autour · continu
  aura: { glyph: '◎', color: '#59d8ff', base: { r: 2.2, dmg: 5, period: 0.45, crit: 0, slow: 0 } },
  // courte · orbite · continu. r 1,95 : avec 2,45 u un Dard collé au joueur passait sous l'anneau
  lames: { glyph: '✦', color: '#fff1db', base: { n: 2, dmg: 12, r: 1.95, spd: 3.35, crit: 0 } },
  // longue · aléatoire + chaîne · lent et fort
  // phase 30 (Jimmy) : une seule cible au départ, les ricochets viennent des cartes (ligne chain, Projectiles, Orage)
  foudre: { glyph: 'ϟ', color: '#d8f4ff', base: { cd: 1.4, dmg: 34, chain: 0, crit: 0, stun: 0 } }, // chain = ricochets (cibles = chain + 1)
  // longue · direction du regard · salve
  boomerang: { glyph: '⟲', color: '#7ee0a1', base: { cd: 1.7, dmg: 14, range: 9, speed: 14, n: 1, crit: 0 } },
  // contact · là où je passe · pose
  mines: { glyph: '✸', color: '#ff7a3d', base: { cd: 0.9, dmg: 30, r: 2.2, n: 5, chain: 0, crit: 0 } },
  // phase 28 — courte · devant (regard) · salve : un arc qui fauche et repousse
  faux: { glyph: '☾', color: '#c9b3ff', base: { cd: 1.1, dmg: 20, r: 3.2, arc: 120, crit: 0 } }, // arc en degrés
  // longue · ennemi le plus loin (ligne) · lent : perce tout
  lance: { glyph: '➹', color: '#9fe8ff', base: { cd: 2.0, dmg: 30, speed: 22, n: 1, crit: 0 } },
  // longue · zone aléatoire autour · lent : cercles annoncés, puis impact
  meteores: { glyph: '☄', color: '#ff9a5a', base: { cd: 2.5, dmg: 42, r: 2.4, n: 2, crit: 0 } }, // phase 30 : la plus faible seule (2:36) → relevée
};
export const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];

/** Glyphes et couleurs des tomes (cartes, inventaire). */
export const TOME_LOOK: Record<TomeKey, { glyph: string; color: string }> = {
  degats: { glyph: '▲', color: '#ffcc4d' },
  cadence: { glyph: '◐', color: '#c7b3cf' },
  projectiles: { glyph: '⁂', color: '#ffe27a' },
  vitalite: { glyph: '♥', color: '#ff5470' },
  mouvement: { glyph: '»', color: '#ff8a3d' },
  savoir: { glyph: '✎', color: '#59d8ff' },
  chance: { glyph: '☘', color: '#7ee0a1' },
  or: { glyph: '$', color: '#ffcc4d' },
};

/** Stats courantes d'une arme (objet partagé, recalculé par refreshStats quand une carte s'applique : jamais modifié par l'appelant). */
export function weaponStats(w: World, k: WeaponKey): Record<string, number> {
  return w.wstats[k];
}

/**
 * Recalcule les stats des six armes depuis les bases, les lignes prises (w.wmods) et les tomes globaux du joueur.
 * Appelé à la création du monde et à chaque carte appliquée : aucune allocation (les objets de w.wstats sont réutilisés).
 */
export function refreshStats(w: World): void {
  const P = w.player;
  for (let i = 0; i < WEAPON_KEYS.length; i++) {
    const k = WEAPON_KEYS[i];
    const base = WEAPONS[k].base;
    const out = w.wstats[k];
    const lines = WEAPON_LINES[k];
    const mods = w.wmods[k];
    for (const stat in base) out[stat] = base[stat];
    for (let j = 0; j < lines.length; j++) {
      const l = lines[j];
      const n = mods[j];
      if (n === 0) continue;
      if (l.kind === 'pct') out[l.stat] = base[l.stat] * Math.pow(1 + l.step, n); // cumul multiplicatif : la montée reste sensible à 30 lignes
      else out[l.stat] = base[l.stat] + l.step * n;
    }
    // tomes globaux
    if (k === 'foudre') out.chain += P.projAdd;
    else if ('n' in base) out.n += P.projAdd;
    if ('r' in base && k !== 'lames') out.r *= P.sizeMul; // Lames : la taille agrandit la lame (rayon de frappe, tick.ts), pas l'orbite ; appliquée aux deux, les Lames explosaient en fin de run (22 % de fins au lieu de 15)
    if ('speed' in base) out.speed *= P.projSpeedMul;
  }
  // synergies (phase 17)
  const s = w.wstats;
  if (w.syn[Syn.Orage]) s.foudre.chain += SYN.orage.chain;
  if (w.syn[Syn.Essaim]) {
    s.orbe.pierce += SYN.essaim.pierce;
    s.orbe.n += SYN.essaim.n;
  }
  if (w.syn[Syn.Brasier]) s.aura.dmg *= 1 + SYN.brasier.dmg;
  if (w.syn[Syn.Tourbillon]) {
    s.lames.spd *= 1 + SYN.tourbillon.spd;
    s.lames.r *= 1 + SYN.tourbillon.r;
  }
  if (w.syn[Syn.Charge]) s.mines.r *= 1 + SYN.charge.r;
  if (w.syn[Syn.Ricochet]) {
    s.boomerang.n += SYN.ricochet.n;
    s.boomerang.range *= 1 + SYN.ricochet.range;
  }
  if (w.syn[Syn.Volee]) s.lance.n += SYN.volee.n; // phase 28
  if (w.syn[Syn.Pluie]) s.meteores.n += SYN.pluie.n;
}

/** Applique au joueur une ligne de tome (clé `stat` de TOMES[k]). Les effets se cumulent de façon additive sur la base. */
export function applyTomeLine(w: World, tome: TomeKey, lineIndex: number): void {
  const l = TOMES[tome][lineIndex];
  const P = w.player;
  switch (l.stat) {
    case 'dmg':
      P.dmgMul += l.step;
      break;
    case 'elite':
      P.eliteDmgMul += l.step;
      break;
    case 'kb':
      P.kbMul += l.step;
      break;
    case 'cd':
      P.cdMul = Math.max(TOME_CAPS.cdMin, P.cdMul - l.step);
      break;
    case 'life':
      P.projLifeMul += l.step;
      break;
    case 'proj':
      P.projAdd += l.step;
      break;
    case 'size':
      P.sizeMul += l.step;
      break;
    case 'pspeed':
      P.projSpeedMul += l.step;
      break;
    case 'hp':
      P.maxHp += l.step;
      P.hp = Math.min(P.maxHp, P.hp + l.step);
      break;
    case 'regen':
      P.regen += l.step;
      break;
    case 'armor':
      P.armor = Math.min(TOME_CAPS.armorMax, P.armor + l.step);
      break;
    case 'speed':
      P.speed *= 1 + l.step;
      break;
    case 'spellcd':
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul - l.step);
      break;
    case 'spellpow':
      P.spellPow += l.step;
      break;
    case 'xp':
      P.xpMul += l.step;
      break;
    case 'magnet':
      P.magnet *= 1 + l.step;
      break;
    case 'luck':
      P.luck += l.step;
      break;
    case 'chestgold':
      P.chestGoldMul += l.step;
      break;
    case 'gold':
      P.goldMul += l.step;
      break;
    case 'elitegold':
      P.eliteGold += l.step;
      break;
    // phase 23
    case 'critdmg':
      P.critMul += l.step;
      break;
    case 'killheal':
      P.killHeal += l.step;
      break;
    case 'jump':
      P.jumpMul *= 1 + l.step;
      break;
    case 'lvlheal':
      P.lvlHeal += l.step;
      break;
    case 'crit':
      P.crit += l.step;
      break;
    case 'shop':
      P.shopMul = Math.max(CRIT.shopMin, P.shopMul - l.step);
      break;
  }
}

/** Index d'une ligne par sa clé de stat (kit de départ des personnages). -1 si absente. */
export function lineIndex(lines: { stat: string }[], stat: string): number {
  for (let i = 0; i < lines.length; i++) if (lines[i].stat === stat) return i;
  return -1;
}
